# Orona Browser Game Exploration

## Summary

Explored whether WinBolo game code could run in a browser. Discovered **Orona**, an existing HTML5/JavaScript port of Bolo that already runs in browsers.

## What is Orona?

- **Repository**: https://github.com/stephank/orona
- **Status**: Archived (2020), but functional
- **Technology**: CoffeeScript → JavaScript, HTML5 Canvas/WebGL
- **License**: GPL-2.0

## Local Setup Completed

Successfully cloned and built Orona locally at `/home/user/bolo/orona/`

### Changes Made to Get It Working

1. **Updated package.json dependencies** (Node.js v22 compatibility):
   - `coffee-script: 1.6.3` (fixed from 1.x)
   - `irc-js: ^0.2.0` (fixed from non-existent 2.x)
   - `browserify: ^17.0.0` (updated)
   - `connect: ^3.7.0` (updated)
   - `faye-websocket: ^0.11.0` (updated)

2. **Fixed Cakefile** (build system):
   - Updated Browserify API usage (modern stream-based)
   - Added CoffeeScript compilation for src/ and villain submodule
   - Generated bundle: `js/bolo-bundle.js` (206KB)

3. **Fixed server/command.coffee**:
   - Replaced deprecated `{puts} = require 'sys'` with `console.log`

### Running the Game

**Single-player mode** (no server needed):
```bash
cd /home/user/bolo/orona
npx cake build
python3 -m http.server 8080
```

Access at: `http://localhost:8080/index.html?local`

### Architecture Highlights

**Client** (`src/client/`):
- Multiple renderers: Direct 2D Canvas, Offscreen Canvas, WebGL
- Game objects: Tanks, Shells, Pillboxes, Bases, Builders, Explosions
- Local and networked world implementations

**Server** (`src/server/`):
- Node.js multiplayer server (needs API updates for modern Node)
- WebSocket support via faye-websocket
- Optional IRC integration for matchmaking

**Networking Library** (villain submodule):
- Custom game networking layer
- WebSocket-based communication

## Comparison: Orona vs WinBolo vs JBolo

| Feature | Orona | JBolo | WinBolo |
|---------|-------|-------|---------|
| Language | CoffeeScript/JS | Java | C/C++ |
| Platform | Browser | JVM | Windows/Linux |
| Status | Archived but works | Broken | Complete |
| Browser Ready | ✅ Yes | Via CheerpJ | Via WASM |
| Effort to Run | Low | High | Very High |

## Conclusion

**Orona is already a working browser-based implementation of Bolo.** It successfully demonstrates that the WinBolo game *can* run in browsers, and in fact already does through this HTML5 port.

The code is well-architected, uses modern web technologies (for 2020), and provides both single-player and multiplayer capabilities.

## Files Modified Locally

- `orona/package.json` - Dependency updates
- `orona/Cakefile` - Build process fixes
- `orona/src/server/command.coffee` - API compatibility fix

Note: The full orona clone is excluded from this repository as it's a complete project with its own git history.
