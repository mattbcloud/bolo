# Bolo - Browser-Based Tank Warfare

A fully playable HTML5 port of **Bolo**, the classic Macintosh tank combat game, running natively in your web browser. No plugins, no downloads, no emulation required.

**[🎮 Play Single-Player](https://mattbcloud.github.io/bolo/?local)**

**NEW:** 🚀 **[Deploy Multiplayer Server to Railway](RAILWAY_DEPLOYMENT.md)** - Play with friends in real-time!

---

## About

This repository hosts **Orona**, a browser-based rewrite of Bolo using modern web technologies. Originally created by Stéphan Kochen, Orona brings the classic tank warfare gameplay of Bolo to HTML5 Canvas and WebGL.

### What is Bolo?

Bolo is a top-down tank combat game originally created by Stuart Cheshire for the BBC Micro and Apple Macintosh. Players control a tank, capture bases, build defenses, and battle opponents in a strategic mix of combat and territory control.

---

## Features

- ✅ **Runs in Any Modern Browser** - Chrome, Firefox, Safari, Edge
- ✅ **Single-Player Mode** - Play offline against AI (coming soon) or explore maps
- ✅ **Multiplayer Support** - Network play via WebSockets (server required)
- ✅ **HTML5 Canvas/WebGL Rendering** - Smooth graphics with multiple rendering backends
- ✅ **Full Sound Effects** - All classic Bolo sounds included
- ✅ **Classic Maps** - Including Everard Island and more
- ✅ **No Installation** - Just click and play

---

## Quick Start

### Play Online

Visit the live game:

**Single Player Mode:**
```
https://mattbcloud.github.io/bolo/?local
```

**Standard Mode:**
```
https://mattbcloud.github.io/bolo/
```

### Run Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/mattbcloud/bolo.git
   cd bolo
   ```

2. Serve with any HTTP server:
   ```bash
   # Python 3
   python3 -m http.server 8080

   # Node.js
   npx http-server -p 8080

   # PHP
   php -S localhost:8080
   ```

3. Open your browser to:
   ```
   http://localhost:8080/?local
   ```

### Run Multiplayer Server

This repository now includes a full multiplayer server! Deploy to Railway in minutes:

**Quick Deploy:**
1. Push this repo to GitHub
2. Connect to Railway.app
3. Railway auto-deploys the server
4. Share your game URL with friends!

**Detailed instructions:** See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md)

**Local multiplayer server:**
```bash
# Install dependencies
npm install
git submodule update --init

# Start server
npm start

# Play at http://localhost:8124
```

---

## Game Controls

| Control | Action |
|---------|--------|
| **Mouse** | Aim and shoot |
| **Arrow Keys** | Move camera view |
| **WASD** | Tank movement (context-dependent) |
| **Spacebar** | Fire weapon |
| **Shift** | Deploy mines |

---

## Technical Details

### Architecture

**Client Side:**
- **Language:** CoffeeScript (compiled to JavaScript)
- **Rendering:** Multiple backends (Canvas 2D, Offscreen Canvas, WebGL)
- **Bundler:** Browserify (UMD standalone module)
- **Bundle Size:** 207KB

**Server Side** (for multiplayer):
- **Platform:** Node.js
- **WebSockets:** Faye-WebSocket
- **Networking:** Custom protocol over WebSockets
- **Optional IRC:** Matchmaking and chat integration

### Game Objects

The game implements classic Bolo entities:
- **Tanks** - Player-controlled vehicles
- **Pillboxes** - Defensive structures
- **Bases** - Territory control points
- **Builders** - Construction units
- **Shells** - Tank ammunition
- **Mines** - Deployable explosives
- **Explosions** - Various explosion effects

### File Structure

```
bolo/
├── index.html              # Game entry point
├── js/
│   ├── bolo-bundle.js      # Complete game bundle (207KB)
│   └── jquery.cookie.js    # Cookie helper
├── css/
│   ├── bolo.css            # Game styles
│   └── jquery.ui.theme.css # UI theme
├── images/                 # Game sprites and UI assets
├── sounds/                 # Sound effects (24 .ogg files)
├── maps/                   # Game maps
│   └── Everard Island.map  # Classic Bolo map
└── GAME_README.md          # Original Orona documentation
```

---

## Development

### Building from Source

If you want to modify or rebuild the game:

1. **Clone Orona:**
   ```bash
   git clone https://github.com/stephank/orona.git
   cd orona
   ```

2. **Install dependencies:**
   ```bash
   git submodule update --init
   npm install
   ```

3. **Update dependencies** (for modern Node.js):

   Edit `package.json`:
   ```json
   {
     "dependencies": {
       "coffee-script": "1.6.3",
       "browserify": "^17.0.0",
       "coffeeify": "^3.0.1",
       "connect": "^3.7.0",
       "faye-websocket": "^0.11.0",
       "irc-js": "^0.2.0",
       "villain": "=0.2.0"
     }
   }
   ```

4. **Build:**
   ```bash
   npx cake build
   ```

5. **Run:**
   ```bash
   python3 -m http.server 8080
   ```

### Running Multiplayer Server

To enable multiplayer:

1. **Configure server:**
   ```bash
   cp config.json.sample config.json
   # Edit config.json with your settings
   ```

2. **Start server:**
   ```bash
   ./bin/bolo-server config.json
   ```

3. **Access game** (without `?local` parameter):
   ```
   http://localhost:8080/
   ```

---

## Deployment

This repository is configured for GitHub Pages deployment from the repository root.

### Updating the Live Game

1. Make changes to game files
2. Commit and push to main branch
3. GitHub Pages automatically rebuilds
4. Changes appear at https://mattbcloud.github.io/bolo/

### Custom Domain

To use a custom domain:

1. Go to repository Settings → Pages
2. Enter your custom domain
3. Configure DNS CNAME record pointing to `mattbcloud.github.io`
4. Enable HTTPS enforcement

---

## Credits

### Orona (Browser Port)

- **Developer:** [Stéphan Kochen](https://github.com/stephank)
- **Repository:** https://github.com/stephank/orona
- **License:** GPL-2.0
- **Status:** Archived (2020) but functional

### Original Bolo

- **Creator:** Stuart Cheshire
- **Platform:** BBC Micro, Apple Macintosh
- **Genre:** Tank warfare / Strategy

### WinBolo Port

- **Developer:** John Morrison
- **Platform:** Windows, Linux
- **Source:** https://github.com/i68040/linbolo
- **License:** GPL-2.0

---

## Resources

### Play & Learn

- **Live Game:** https://mattbcloud.github.io/bolo/?local
- **Original Orona:** https://github.com/stephank/orona
- **WinBolo Source:** https://github.com/i68040/linbolo

### Documentation

- `ORONA_EXPLORATION.md` - Technical architecture analysis
- `ORONA_QUICKSTART.md` - Local development guide
- `GAME_README.md` - Original Orona documentation
- `setup-orona.sh` - Automated setup script

---

## Browser Compatibility

**Tested and working on:**
- ✅ Chrome/Edge (latest)
- ✅ Firefox (latest)
- ✅ Safari (latest)
- ✅ Opera (latest)

**Minimum requirements:**
- JavaScript enabled
- HTML5 Canvas support
- WebGL support (for best performance)
- Modern browser (2015 or newer)

---

## Known Issues

1. **Multiplayer server needs updates** for modern Node.js
   - Connect API has changed
   - Workaround: Use single-player mode with `?local`

2. **Mobile support is limited**
   - Designed for desktop browsers
   - Touch controls not implemented
   - Keyboard required for gameplay

3. **Old dependencies**
   - jQuery 1.6.4 (from original Orona)
   - CoffeeScript 1.6.3
   - Consider modernizing for new projects

---

## Contributing

Contributions welcome! Areas for improvement:

- 🎮 Implement AI opponents for single-player
- 📱 Add mobile/touch controls
- 🎨 Modernize UI/UX
- 🌐 Update multiplayer server for modern Node.js
- 🗺️ Add more classic Bolo maps
- 🔊 Improve sound system
- ⚡ Performance optimizations
- 📚 Better documentation

---

## License

- **This Repository:** MIT License (deployment and configuration)
- **Orona Source:** GPL-2.0 (Stéphan Kochen)
- **Original Bolo:** Freeware (Stuart Cheshire)
- **Graphics/Sounds:** Original Bolo assets

See individual source files for specific licensing details.

---

## Support

- **Game Issues:** Open an issue in this repository
- **Orona Source:** https://github.com/stephank/orona/issues
- **Bolo History:** https://en.wikipedia.org/wiki/Bolo_(1987_video_game)

---

**Enjoy the classic tank warfare action! 🎮💥**

*Last updated: October 2025*
