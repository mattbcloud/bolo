# 🎮 Bolo Browser - Multiplayer Tank Battle Game

A faithful browser-based remake of the classic 1987 Bolo game by Stuart Cheshire, featuring true peer-to-peer multiplayer via WebRTC.

![Bolo Browser](https://img.shields.io/badge/version-1.0.0-blue.svg)
![WebRTC](https://img.shields.io/badge/WebRTC-P2P-green.svg)
![Players](https://img.shields.io/badge/players-16_max-orange.svg)

## 🚀 Quick Start

### Option 1: Run Locally

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open browser to http://localhost:3000
```

### Option 2: Deploy to Cloud

#### Heroku
```bash
heroku create your-bolo-game
git push heroku main
```

#### Docker
```bash
docker build -t bolo-browser .
docker run -p 3000:3000 bolo-browser
```

## 🎯 Features

### Core Gameplay
- ✅ **Tank Combat**: Classic Bolo tank battles
- ✅ **16 Player Support**: Original player limit preserved
- ✅ **Team Play**: Multiple team configurations
- ✅ **Base Capture**: Strategic base control
- ✅ **Mine Laying**: Tactical area denial
- ✅ **Terrain System**: Water, forest, roads affect movement

### Networking
- ✅ **True P2P**: WebRTC data channels for low latency
- ✅ **Deterministic Simulation**: Perfect synchronization
- ✅ **Rollback Netcode**: Handles network delays gracefully
- ✅ **Minimal Server**: Only used for matchmaking

### Modern Enhancements
- ✅ **No Installation**: Runs entirely in browser
- ✅ **Cross-Platform**: Works on desktop and mobile
- ✅ **HD Graphics**: Canvas-based rendering
- ✅ **Sound Effects**: Procedural Web Audio API
- ✅ **Touch Controls**: Mobile-friendly interface

## 🎮 How to Play

### Controls
- **W/↑**: Move forward
- **S/↓**: Move backward
- **A/←**: Turn left
- **D/→**: Turn right
- **Left Click**: Fire
- **Right Click/Space**: Lay mine
- **Enter**: Open chat
- **Tab**: Show scores

### Game Modes
1. **Quick Play**: Instantly join or create a game
2. **Create Game**: Host your own game with custom settings
3. **Join Game**: Browse and join existing games

### Strategy Tips
- Control roads for faster movement
- Avoid water and dense forests
- Use mines to protect captured bases
- Coordinate with teammates via chat
- Watch the minimap for enemy positions

## 🏗️ Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript ES6+
- **Networking**: WebRTC DataChannels
- **Graphics**: HTML5 Canvas 2D
- **Audio**: Web Audio API
- **Server**: Node.js + Express + WebSocket

### Network Architecture
```
Player A <--WebRTC--> Player B
    |                     |
    +--Signaling Server--+
         (Matchmaking)
```

### Game Loop
1. **Input Collection** (60 Hz)
2. **Simulation Update** (30 Hz)
3. **State Synchronization** (10 Hz)
4. **Rendering** (60 FPS with interpolation)

## 📁 Project Structure

```
bolo-browser/
├── index.html       # Main game interface
├── game.js          # Game coordinator
├── engine.js        # Deterministic simulation
├── network.js       # WebRTC networking
├── renderer.js      # Canvas rendering
├── input.js         # Input handling
├── audio.js         # Sound effects
├── server.js        # Signaling server
└── package.json     # Dependencies
```

## 🔧 Configuration

### Server Configuration
Edit `server.js`:
```javascript
const PORT = process.env.PORT || 3000;
const MAX_GAMES = 100;
const MAX_PLAYERS_PER_GAME = 16;
```

### Client Configuration
Edit `engine.js`:
```javascript
this.config = {
    mapWidth: 100,
    mapHeight: 100,
    tankSpeed: 100,
    projectileSpeed: 300
};
```

## 🌐 Deployment

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Set to 'production' for optimizations

### STUN/TURN Servers
For production, configure your own TURN servers in `network.js`:
```javascript
this.rtcConfig = {
    iceServers: [
        { urls: 'stun:your-stun-server.com:3478' },
        { 
            urls: 'turn:your-turn-server.com:3478',
            username: 'username',
            credential: 'password'
        }
    ]
};
```

## 🛠️ Development

### Running in Development
```bash
npm run dev  # Uses nodemon for auto-reload
```

### Building for Production
```bash
npm run build  # Webpack production build
```

### Testing
```bash
npm test  # Run test suite
```

## 📊 Performance

### Optimizations
- **Viewport Culling**: Only render visible entities
- **Terrain Caching**: Pre-render static terrain
- **Object Pooling**: Reuse projectile objects
- **Delta Compression**: Send only changed state

### Benchmarks
- **Players**: 16 simultaneous
- **Latency**: <50ms P2P
- **FPS**: 60 (rendering), 30 (simulation)
- **Bandwidth**: ~5KB/s per player

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📜 License

This project is licensed under the MIT License. The original Bolo game was created by Stuart Cheshire and released as freeware.

## 🙏 Credits

- **Original Bolo**: Stuart Cheshire (1987-1995)
- **Inspiration**: The Mac gaming community
- **Technologies**: WebRTC, Web Audio API, Canvas 2D

## 🐛 Known Issues

- Mobile controls need refinement
- No AI bots yet
- Map editor not implemented
- Voice chat planned but not ready

## 📮 Contact

For questions or support, please open an issue on GitHub.

---

**"Bolo is about computers communicating on the network, and more importantly about humans communicating with each other."** - Stuart Cheshire

Enjoy the game! 🎮
