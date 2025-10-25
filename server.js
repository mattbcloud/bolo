// server.js - Signaling Server for Bolo WebRTC
const WebSocket = require('ws');
const http = require('http');
const express = require('express');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname)));

// Game state
const games = new Map();
const players = new Map();
let nextPlayerId = 1;
let nextGameId = 1;

class Game {
    constructor(id, name, hostId, maxPlayers = 16) {
        this.id = id;
        this.name = name;
        this.hostId = hostId;
        this.maxPlayers = maxPlayers;
        this.players = new Set();
        this.started = false;
        this.map = 'Everard Island';
        this.created = Date.now();
    }
    
    addPlayer(playerId) {
        if (this.players.size >= this.maxPlayers) {
            return false;
        }
        this.players.add(playerId);
        return true;
    }
    
    removePlayer(playerId) {
        this.players.delete(playerId);
        if (playerId === this.hostId && this.players.size > 0) {
            // Transfer host to another player
            this.hostId = this.players.values().next().value;
        }
    }
    
    isEmpty() {
        return this.players.size === 0;
    }
    
    getInfo() {
        return {
            id: this.id,
            name: this.name,
            players: this.players.size,
            maxPlayers: this.maxPlayers,
            map: this.map,
            started: this.started
        };
    }
}

class Player {
    constructor(id, ws) {
        this.id = id;
        this.ws = ws;
        this.name = `Player${id}`;
        this.gameId = null;
        this.team = -1;
    }
    
    send(message) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }
}

// WebSocket connection handler
wss.on('connection', (ws) => {
    const playerId = nextPlayerId++;
    const player = new Player(playerId, ws);
    players.set(playerId, player);
    
    console.log(`Player ${playerId} connected`);
    
    // Send welcome message
    player.send({
        type: 'welcome',
        id: playerId
    });
    
    // Handle messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            handleMessage(player, message);
        } catch (error) {
            console.error('Invalid message:', error);
        }
    });
    
    // Handle disconnect
    ws.on('close', () => {
        console.log(`Player ${playerId} disconnected`);
        
        // Leave game if in one
        if (player.gameId) {
            leaveGame(player);
        }
        
        players.delete(playerId);
    });
    
    ws.on('error', (error) => {
        console.error(`Player ${playerId} error:`, error);
    });
});

function handleMessage(player, message) {
    console.log(`Message from ${player.id}:`, message.type);
    
    switch (message.type) {
        case 'createGame':
            createGame(player, message);
            break;
            
        case 'joinGame':
            joinGame(player, message);
            break;
            
        case 'quickPlay':
            quickPlay(player, message);
            break;
            
        case 'requestGameList':
            sendGameList(player);
            break;
            
        case 'leaveGame':
            leaveGame(player);
            break;
            
        case 'offer':
        case 'answer':
        case 'iceCandidate':
            relayWebRTCMessage(player, message);
            break;
            
        default:
            console.warn('Unknown message type:', message.type);
    }
}

function createGame(player, message) {
    const gameId = nextGameId++;
    const game = new Game(gameId, message.gameName || `Game ${gameId}`, player.id, message.maxPlayers || 16);
    
    games.set(gameId, game);
    game.addPlayer(player.id);
    
    player.gameId = gameId;
    player.name = message.playerName || player.name;
    player.team = 0; // Host is team 0
    
    console.log(`Game ${gameId} created by ${player.id}`);
    
    player.send({
        type: 'gameCreated',
        gameId: gameId
    });
    
    // Broadcast updated game list
    broadcastGameList();
}

function joinGame(player, message) {
    const game = games.get(message.gameId);
    
    if (!game) {
        player.send({
            type: 'error',
            message: 'Game not found'
        });
        return;
    }
    
    if (!game.addPlayer(player.id)) {
        player.send({
            type: 'error',
            message: 'Game is full'
        });
        return;
    }
    
    player.gameId = message.gameId;
    player.name = message.playerName || player.name;
    player.team = 1; // Joiners start on team 1
    
    // Get list of existing players
    const existingPlayers = [];
    game.players.forEach(pid => {
        if (pid !== player.id) {
            const p = players.get(pid);
            if (p) {
                existingPlayers.push({
                    id: pid,
                    name: p.name,
                    team: p.team
                });
            }
        }
    });
    
    // Notify joiner
    player.send({
        type: 'gameJoined',
        gameId: message.gameId,
        players: existingPlayers
    });
    
    // Notify existing players
    game.players.forEach(pid => {
        if (pid !== player.id) {
            const p = players.get(pid);
            if (p) {
                p.send({
                    type: 'playerJoined',
                    playerId: player.id,
                    player: {
                        id: player.id,
                        name: player.name,
                        team: player.team
                    }
                });
            }
        }
    });
    
    console.log(`Player ${player.id} joined game ${message.gameId}`);
    broadcastGameList();
}

function quickPlay(player, message) {
    // Find an available game
    let targetGame = null;
    
    for (const game of games.values()) {
        if (!game.started && game.players.size < game.maxPlayers) {
            targetGame = game;
            break;
        }
    }
    
    if (targetGame) {
        joinGame(player, { gameId: targetGame.id, playerName: message.playerName });
    } else {
        // Create new game
        createGame(player, { gameName: 'Quick Game', playerName: message.playerName });
    }
}

function leaveGame(player) {
    const game = games.get(player.gameId);
    if (!game) return;
    
    game.removePlayer(player.id);
    
    // Notify other players
    game.players.forEach(pid => {
        const p = players.get(pid);
        if (p) {
            p.send({
                type: 'playerLeft',
                playerId: player.id
            });
        }
    });
    
    // Delete empty games
    if (game.isEmpty()) {
        games.delete(game.id);
        console.log(`Game ${game.id} deleted (empty)`);
    }
    
    player.gameId = null;
    console.log(`Player ${player.id} left game`);
    broadcastGameList();
}

function sendGameList(player) {
    const gameList = Array.from(games.values())
        .filter(game => !game.started)
        .map(game => game.getInfo());
    
    player.send({
        type: 'gameList',
        games: gameList
    });
}

function broadcastGameList() {
    const gameList = Array.from(games.values())
        .filter(game => !game.started)
        .map(game => game.getInfo());
    
    players.forEach(player => {
        if (!player.gameId) { // Only send to players in lobby
            player.send({
                type: 'gameList',
                games: gameList
            });
        }
    });
}

function relayWebRTCMessage(player, message) {
    const targetPlayer = players.get(message.to);
    if (targetPlayer && targetPlayer.gameId === player.gameId) {
        targetPlayer.send({
            ...message,
            from: player.id
        });
    }
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎮 Bolo Signaling Server running on port ${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
    console.log(`🌐 Web interface: http://localhost:${PORT}`);
});

// Cleanup old games periodically
setInterval(() => {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    games.forEach((game, id) => {
        if (game.isEmpty() || (now - game.created > timeout && !game.started)) {
            games.delete(id);
            console.log(`Cleaned up old game ${id}`);
        }
    });
}, 60000); // Check every minute
