// network.js - WebRTC P2P Networking for Bolo
class NetworkManager extends EventTarget {
    constructor() {
        super();
        
        this.ws = null;
        this.peers = new Map();
        this.localId = null;
        this.gameId = null;
        
        // WebRTC configuration
        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        // Message buffer for reliability
        this.messageBuffer = new Map();
        this.messageSequence = 0;
    }
    
    async connect(serverUrl) {
        return new Promise((resolve, reject) => {
            console.log(`📡 Connecting to ${serverUrl}`);
            
            this.ws = new WebSocket(serverUrl);
            
            this.ws.onopen = () => {
                console.log('✅ WebSocket connected');
                this.dispatchEvent(new Event('connected'));
                resolve();
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ WebSocket error:', error);
                reject(error);
            };
            
            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                this.dispatchEvent(new Event('disconnected'));
                this.cleanup();
            };
            
            this.ws.onmessage = (event) => {
                this.handleSignalingMessage(JSON.parse(event.data));
            };
        });
    }
    
    handleSignalingMessage(message) {
        console.log('📨 Signaling message:', message.type);
        
        switch (message.type) {
            case 'welcome':
                this.localId = message.id;
                console.log('🆔 Local ID:', this.localId);
                break;
                
            case 'gameList':
                this.dispatchEvent(new CustomEvent('gameList', { detail: message.games }));
                break;
                
            case 'gameCreated':
                this.gameId = message.gameId;
                this.dispatchEvent(new CustomEvent('gameCreated', { 
                    detail: { 
                        gameId: message.gameId,
                        playerId: this.localId 
                    }
                }));
                break;
                
            case 'gameJoined':
                this.gameId = message.gameId;
                this.dispatchEvent(new CustomEvent('gameJoined', { 
                    detail: { 
                        gameId: message.gameId,
                        playerId: this.localId,
                        players: message.players
                    }
                }));
                // Connect to existing players
                message.players.forEach(player => {
                    if (player.id !== this.localId) {
                        this.createPeerConnection(player.id, true);
                    }
                });
                break;
                
            case 'playerJoined':
                if (message.playerId !== this.localId) {
                    console.log('👤 New player:', message.playerId);
                    this.createPeerConnection(message.playerId, false);
                    this.dispatchEvent(new CustomEvent('playerJoined', { 
                        detail: message.player 
                    }));
                }
                break;
                
            case 'playerLeft':
                this.closePeerConnection(message.playerId);
                this.dispatchEvent(new CustomEvent('playerLeft', { 
                    detail: message.playerId 
                }));
                break;
                
            case 'offer':
                this.handleOffer(message);
                break;
                
            case 'answer':
                this.handleAnswer(message);
                break;
                
            case 'iceCandidate':
                this.handleIceCandidate(message);
                break;
                
            case 'error':
                console.error('❌ Server error:', message.message);
                break;
        }
    }
    
    async createPeerConnection(peerId, createOffer) {
        console.log(`🔗 Creating peer connection to ${peerId} (offer: ${createOffer})`);
        
        const pc = new RTCPeerConnection(this.rtcConfig);
        
        // Create data channels
        const reliableChannel = pc.createDataChannel('reliable', {
            ordered: true,
            maxRetransmits: 3
        });
        
        const unreliableChannel = pc.createDataChannel('unreliable', {
            ordered: false,
            maxRetransmits: 0
        });
        
        const peer = {
            id: peerId,
            connection: pc,
            reliableChannel,
            unreliableChannel,
            isConnected: false
        };
        
        this.peers.set(peerId, peer);
        
        // Setup channel handlers
        this.setupDataChannel(reliableChannel, peerId, true);
        this.setupDataChannel(unreliableChannel, peerId, false);
        
        // Handle incoming data channels
        pc.ondatachannel = (event) => {
            const channel = event.channel;
            if (channel.label === 'reliable') {
                peer.reliableChannel = channel;
                this.setupDataChannel(channel, peerId, true);
            } else if (channel.label === 'unreliable') {
                peer.unreliableChannel = channel;
                this.setupDataChannel(channel, peerId, false);
            }
        };
        
        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignaling({
                    type: 'iceCandidate',
                    to: peerId,
                    candidate: event.candidate
                });
            }
        };
        
        // Connection state
        pc.onconnectionstatechange = () => {
            console.log(`📶 Connection state with ${peerId}: ${pc.connectionState}`);
            if (pc.connectionState === 'connected') {
                peer.isConnected = true;
                this.dispatchEvent(new CustomEvent('peerConnected', { detail: peerId }));
            } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                this.closePeerConnection(peerId);
            }
        };
        
        // Create offer if initiator
        if (createOffer) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.sendSignaling({
                    type: 'offer',
                    to: peerId,
                    offer: offer
                });
            } catch (error) {
                console.error('Failed to create offer:', error);
            }
        }
        
        return peer;
    }
    
    setupDataChannel(channel, peerId, isReliable) {
        channel.onopen = () => {
            console.log(`📂 ${isReliable ? 'Reliable' : 'Unreliable'} channel opened with ${peerId}`);
        };
        
        channel.onclose = () => {
            console.log(`📁 ${isReliable ? 'Reliable' : 'Unreliable'} channel closed with ${peerId}`);
        };
        
        channel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handlePeerMessage(peerId, message, isReliable);
            } catch (error) {
                console.error('Failed to parse peer message:', error);
            }
        };
        
        channel.onerror = (error) => {
            console.error(`Channel error with ${peerId}:`, error);
        };
    }
    
    async handleOffer(message) {
        console.log(`📥 Received offer from ${message.from}`);
        
        let peer = this.peers.get(message.from);
        if (!peer) {
            peer = await this.createPeerConnection(message.from, false);
        }
        
        try {
            await peer.connection.setRemoteDescription(message.offer);
            const answer = await peer.connection.createAnswer();
            await peer.connection.setLocalDescription(answer);
            
            this.sendSignaling({
                type: 'answer',
                to: message.from,
                answer: answer
            });
        } catch (error) {
            console.error('Failed to handle offer:', error);
        }
    }
    
    async handleAnswer(message) {
        console.log(`📥 Received answer from ${message.from}`);
        
        const peer = this.peers.get(message.from);
        if (!peer) {
            console.error('No peer connection for answer');
            return;
        }
        
        try {
            await peer.connection.setRemoteDescription(message.answer);
        } catch (error) {
            console.error('Failed to handle answer:', error);
        }
    }
    
    async handleIceCandidate(message) {
        const peer = this.peers.get(message.from);
        if (!peer) {
            console.error('No peer connection for ICE candidate');
            return;
        }
        
        try {
            await peer.connection.addIceCandidate(message.candidate);
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }
    
    handlePeerMessage(peerId, message, isReliable) {
        switch (message.type) {
            case 'input':
                this.dispatchEvent(new CustomEvent('playerInput', {
                    detail: {
                        playerId: peerId,
                        input: message.input,
                        frame: message.frame
                    }
                }));
                break;
                
            case 'stateSync':
                this.dispatchEvent(new CustomEvent('stateSync', {
                    detail: message.state
                }));
                break;
                
            case 'chat':
                this.dispatchEvent(new CustomEvent('chatMessage', {
                    detail: {
                        playerId: peerId,
                        playerName: message.playerName,
                        message: message.message
                    }
                }));
                break;
                
            default:
                console.warn('Unknown peer message type:', message.type);
        }
    }
    
    closePeerConnection(peerId) {
        const peer = this.peers.get(peerId);
        if (peer) {
            console.log(`🔌 Closing connection with ${peerId}`);
            
            if (peer.reliableChannel) peer.reliableChannel.close();
            if (peer.unreliableChannel) peer.unreliableChannel.close();
            if (peer.connection) peer.connection.close();
            
            this.peers.delete(peerId);
        }
    }
    
    sendSignaling(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
    
    broadcastToPeers(message, reliable = true) {
        const data = JSON.stringify(message);
        
        this.peers.forEach(peer => {
            if (peer.isConnected) {
                const channel = reliable ? peer.reliableChannel : peer.unreliableChannel;
                if (channel && channel.readyState === 'open') {
                    try {
                        channel.send(data);
                    } catch (error) {
                        console.error(`Failed to send to ${peer.id}:`, error);
                    }
                }
            }
        });
    }
    
    // Public API
    createGame(gameName, playerName) {
        this.sendSignaling({
            type: 'createGame',
            gameName,
            playerName,
            maxPlayers: 16
        });
    }
    
    joinGame(gameId, playerName) {
        this.sendSignaling({
            type: 'joinGame',
            gameId,
            playerName
        });
    }
    
    quickPlay(playerName) {
        this.sendSignaling({
            type: 'quickPlay',
            playerName
        });
    }
    
    requestGameList() {
        this.sendSignaling({ type: 'requestGameList' });
    }
    
    sendInput(input, frame) {
        this.broadcastToPeers({
            type: 'input',
            input,
            frame,
            sequence: this.messageSequence++
        }, false); // Use unreliable channel for inputs
    }
    
    broadcastState(state) {
        this.broadcastToPeers({
            type: 'stateSync',
            state,
            sequence: this.messageSequence++
        }, true); // Use reliable channel for state sync
    }
    
    sendChat(message) {
        const playerName = document.getElementById('playerName').value;
        this.broadcastToPeers({
            type: 'chat',
            playerName,
            message
        }, true);
    }
    
    disconnect() {
        if (this.ws) {
            this.ws.close();
        }
        this.cleanup();
    }
    
    cleanup() {
        this.peers.forEach((peer, id) => {
            this.closePeerConnection(id);
        });
        this.peers.clear();
        this.gameId = null;
    }
}

export { NetworkManager };
