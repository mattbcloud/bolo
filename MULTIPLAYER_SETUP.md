# Orona Multiplayer Server Setup Guide

This guide explains how to set up and run the Orona multiplayer server to enable network play.

---

## Understanding Game Modes

Orona has two distinct modes:

### 1. **Local Mode** (Single-Player)
- Runs entirely in the browser
- No server required
- Access via: `https://mattbcloud.github.io/bolo/?local`
- Perfect for solo play and testing

### 2. **Network Mode** (Multiplayer)
- Requires a WebSocket server
- Supports multiple players in real-time
- Uses WebSocket protocol for communication
- Access via: `http://your-server:8124/` (without `?local`)

---

## Current Issue

When you access the game **without** the `?local` parameter, it tries to connect to a WebSocket server at:
```
ws://mattbcloud.github.io/demo
```

Since GitHub Pages doesn't provide WebSocket server capabilities, the connection fails and you see:
```
"Connecting to the multiplayer game"
```

**Solution:** Either use `?local` for single-player, or set up your own multiplayer server (instructions below).

---

## Quick Fix: Single-Player Mode

Simply add `?local` to your URL:

**Before:** `https://mattbcloud.github.io/bolo/`
**After:** `https://mattbcloud.github.io/bolo/?local`

This runs the game entirely in your browser with no server needed.

---

## Setting Up Multiplayer Server

To enable real multiplayer, you need to run the Orona server on a machine with a public IP or domain.

### Prerequisites

- Node.js v16 or higher
- A server with public IP address or domain
- Port 8124 (or custom) open for HTTP and WebSocket traffic

### Step 1: Clone and Setup

```bash
# Clone the Orona source (not this deployment repo)
git clone https://github.com/stephank/orona.git
cd orona

# Initialize submodules
git submodule update --init

# Install dependencies
npm install
```

### Step 2: Update Dependencies (Required)

The original Orona uses deprecated packages. Update `package.json`:

```json
{
  "name": "orona",
  "version": "0.0.0",
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

Then:
```bash
npm install
```

### Step 3: Fix Server Code

The server uses deprecated Connect.js API. You need to update `src/server/application.coffee`:

**Current code (lines 285-290):**
```coffeescript
@connectServer = connect.createServer()
if options.web.log
  @connectServer.use '/', connect.logger()
@connectServer.use '/', redirector(options.general.base)
@connectServer.use '/', connect.static(webroot)
@connectServer.listen options.web.port
```

**Fixed code:**
```coffeescript
http = require 'http'
@connectServer = connect()
if options.web.log
  @connectServer.use '/', connect.logger()
@connectServer.use '/', redirector(options.general.base)
@connectServer.use '/', connect.static(webroot)
@httpServer = http.createServer(@connectServer)
@httpServer.listen options.web.port
```

And update the WebSocket attachment (around line 298):
```coffeescript
# Before:
@ws.attach(@connectServer)

# After:
@ws.attach({server: @httpServer})
```

### Step 4: Create Configuration

Create `config.json`:

```json
{
  "general": {
    "base": "http://your-domain.com:8124",
    "maxgames": 5
  },
  "web": {
    "port": 8124,
    "log": true
  },
  "irc": {
    "enabled": false
  }
}
```

**Replace `your-domain.com` with:**
- Your public domain name
- Your public IP address
- `localhost` for local testing

### Step 5: Build the Game

```bash
npx cake build
```

This compiles CoffeeScript and creates the JavaScript bundle.

### Step 6: Start the Server

```bash
node src/server/command.js config.json
```

Or if using CoffeeScript directly:
```bash
coffee src/server/command.coffee config.json
```

You should see:
```
Bolo server listening on http://your-domain.com:8124
```

### Step 7: Connect Players

Players can now connect to:
```
http://your-domain.com:8124/
```

**Note:** Do NOT include `?local` parameter for multiplayer.

---

## Server Architecture

### WebSocket Protocol

The server uses WebSocket for real-time bidirectional communication:

- **Client → Server:** Tank controls, chat messages, build orders
- **Server → Client:** Game state updates, player positions, map changes

### Message Types

**Binary Messages (Game State):**
- `CREATE_MESSAGE` - Spawn objects
- `DESTROY_MESSAGE` - Remove objects
- `UPDATE_MESSAGE` - State synchronization
- `MAPCHANGE_MESSAGE` - Terrain modifications
- `SOUNDEFFECT_MESSAGE` - Audio cues

**JSON Messages (Metadata):**
- `join` - Player joins game
- `msg` - Public chat
- `teamMsg` - Team chat
- `nick` - Player nickname updates

### Game Tick Rate

- Server runs at 25 FPS (40ms per tick)
- Critical updates sent every frame
- Non-critical updates every other frame
- Heartbeat messages every 10 ticks (400ms)

---

## Hosting Options

### Local Network (LAN Parties)

```bash
# Find your local IP
ifconfig  # macOS/Linux
ipconfig  # Windows

# Start server on local IP
# Update config.json to use: http://192.168.1.100:8124
node src/server/command.js config.json
```

### Cloud Hosting

**Recommended Platforms:**
- DigitalOcean Droplet ($5-10/month)
- AWS EC2 t2.micro (Free tier available)
- Heroku Dyno (Free tier available, but may sleep)
- Google Cloud Compute Engine

**Requirements:**
- 512MB RAM minimum
- 1GB disk space
- Open port 8124 (or custom)
- WebSocket support enabled

### Docker Deployment

Create `Dockerfile`:

```dockerfile
FROM node:16-alpine

WORKDIR /app
COPY . .

RUN apk add --no-cache git && \
    git submodule update --init && \
    npm install && \
    npx cake build

EXPOSE 8124

CMD ["node", "src/server/command.js", "config.json"]
```

Run:
```bash
docker build -t orona-server .
docker run -p 8124:8124 -v ./config.json:/app/config.json orona-server
```

---

## Troubleshooting

### "Connection lost" immediately

**Cause:** WebSocket not upgrading properly

**Fix:** Ensure your reverse proxy (if any) supports WebSocket upgrades:

**Nginx:**
```nginx
location / {
    proxy_pass http://localhost:8124;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**Apache:**
```apache
ProxyPass / http://localhost:8124/
ProxyPassReverse / http://localhost:8124/
```

### "Cannot find module" errors

**Cause:** Missing dependencies

**Fix:**
```bash
npm install
git submodule update --init
coffee -c node_modules/villain/*.coffee
coffee -c node_modules/villain/world/*.coffee
coffee -c node_modules/villain/world/net/*.coffee
```

### Port already in use

**Fix:**
```bash
# Find process using port 8124
lsof -i :8124  # macOS/Linux
netstat -ano | findstr :8124  # Windows

# Kill the process or change port in config.json
```

### HTTPS Required (Mixed Content Error)

**Cause:** GitHub Pages uses HTTPS, but your server uses HTTP

**Fix:** Set up SSL/TLS on your server:

```bash
# Use Let's Encrypt
sudo apt-get install certbot
sudo certbot certonly --standalone -d your-domain.com

# Update config.json
{
  "general": {
    "base": "https://your-domain.com:8124"
  }
}
```

Or use a reverse proxy with SSL termination (Cloudflare Tunnel, ngrok, etc.).

---

## Security Considerations

1. **Rate Limiting:** Add rate limiting to prevent spam/abuse
2. **Input Validation:** Server already validates player nicknames and commands
3. **DDoS Protection:** Use Cloudflare or similar service
4. **Firewall:** Only open port 8124 (or custom port)
5. **Authentication:** Consider adding player authentication for private servers

---

## Optional IRC Integration

Orona supports IRC for matchmaking and chat:

```json
{
  "irc": {
    "enabled": true,
    "server": "irc.libera.chat",
    "port": 6667,
    "nick": "BoloBot",
    "channel": "#bolo-games"
  }
}
```

This announces games to IRC channels for easier player recruitment.

---

## Performance Tuning

### For High Player Counts

Edit `src/server/application.coffee`:

```coffeescript
# Increase max players per game
TICK_RATE = 40  # milliseconds (25 FPS)
MAX_TANKS = 32  # default is 32

# Reduce update frequency for distant objects
# (Requires custom implementation)
```

### Monitoring

Add logging to track performance:

```bash
# Enable detailed logging in config.json
{
  "web": {
    "log": true
  }
}

# Monitor with PM2
npm install -g pm2
pm2 start src/server/command.js -- config.json
pm2 logs
pm2 monit
```

---

## Alternative: Use ?local for Single-Player

If setting up a server is too complex, simply use Local Mode:

**URL:** `https://mattbcloud.github.io/bolo/?local`

This gives you a fully functional single-player experience with no server setup required.

---

## Resources

- **Orona Source:** https://github.com/stephank/orona
- **WebSocket Docs:** https://github.com/faye/faye-websocket-node
- **Connect.js Migration:** https://github.com/senchalabs/connect/blob/master/History.md

---

## Summary

**For Single-Player (Easiest):**
```
https://mattbcloud.github.io/bolo/?local
```

**For Multiplayer (Advanced):**
1. Set up a server with Node.js
2. Fix deprecated Connect.js API
3. Create config.json
4. Build and run the server
5. Share your server URL (without `?local`)

---

**Need help?** Open an issue in the repository or check the Orona documentation.
