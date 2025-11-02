# Bolo

Bolo is a top-down game of tank warfare originally written by Stuart Cheshire for the BBC Micro and
Apple Macintosh, and also notably rewritten for Windows and Linux by John Morrison.

 * [The Bolo homepage][Bolo]
 * [The WinBolo homepage][WinBolo]
 * [The WinBolo project at Google Code][WinBolo project]

## Orona

Orona is a modern browser-based rewrite of Bolo, playable in any modern web browser. This version is
developed in [TypeScript] and uses modern web technologies including HTML5 Canvas and WebSockets for
real-time multiplayer gameplay.

The name comes from an uninhabited island situated in the central Pacific Ocean.

## Features

- Real-time multiplayer tank combat
- WebSocket-based networking for low-latency gameplay
- Canvas-based rendering with WebGL support
- Team-based gameplay (Red vs Blue)
- Base capturing and resource management
- Builder units for constructing defenses
- Pillboxes and mines for strategic defense

## Requirements

- [Node.js] (v14 or higher recommended)
- npm (comes with Node.js)
- A modern web browser with WebSocket and Canvas support

## Running an Orona Server

### Development Mode

To run the game in development mode with hot-reloading:

```bash
# Install dependencies
npm install

# Run the development servers (in separate terminals)
npm run dev          # Client dev server (http://localhost:3000)
npm exec tsx src/server/command.ts config.json  # Game server
```

### Production Build

To build and run the production version:

```bash
# Build client and server
npm run build

# Start the game server
npm exec tsx src/server/command.ts config.json
```

### Configuration

You will need a `config.json` file. If it doesn't exist, the server will create a sample one for you.
The IRC functionality is optional and used for match-making. If you don't want to connect to an IRC
network, simply remove the `irc` section from the config file.

Example `config.json`:
```json
{
  "port": 8124,
  "map": "maps/everard.json"
}
```

## Game Controls

### Movement & Combat
- **Arrow Keys**: Tank movement
  - Up: Accelerate
  - Down: Brake
  - Left: Turn counter-clockwise
  - Right: Turn clockwise
- **Spacebar**: Shoot
- **Z**: Increase firing range
- **X**: Decrease firing range

### Communication
- **T**: Open public chat
- **R**: Open team chat

### Building Tools
Use the tool selector in the HUD (bottom-left) and click on the map to:
- Build forests (requires trees)
- Build roads (requires trees)
- Build/repair buildings (requires trees)
- Build/repair pillboxes (requires trees)
- Lay mines (requires mines in inventory)

## HUD Display

The game displays:
- **Bottom-left**:
  - Tank status (shells, mines, armor, trees)
  - Pillbox indicators (gray circles)
  - Base indicators (colored squares showing team ownership)
  - Build tool selector
- **Bottom-right**: Tank status bars

## Recent Updates

### HUD Fix (2025)
Fixed an issue where pillbox and refueling base ownership changes weren't reflected in the HUD.
The fix ensures that when bases or pillboxes are captured during gameplay, the HUD indicators
update correctly by rebuilding the map object arrays after each object creation or destruction.

## Technology Stack

- **TypeScript**: Type-safe development
- **Vite**: Fast development server and build tool
- **WebSockets**: Real-time client-server communication
- **HTML5 Canvas**: 2D rendering (with optional WebGL acceleration)
- **Node.js**: Server runtime

## License

The source code of Orona is distributed with the GNU GPL version 2, as inherited from WinBolo.
Much of the game logic was written with WinBolo as a reference, thus becoming a derived work of it.
You can find a copy of the license in the COPYING file.

Some files, or parts of files, are subject to other licenses, where indicated in the files
themselves. A short overview of those parts follows.

All the graphic and sound files are from:

 * [Bolo], © 1993 Stuart Cheshire.

For the browser client, Orona also bundles:

 * Components that are part of [Villain].

## Contributing

Issue reports and pull requests are welcome at the project repository.

 [Bolo]: http://www.bolo.net/
 [WinBolo]: http://www.winbolo.com/
 [WinBolo project]: http://code.google.com/p/winbolo/
 [TypeScript]: https://www.typescriptlang.org/
 [Node.js]: http://nodejs.org/
 [Villain]: http://github.com/stephank/villain
