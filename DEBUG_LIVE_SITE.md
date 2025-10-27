# Debugging Live Site 404 Error

Your setup is correct (public repo, Pages enabled, deployment succeeded), but you're still getting 404. Let's debug this systematically.

## Step 1: Verify the Exact URL GitHub Says

1. Go to Settings → Pages:
   ```
   https://github.com/mattbcloud/bolo/settings/pages
   ```

2. **Look at the green box at the top**. It should say something like:
   ```
   Your site is live at https://mattbcloud.github.io/bolo/
   ```

3. **Copy that EXACT URL** and tell me what it says

---

## Step 2: Try These Specific URLs (in order)

Try each of these URLs in your browser **with a hard refresh** (Ctrl+Shift+R or Cmd+Shift+R):

### URL 1: Root
```
https://mattbcloud.github.io/bolo/
```
**Expected:** Landing page with "Bolo - Tank Warfare Game" heading

### URL 2: Root index.html
```
https://mattbcloud.github.io/bolo/index.html
```
**Expected:** Same as URL 1

### URL 3: Orona directory
```
https://mattbcloud.github.io/bolo/orona/
```
**Expected:** Game page loads

### URL 4: Orona index.html
```
https://mattbcloud.github.io/bolo/orona/index.html
```
**Expected:** Game page loads

### URL 5: Orona with ?local parameter
```
https://mattbcloud.github.io/bolo/orona/index.html?local
```
**Expected:** Game in single-player mode

---

## Step 3: Clear Your Browser Cache

The 404 page might be cached in your browser.

### Chrome:
1. Press `Ctrl+Shift+Delete` (or `Cmd+Shift+Delete` on Mac)
2. Select "Cached images and files"
3. Click "Clear data"
4. Try the URLs again

### Firefox:
1. Press `Ctrl+Shift+Delete`
2. Check "Cache"
3. Click "Clear Now"
4. Try the URLs again

### Safari:
1. Go to Develop → Empty Caches
2. Or press `Cmd+Option+E`
3. Try the URLs again

---

## Step 4: Try Incognito/Private Mode

Open a **new incognito/private window** and try:
```
https://mattbcloud.github.io/bolo/
```

This bypasses all cache.

---

## Step 5: Check the Deployment Details

1. Go to Actions:
   ```
   https://github.com/mattbcloud/bolo/actions
   ```

2. **Click on the most recent "pages build and deployment"** workflow (the top one)

3. **Look for these details:**
   - When did it finish?
   - What branch did it deploy from?
   - Any errors or warnings?

4. **Tell me:**
   - How long ago did it finish?
   - What does it say?

---

## Step 6: Verify File Structure

Let's make sure the files are really there in the main branch:

1. Go to your repository:
   ```
   https://github.com/mattbcloud/bolo
   ```

2. Make sure you're on the **main** branch (check the branch dropdown)

3. **Click on the `docs/` folder**

4. **You should see:**
   - `index.html` ✓
   - `orona/` folder ✓

5. **Click into `orona/` and verify:**
   - `index.html` ✓
   - `js/` folder ✓
   - `css/` folder ✓
   - `images/` folder ✓
   - `sounds/` folder ✓
   - `maps/` folder ✓

---

## Step 7: Try a Different Network

Sometimes DNS caching happens at the network level:

1. Try accessing the URL from your phone (using cellular data, not WiFi)
2. Or try from a different computer/network

---

## Step 8: Check Deployment Time

GitHub Pages can take a few minutes to propagate through their CDN.

**How long has it been since you:**
- Made the repository public?
- Merged the last PR?
- Saw the green checkmark in Actions?

If it's been less than **5 minutes**, wait a bit longer and try again.

---

## What to Tell Me

Please try the steps above and tell me:

1. **What EXACT URL does Settings → Pages show?**

2. **Which of the 5 test URLs work or don't work?**
   - Try each one with hard refresh

3. **What happens in incognito mode?**

4. **How long ago did the last deployment finish?**
   - Check the Actions tab timestamp

5. **Can you see the files in the docs/ folder on GitHub?**

---

## Common Causes

Based on the symptoms, the most likely causes are:

1. **Browser cache** (very common) - Try incognito mode
2. **CDN propagation delay** - Wait 5-10 minutes
3. **Wrong URL** - Make sure you're using the exact URLs I listed
4. **DNS cache** - Try from a different device/network

---

Let me know what you find and we'll get this working!
