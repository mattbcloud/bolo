// mapeditor.js - Bolo Map Editor
class MapEditor {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById('minimapCanvas');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        
        // Map data
        this.mapWidth = 100;
        this.mapHeight = 100;
        this.tileSize = 32;
        this.terrain = [];
        this.objects = {
            bases: [],
            pillboxes: [],
            spawnPoints: []
        };
        
        // Editor state
        this.selectedTerrain = 0;
        this.selectedTool = 'brush';
        this.brushSize = 1;
        this.isDrawing = false;
        this.lastPos = null;
        this.lineStart = null;
        
        // Terrain colors
        this.terrainColors = {
            0: '#4a7c4e', // GRASS
            1: '#3498db', // WATER
            2: '#2c5f2d', // FOREST
            3: '#666666', // ROAD
            4: '#8b7355', // BUILDING
            5: '#3e3e3e', // CRATER
            6: '#6b8e23', // SWAMP
            7: '#969696'  // RUBBLE
        };
        
        this.terrainNames = [
            'Grass', 'Water', 'Forest', 'Road',
            'Building', 'Crater', 'Swamp', 'Rubble'
        ];
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        this.init();
    }
    
    init() {
        // Initialize empty map
        this.createNewMap(this.mapWidth, this.mapHeight);
        
        // Setup canvas
        this.canvas.width = this.mapWidth * this.tileSize;
        this.canvas.height = this.mapHeight * this.tileSize;
        
        // Setup minimap
        this.minimapCanvas.width = 146;
        this.minimapCanvas.height = 146;
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initial render
        this.render();
        this.renderMinimap();
        
        // Save initial state
        this.saveHistory();
    }
    
    createNewMap(width, height) {
        this.mapWidth = width;
        this.mapHeight = height;
        this.terrain = [];
        this.objects = {
            bases: [],
            pillboxes: [],
            spawnPoints: []
        };
        
        // Fill with grass
        for (let y = 0; y < height; y++) {
            this.terrain[y] = new Array(width).fill(0);
        }
        
        // Update canvas size
        this.canvas.width = width * this.tileSize;
        this.canvas.height = height * this.tileSize;
        
        // Add default bases
        this.objects.bases = [
            { team: 0, x: 5, y: 5 },
            { team: 1, x: width - 5, y: height - 5 }
        ];
        
        this.updateStatus();
    }
    
    setupEventListeners() {
        // Terrain selection
        document.querySelectorAll('.terrain-tile').forEach(tile => {
            tile.addEventListener('click', () => {
                this.selectTerrain(parseInt(tile.dataset.terrain));
                document.querySelectorAll('.terrain-tile').forEach(t => t.classList.remove('selected'));
                tile.classList.add('selected');
            });
        });
        
        // Tool selection
        document.getElementById('brushTool').addEventListener('click', () => this.selectTool('brush'));
        document.getElementById('fillTool').addEventListener('click', () => this.selectTool('fill'));
        document.getElementById('lineTool').addEventListener('click', () => this.selectTool('line'));
        document.getElementById('rectTool').addEventListener('click', () => this.selectTool('rect'));
        document.getElementById('circleTool').addEventListener('click', () => this.selectTool('circle'));
        
        // Object placement
        document.getElementById('baseTeam0').addEventListener('click', () => this.selectTool('base0'));
        document.getElementById('baseTeam1').addEventListener('click', () => this.selectTool('base1'));
        document.getElementById('pillbox').addEventListener('click', () => this.selectTool('pillbox'));
        document.getElementById('spawnPoint').addEventListener('click', () => this.selectTool('spawn'));
        
        // Brush size
        const brushSizeSlider = document.getElementById('brushSize');
        brushSizeSlider.addEventListener('input', (e) => {
            this.brushSize = parseInt(e.target.value);
            document.getElementById('brushSizeLabel').textContent = this.brushSize;
        });
        
        // Canvas mouse events
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('mouseleave', () => this.isDrawing = false);
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Minimap click
        this.minimapCanvas.addEventListener('click', (e) => this.handleMinimapClick(e));
        
        // Control buttons
        document.getElementById('newMapBtn').addEventListener('click', () => this.newMap());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearMap());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveMap());
        document.getElementById('loadBtn').addEventListener('click', () => this.loadMap());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportMap());
        document.getElementById('playBtn').addEventListener('click', () => this.playMap());
        
        // Map size change
        document.getElementById('mapSize').addEventListener('change', (e) => {
            const size = parseInt(e.target.value);
            this.createNewMap(size, size);
            this.render();
            this.renderMinimap();
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }
    
    selectTerrain(terrain) {
        this.selectedTerrain = terrain;
    }
    
    selectTool(tool) {
        this.selectedTool = tool;
        
        // Update button states
        document.querySelectorAll('.tool-button').forEach(btn => btn.classList.remove('active'));
        
        const toolButtons = {
            'brush': 'brushTool',
            'fill': 'fillTool',
            'line': 'lineTool',
            'rect': 'rectTool',
            'circle': 'circleTool',
            'base0': 'baseTeam0',
            'base1': 'baseTeam1',
            'pillbox': 'pillbox',
            'spawn': 'spawnPoint'
        };
        
        if (toolButtons[tool]) {
            document.getElementById(toolButtons[tool]).classList.add('active');
        }
    }
    
    handleMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        this.isDrawing = true;
        this.lastPos = { x, y };
        
        if (e.button === 0) { // Left click
            switch (this.selectedTool) {
                case 'brush':
                    this.paintTerrain(x, y);
                    break;
                case 'fill':
                    this.fillArea(x, y);
                    break;
                case 'line':
                    this.lineStart = { x, y };
                    break;
                case 'rect':
                    this.lineStart = { x, y };
                    break;
                case 'circle':
                    this.lineStart = { x, y };
                    break;
                case 'base0':
                case 'base1':
                    this.placeBase(x, y, this.selectedTool === 'base0' ? 0 : 1);
                    break;
                case 'pillbox':
                    this.placePillbox(x, y);
                    break;
                case 'spawn':
                    this.placeSpawnPoint(x, y);
                    break;
            }
        } else if (e.button === 2) { // Right click - erase
            this.eraseTile(x, y);
        }
    }
    
    handleMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        // Update status bar
        document.getElementById('cursorPos').textContent = `${x}, ${y}`;
        if (this.isValidTile(x, y)) {
            document.getElementById('terrainType').textContent = this.terrainNames[this.terrain[y][x]];
        }
        
        if (this.isDrawing && this.selectedTool === 'brush') {
            // Draw line from last position to current
            this.drawLine(this.lastPos.x, this.lastPos.y, x, y);
            this.lastPos = { x, y };
        }
    }
    
    handleMouseUp(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) / this.tileSize);
        const y = Math.floor((e.clientY - rect.top) / this.tileSize);
        
        if (this.lineStart) {
            switch (this.selectedTool) {
                case 'line':
                    this.drawLine(this.lineStart.x, this.lineStart.y, x, y);
                    break;
                case 'rect':
                    this.drawRectangle(this.lineStart.x, this.lineStart.y, x, y);
                    break;
                case 'circle':
                    this.drawCircle(this.lineStart.x, this.lineStart.y, x, y);
                    break;
            }
            this.lineStart = null;
        }
        
        this.isDrawing = false;
        this.saveHistory();
        this.render();
        this.renderMinimap();
    }
    
    handleMinimapClick(e) {
        const rect = this.minimapCanvas.getBoundingClientRect();
        const scale = this.mapWidth / 146;
        const x = (e.clientX - rect.left) * scale;
        const y = (e.clientY - rect.top) * scale;
        
        // Center view on clicked position
        const viewX = x * this.tileSize - this.canvas.parentElement.clientWidth / 2;
        const viewY = y * this.tileSize - this.canvas.parentElement.clientHeight / 2;
        
        this.canvas.parentElement.scrollLeft = viewX;
        this.canvas.parentElement.scrollTop = viewY;
    }
    
    handleKeyboard(e) {
        // Ctrl+Z for undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
        }
        // Ctrl+Shift+Z or Ctrl+Y for redo
        else if ((e.ctrlKey && e.shiftKey && e.key === 'Z') || (e.ctrlKey && e.key === 'y')) {
            e.preventDefault();
            this.redo();
        }
        // Number keys for terrain selection
        else if (e.key >= '1' && e.key <= '8') {
            const terrain = parseInt(e.key) - 1;
            this.selectTerrain(terrain);
            document.querySelectorAll('.terrain-tile').forEach(t => t.classList.remove('selected'));
            document.querySelector(`[data-terrain="${terrain}"]`).classList.add('selected');
        }
    }
    
    paintTerrain(x, y) {
        for (let dy = -Math.floor(this.brushSize / 2); dy <= Math.floor(this.brushSize / 2); dy++) {
            for (let dx = -Math.floor(this.brushSize / 2); dx <= Math.floor(this.brushSize / 2); dx++) {
                const tx = x + dx;
                const ty = y + dy;
                if (this.isValidTile(tx, ty)) {
                    this.terrain[ty][tx] = this.selectedTerrain;
                }
            }
        }
    }
    
    eraseTile(x, y) {
        // Erase terrain to grass
        if (this.isValidTile(x, y)) {
            this.terrain[y][x] = 0;
        }
        
        // Remove objects at this position
        this.objects.pillboxes = this.objects.pillboxes.filter(p => p.x !== x || p.y !== y);
        this.objects.spawnPoints = this.objects.spawnPoints.filter(s => s.x !== x || s.y !== y);
    }
    
    fillArea(x, y) {
        if (!this.isValidTile(x, y)) return;
        
        const targetTerrain = this.terrain[y][x];
        if (targetTerrain === this.selectedTerrain) return;
        
        const queue = [[x, y]];
        const visited = new Set();
        
        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            const key = `${cx},${cy}`;
            
            if (visited.has(key)) continue;
            visited.add(key);
            
            if (!this.isValidTile(cx, cy)) continue;
            if (this.terrain[cy][cx] !== targetTerrain) continue;
            
            this.terrain[cy][cx] = this.selectedTerrain;
            
            // Add neighbors
            queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
    }
    
    drawLine(x1, y1, x2, y2) {
        const dx = Math.abs(x2 - x1);
        const dy = Math.abs(y2 - y1);
        const sx = x1 < x2 ? 1 : -1;
        const sy = y1 < y2 ? 1 : -1;
        let err = dx - dy;
        let x = x1;
        let y = y1;
        
        while (true) {
            this.paintTerrain(x, y);
            
            if (x === x2 && y === y2) break;
            
            const e2 = 2 * err;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }
    }
    
    drawRectangle(x1, y1, x2, y2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                this.paintTerrain(x, y);
            }
        }
    }
    
    drawCircle(x1, y1, x2, y2) {
        const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
        
        for (let y = -radius; y <= radius; y++) {
            for (let x = -radius; x <= radius; x++) {
                if (x * x + y * y <= radius * radius) {
                    const tx = Math.floor(x1 + x);
                    const ty = Math.floor(y1 + y);
                    if (this.isValidTile(tx, ty)) {
                        this.paintTerrain(tx, ty);
                    }
                }
            }
        }
    }
    
    placeBase(x, y, team) {
        // Remove existing base for this team
        this.objects.bases = this.objects.bases.filter(b => b.team !== team);
        
        // Add new base
        this.objects.bases.push({ team, x, y });
        this.updateStatus();
    }
    
    placePillbox(x, y) {
        // Check if pillbox already exists at this position
        const exists = this.objects.pillboxes.some(p => p.x === x && p.y === y);
        if (!exists) {
            this.objects.pillboxes.push({ x, y });
            this.updateStatus();
        }
    }
    
    placeSpawnPoint(x, y) {
        // Check if spawn point already exists at this position
        const exists = this.objects.spawnPoints.some(s => s.x === x && s.y === y);
        if (!exists) {
            this.objects.spawnPoints.push({ x, y });
            this.updateStatus();
        }
    }
    
    render() {
        // Clear canvas
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw terrain
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
                const terrain = this.terrain[y][x];
                this.ctx.fillStyle = this.terrainColors[terrain];
                this.ctx.fillRect(x * this.tileSize, y * this.tileSize, this.tileSize, this.tileSize);
            }
        }
        
        // Draw grid
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        
        for (let x = 0; x <= this.mapWidth; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * this.tileSize, 0);
            this.ctx.lineTo(x * this.tileSize, this.canvas.height);
            this.ctx.stroke();
        }
        
        for (let y = 0; y <= this.mapHeight; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * this.tileSize);
            this.ctx.lineTo(this.canvas.width, y * this.tileSize);
            this.ctx.stroke();
        }
        
        // Draw objects
        this.renderObjects();
    }
    
    renderObjects() {
        // Draw bases
        this.objects.bases.forEach(base => {
            const cx = base.x * this.tileSize + this.tileSize / 2;
            const cy = base.y * this.tileSize + this.tileSize / 2;
            
            this.ctx.fillStyle = base.team === 0 ? '#0066cc' : '#cc0000';
            this.ctx.fillRect(cx - 20, cy - 20, 40, 40);
            
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(cx - 20, cy - 20, 40, 40);
            
            // Draw flag
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy - 20);
            this.ctx.lineTo(cx, cy - 35);
            this.ctx.lineTo(cx + 12, cy - 30);
            this.ctx.lineTo(cx + 12, cy - 25);
            this.ctx.closePath();
            this.ctx.fill();
        });
        
        // Draw pillboxes
        this.objects.pillboxes.forEach(pillbox => {
            const cx = pillbox.x * this.tileSize + this.tileSize / 2;
            const cy = pillbox.y * this.tileSize + this.tileSize / 2;
            
            this.ctx.fillStyle = '#888';
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, 12, 0, Math.PI * 2);
            this.ctx.fill();
            
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            // Draw turret
            this.ctx.strokeStyle = '#444';
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(cx, cy);
            this.ctx.lineTo(cx + 15, cy);
            this.ctx.stroke();
        });
        
        // Draw spawn points
        this.objects.spawnPoints.forEach(spawn => {
            const cx = spawn.x * this.tileSize + this.tileSize / 2;
            const cy = spawn.y * this.tileSize + this.tileSize / 2;
            
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            
            // Draw crosshair
            this.ctx.beginPath();
            this.ctx.moveTo(cx - 10, cy);
            this.ctx.lineTo(cx + 10, cy);
            this.ctx.moveTo(cx, cy - 10);
            this.ctx.lineTo(cx, cy + 10);
            this.ctx.stroke();
            
            // Draw circle
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, 8, 0, Math.PI * 2);
            this.ctx.stroke();
        });
    }
    
    renderMinimap() {
        const scale = 146 / Math.max(this.mapWidth, this.mapHeight);
        
        // Clear minimap
        this.minimapCtx.fillStyle = '#000';
        this.minimapCtx.fillRect(0, 0, 146, 146);
        
        // Draw terrain
        for (let y = 0; y < this.mapHeight; y++) {
            for (let x = 0; x < this.mapWidth; x++) {
                const terrain = this.terrain[y][x];
                this.minimapCtx.fillStyle = this.terrainColors[terrain];
                this.minimapCtx.fillRect(
                    x * scale, y * scale,
                    Math.ceil(scale), Math.ceil(scale)
                );
            }
        }
        
        // Draw objects
        this.objects.bases.forEach(base => {
            this.minimapCtx.fillStyle = base.team === 0 ? '#0066cc' : '#cc0000';
            this.minimapCtx.fillRect(
                base.x * scale - 2, base.y * scale - 2,
                4, 4
            );
        });
        
        this.objects.pillboxes.forEach(pillbox => {
            this.minimapCtx.fillStyle = '#fff';
            this.minimapCtx.fillRect(
                pillbox.x * scale - 1, pillbox.y * scale - 1,
                2, 2
            );
        });
    }
    
    isValidTile(x, y) {
        return x >= 0 && x < this.mapWidth && y >= 0 && y < this.mapHeight;
    }
    
    saveHistory() {
        // Remove any history after current index
        this.history = this.history.slice(0, this.historyIndex + 1);
        
        // Add current state
        this.history.push({
            terrain: JSON.parse(JSON.stringify(this.terrain)),
            objects: JSON.parse(JSON.stringify(this.objects))
        });
        
        // Limit history size
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        } else {
            this.historyIndex++;
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            const state = this.history[this.historyIndex];
            this.terrain = JSON.parse(JSON.stringify(state.terrain));
            this.objects = JSON.parse(JSON.stringify(state.objects));
            this.render();
            this.renderMinimap();
            this.updateStatus();
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            const state = this.history[this.historyIndex];
            this.terrain = JSON.parse(JSON.stringify(state.terrain));
            this.objects = JSON.parse(JSON.stringify(state.objects));
            this.render();
            this.renderMinimap();
            this.updateStatus();
        }
    }
    
    updateStatus() {
        document.getElementById('mapInfo').textContent = `${this.mapWidth}x${this.mapHeight}`;
        document.getElementById('objectCount').textContent = 
            this.objects.pillboxes.length + this.objects.spawnPoints.length;
    }
    
    newMap() {
        if (confirm('Create new map? This will clear the current map.')) {
            const size = parseInt(document.getElementById('mapSize').value);
            this.createNewMap(size, size);
            this.render();
            this.renderMinimap();
            this.saveHistory();
        }
    }
    
    clearMap() {
        if (confirm('Clear all terrain? This cannot be undone.')) {
            for (let y = 0; y < this.mapHeight; y++) {
                for (let x = 0; x < this.mapWidth; x++) {
                    this.terrain[y][x] = 0;
                }
            }
            this.render();
            this.renderMinimap();
            this.saveHistory();
        }
    }
    
    saveMap() {
        const mapData = {
            name: document.getElementById('mapName').value,
            width: this.mapWidth,
            height: this.mapHeight,
            terrain: this.terrain,
            objects: this.objects,
            created: new Date().toISOString()
        };
        
        const json = JSON.stringify(mapData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `${mapData.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
    
    loadMap() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const mapData = JSON.parse(event.target.result);
                    
                    // Load map data
                    this.mapWidth = mapData.width;
                    this.mapHeight = mapData.height;
                    this.terrain = mapData.terrain;
                    this.objects = mapData.objects;
                    
                    // Update UI
                    document.getElementById('mapName').value = mapData.name;
                    
                    // Update canvas
                    this.canvas.width = this.mapWidth * this.tileSize;
                    this.canvas.height = this.mapHeight * this.tileSize;
                    
                    // Render
                    this.render();
                    this.renderMinimap();
                    this.saveHistory();
                    this.updateStatus();
                    
                    alert('Map loaded successfully!');
                } catch (error) {
                    alert('Failed to load map: ' + error.message);
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }
    
    exportMap() {
        // Export as base64 image
        const imageData = this.canvas.toDataURL('image/png');
        
        const a = document.createElement('a');
        a.href = imageData;
        a.download = `${document.getElementById('mapName').value}_preview.png`;
        a.click();
    }
    
    playMap() {
        // Save map to localStorage and redirect to game
        const mapData = {
            name: document.getElementById('mapName').value,
            width: this.mapWidth,
            height: this.mapHeight,
            terrain: this.terrain,
            objects: this.objects
        };
        
        localStorage.setItem('customMap', JSON.stringify(mapData));
        window.location.href = 'index.html?map=custom';
    }
}

// Initialize editor when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.mapEditor = new MapEditor();
    });
} else {
    window.mapEditor = new MapEditor();
}
