# GitHub Pages Setup Instructions

The Orona game has been deployed to your repository and is ready to be served via GitHub Pages!

## Step 1: Enable GitHub Pages

1. Go to your repository on GitHub:
   ```
   https://github.com/mattbcloud/bolo
   ```

2. Click on **Settings** (top menu)

3. Scroll down to **Pages** in the left sidebar

4. Under **Source**, select:
   - **Branch**: `claude/review-game-code-011CUWfic526tH1rEBaDmbYc`
   - **Folder**: `/docs`

5. Click **Save**

6. Wait 1-2 minutes for GitHub to build and deploy

## Step 2: Access the Game

Once GitHub Pages is enabled, you can access the game at:

### Main Landing Page:
```
https://mattbcloud.github.io/bolo/
```

### Direct Game Link:
```
https://mattbcloud.github.io/bolo/orona/index.html?local
```

## Alternative: Merge to Main Branch

If you'd prefer to host from your main branch:

1. **Merge the PR** that will be created from this branch
2. In GitHub Pages settings, select:
   - **Branch**: `main` (or `master`)
   - **Folder**: `/docs`

## What's Deployed

The `docs/` directory contains:
- ✅ Complete Orona game (206KB bundle)
- ✅ All game assets (maps, images, sounds)
- ✅ Landing page with game info
- ✅ Single-player mode ready to play

## Troubleshooting

### Game doesn't load?
- Check browser console for errors
- Make sure GitHub Pages is enabled
- Try hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

### GitHub Pages not showing?
- Ensure you selected the correct branch and `/docs` folder
- Wait a few minutes after enabling
- Check the Actions tab for deployment status

### Game loads but doesn't work?
- Try adding `?local` to the URL for single-player mode
- Check browser compatibility (modern browsers only)
- Enable JavaScript if disabled

## Custom Domain (Optional)

If you have a custom domain, you can configure it in GitHub Pages settings after enabling Pages.

## Notes

- The game runs entirely in the browser (client-side only)
- No server needed for single-player mode
- Multiplayer server would need separate hosting
- All assets served via GitHub's CDN

Enjoy the game! 🎮
