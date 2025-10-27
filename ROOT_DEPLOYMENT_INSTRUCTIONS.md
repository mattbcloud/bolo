# Game Moved to Repository Root - Setup Instructions

## ✅ What Changed

All game files have been moved from `docs/` to the repository root `/`.

**Before:**
```
docs/
├── index.html
├── css/
├── js/
└── ...
```

**After:**
```
/
├── index.html
├── css/
├── js/
├── images/
├── maps/
├── sounds/
└── GAME_README.md
```

---

## 🚀 Steps to Complete Setup

### Step 1: Merge the Pull Request

1. **Go to your repository:**
   ```
   https://github.com/mattbcloud/bolo/pulls
   ```

2. **Find the PR:** "Move game to repository root for direct access"

3. **Merge the PR**

---

### Step 2: Update GitHub Pages Settings (IMPORTANT!)

After merging, you MUST change the GitHub Pages source folder:

1. **Go to Settings → Pages:**
   ```
   https://github.com/mattbcloud/bolo/settings/pages
   ```

2. **Under "Build and deployment" → "Source":**
   - **Branch:** Keep as `main`
   - **Folder:** Change from `/docs` to **`/ (root)`**

3. **Click Save**

4. **Wait 1-2 minutes** for GitHub to rebuild

---

## 🎮 Final Game URL

Once you've completed both steps above, your game will be at:

### Main URL:
```
https://mattbcloud.github.io/bolo/
```

### With single-player mode:
```
https://mattbcloud.github.io/bolo/?local
```

**No more `/docs/` or `/orona/` in the URL!** Just the clean root URL.

---

## ⚠️ Important Notes

1. **You MUST change the folder from `/docs` to `/` (root)** in GitHub Pages settings
   - If you don't do this, you'll still get 404 errors
   - The game files are no longer in `/docs`

2. **After changing settings, wait 2-3 minutes** for GitHub to rebuild

3. **Clear your browser cache** or use incognito mode when testing

---

## 📋 Checklist

- [ ] Merge the PR
- [ ] Go to Settings → Pages
- [ ] Change folder from `/docs` to `/` (root)
- [ ] Click Save
- [ ] Wait 2-3 minutes
- [ ] Try: https://mattbcloud.github.io/bolo/
- [ ] Clear browser cache if needed

---

## 🎯 Expected Result

When you visit `https://mattbcloud.github.io/bolo/`, you should see:
- ✅ The Bolo tank warfare game loads
- ✅ Game canvas appears
- ✅ Controls work
- ✅ Sound effects play

---

## 🆘 If You Get 404

1. **Verify GitHub Pages settings** show `/ (root)` not `/docs`
2. **Check Actions tab** - deployment succeeded?
3. **Hard refresh** browser (Ctrl+Shift+R)
4. **Try incognito/private mode**
5. **Wait 5 minutes** - CDN propagation can take time

---

Let me know when you've completed these steps!
