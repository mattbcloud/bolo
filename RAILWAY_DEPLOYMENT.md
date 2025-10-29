# Deploying Bolo Multiplayer Server to Railway

This guide will help you deploy the Bolo multiplayer game server to Railway.app.

## Prerequisites

- A GitHub account
- A Railway account (sign up at https://railway.app)
- This repository pushed to GitHub

## Deployment Steps

### 1. Push Code to GitHub

Make sure all changes are committed and pushed to your GitHub repository:

```bash
git add .
git commit -m "Add multiplayer server for Railway deployment"
git push origin main
```

### 2. Deploy to Railway

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your `mattbcloud/bolo` repository
5. Railway will automatically detect it's a Node.js app

### 3. Configure Environment Variables (Optional)

Railway automatically sets:
- `PORT` - The port your server should listen on
- `RAILWAY_PUBLIC_DOMAIN` - Your app's public URL

No additional configuration needed! The server automatically uses these.

### 4. Wait for Deployment

Railway will:
1. Install dependencies (`npm install`)
2. Initialize git submodules (villain)
3. Run `npm start` to start the server

Deployment typically takes 2-3 minutes.

### 5. Access Your Game

Once deployed, Railway will provide a URL like:
```
https://bolo-production.up.railway.app
```

**To play:**
- Open the URL in your browser
- The game will automatically connect to the multiplayer server
- Share the URL with friends to play together!

## Project Structure

The server includes:

```
bolo/
├── src/                    # Server source code (CoffeeScript)
│   ├── server/            # Server application
│   └── client/            # Client code (bundled)
├── bin/
│   └── bolo-server        # Server executable
├── package.json           # Dependencies and start script
├── config.json            # Server configuration
├── Procfile              # Railway process definition
└── index.html            # Game client page
```

## Configuration

### config.json

Default configuration works for Railway. Key settings:

```json
{
  "general": {
    "base": "https://bolo-production.up.railway.app",
    "maxgames": 5
  },
  "web": {
    "port": 8124,
    "log": true
  }
}
```

**Note:** The `base` URL and `port` are automatically overridden by environment variables when running on Railway.

## Server Features

- ✅ **WebSocket Support** - Real-time multiplayer
- ✅ **Auto-scaling** - Handles multiple games
- ✅ **Map Support** - Includes Everard Island map
- ✅ **Persistent Connections** - Players stay connected
- ✅ **Game Sessions** - Create and join games

## Local Testing

Test the server locally before deploying:

```bash
# Install dependencies
npm install
git submodule update --init

# Start server
npm start

# Open browser
open http://localhost:8124
```

## Troubleshooting

### Server Won't Start

Check Railway logs:
1. Go to your project in Railway
2. Click "Deployments"
3. Click the latest deployment
4. View logs

Common issues:
- Missing `node_modules/villain` - Run `git submodule update --init`
- Port conflicts - Railway sets PORT automatically
- Configuration errors - Check config.json syntax

### Can't Connect to Game

1. Check server is running in Railway dashboard
2. Verify the URL is correct
3. Check browser console for errors (F12)
4. Ensure WebSocket connections aren't blocked by firewall

### Multiple Players Can't Join

- Default config allows 5 concurrent games
- Edit `config.json` to increase `maxgames`
- Each game supports multiple players

## Updating the Server

To deploy updates:

```bash
# Make changes
git add .
git commit -m "Update description"
git push origin main
```

Railway automatically redeploys when you push to GitHub.

## Cost

Railway free tier includes:
- $5 of free usage per month
- Enough for development and testing
- Scales to paid plans as needed

## Support

- **Server Issues:** Check Railway logs
- **Game Issues:** Open issue on GitHub
- **Railway Help:** https://docs.railway.app

## Next Steps

After deployment:
1. Test the multiplayer functionality
2. Share the URL with friends
3. Monitor usage in Railway dashboard
4. Consider custom domain (Railway Pro)

Enjoy your multiplayer Bolo server! 🎮
