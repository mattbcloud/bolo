# GitHub Pages 404 Error - Troubleshooting Guide

You're getting a 404 error. Let's fix this!

## Most Common Causes:

### 1. **Repository Visibility** (Most Likely Issue)

**Problem:** Your repository might be set to **Private**. GitHub Pages requires a public repository (or GitHub Pro for private repos).

**Solution:**
1. Go to: `https://github.com/mattbcloud/bolo/settings`
2. Scroll to the **very bottom** of the page
3. Look for **"Danger Zone"** section
4. Click **"Change visibility"**
5. Select **"Make public"**
6. Confirm the change

---

### 2. **GitHub Pages Configuration**

**Verify your settings are correct:**

1. Go to: `https://github.com/mattbcloud/bolo/settings/pages`

2. **Check these settings:**
   - **Source:** Deploy from a branch
   - **Branch:** `main`
   - **Folder:** `/docs`
   - Click **Save** (if needed)

3. **Look for the deployment URL** at the top - it should show:
   ```
   Your site is live at https://mattbcloud.github.io/bolo/
   ```

---

### 3. **Deployment Status**

**Check if deployment is complete:**

1. Go to: `https://github.com/mattbcloud/bolo/actions`

2. Look for **"pages build and deployment"** workflow

3. Check the status:
   - ✅ Green checkmark = Deployed successfully
   - 🟡 Yellow dot = Still deploying (wait a few minutes)
   - ❌ Red X = Deployment failed (click to see error)

---

### 4. **Branch Check**

**Verify you're on the right branch:**

1. Go to: `https://github.com/mattbcloud/bolo`

2. Check the branch dropdown (should show **"main"**)

3. Navigate to the `docs/` folder and verify files are there:
   - Click on `docs/`
   - You should see `index.html` and `orona/` folder

---

## Quick Diagnostic Checklist:

Run through this checklist:

- [ ] Repository is **Public** (not Private)
- [ ] GitHub Pages is **enabled** in Settings → Pages
- [ ] Source is set to **main** branch, **/docs** folder
- [ ] Latest deployment in Actions tab is **successful** (green ✓)
- [ ] `docs/index.html` exists in the main branch
- [ ] Waited at least **2-3 minutes** after enabling Pages

---

## What URLs Should Work:

After fixing the issue, these should work:

**Landing Page:**
```
https://mattbcloud.github.io/bolo/
```

**Game (Single Player):**
```
https://mattbcloud.github.io/bolo/orona/index.html?local
```

---

## Still Getting 404?

If you've checked everything above and still get 404:

### Option A: Check Repository Visibility
```
Go to: https://github.com/mattbcloud/bolo/settings
Look for "Visibility" section
```

### Option B: Re-Deploy
1. Make a small change to `docs/index.html`
2. Commit and push
3. Wait for automatic deployment

### Option C: Verify File Paths
1. Go to: `https://github.com/mattbcloud/bolo/tree/main/docs`
2. Confirm you see:
   - `index.html` ✓
   - `orona/` folder ✓

---

## Expected File Structure:

Your repository should have:

```
bolo/
├── docs/
│   ├── index.html          ← Landing page
│   └── orona/
│       ├── index.html      ← Game entry point
│       ├── js/
│       │   └── bolo-bundle.js
│       ├── css/
│       ├── images/
│       ├── sounds/
│       └── maps/
├── ORONA_EXPLORATION.md
├── ORONA_QUICKSTART.md
└── GITHUB_PAGES_SETUP.md
```

---

## Need More Help?

1. **Check the Actions tab** for deployment errors:
   `https://github.com/mattbcloud/bolo/actions`

2. **Verify the Pages settings** one more time:
   `https://github.com/mattbcloud/bolo/settings/pages`

3. **Tell me:**
   - Is your repository Public or Private?
   - What do you see in Settings → Pages?
   - What's the status in the Actions tab?

---

## Most Likely Fix:

**🔓 Make Repository Public**

This is the #1 cause of 404 errors on GitHub Pages. Private repositories require GitHub Pro for Pages to work.

1. Settings → Scroll to bottom → "Change visibility"
2. Make public
3. Wait 1-2 minutes
4. Try the URL again

Let me know what you find!
