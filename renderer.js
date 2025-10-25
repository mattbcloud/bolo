// renderer.js - Canvas Renderer for Bolo
class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Camera
        this.camera = {
            x: 0,
            y: 0,
            zoom: 1,
            width: canvas.width,
            height: canvas.height
        };
        
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
        
        // Tank colors
        this.teamColors = [
            '#0066cc', // Blue team
            '#cc0000', // Red team
            '#00cc00', // Green team
            '#cccc00'  // Yellow team
        ];
        
        // Cached terrain canvas for performance
        this.terrainCanvas = document.createElement('canvas');
        this.terrainCtx = this.terrainCanvas.getContext('2d');
        this.terrainDirty = true;
        
        // Visual effects
        this.effects = [];
        this.particles = [];
    }
    
    resize(width, height) {
        this.camera.width = width;
        this.camera.height = height;
    }
    
    setCamera(x, y) {
        // Smooth camera follow
        const smoothing = 0.1;
        this.camera.x += (x - this.camera.x) * smoothing;
        this.camera.y += (y - this.camera.y) * smoothing;
        
        // Keep camera in bounds
        const halfWidth = this.camera.width / (2 * this.camera.zoom);
        const halfHeight = this.camera.height / (2 * this.camera.zoom);
        
        this.camera.x = Math.max(halfWidth, Math.min(this.camera.x, 3200 - halfWidth));
        this.camera.y = Math.max(halfHeight, Math.min(this.camera.y, 3200 - halfHeight));
    }
    
    render(gameState, interpolation) {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Save context state
        this.ctx.save();
        
        // Apply camera transform
        this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
        this.ctx.scale(this.camera.zoom, this.camera.zoom);
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Render layers
        this.renderTerrain(gameState);
        this.renderMines(gameState);
        this.renderBases(gameState);
        this.renderPillboxes(gameState);
        this.renderTanks(gameState, interpolation);
        this.renderProjectiles(gameState, interpolation);
        this.renderEffects();
        
        // Restore context
        this.ctx.restore();
        
        // Render UI overlays (not affected by camera)
        this.renderRadar(gameState);
        this.renderCrosshair();
    }
    
    renderTerrain(gameState) {
        if (!gameState.terrain) return;
        
        // Cache terrain to offscreen canvas if dirty
        if (this.terrainDirty) {
            this.cacheTerrain(gameState.terrain);
            this.terrainDirty = false;
        }
        
        // Draw cached terrain
        const viewBounds = this.getViewBounds();
        
        this.ctx.drawImage(
            this.terrainCanvas,
            viewBounds.minX, viewBounds.minY, viewBounds.width, viewBounds.height,
            viewBounds.minX, viewBounds.minY, viewBounds.width, viewBounds.height
        );
    }
    
    cacheTerrain(terrain) {
        const tileSize = 32;
        const mapWidth = terrain[0].length;
        const mapHeight = terrain.length;
        
        this.terrainCanvas.width = mapWidth * tileSize;
        this.terrainCanvas.height = mapHeight * tileSize;
        
        // Draw all terrain tiles
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                const type = terrain[y][x];
                this.terrainCtx.fillStyle = this.terrainColors[type];
                this.terrainCtx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
                
                // Add tile borders for certain types
                if (type === 3) { // Road
                    this.terrainCtx.strokeStyle = '#555';
                    this.terrainCtx.lineWidth = 1;
                    this.terrainCtx.strokeRect(x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }
        
        // Add grid lines
        this.terrainCtx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
        this.terrainCtx.lineWidth = 0.5;
        for (let x = 0; x <= mapWidth; x++) {
            this.terrainCtx.beginPath();
            this.terrainCtx.moveTo(x * tileSize, 0);
            this.terrainCtx.lineTo(x * tileSize, mapHeight * tileSize);
            this.terrainCtx.stroke();
        }
        for (let y = 0; y <= mapHeight; y++) {
            this.terrainCtx.beginPath();
            this.terrainCtx.moveTo(0, y * tileSize);
            this.terrainCtx.lineTo(mapWidth * tileSize, y * tileSize);
            this.terrainCtx.stroke();
        }
    }
    
    renderTanks(gameState, interpolation) {
        gameState.players.forEach(player => {
            const tank = player.tank;
            if (!tank || tank.isDestroyed) return;
            
            // Interpolate position
            const x = tank.position.x;
            const y = tank.position.y;
            
            // Tank body
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(tank.rotation);
            
            // Draw tank chassis
            this.ctx.fillStyle = this.teamColors[player.team] || '#666';
            this.ctx.fillRect(-15, -10, 30, 20);
            
            // Draw tracks
            this.ctx.fillStyle = '#333';
            this.ctx.fillRect(-18, -12, 36, 4);
            this.ctx.fillRect(-18, 8, 36, 4);
            
            // Draw turret
            this.ctx.fillStyle = '#444';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw cannon
            this.ctx.strokeStyle = '#222';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);
            this.ctx.lineTo(20, 0);
            this.ctx.stroke();
            
            this.ctx.restore();
            
            // Draw player name
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '10px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(player.name, x, y - 20);
            
            // Draw health bar
            if (tank.health < tank.maxHealth) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(x - 20, y - 30, 40, 4);
                
                const healthPercent = tank.health / tank.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : 
                                     healthPercent > 0.25 ? '#ff0' : '#f00';
                this.ctx.fillRect(x - 20, y - 30, 40 * healthPercent, 4);
            }
        });
    }
    
    renderProjectiles(gameState, interpolation) {
        this.ctx.fillStyle = '#ffcc00';
        this.ctx.strokeStyle = '#ff9900';
        this.ctx.lineWidth = 2;
        
        gameState.projectiles.forEach(projectile => {
            const x = projectile.position.x;
            const y = projectile.position.y;
            
            // Draw projectile
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Draw trail
            const trailLength = 10;
            const dx = projectile.velocity.x / 10;
            const dy = projectile.velocity.y / 10;
            
            this.ctx.strokeStyle = 'rgba(255, 200, 0, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x, y);
            this.ctx.lineTo(x - dx * trailLength, y - dy * trailLength);
            this.ctx.stroke();
        });
    }
    
    renderMines(gameState) {
        gameState.mines.forEach(mine => {
            const x = mine.position.x;
            const y = mine.position.y;
            
            // Only show mines from your team
            if (mine.team === 0) { // Replace with local player team check
                this.ctx.fillStyle = mine.armed ? '#ff0000' : '#ffcc00';
                this.ctx.strokeStyle = '#000';
                this.ctx.lineWidth = 1;
                
                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                
                // Draw warning circle for armed mines
                if (mine.armed) {
                    this.ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, 25, 0, Math.PI * 2);
                    this.ctx.stroke();
                }
            }
        });
    }
    
    renderBases(gameState) {
        gameState.bases.forEach(base => {
            const x = base.position.x;
            const y = base.position.y;
            
            // Base structure
            this.ctx.fillStyle = this.teamColors[base.team];
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            
            this.ctx.fillRect(x - 30, y - 30, 60, 60);
            this.ctx.strokeRect(x - 30, y - 30, 60, 60);
            
            // Flag
            this.ctx.beginPath();
            this.ctx.moveTo(x, y - 30);
            this.ctx.lineTo(x, y - 50);
            this.ctx.lineTo(x + 15, y - 45);
            this.ctx.lineTo(x + 15, y - 40);
            this.ctx.closePath();
            this.ctx.fill();
            
            // Health bar
            if (base.health < base.maxHealth) {
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                this.ctx.fillRect(x - 30, y - 40, 60, 4);
                
                const healthPercent = base.health / base.maxHealth;
                this.ctx.fillStyle = healthPercent > 0.5 ? '#0f0' : 
                                     healthPercent > 0.25 ? '#ff0' : '#f00';
                this.ctx.fillRect(x - 30, y - 40, 60 * healthPercent, 4);
            }
        });
    }
    
    renderPillboxes(gameState) {
        gameState.pillboxes.forEach(pillbox => {
            const x = pillbox.position.x;
            const y = pillbox.position.y;
            
            // Pillbox base
            this.ctx.fillStyle = pillbox.team === -1 ? '#888' : this.teamColors[pillbox.team];
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, 12, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
            
            // Turret
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(pillbox.rotation || 0);
            
            this.ctx.fillStyle = '#444';
            this.ctx.fillRect(-2, -15, 4, 15);
            
            this.ctx.restore();
        });
    }
    
    renderEffects() {
        // Render and update visual effects
        this.effects = this.effects.filter(effect => {
            effect.lifetime--;
            
            if (effect.type === 'explosion') {
                const alpha = effect.lifetime / effect.maxLifetime;
                this.ctx.fillStyle = `rgba(255, 100, 0, ${alpha * 0.5})`;
                this.ctx.beginPath();
                this.ctx.arc(effect.x, effect.y, effect.radius * (1 - alpha), 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            return effect.lifetime > 0;
        });
        
        // Render particles
        this.particles = this.particles.filter(particle => {
            particle.lifetime--;
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.2; // Gravity
            
            const alpha = particle.lifetime / particle.maxLifetime;
            this.ctx.fillStyle = `rgba(${particle.color}, ${alpha})`;
            this.ctx.fillRect(particle.x - 1, particle.y - 1, 2, 2);
            
            return particle.lifetime > 0;
        });
    }
    
    renderRadar(gameState) {
        // This is handled by the minimap in the HTML
    }
    
    renderCrosshair() {
        // Draw crosshair at mouse position
        // This would be updated based on mouse events
    }
    
    addExplosion(x, y, radius = 30) {
        this.effects.push({
            type: 'explosion',
            x, y, radius,
            lifetime: 30,
            maxLifetime: 30
        });
        
        // Add particles
        for (let i = 0; i < 20; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                color: '255, 100, 0',
                lifetime: 20 + Math.random() * 10,
                maxLifetime: 30
            });
        }
    }
    
    getViewBounds() {
        const halfWidth = this.camera.width / (2 * this.camera.zoom);
        const halfHeight = this.camera.height / (2 * this.camera.zoom);
        
        return {
            minX: Math.floor(this.camera.x - halfWidth),
            minY: Math.floor(this.camera.y - halfHeight),
            maxX: Math.ceil(this.camera.x + halfWidth),
            maxY: Math.ceil(this.camera.y + halfHeight),
            width: Math.ceil(halfWidth * 2),
            height: Math.ceil(halfHeight * 2)
        };
    }
    
    reset() {
        this.terrainDirty = true;
        this.effects = [];
        this.particles = [];
    }
}

export { Renderer };
