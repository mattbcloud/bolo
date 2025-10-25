// engine.js - Deterministic Game Engine for Bolo
class GameEngine {
    constructor() {
        // Game state
        this.state = {
            frame: 0,
            players: new Map(),
            projectiles: [],
            mines: [],
            pillboxes: [],
            terrain: null,
            bases: []
        };
        
        // Configuration
        this.config = {
            mapWidth: 100,
            mapHeight: 100,
            tileSize: 32,
            tankSpeed: 100,
            tankRotationSpeed: 2,
            projectileSpeed: 300,
            projectileDamage: 25,
            mineD amage: 50,
            tankMaxHealth: 100,
            tankMaxAmmo: 50,
            tankMaxMines: 10
        };
        
        // Input buffer for rollback
        this.inputBuffer = [];
        this.stateSnapshots = [];
        this.maxSnapshots = 60;
        
        // Terrain types
        this.terrainTypes = {
            GRASS: 0,
            WATER: 1,
            FOREST: 2,
            ROAD: 3,
            BUILDING: 4,
            CRATER: 5,
            SWAMP: 6,
            RUBBLE: 7
        };
        
        this.running = false;
    }
    
    init() {
        console.log('🎮 Initializing game engine');
        
        // Generate or load terrain
        this.generateTerrain();
        
        // Reset frame counter
        this.state.frame = 0;
        
        // Clear entities
        this.state.players.clear();
        this.state.projectiles = [];
        this.state.mines = [];
        this.state.pillboxes = [];
        
        // Initialize bases
        this.initializeBases();
    }
    
    generateTerrain() {
        const { mapWidth, mapHeight } = this.config;
        this.state.terrain = new Array(mapHeight);
        
        for (let y = 0; y < mapHeight; y++) {
            this.state.terrain[y] = new Array(mapWidth);
            for (let x = 0; x < mapWidth; x++) {
                // Generate terrain with some patterns
                if (Math.random() < 0.1) {
                    this.state.terrain[y][x] = this.terrainTypes.WATER;
                } else if (Math.random() < 0.15) {
                    this.state.terrain[y][x] = this.terrainTypes.FOREST;
                } else if (Math.random() < 0.05) {
                    this.state.terrain[y][x] = this.terrainTypes.SWAMP;
                } else {
                    this.state.terrain[y][x] = this.terrainTypes.GRASS;
                }
            }
        }
        
        // Add some roads
        this.generateRoads();
    }
    
    generateRoads() {
        const { mapWidth, mapHeight } = this.config;
        
        // Horizontal road
        const roadY = Math.floor(mapHeight / 2);
        for (let x = 0; x < mapWidth; x++) {
            this.state.terrain[roadY][x] = this.terrainTypes.ROAD;
            if (roadY > 0) this.state.terrain[roadY - 1][x] = this.terrainTypes.ROAD;
        }
        
        // Vertical road
        const roadX = Math.floor(mapWidth / 2);
        for (let y = 0; y < mapHeight; y++) {
            this.state.terrain[y][roadX] = this.terrainTypes.ROAD;
            if (roadX > 0) this.state.terrain[y][roadX - 1] = this.terrainTypes.ROAD;
        }
    }
    
    initializeBases() {
        // Add team bases
        this.state.bases = [
            {
                team: 0,
                position: { x: 100, y: 100 },
                health: 1000,
                maxHealth: 1000
            },
            {
                team: 1,
                position: { x: this.config.mapWidth * this.config.tileSize - 100, y: this.config.mapHeight * this.config.tileSize - 100 },
                health: 1000,
                maxHealth: 1000
            }
        ];
    }
    
    start() {
        this.running = true;
        console.log('🚀 Game engine started');
    }
    
    stop() {
        this.running = false;
        console.log('⏹️ Game engine stopped');
    }
    
    reset() {
        this.stop();
        this.init();
    }
    
    addPlayer(playerInfo) {
        console.log('➕ Adding player:', playerInfo.name);
        
        const spawnPoint = this.getSpawnPoint(playerInfo.team);
        
        const player = {
            id: playerInfo.id,
            name: playerInfo.name,
            team: playerInfo.team || 0,
            isLocal: playerInfo.isLocal || false,
            score: 0,
            kills: 0,
            deaths: 0,
            tank: {
                position: spawnPoint,
                velocity: { x: 0, y: 0 },
                rotation: 0,
                turretRotation: 0,
                health: this.config.tankMaxHealth,
                maxHealth: this.config.tankMaxHealth,
                ammo: this.config.tankMaxAmmo,
                maxAmmo: this.config.tankMaxAmmo,
                mines: this.config.tankMaxMines,
                maxMines: this.config.tankMaxMines,
                isDestroyed: false,
                respawnTimer: 0
            }
        };
        
        this.state.players.set(playerInfo.id, player);
        return player;
    }
    
    removePlayer(playerId) {
        console.log('➖ Removing player:', playerId);
        this.state.players.delete(playerId);
    }
    
    getPlayer(playerId) {
        return this.state.players.get(playerId);
    }
    
    getSpawnPoint(team) {
        // Spawn near team base
        const base = this.state.bases[team];
        if (base) {
            return {
                x: base.position.x + (Math.random() - 0.5) * 200,
                y: base.position.y + (Math.random() - 0.5) * 200
            };
        }
        
        // Fallback spawn points
        return team === 0 ? 
            { x: 200, y: 200 } : 
            { x: this.config.mapWidth * this.config.tileSize - 200, y: this.config.mapHeight * this.config.tileSize - 200 };
    }
    
    applyInput(playerId, input, frame) {
        // Store input for potential rollback
        this.inputBuffer.push({ playerId, input, frame });
        
        // Apply input immediately for prediction
        const player = this.state.players.get(playerId);
        if (!player || !player.tank || player.tank.isDestroyed) return;
        
        switch (input.type) {
            case 'move':
                this.handleMovement(player, input.direction);
                break;
            case 'turn':
                this.handleRotation(player, input.direction);
                break;
            case 'fire':
                this.handleFire(player, input.target);
                break;
            case 'mine':
                this.handleLayMine(player);
                break;
        }
    }
    
    handleMovement(player, direction) {
        const tank = player.tank;
        const speed = this.config.tankSpeed;
        
        // Calculate movement based on rotation
        const rad = tank.rotation;
        const moveSpeed = direction === 'forward' ? speed : -speed * 0.5;
        
        tank.velocity.x = Math.cos(rad) * moveSpeed;
        tank.velocity.y = Math.sin(rad) * moveSpeed;
    }
    
    handleRotation(player, direction) {
        const tank = player.tank;
        const rotSpeed = this.config.tankRotationSpeed;
        
        if (direction === 'left') {
            tank.rotation -= rotSpeed * 0.016; // ~60fps
        } else if (direction === 'right') {
            tank.rotation += rotSpeed * 0.016;
        }
    }
    
    handleFire(player, target) {
        const tank = player.tank;
        
        // Check ammo
        if (tank.ammo <= 0) return;
        
        tank.ammo--;
        
        // Calculate projectile direction
        const dx = target.x - tank.position.x;
        const dy = target.y - tank.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return;
        
        const projectile = {
            id: `proj_${this.state.frame}_${player.id}`,
            owner: player.id,
            team: player.team,
            position: { ...tank.position },
            velocity: {
                x: (dx / distance) * this.config.projectileSpeed,
                y: (dy / distance) * this.config.projectileSpeed
            },
            damage: this.config.projectileDamage,
            lifetime: 60 // frames
        };
        
        this.state.projectiles.push(projectile);
    }
    
    handleLayMine(player) {
        const tank = player.tank;
        
        // Check mines
        if (tank.mines <= 0) return;
        
        tank.mines--;
        
        const mine = {
            id: `mine_${this.state.frame}_${player.id}`,
            owner: player.id,
            team: player.team,
            position: { ...tank.position },
            damage: this.config.mineDamage,
            armed: false,
            armTimer: 60 // frames until armed
        };
        
        this.state.mines.push(mine);
    }
    
    update(deltaTime) {
        if (!this.running) return;
        
        this.state.frame++;
        
        // Save snapshot periodically for rollback
        if (this.state.frame % 10 === 0) {
            this.saveSnapshot();
        }
        
        // Update all entities
        this.updateTanks(deltaTime);
        this.updateProjectiles(deltaTime);
        this.updateMines(deltaTime);
        this.updateRespawns(deltaTime);
        
        // Check collisions
        this.checkProjectileCollisions();
        this.checkMineCollisions();
        this.checkTankCollisions();
        
        // Clean up destroyed entities
        this.cleanup();
    }
    
    updateTanks(deltaTime) {
        const dt = deltaTime / 1000; // Convert to seconds
        
        this.state.players.forEach(player => {
            const tank = player.tank;
            if (!tank || tank.isDestroyed) return;
            
            // Apply velocity
            if (tank.velocity.x !== 0 || tank.velocity.y !== 0) {
                const newX = tank.position.x + tank.velocity.x * dt;
                const newY = tank.position.y + tank.velocity.y * dt;
                
                // Check terrain and bounds
                if (this.isValidPosition(newX, newY)) {
                    tank.position.x = newX;
                    tank.position.y = newY;
                }
                
                // Apply friction
                tank.velocity.x *= 0.9;
                tank.velocity.y *= 0.9;
                
                // Stop if very slow
                if (Math.abs(tank.velocity.x) < 1) tank.velocity.x = 0;
                if (Math.abs(tank.velocity.y) < 1) tank.velocity.y = 0;
            }
        });
    }
    
    updateProjectiles(deltaTime) {
        const dt = deltaTime / 1000;
        
        this.state.projectiles.forEach(projectile => {
            projectile.position.x += projectile.velocity.x * dt;
            projectile.position.y += projectile.velocity.y * dt;
            projectile.lifetime--;
        });
    }
    
    updateMines(deltaTime) {
        this.state.mines.forEach(mine => {
            if (!mine.armed) {
                mine.armTimer--;
                if (mine.armTimer <= 0) {
                    mine.armed = true;
                }
            }
        });
    }
    
    updateRespawns(deltaTime) {
        this.state.players.forEach(player => {
            const tank = player.tank;
            if (tank.isDestroyed) {
                tank.respawnTimer--;
                if (tank.respawnTimer <= 0) {
                    this.respawnTank(player);
                }
            }
        });
    }
    
    checkProjectileCollisions() {
        this.state.projectiles.forEach(projectile => {
            // Check tank hits
            this.state.players.forEach(player => {
                if (player.id === projectile.owner) return; // Can't hit self
                if (player.team === projectile.team) return; // No friendly fire
                
                const tank = player.tank;
                if (tank.isDestroyed) return;
                
                const dist = this.getDistance(projectile.position, tank.position);
                if (dist < 20) { // Tank radius
                    this.damageT ank(player, projectile.damage);
                    projectile.lifetime = 0; // Destroy projectile
                    
                    // Give score to shooter
                    const shooter = this.state.players.get(projectile.owner);
                    if (shooter && tank.isDestroyed) {
                        shooter.score += 10;
                        shooter.kills++;
                    }
                }
            });
            
            // Check terrain hits
            if (!this.isValidPosition(projectile.position.x, projectile.position.y)) {
                projectile.lifetime = 0;
            }
        });
    }
    
    checkMineCollisions() {
        this.state.mines.forEach(mine => {
            if (!mine.armed) return;
            
            this.state.players.forEach(player => {
                if (player.team === mine.team) return; // No friendly mines
                
                const tank = player.tank;
                if (tank.isDestroyed) return;
                
                const dist = this.getDistance(mine.position, tank.position);
                if (dist < 25) { // Mine trigger radius
                    this.damageTank(player, mine.damage);
                    mine.lifetime = 0; // Destroy mine
                    
                    // Create explosion effect
                    this.createExplosion(mine.position);
                }
            });
        });
    }
    
    checkTankCollisions() {
        const players = Array.from(this.state.players.values());
        
        for (let i = 0; i < players.length; i++) {
            for (let j = i + 1; j < players.length; j++) {
                const tank1 = players[i].tank;
                const tank2 = players[j].tank;
                
                if (tank1.isDestroyed || tank2.isDestroyed) continue;
                
                const dist = this.getDistance(tank1.position, tank2.position);
                if (dist < 30) { // Tank collision radius
                    // Push tanks apart
                    const dx = tank2.position.x - tank1.position.x;
                    const dy = tank2.position.y - tank1.position.y;
                    const pushDist = (30 - dist) / 2;
                    
                    const nx = dx / dist;
                    const ny = dy / dist;
                    
                    tank1.position.x -= nx * pushDist;
                    tank1.position.y -= ny * pushDist;
                    tank2.position.x += nx * pushDist;
                    tank2.position.y += ny * pushDist;
                    
                    // Stop velocities
                    tank1.velocity.x = 0;
                    tank1.velocity.y = 0;
                    tank2.velocity.x = 0;
                    tank2.velocity.y = 0;
                }
            }
        }
    }
    
    damageTank(player, damage) {
        const tank = player.tank;
        tank.health -= damage;
        
        if (tank.health <= 0) {
            tank.health = 0;
            tank.isDestroyed = true;
            tank.respawnTimer = 180; // 3 seconds at 60fps
            player.deaths++;
            
            // Create explosion
            this.createExplosion(tank.position);
        }
    }
    
    respawnTank(player) {
        const tank = player.tank;
        const spawnPoint = this.getSpawnPoint(player.team);
        
        tank.position = spawnPoint;
        tank.velocity = { x: 0, y: 0 };
        tank.health = this.config.tankMaxHealth;
        tank.ammo = this.config.tankMaxAmmo;
        tank.mines = this.config.tankMaxMines;
        tank.isDestroyed = false;
        tank.respawnTimer = 0;
    }
    
    createExplosion(position) {
        // This would trigger visual effects in the renderer
        // For now, just create a crater in terrain
        const tileX = Math.floor(position.x / this.config.tileSize);
        const tileY = Math.floor(position.y / this.config.tileSize);
        
        if (this.isValidTile(tileX, tileY)) {
            this.state.terrain[tileY][tileX] = this.terrainTypes.CRATER;
        }
    }
    
    cleanup() {
        // Remove expired projectiles
        this.state.projectiles = this.state.projectiles.filter(p => p.lifetime > 0);
        
        // Remove destroyed mines
        this.state.mines = this.state.mines.filter(m => m.lifetime === undefined || m.lifetime > 0);
    }
    
    isValidPosition(x, y) {
        // Check bounds
        if (x < 0 || y < 0 || 
            x >= this.config.mapWidth * this.config.tileSize || 
            y >= this.config.mapHeight * this.config.tileSize) {
            return false;
        }
        
        // Check terrain
        const tileX = Math.floor(x / this.config.tileSize);
        const tileY = Math.floor(y / this.config.tileSize);
        
        if (this.isValidTile(tileX, tileY)) {
            const terrain = this.state.terrain[tileY][tileX];
            return terrain !== this.terrainTypes.WATER && 
                   terrain !== this.terrainTypes.BUILDING;
        }
        
        return false;
    }
    
    isValidTile(x, y) {
        return x >= 0 && y >= 0 && 
               x < this.config.mapWidth && 
               y < this.config.mapHeight;
    }
    
    getDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // Snapshot and rollback for networking
    saveSnapshot() {
        const snapshot = {
            frame: this.state.frame,
            state: JSON.parse(JSON.stringify(this.state))
        };
        
        this.stateSnapshots.push(snapshot);
        
        // Limit snapshots
        if (this.stateSnapshots.length > this.maxSnapshots) {
            this.stateSnapshots.shift();
        }
    }
    
    rollbackToFrame(frame) {
        // Find closest snapshot
        let snapshot = null;
        for (let i = this.stateSnapshots.length - 1; i >= 0; i--) {
            if (this.stateSnapshots[i].frame <= frame) {
                snapshot = this.stateSnapshots[i];
                break;
            }
        }
        
        if (snapshot) {
            // Restore state
            this.state = JSON.parse(JSON.stringify(snapshot.state));
            
            // Replay inputs from snapshot to target frame
            const relevantInputs = this.inputBuffer.filter(
                input => input.frame > snapshot.frame && input.frame <= frame
            );
            
            relevantInputs.forEach(input => {
                this.applyInput(input.playerId, input.input, input.frame);
            });
        }
    }
    
    // Public API
    getState() {
        return this.state;
    }
    
    setState(state) {
        this.state = state;
    }
    
    getCurrentFrame() {
        return this.state.frame;
    }
}

export { GameEngine };
