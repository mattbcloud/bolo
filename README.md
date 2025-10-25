# Bolo Multiplayer

A web-based multiplayer platform for playing **Bolo**, the classic Macintosh tank combat game, using browser-based Mac emulation with networked multiplayer support.

## Features

- **Browser-based Mac Emulation** - Powered by Infinite Mac (System 7.5.3)
- **Multiplayer Networking** - AppleTalk over Cloudflare Durable Objects
- **Easy Game Creation** - Generate game IDs or join existing games
- **Session Management** - Track game duration and network status
- **Clean UI** - Modern, responsive interface
- **No Installation** - Works entirely in the browser

## How It Works

1. **Game Sessions**: Each game has a unique Game ID that acts as a network zone
2. **Subdomain-based Networking**: Game IDs map to subdomains (e.g., `game-id.system7.app`)
3. **AppleTalk Emulation**: Players on the same subdomain share a virtual AppleTalk network
4. **Bolo Multiplayer**: Launch Bolo in the emulator and join network games

## Quick Start

### Local Testing

1. Clone this repository
2. Serve the files with any HTTP server:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js http-server
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

3. Open `http://localhost:8000` in your browser
4. Create or join a game

**Note**: Local testing uses the Infinite Mac infrastructure. Full subdomain networking requires deployment (see below).

### Playing Bolo

1. **Create or Join a Game**
   - Click "Create New Game" to generate a unique Game ID
   - Or enter an existing Game ID to join friends

2. **Wait for Mac to Boot**
   - The Mac emulator takes 10-15 seconds to boot
   - You'll see the Happy Mac icon, then the desktop

3. **Launch Bolo**
   - Double-click "Infinite HD" on the desktop
   - Navigate to and open "Bolo"
   - Wait for Bolo to load

4. **Start Network Game**
   - In Bolo, choose "Join Network Game" or "Start Server"
   - Other players on the same Game ID will appear
   - Start playing!

## Project Structure

```
bolo/
├── index.html              # Main HTML structure
├── styles.css              # All styling
├── app.js                  # Application logic
├── README.md               # This file
└── EMBEDDING_MACINTOSH_EMULATORS.md  # Technical documentation
```

## Configuration

Edit `app.js` to customize:

```javascript
const config = {
    baseUrl: 'system7.app',              // Subdomain base
    embedPath: '/embed',                  // Infinite Mac embed endpoint
    systemVersion: 'System%207.5.3',      // Mac OS version
    defaultSettings: {
        infinite_hd: 'true',              // Enable Infinite HD
        screen_update_messages: 'false'   // Disable screen updates
    }
};
```

## Deployment

### Option 1: Static Site Hosting (Recommended for Testing)

Deploy to any static hosting service:

- **GitHub Pages**: Push to `gh-pages` branch
- **Netlify**: Drag and drop the folder
- **Vercel**: Connect repository and deploy
- **Cloudflare Pages**: Push to repository

The site will work immediately but relies on Infinite Mac's infrastructure.

#### GitHub Pages

```bash
# Create gh-pages branch
git checkout -b gh-pages
git add .
git commit -m "Deploy Bolo Multiplayer"
git push origin gh-pages
```

Then enable GitHub Pages in repository settings.

#### Netlify

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --prod --dir=.
```

### Option 2: Custom Domain with Subdomain Wildcards

For full control over networking:

1. **Set up DNS**
   - Add wildcard DNS record: `*.yourdomain.com` → Your server IP
   - Configure SSL for wildcard subdomains

2. **Fork Infinite Mac**
   - Clone https://github.com/mihaip/infinite-mac
   - Deploy to Cloudflare Workers
   - Configure to use your domain

3. **Update Configuration**
   ```javascript
   const config = {
       baseUrl: 'yourdomain.com',
       // ... rest of config
   };
   ```

This gives you complete control but requires more setup.

## API Reference

### Emulator Communication

The app communicates with the Infinite Mac emulator via `postMessage`:

```javascript
// Send to emulator
iframe.contentWindow.postMessage({
    type: 'emulator_pause'
}, '*');

// Receive from emulator
window.addEventListener('message', (event) => {
    const data = event.data;
    if (data.type === 'emulator_ethernet_init') {
        console.log('MAC Address:', data.macAddress);
    }
});
```

### Available Message Types

**To Emulator:**
- `emulator_pause` - Pause emulation
- `emulator_unpause` - Resume emulation
- `emulator_mouse_move` - Send mouse movement
- `emulator_mouse_down` - Mouse button down
- `emulator_mouse_up` - Mouse button up
- `emulator_key_down` - Key press
- `emulator_key_up` - Key release
- `emulator_load_disk` - Load disk image

**From Emulator:**
- `emulator_ethernet_init` - Ethernet initialized (includes MAC address)
- `emulator_screen` - Screen update (if enabled)
- `emulator_ready` - Emulator ready

### Debug Interface

Access debug features in browser console:

```javascript
// View current state
window.boloDebug.state

// Control emulator
const emulator = window.boloDebug.emulator();
emulator.pause()
emulator.unpause()

// Copy game ID
window.boloDebug.copyGameId()
```

## Limitations

### Network Sync Issues

AppleTalk was designed for LAN play. Over the internet:
- Game state may desync after 15-20 minutes
- Higher latency causes more issues
- Recommend keeping sessions under 20 minutes

### Browser Requirements

- Modern browser with iframe support
- JavaScript enabled
- Decent internet connection
- `SharedArrayBuffer` support (for best performance)

### Known Issues

1. **Loading Time**: Mac emulator takes 10-15 seconds to boot
2. **Mobile Support**: Limited - designed for desktop browsers
3. **Session Duration**: Keep under 20 minutes to avoid sync issues
4. **Multiple Tabs**: Don't open same game in multiple tabs

## Troubleshooting

### Emulator Won't Load

- Check browser console for errors
- Ensure JavaScript is enabled
- Try a different browser (Chrome/Firefox recommended)
- Check internet connection

### Can't See Other Players

- Verify all players are using the exact same Game ID
- Wait 30-60 seconds for network to initialize
- Check that AppleTalk is enabled in emulator
- Try creating a new game

### Game Desyncs

- Keep sessions under 20 minutes
- Minimize network latency where possible
- Consider restarting the game session

### Bolo Won't Launch

- Ensure Mac has fully booted (see desktop)
- Look for "Infinite HD" on desktop
- Try double-clicking slowly and deliberately
- Wait for disk to mount

## Development

### Adding Features

Some ideas for enhancements:

1. **Chat System** - Add text chat alongside emulator
2. **Player List** - Show active players in current game
3. **Game History** - Track past games and scores
4. **Spectator Mode** - Watch games without playing
5. **Custom Maps** - Load custom Bolo maps
6. **Voice Chat** - Integrate WebRTC voice communication
7. **Leaderboards** - Track wins and statistics

### Contributing

Contributions welcome! Areas to improve:

- Better mobile support
- UI/UX enhancements
- Performance optimizations
- Additional documentation
- Bug fixes

## Technical Details

See [EMBEDDING_MACINTOSH_EMULATORS.md](EMBEDDING_MACINTOSH_EMULATORS.md) for in-depth technical documentation about:

- Infinite Mac architecture
- WebAssembly emulation
- AppleTalk networking
- Cloudflare Durable Objects
- Embedding API details

## Credits

- **Infinite Mac** by [Mihai Parparita](https://github.com/mihaip) - Mac emulation platform
- **Bolo** by Stuart Cheshire - The classic game itself
- **Emulator Cores** - Basilisk II, SheepShaver, and others

## Resources

- [Infinite Mac](https://infinitemac.org) - Main emulator site
- [Infinite Mac GitHub](https://github.com/mihaip/infinite-mac) - Source code
- [Blog Posts](https://blog.persistent.info) - Technical deep dives
- [Embed Documentation](https://infinitemac.org/embed-docs) - Embedding API

## License

This project is provided as-is for educational and entertainment purposes.

- This application: MIT License (or your choice)
- Infinite Mac: Check [upstream repository](https://github.com/mihaip/infinite-mac)
- Bolo: Freeware (check original license)

## Support

For issues with:
- **This application**: Open an issue in this repository
- **Infinite Mac emulator**: See https://github.com/mihaip/infinite-mac
- **Bolo gameplay**: Check classic Mac forums and resources

---

**Have fun playing Bolo! 🎮**
