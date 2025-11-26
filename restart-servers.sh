#!/bin/bash

# Multiplayer Tank Combat Game - Server Restart Script
# This script builds, kills old processes, and restarts both servers

set -e  # Exit on any error

echo "🔨 Building client and server..."
npm run build:client
npm run build:server

echo "🔪 Killing existing server processes..."
# Kill processes on port 3000 (Vite dev server)
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "  No process on port 3000"

# Kill processes on port 8124 (Game server)
lsof -ti:8124 | xargs kill -9 2>/dev/null || echo "  No process on port 8124"

echo "🚀 Starting servers..."
# Start game server in background
npm run dev:server &
GAME_SERVER_PID=$!
echo "  Game server started (PID: $GAME_SERVER_PID) on port 8124"

# Give the game server a moment to start
sleep 2

# Start Vite dev server in background
npm run dev &
VITE_PID=$!
echo "  Vite dev server started (PID: $VITE_PID) on port 3000"

echo ""
echo "✅ Both servers are running!"
echo "   Game server: http://localhost:8124"
echo "   Client: http://localhost:3000"
echo ""
echo "To stop the servers, run:"
echo "  kill $GAME_SERVER_PID $VITE_PID"
echo "  or use: lsof -ti:3000 -ti:8124 | xargs kill -9"
