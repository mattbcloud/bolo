// Bolo Multiplayer Application
// Manages game sessions, Infinite Mac embedding, and networking

// State management
const state = {
    currentView: 'lobby',
    gameId: null,
    playerName: null,
    sessionStartTime: null,
    macAddress: null,
    networkConnected: false,
    durationInterval: null
};

// Configuration
const config = {
    // Using infinitemac.org for embedding
    // Note: For true multiplayer networking, custom DNS setup is required
    baseUrl: 'infinitemac.org',
    embedPath: '/embed',
    systemVersion: 'System%207.5.3',
    defaultSettings: {
        infinite_hd: 'true',
        screen_update_messages: 'false'
    }
};

// Initialize application
function init() {
    console.log('Bolo Multiplayer initialized');

    // Check if returning to existing game (from URL hash)
    const hash = window.location.hash.substring(1);
    if (hash && hash.startsWith('game-')) {
        const gameId = hash.substring(5);
        if (gameId) {
            document.getElementById('gameId').value = gameId;
        }
    }

    // Setup message listener for emulator communication
    window.addEventListener('message', handleEmulatorMessage);

    // Setup keyboard shortcuts
    document.addEventListener('keydown', handleKeydown);

    // Enable enter key on inputs
    document.getElementById('gameId').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });
    document.getElementById('playerName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createGame();
    });
}

// Generate a random game ID
function generateGameId() {
    const adjectives = ['swift', 'brave', 'steel', 'iron', 'thunder', 'shadow', 'rocket', 'turbo', 'mega', 'ultra'];
    const nouns = ['tank', 'warrior', 'battle', 'combat', 'strike', 'force', 'squad', 'platoon', 'commander', 'division'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 100);
    return `${adj}-${noun}-${num}`;
}

// Sanitize game ID to be URL-safe
function sanitizeGameId(gameId) {
    return gameId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 50);
}

// Create a new game
function createGame() {
    const playerName = document.getElementById('playerName').value.trim();
    const gameId = generateGameId();

    state.playerName = playerName || 'Player';

    console.log('Creating new game:', gameId);
    loadGame(gameId);
}

// Join an existing game
function joinGame() {
    const gameIdInput = document.getElementById('gameId').value.trim();

    if (!gameIdInput) {
        alert('Please enter a Game ID');
        return;
    }

    const gameId = sanitizeGameId(gameIdInput);
    console.log('Joining game:', gameId);
    loadGame(gameId);
}

// Load game and switch to game view
function loadGame(gameId) {
    state.gameId = gameId;
    state.sessionStartTime = Date.now();

    // Update URL hash for sharing
    window.location.hash = `game-${gameId}`;

    // Update UI
    document.getElementById('currentGameId').textContent = gameId;
    document.getElementById('networkZone').textContent = gameId;
    document.getElementById('sessionStart').textContent = new Date().toLocaleTimeString();

    // Switch views
    switchView('game');

    // Build embed URL using subdomain for AppleTalk networking
    const embedUrl = buildEmbedUrl(gameId);
    console.log('Loading emulator:', embedUrl);

    // Load emulator
    const iframe = document.getElementById('emulator');
    iframe.src = embedUrl;

    // Start session duration timer
    startDurationTimer();

    // Hide loading screen after delay
    setTimeout(() => {
        const loadingScreen = document.getElementById('loadingScreen');
        loadingScreen.classList.add('hidden');
    }, 15000);
}

// Build the Infinite Mac embed URL
function buildEmbedUrl(gameId) {
    const params = new URLSearchParams({
        disk: config.systemVersion,
        ...config.defaultSettings
    });

    // Try using subdomain-based networking with system7.app
    // If this doesn't work, falls back to main infinitemac.org
    const useSubdomain = false; // Set to true to enable subdomain networking

    if (useSubdomain) {
        // Use subdomain for AppleTalk networking zone
        // This requires DNS to be configured for *.system7.app
        const subdomain = gameId;
        return `https://${subdomain}.system7.app${config.embedPath}?${params}`;
    } else {
        // Use main infinitemac.org (no automatic networking, but should load)
        // Players can still manually set up networking within the emulator
        return `https://${config.baseUrl}${config.embedPath}?${params}`;
    }
}

// Leave current game
function leaveGame() {
    if (confirm('Are you sure you want to leave this game?')) {
        // Stop duration timer
        if (state.durationInterval) {
            clearInterval(state.durationInterval);
            state.durationInterval = null;
        }

        // Reset state
        state.gameId = null;
        state.sessionStartTime = null;
        state.macAddress = null;
        state.networkConnected = false;

        // Clear URL hash
        window.location.hash = '';

        // Unload emulator
        document.getElementById('emulator').src = '';

        // Show loading screen again for next session
        document.getElementById('loadingScreen').classList.remove('hidden');

        // Switch back to lobby
        switchView('lobby');

        console.log('Left game');
    }
}

// Switch between views
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Show selected view
    const targetView = document.getElementById(viewName);
    if (targetView) {
        targetView.classList.add('active');
        state.currentView = viewName;
    }
}

// Handle messages from the emulator iframe
function handleEmulatorMessage(event) {
    // Security: verify origin if needed
    // if (!event.origin.includes('system7.app') && !event.origin.includes('infinitemac.org')) return;

    const data = event.data;

    if (!data || !data.type) return;

    console.log('Emulator message:', data.type, data);

    switch (data.type) {
        case 'emulator_ethernet_init':
            handleEthernetInit(data);
            break;

        case 'emulator_screen':
            handleScreenUpdate(data);
            break;

        case 'emulator_ready':
            handleEmulatorReady(data);
            break;

        default:
            // Log unknown message types for debugging
            console.log('Unknown emulator message type:', data.type);
    }
}

// Handle Ethernet initialization
function handleEthernetInit(data) {
    state.macAddress = data.macAddress;
    state.networkConnected = true;

    console.log('Ethernet initialized:', data.macAddress);

    // Update UI
    document.getElementById('macAddress').textContent = data.macAddress;

    const statusBox = document.getElementById('networkStatus');
    statusBox.innerHTML = `
        <span class="status-indicator connected"></span>
        <span>Connected to Network</span>
    `;

    // Hide loading screen if still visible
    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
    }, 1000);
}

// Handle screen updates (if enabled)
function handleScreenUpdate(data) {
    // Screen data available: data.width, data.height, data.data
    // Can be used for thumbnails, recording, etc.
    // Not used in basic implementation
}

// Handle emulator ready state
function handleEmulatorReady(data) {
    console.log('Emulator ready');
    document.getElementById('loadingScreen').classList.add('hidden');
}

// Send message to emulator
function sendEmulatorMessage(message) {
    const iframe = document.getElementById('emulator');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
        console.log('Sent to emulator:', message.type);
    }
}

// Start session duration timer
function startDurationTimer() {
    if (state.durationInterval) {
        clearInterval(state.durationInterval);
    }

    state.durationInterval = setInterval(() => {
        if (state.sessionStartTime) {
            const elapsed = Date.now() - state.sessionStartTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            document.getElementById('sessionDuration').textContent = formatted;

            // Warn if approaching 20 minute limit
            if (minutes >= 20) {
                document.getElementById('sessionDuration').style.color = 'var(--danger-color)';
            } else if (minutes >= 15) {
                document.getElementById('sessionDuration').style.color = 'var(--warning-color)';
            }
        }
    }, 1000);
}

// Handle keyboard shortcuts
function handleKeydown(event) {
    // ESC to leave game (with confirmation)
    if (event.key === 'Escape' && state.currentView === 'game') {
        event.preventDefault();
        leaveGame();
    }
}

// Copy game ID to clipboard
function copyGameId() {
    if (state.gameId) {
        navigator.clipboard.writeText(state.gameId).then(() => {
            alert('Game ID copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

// Utility: Get emulator control interface
function getEmulatorControl() {
    return {
        pause: () => sendEmulatorMessage({type: 'emulator_pause'}),
        unpause: () => sendEmulatorMessage({type: 'emulator_unpause'}),
        loadDisk: (url) => sendEmulatorMessage({type: 'emulator_load_disk', url}),
        mouseMove: (x, y, deltaX = 0, deltaY = 0) =>
            sendEmulatorMessage({type: 'emulator_mouse_move', x, y, deltaX, deltaY}),
        mouseDown: (button = 0) =>
            sendEmulatorMessage({type: 'emulator_mouse_down', button}),
        mouseUp: (button = 0) =>
            sendEmulatorMessage({type: 'emulator_mouse_up', button}),
        keyDown: (code) =>
            sendEmulatorMessage({type: 'emulator_key_down', code}),
        keyUp: (code) =>
            sendEmulatorMessage({type: 'emulator_key_up', code})
    };
}

// Export for debugging in console
window.boloDebug = {
    state,
    config,
    emulator: getEmulatorControl,
    copyGameId,
    sendEmulatorMessage
};

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

console.log('Bolo Multiplayer loaded. Debug interface available at window.boloDebug');
