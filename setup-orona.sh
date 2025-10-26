#!/bin/bash
# Automated Orona Setup Script
# This script clones, patches, builds, and runs Orona locally

set -e  # Exit on error

echo "🎮 Orona Setup Script"
echo "===================="
echo ""

# Check prerequisites
command -v git >/dev/null 2>&1 || { echo "❌ git is required but not installed. Aborting." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Node.js is required but not installed. Aborting." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "❌ npm is required but not installed. Aborting." >&2; exit 1; }

echo "✅ Prerequisites checked"
echo ""

# Clone repository
echo "📥 Cloning Orona repository..."
if [ -d "orona" ]; then
    echo "⚠️  orona directory already exists. Skipping clone."
    cd orona
else
    git clone https://github.com/stephank/orona.git
    cd orona
fi
echo ""

# Initialize submodules
echo "📦 Initializing submodules..."
git submodule update --init
echo ""

# Patch package.json
echo "🔧 Updating package.json..."
cat > package.json << 'EOF'
{
  "name": "orona",
  "version": "0.1.91",
  "description": "Bolo, a game of tank warfare, rewritten for modern browsers.",

  "homepage": "http://stephank.github.com/orona/",
  "repository": {
    "type": "git",
    "url": "http://github.com/stephank/orona.git"
  },
  "author": {
    "name": "Stéphan Kochen",
    "email": "stephan@kochen.nl",
    "url": "http://stephan.kochen.nl/"
  },

  "engines: ": {
    "node": "0.6"
  },
  "dependencies": {
    "browserify": "^17.0.0",
    "coffee-script": "1.6.3",
    "coffeeify": "^3.0.1",
    "connect": "^3.7.0",
    "faye-websocket": "^0.11.0",
    "irc-js": "^0.2.0",
    "villain": "=0.2.0"
  },

  "bin": {
    "bolo-server": "./bin/bolo-server"
  }
}
EOF
echo ""

# Patch Cakefile
echo "🔧 Updating Cakefile..."
cat > Cakefile << 'EOF'
fs         = require 'fs'
{exec}     = require 'child_process'
browserify = require 'browserify'


task 'build:jsbundle', 'Compile the Bolo client JavaScript bundle', ->
  # Compile CoffeeScript first, then bundle
  exec 'coffee -c -o lib/ src/ && coffee -c node_modules/villain/*.coffee && coffee -c node_modules/villain/world/*.coffee && coffee -c node_modules/villain/world/net/*.coffee', (error) ->
    throw error if error
    b = browserify()
    b.add './lib/client/index.js'
    bundle = b.bundle()
    output = fs.createWriteStream 'js/bolo-bundle.js'
    bundle.pipe output

task 'build:manifest', 'Create the manifest file', ->
  dirtytag = Math.round(Math.random() * 10000)
  exec "git describe --always --dirty=-#{dirtytag}", (error, stdout) ->
    throw error if error
    rev = stdout.trim()

    images = ''
    for file in fs.readdirSync 'images/'
      images += "images/#{file}\n" unless file.match /\.gz$/

    sounds = ''
    for file in fs.readdirSync 'sounds/'
      sounds += "sounds/#{file}\n" unless file.match /\.gz$/

    fs.writeFileSync 'bolo.manifest',
      """
        CACHE MANIFEST
        # Version #{rev}

        index.html
        http://ajax.googleapis.com/ajax/libs/jqueryui/1.8.14/themes/base/jquery.ui.all.css
        css/bolo.css
        css/jquery.ui.theme.css
        https://ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js
        https://ajax.googleapis.com/ajax/libs/jqueryui/1.8.14/jquery-ui.min.js
        bolo-bundle.js
        http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png

        #{images}
        #{sounds}
      """

task 'build', 'Compile Bolo', ->
  invoke 'build:jsbundle'
  # FIXME: use applicationCache again.
  #invoke 'build:manifest'
EOF
echo ""

# Patch server command
echo "🔧 Fixing server/command.coffee..."
sed -i "1s/.*/puts = console.log/" src/server/command.coffee
echo ""

# Install dependencies
echo "📦 Installing npm dependencies (this may take a minute)..."
npm install
echo ""

# Build
echo "🏗️  Building Orona..."
npx cake build
echo ""

# Check if build succeeded
if [ -f "js/bolo-bundle.js" ]; then
    BUNDLE_SIZE=$(du -h js/bolo-bundle.js | cut -f1)
    echo "✅ Build successful! Bundle size: $BUNDLE_SIZE"
    echo ""
    echo "🎮 To play Orona:"
    echo "   1. Start a web server:"
    echo "      python3 -m http.server 8080"
    echo "      OR"
    echo "      npx http-server -p 8080"
    echo ""
    echo "   2. Open your browser to:"
    echo "      http://localhost:8080/index.html?local"
    echo ""
    echo "Happy gaming! 🚀"
else
    echo "❌ Build failed - js/bolo-bundle.js not found"
    exit 1
fi
