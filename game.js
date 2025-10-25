// game.js - Main Bolo Game Implementation
import { NetworkManager } from './network.js';
import { GameEngine } from './engine.js';
import { Renderer } from './renderer.js';
import { InputManager } from './input.js';
import { AudioManager } from './audio.js';

class BoloGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Core systems
        this.engine = new GameEngine();
        this.renderer = new Renderer(this.canvas);
        this.network = new NetworkManager();
        this.input = new InputManager(this.canvas);
        this.audio = new AudioManager();
        
        // Game state
        this.localPlayerId = null;
        this.gameState = null;
        this.isHost = false;
        this.inGame = false;
        
        // UI elements
        this.lobby = document.getElementById('lobby');
        this.loadingScreen = document.getElementById('loadingScreen');
        this.hud = document.getElementById('hud');
        this.chat = document.getElementById('chat');
        this.minimap = document.getElementById('minimap');
        this.connectionStatus = document.getElementById('connectionStatus');
        
        // Performance
        this.lastTime = 0;
        this.accumulator = 0;
        this.frameTime = 1000 / 60; // 60 FPS
        this.tickRate = 1000 / 30; // 30 Hz simulation
        
        this.init();
    }
    
    async init() {
        console.log('🎮 Bolo Browser - Initializing...');
        
        // Setup canvas size
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Initialize network callbacks
        this.setupNetworkHandlers();
        
        // Setup input handlers
        this.setupInputHandlers();
        
        // Setup UI handlers
        this.setupUIHandlers();
        
        // Hide loading screen
        setTimeout(() => {
            this.loadingScreen.style.display = 'none';
        }, 1000);
        
        // Start game loop
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.renderer.resize(this.canvas.width, this.canvas.height);
    }
    
    setupNetworkHandlers() {
        // Connection events
        this.network.on('connected', () => {
            console.log('✅ Connected to signaling server');
            this.updateConnectionStatus('Connected', 'connected');
            this.refreshGameList();
        });
        
        this.network.on('disconnected', () => {
            console.log('❌ Disconnected from server');
            this.updateConnectionStatus('Disconnected', 'disconnected');
            if (this.inGame) {
                this.exitToLobby();
            }
        });
        
        // Game list updates
        this.network.on('gameList', (games) => {
            this.updateGameList(games);
        });
        
        // Game events
        this.network.on('gameCreated', (data) => {
            console.log('🎮 Game created:', data);
            this.localPlayerId = data.playerId;
            this.isHost = true;
            this.startGame(data.gameId);
        });
        
        this.network.on('gameJoined', (data) => {
            console.log('🎮 Joined game:', data);
            this.localPlayerId = data.playerId;
            this.isHost = false;
            this.startGame(data.gameId);
        });
        
        // Player events
        this.network.on('playerJoined', (player) => {
            console.log('👤 Player joined:', player.name);
            this.engine.addPlayer(player);
            this.showNotification(`${player.name} joined the game`);
        });
        
        this.network.on('playerLeft', (playerId) => {
            const player = this.engine.getPlayer(playerId);
            if (player) {
                console.log('👤 Player left:', player.name);
                this.showNotification(`${player.name} left the game`);
                this.engine.removePlayer(playerId);
            }
        });
        
        // Game state sync
        this.network.on('stateSync', (state) => {
            if (!this.isHost) {
                this.engine.setState(state);
            }
        });
        
        // Input from other players
        this.network.on('playerInput', (data) => {
            if (data.playerId !== this.localPlayerId) {
                this.engine.applyInput(data.playerId, data.input, data.frame);
            }
        });
        
        // Chat messages
        this.network.on('chatMessage', (data) => {
            this.addChatMessage(data.playerName, data.message);
        });
    }
    
    setupInputHandlers() {
        // Movement keys
        this.input.on('moveForward', () => {
            this.sendInput({ type: 'move', direction: 'forward' });
        });
        
        this.input.on('moveBackward', () => {
            this.sendInput({ type: 'move', direction: 'backward' });
        });
        
        this.input.on('turnLeft', () => {
            this.sendInput({ type: 'turn', direction: 'left' });
        });
        
        this.input.on('turnRight', () => {
            this.sendInput({ type: 'turn', direction: 'right' });
        });
        
        // Combat
        this.input.on('fire', (mousePos) => {
            this.sendInput({ type: 'fire', target: mousePos });
        });
        
        this.input.on('layMine', () => {
            this.sendInput({ type: 'mine' });
        });
        
        // Chat
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const input = e.target;
                if (input.value.trim()) {
                    this.network.sendChat(input.value);
                    input.value = '';
                }
            }
        });
    }
    
    setupUIHandlers() {
        // Player name
        const playerNameInput = document.getElementById('playerName');
        playerNameInput.value = localStorage.getItem('playerName') || `Tank${Math.floor(Math.random() * 1000)}`;
        playerNameInput.addEventListener('change', (e) => {
            localStorage.setItem('playerName', e.target.value);
        });
        
        // Server URL
        const serverUrlInput = document.getElementById('serverUrl');
        serverUrlInput.value = localStorage.getItem('serverUrl') || 'ws://localhost:3000';
        serverUrlInput.addEventListener('change', (e) => {
            localStorage.setItem('serverUrl', e.target.value);
        });
        
        // Connect button (implicit)
        serverUrlInput.addEventListener('keypress', async (e) => {
            if (e.key === 'Enter') {
                await this.connectToServer();
            }
        });
        
        // Create game
        document.getElementById('createGameBtn').addEventListener('click', () => {
            const gameName = document.getElementById('gameName').value || `Game${Math.floor(Math.random() * 1000)}`;
            const playerName = document.getElementById('playerName').value;
            this.network.createGame(gameName, playerName);
        });
        
        // Join game
        document.getElementById('joinGameBtn').addEventListener('click', () => {
            const selected = document.querySelector('.game-item.selected');
            if (selected && selected.dataset.gameId) {
                const playerName = document.getElementById('playerName').value;
                this.network.joinGame(selected.dataset.gameId, playerName);
            }
        });
        
        // Quick play
        document.getElementById('quickPlayBtn').addEventListener('click', () => {
            const playerName = document.getElementById('playerName').value;
            this.network.quickPlay(playerName);
        });
        
        // Auto-connect on load
        this.connectToServer();
    }
    
    async connectToServer() {
        const serverUrl = document.getElementById('serverUrl').value;
        this.updateConnectionStatus('Connecting...', 'connecting');
        
        try {
            await this.network.connect(serverUrl);
        } catch (error) {
            console.error('Failed to connect:', error);
            this.updateConnectionStatus('Failed to connect', 'disconnected');
        }
    }
    
    refreshGameList() {
        this.network.requestGameList();
    }
    
    updateGameList(games) {
        const gameList = document.getElementById('gameList');
        
        if (games.length === 0) {
            gameList.innerHTML = '<div class="game-item">No games available. Create one!</div>';
            return;
        }
        
        gameList.innerHTML = '';
        games.forEach(game => {
            const item = document.createElement('div');
            item.className = 'game-item';
            item.dataset.gameId = game.id;
            item.innerHTML = `
                <strong>${game.name}</strong> - 
                ${game.players}/${game.maxPlayers} players - 
                ${game.map}
            `;
            item.addEventListener('click', () => {
                document.querySelectorAll('.game-item').forEach(i => i.classList.remove('selected'));
                item.classList.add('selected');
            });
            gameList.appendChild(item);
        });
    }
    
    startGame(gameId) {
        console.log('🚀 Starting game:', gameId);
        
        // Hide lobby, show game UI
        this.lobby.style.display = 'none';
        this.hud.style.display = 'block';
        this.chat.style.display = 'block';
        this.minimap.style.display = 'block';
        this.connectionStatus.style.display = 'block';
        
        // Initialize game
        this.inGame = true;
        this.engine.init();
        
        // Add local player
        const playerName = document.getElementById('playerName').value;
        this.engine.addPlayer({
            id: this.localPlayerId,
            name: playerName,
            team: this.isHost ? 0 : 1,
            isLocal: true
        });
        
        // Start simulation if host
        if (this.isHost) {
            this.engine.start();
        }
        
        // Play start sound
        this.audio.play('gameStart');
    }
    
    exitToLobby() {
        console.log('🏠 Returning to lobby');
        
        // Show lobby, hide game UI
        this.lobby.style.display = 'block';
        this.hud.style.display = 'none';
        this.chat.style.display = 'none';
        this.minimap.style.display = 'none';
        
        // Reset game state
        this.inGame = false;
        this.engine.reset();
        this.renderer.reset();
        
        // Refresh game list
        this.refreshGameList();
    }
    
    sendInput(input) {
        if (!this.inGame || !this.localPlayerId) return;
        
        // Apply locally with prediction
        const frame = this.engine.getCurrentFrame();
        this.engine.applyInput(this.localPlayerId, input, frame);
        
        // Send to other players
        this.network.sendInput(input, frame);
    }
    
    gameLoop(currentTime) {
        const deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        if (this.inGame) {
            // Fixed timestep with interpolation
            this.accumulator += deltaTime;
            
            // Run simulation at fixed rate
            while (this.accumulator >= this.tickRate) {
                this.engine.update(this.tickRate);
                this.accumulator -= this.tickRate;
                
                // Host broadcasts state periodically
                if (this.isHost && this.engine.getCurrentFrame() % 30 === 0) {
                    this.network.broadcastState(this.engine.getState());
                }
            }
            
            // Render with interpolation
            const alpha = this.accumulator / this.tickRate;
            this.render(alpha);
            
            // Update HUD
            this.updateHUD();
        }
        
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    render(interpolation) {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Get camera position (follow local player)
        const localPlayer = this.engine.getPlayer(this.localPlayerId);
        if (localPlayer && localPlayer.tank) {
            this.renderer.setCamera(
                localPlayer.tank.position.x,
                localPlayer.tank.position.y
            );
        }
        
        // Render game
        this.renderer.render(this.engine.getState(), interpolation);
        
        // Render minimap
        this.renderMinimap();
    }
    
    renderMinimap() {
        const minimapCanvas = document.getElementById('minimapCanvas');
        const ctx = minimapCanvas.getContext('2d');
        
        // Set canvas size if needed
        if (minimapCanvas.width !== 196) {
            minimapCanvas.width = 196;
            minimapCanvas.height = 196;
        }
        
        // Clear
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 196, 196);
        
        // Draw terrain overview
        const scale = 196 / (100 * 32); // map size * tile size
        
        // Draw players
        this.engine.getState().players.forEach(player => {
            if (player.tank && !player.tank.isDestroyed) {
                const x = player.tank.position.x * scale;
                const y = player.tank.position.y * scale;
                
                ctx.fillStyle = player.id === this.localPlayerId ? '#0f0' : 
                               player.team === 0 ? '#00f' : '#f00';
                ctx.fillRect(x - 2, y - 2, 4, 4);
            }
        });
    }
    
    updateHUD() {
        const localPlayer = this.engine.getPlayer(this.localPlayerId);
        if (!localPlayer || !localPlayer.tank) return;
        
        const tank = localPlayer.tank;
        
        // Health bar
        const healthPercent = (tank.health / tank.maxHealth) * 100;
        document.getElementById('healthFill').style.width = `${healthPercent}%`;
        
        // Ammo
        document.getElementById('ammoCount').textContent = `${tank.ammo}/${tank.maxAmmo}`;
        
        // Mines
        document.getElementById('mineCount').textContent = tank.mines;
        
        // Score
        document.getElementById('scoreCount').textContent = localPlayer.score;
        
        // Player count
        const playerCount = this.engine.getState().players.size;
        document.getElementById('playerCount').textContent = `${playerCount}/16`;
    }
    
    updateConnectionStatus(text, className) {
        const statusText = document.getElementById('statusText');
        statusText.textContent = text;
        statusText.className = `status-${className}`;
    }
    
    addChatMessage(playerName, message) {
        const chatMessages = document.getElementById('chatMessages');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message';
        msgDiv.innerHTML = `<span class="chat-player">${playerName}:</span> ${message}`;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Remove old messages
        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }
    
    showNotification(message) {
        this.addChatMessage('System', message);
    }
}

// Initialize game when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.game = new BoloGame();
    });
} else {
    window.game = new BoloGame();
}

export { BoloGame };
