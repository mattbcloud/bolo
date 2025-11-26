# Orona Development Workflow

## Project Overview
Multiplayer tank combat game (Bolo remake) built with TypeScript, Node.js, and WebSockets.

**Project location**: `/Users/matthew.benjamin/orona-new/`

## Server Architecture

The project runs **TWO separate servers**:

1. **Client Dev Server (Vite)** - Port 3000
   - Serves the game client
   - Hot-reloads client code changes
   - Proxies API requests to game server

2. **Game Server** - Port 8124
   - Handles game logic and WebSocket connections
   - Runs with `tsx watch` for auto-reload on changes
   - Uses `config.json` for configuration

## Development Workflow

### After Making Changes Ready for Testing

**ALWAYS run this command:**
```bash
./restart-servers.sh
```

This automated script does the following:
1. Builds client: `npm run build:client` (TypeScript → Vite)
2. Builds server: `npm run build:server` (TypeScript)
3. Kills processes on ports 3000 and 8124
4. Starts game server: `npm run dev:server` (with auto-reload)
5. Starts client dev server: `npm run dev` (with hot-reload)

### Accessing the Game
- Client: http://localhost:3000
- Game server API: http://localhost:8124

### Stopping Servers
```bash
lsof -ti:3000 -ti:8124 | xargs kill -9
```

## Important Files

- `package.json` - NPM scripts configuration
- `config.json` - Game server configuration (port 8124, max games, etc.)
- `vite.config.ts` - Client dev server config (port 3000, proxy settings)
- `.env` - Firebase configuration for team stats
- `src/server/command.ts` - Game server entry point
- `restart-servers.sh` - Automated build and restart script

## TypeScript Configuration

- `tsconfig.client.json` - Client TypeScript config
- `tsconfig.server.json` - Server TypeScript config
- `tsconfig.json` - Base TypeScript config

## Build Outputs

- `dist/client/` - Built client files
- `dist/server/` - Built server files

## Key NPM Scripts

- `npm run build:client` - Build client only
- `npm run build:server` - Build server only
- `npm run dev:server` - Start game server with watch mode
- `npm run dev` - Start Vite dev server
- `npm start` - Production server start

## Firebase Integration

The game includes a Firebase-based team stats system:
- Database URL: Set in `.env`
- Service account: `bolo-16677-firebase-adminsdk-fbsvc-0f7d535043.json`
- Records team rankings and aggregates hourly/daily/monthly data
- Initialized in `src/server/application.ts`

## Remember

- TypeScript must compile successfully before servers start
- Both servers must be running for the game to work
- The client dev server proxies requests to the game server
- Always use `./restart-servers.sh` when ready to test changes
