# Embedding Macintosh Emulators for Multiplayer Bolo

## Overview

This document summarizes how to embed Macintosh emulators into webpages to enable multiplayer classic Mac gaming, specifically for running Bolo in a browser with networked multiplayer capabilities.

## Infinite Mac Project

**Project:** https://github.com/mihaip/infinite-mac
**Live Site:** https://infinitemac.org
**Creator:** Mihai Parparita

### What It Is

Infinite Mac provides browser-based emulation of classic Macintosh computers from the 1980s-2000s (System 1.0 through Mac OS X 10.4 Tiger) using WebAssembly.

### Core Technology

**Emulator Cores (compiled to WebAssembly via Emscripten):**
- **Basilisk II** - 68K Mac emulation (System 6-9)
- **SheepShaver** - PowerPC emulation
- **Mini vMac** - Multiple Mac variants (128K, 512Ke, SE, II, IIx)
- **DingusPPC** - PowerPC emulation
- **PearPC** - PowerPC emulation
- **Previous** - NeXT computer emulation

**Infrastructure:**
- Cloudflare Workers for dynamic content delivery
- Cloudflare R2 for disk image storage
- Disk images are chunked with manifests for efficient serving
- TypeScript-based (80.2% of codebase)

---

## Embedding API

### Embed Endpoint

**URL:** `https://infinitemac.org/embed`

The /embed endpoint provides a YouTube-like embedding experience:
- Hides screen bezel and other UI chrome
- Controls screen resolution
- Sends/receives mouse and keyboard events
- Provides screen content notifications
- Supports auto-pausing when hidden

### Documentation

**Full API Docs:** https://infinitemac.org/embed-docs
**Embed Builder:** https://infinitemac.org/embed (generates iframe HTML)
**Test Examples:** https://infinitemac.org/embed-testbed

### Basic Iframe Setup

```html
<iframe
    src="https://infinitemac.org/embed?disk=System%207.5&infinite_hd=true"
    allow="cross-origin-isolated"
    width="512"
    height="342"
></iframe>
```

### Query Parameters

Key configuration options for the embed URL:

- **disk** - System version selection (e.g., "System 7.5", "Mac OS 8", etc.)
- **infinite_hd** - Enable infinite hard drive (boolean)
- **screen_update_messages** - Request screen updates (boolean)
- **paused** - Launch in paused state (boolean)
- **settings** - JSON configuration object, e.g., `{"swapControlAndCommand":true}`

---

## JavaScript Communication API

The embed uses `postMessage()` for bidirectional communication between parent page and iframe.

### Sending Messages to Emulator

```javascript
const iframe = document.querySelector('iframe');
const emulator = iframe.contentWindow;

// Emulation control
emulator.postMessage({type: "emulator_pause"}, '*');
emulator.postMessage({type: "emulator_unpause"}, '*');

// Mouse input
emulator.postMessage({
    type: "emulator_mouse_move",
    x: 100,
    y: 100,
    deltaX: 5,
    deltaY: 5
}, '*');

emulator.postMessage({type: "emulator_mouse_down", button: 0}, '*');
emulator.postMessage({type: "emulator_mouse_up", button: 0}, '*');

// Keyboard input
emulator.postMessage({type: "emulator_key_down", code: "KeyA"}, '*');
emulator.postMessage({type: "emulator_key_up", code: "KeyA"}, '*');

// Disk loading
emulator.postMessage({
    type: "emulator_load_disk",
    url: "https://example.com/disk.dsk"
}, '*');
```

### Receiving Messages from Emulator

```javascript
window.addEventListener('message', function(e) {
    const data = e.data;

    if (data.type === "emulator_screen") {
        // Screen data available
        console.log('Screen size:', data.width, 'x', data.height);
        // data.data contains the pixel buffer
    }

    if (data.type === "emulator_ethernet_init") {
        console.log('Ethernet initialized:', data.macAddress);
    }
});
```

---

## Multiplayer Networking with AppleTalk

### How It Works

Infinite Mac implements networked multiplayer gaming (including Bolo and Marathon) using:

1. **AppleTalk over Ethernet emulation**
2. **Cloudflare Durable Objects** for packet routing
3. **Subdomain-based zones** for creating isolated networks

### Technical Implementation

**Architecture Components:**

1. **ether_js.cpp** - JavaScript-based Ethernet implementation
   - Generates random MAC addresses
   - Forwards packets via postMessage
   - Uses SharedArrayBuffer-backed ring buffer
   - Triggers interrupts every 16ms

2. **Ethernet Providers:**
   - `BroadcastChannelEthernetProvider` - Cross-tab communication (local testing)
   - `CloudflareWorkerEthernetProvider` - Uses Durable Objects for multi-client zones

3. **AppleTalk Features:**
   - Distinguishes AppleTalk broadcast addresses
   - PRAM preference controls enablement
   - Handles AARP probe requests (~5-second boot delay)

### Using Subdomains for Multiplayer

**Key Concept:** Subdomains define "zones" where AppleTalk packets are broadcast.

**Examples:**
- `https://demo.system7.app` - Everyone on this subdomain shares a network
- `https://bolo-game-1.system7.app` - Custom zone for specific game
- `https://yourname.macos9.app` - Create your own private zone

**How to Use:**
1. Choose a unique subdomain for your game session
2. All players visit the same subdomain URL
3. AppleTalk networking is automatically enabled
4. Players can see each other in networked games

**Note:** AppleTalk is NOT enabled on the default infinitemac.org domain, only on subdomains.

### Bolo-Specific Configuration

While the exact query parameter syntax isn't fully documented, Bolo can be pre-configured:

```
https://infinitemac.org/1996/System%207.5.3?appleTalk=bolo
```

This appears to:
- Load System 7.5.3 (optimal for Bolo)
- Enable AppleTalk
- Possibly pre-launch or configure Bolo

### Networking Performance Notes

From the blog:
> "The network protocol was designed for LAN play, and does not handle the increased latency of being played over the internet well. If playing for more than 15-20 minutes the game state gets out of sync between players."

**Recommendations:**
- Keep game sessions under 15-20 minutes
- Use lower latency connections when possible
- Consider implementing sync checkpoints or restart mechanisms

---

## Building a Multiplayer Bolo Site

### Architecture Options

**Option 1: Full Infinite Mac Embed (Easiest)**
- Embed infinitemac.org/embed iframes directly
- Use subdomain-based zones for multiplayer
- Minimal custom code required
- Relies on Infinite Mac infrastructure

**Option 2: Fork Infinite Mac (Most Control)**
- Clone https://github.com/mihaip/infinite-mac
- Customize UI and networking
- Deploy to your own Cloudflare Workers
- Full control over infrastructure

**Option 3: Hybrid Approach**
- Use Infinite Mac embeds
- Build custom lobby/matchmaking UI
- Dynamically generate unique subdomains for game sessions
- Add custom features like chat, game history, etc.

### Recommended Approach for Bolo

```html
<!DOCTYPE html>
<html>
<head>
    <title>Bolo Multiplayer</title>
    <style>
        .game-container {
            max-width: 640px;
            margin: 0 auto;
        }
        iframe {
            border: none;
            width: 100%;
            height: 480px;
        }
    </style>
</head>
<body>
    <div class="game-container">
        <h1>Bolo Multiplayer</h1>
        <div id="lobby">
            <h2>Join a Game</h2>
            <input type="text" id="gameId" placeholder="Enter game ID">
            <button onclick="joinGame()">Join Game</button>
            <button onclick="createGame()">Create New Game</button>
        </div>
        <div id="game" style="display:none;">
            <h2>Game: <span id="currentGameId"></span></h2>
            <p>Share this game ID with other players</p>
            <iframe id="emulator" allow="cross-origin-isolated"></iframe>
        </div>
    </div>

    <script>
        function createGame() {
            const gameId = 'bolo-' + Math.random().toString(36).substring(7);
            loadGame(gameId);
        }

        function joinGame() {
            const gameId = document.getElementById('gameId').value;
            if (gameId) {
                loadGame(gameId);
            }
        }

        function loadGame(gameId) {
            // Use subdomain-based networking
            const subdomain = gameId;
            const embedUrl = `https://${subdomain}.system7.app/embed?` +
                `disk=System%207.5.3&` +
                `infinite_hd=true&` +
                `screen_update_messages=false`;

            document.getElementById('lobby').style.display = 'none';
            document.getElementById('game').style.display = 'block';
            document.getElementById('currentGameId').textContent = gameId;
            document.getElementById('emulator').src = embedUrl;

            // Listen for emulator messages
            window.addEventListener('message', handleEmulatorMessage);
        }

        function handleEmulatorMessage(e) {
            const data = e.data;

            if (data.type === "emulator_ethernet_init") {
                console.log('Connected to network:', data.macAddress);
            }
        }
    </script>
</body>
</html>
```

### Key Features to Add

1. **Lobby System**
   - Game ID generation
   - Player list
   - Game status (waiting/in progress)

2. **Communication**
   - Text chat between players
   - Voice chat integration
   - Game state synchronization

3. **Game Management**
   - Create/join/leave games
   - Save game history
   - Player statistics

4. **Quality of Life**
   - Keyboard/mouse lock toggle
   - Screen recording
   - Session time limits (due to sync issues)
   - Auto-reconnect on disconnect

---

## Development Workflow

### Local Development

If you want to work with Infinite Mac locally:

```bash
# Clone repository
git clone --recursive https://github.com/mihaip/infinite-mac
cd infinite-mac

# Install dependencies
npm install

# Start dev server (port 3127)
npm run start

# Visit http://localhost:3127
```

### Testing Multiplayer Locally

For local AppleTalk testing, use BroadcastChannel provider:
- Open multiple browser tabs
- They'll automatically connect via BroadcastChannel
- No Cloudflare Workers needed for local testing

### Deployment Considerations

**If using Infinite Mac as-is:**
- No deployment needed
- Just embed the iframes
- Relies on infinitemac.org availability

**If self-hosting:**
- Need Cloudflare account
- Configure Cloudflare Workers
- Set up Durable Objects (networking)
- Upload disk images to R2
- Configure DNS/subdomains

---

## Resources

### Official Links
- **Blog:** https://blog.persistent.info
- **Main Site:** https://infinitemac.org
- **GitHub:** https://github.com/mihaip/infinite-mac
- **Embed Docs:** https://infinitemac.org/embed-docs
- **Embed Builder:** https://infinitemac.org/embed

### Key Blog Posts
- [Infinite Mac Construction Set](https://blog.persistent.info/2025/07/infinite-mac-embedding.html) - Embedding API
- [Infinite Mac on a (Virtual) LAN](https://blog.persistent.info/2022/07/infinite-mac-networking.html) - Networking implementation
- [Infinite Mac: An Instant-Booting Quadra](https://blog.persistent.info/2022/03/blog-post.html) - Project origins

### Technical References
- Basilisk II architecture documentation
- AppleTalk protocol specifications
- Cloudflare Durable Objects docs
- WebAssembly/Emscripten guides

---

## Next Steps for Your Project

1. **Prototype**
   - Create basic HTML page with iframe embed
   - Test subdomain-based networking
   - Verify Bolo loads and runs

2. **Multiplayer Testing**
   - Set up test subdomain
   - Have 2+ users join same subdomain
   - Test Bolo multiplayer functionality
   - Document any sync issues or timing problems

3. **Build UI**
   - Lobby system for creating/joining games
   - Player management
   - Game session tracking

4. **Enhance**
   - Add chat/communication
   - Implement game history
   - Add spectator mode
   - Create leaderboards

5. **Polish**
   - Responsive design
   - Mobile support (if feasible)
   - Error handling
   - Performance optimization

---

## Important Notes

- Bolo was designed for LAN play - expect some sync issues over internet
- Session duration should be kept under 15-20 minutes
- AppleTalk only works on subdomains, not main infinitemac.org
- Each subdomain creates an isolated network zone
- Cloudflare Durable Objects handle packet routing between zones
- The emulator auto-generates MAC addresses
- Screen resolution is configurable via query parameters

---

## Questions to Investigate

1. Can we improve sync stability for longer game sessions?
2. What's the optimal System version for Bolo? (7.5.3 seems common)
3. Can we pre-load Bolo automatically on boot?
4. Is there a way to save/restore game state?
5. Can we customize the Infinite HD to include only Bolo?
6. What's the player limit per zone?
7. Can we add server-side game state validation?

---

*Document created: 2025-10-25*
*Based on research of Infinite Mac project and blog.persistent.info*
