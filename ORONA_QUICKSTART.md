# Orona Quick Start Guide

## Run Orona on Your Local Machine

### Prerequisites
- Node.js (v14 or higher recommended)
- Git

### Step 1: Clone Orona
```bash
git clone https://github.com/stephank/orona.git
cd orona
```

### Step 2: Initialize Submodules
```bash
git submodule update --init
```

### Step 3: Update Dependencies
Edit `package.json` and update the dependencies section to:
```json
"dependencies": {
  "coffee-script": "1.6.3",
  "villain": "=0.2.0",
  "faye-websocket": "^0.11.0",
  "connect": "^3.7.0",
  "irc-js": "^0.2.0",
  "browserify": "^17.0.0"
}
```

### Step 4: Install Dependencies
```bash
npm install
npm install --save coffeeify
```

### Step 5: Fix the Build File
Edit `Cakefile` and replace the `build:jsbundle` task with:
```coffeescript
task 'build:jsbundle', 'Compile the Bolo client JavaScript bundle', ->
  # Compile CoffeeScript first, then bundle
  exec 'coffee -c -o lib/ src/ && coffee -c node_modules/villain/*.coffee && coffee -c node_modules/villain/world/*.coffee && coffee -c node_modules/villain/world/net/*.coffee', (error) ->
    throw error if error
    b = browserify()
    b.add './lib/client/index.js'
    bundle = b.bundle()
    output = fs.createWriteStream 'js/bolo-bundle.js'
    bundle.pipe output
```

### Step 6: Fix the Server Command
Edit `src/server/command.coffee` and change line 1 from:
```coffeescript
{puts} = require 'sys'
```
to:
```coffeescript
puts = console.log
```

### Step 7: Build
```bash
npx cake build
```

### Step 8: Run Local Web Server
```bash
python3 -m http.server 8080
```
Or using Node.js:
```bash
npx http-server -p 8080
```

### Step 9: Play!
Open your browser and go to:
```
http://localhost:8080/index.html?local
```

## Controls (Typical Bolo Controls)
- **Arrow Keys** - Move camera/view
- **Mouse** - Aim and click to shoot
- **WASD** - Tank movement (may vary)
- **Spacebar** - Fire
- **Shift** - Deploy mines

## Troubleshooting

### Build fails with CoffeeScript errors?
Make sure you're using `coffee-script` version 1.6.3 (not 1.12+)

### Bundle not generating?
Check that `lib/` directory was created after compilation

### Game won't load?
- Check browser console for errors
- Make sure `js/bolo-bundle.js` exists and is ~206KB
- Try clearing browser cache

## Play Online (If Available)
The original demo may still be accessible at:
- https://stephank.github.io/orona/

## More Information
See ORONA_EXPLORATION.md for technical details and architecture.
