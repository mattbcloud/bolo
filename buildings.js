// buildings.js - Pillbox and Building System for Bolo

class Pillbox {
    constructor(id, position, team = -1) {
        this.id = id;
        this.position = position;
        this.team = team; // -1 = neutral, 0+ = team owned
        this.rotation = 0;
        this.health = 100;
        this.maxHealth = 100;
        this.fireRate = 1000; // ms between shots
        this.lastFire = 0;
        this.range = 300;
        this.damage = 15;
        this.target = null;
    }
    
    update(gameState, deltaTime) {
        if (this.team === -1) return; // Neutral pillboxes don't fire
        
        const now = Date.now();
        
        // Find closest enemy
        let closestEnemy = null;
        let closestDistance = this.range;
        
        gameState.players.forEach(player => {
            if (player.team === this.team) return;
            if (!player.tank || player.tank.isDestroyed) return;
            
            const dx = player.tank.position.x - this.position.x;
            const dy = player.tank.position.y - this.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestEnemy = player;
            }
        });
        
        this.target = closestEnemy;
        
        // Rotate toward target
        if (this.target) {
            const dx = this.target.tank.position.x - this.position.x;
            const dy = this.target.tank.position.y - this.position.y;
            const targetAngle = Math.atan2(dy, dx);
            
            // Smooth rotation
            let angleDiff = targetAngle - this.rotation;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            
            this.rotation += angleDiff * 0.1;
            
            // Fire if aligned and ready
            if (Math.abs(angleDiff) < 0.2 && now - this.lastFire > this.fireRate) {
                this.fire(gameState);
                this.lastFire = now;
            }
        }
    }
    
    fire(gameState) {
        if (!this.target) return;
        
        const projectile = {
            id: `pillbox_proj_${this.id}_${Date.now()}`,
            owner: this.id,
            team: this.team,
            isPillbox: true,
            position: { ...this.position },
            velocity: {
                x: Math.cos(this.rotation) * 250,
                y: Math.sin(this.rotation) * 250
            },
            damage: this.damage,
            lifetime: 40
        };
        
        gameState.projectiles.push(projectile);
    }
    
    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.health = 0;
            this.team = -1; // Becomes neutral when destroyed
        }
    }
    
    capture(team) {
        this.team = team;
        this.health = this.maxHealth;
        console.log(`Pillbox ${this.id} captured by team ${team}`);
    }
}

class LGM {
    constructor(id, owner, position) {
        this.id = id;
        this.owner = owner;
        this.team = owner.team;
        this.position = { ...position };
        this.destination = null;
        this.state = 'idle'; // idle, moving, building, repairing
        this.speed = 50;
        this.buildProgress = 0;
        this.buildTarget = null;
        this.health = 20;
        this.maxHealth = 20;
        this.carryingTrees = 0;
        this.maxTrees = 5;
    }
    
    update(gameState, deltaTime) {
        const dt = deltaTime / 1000;
        
        switch (this.state) {
            case 'moving':
                this.move(dt);
                break;
                
            case 'building':
                this.build(gameState, dt);
                break;
                
            case 'repairing':
                this.repair(gameState, dt);
                break;
                
            case 'harvesting':
                this.harvest(gameState, dt);
                break;
        }
        
        // Check if reached destination
        if (this.destination && this.state === 'moving') {
            const dx = this.destination.x - this.position.x;
            const dy = this.destination.y - this.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 10) {
                this.position = { ...this.destination };
                this.destination = null;
                this.state = 'idle';
            }
        }
    }
    
    move(dt) {
        if (!this.destination) {
            this.state = 'idle';
            return;
        }
        
        const dx = this.destination.x - this.position.x;
        const dy = this.destination.y - this.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 0) {
            const moveDistance = Math.min(this.speed * dt, distance);
            this.position.x += (dx / distance) * moveDistance;
            this.position.y += (dy / distance) * moveDistance;
        }
    }
    
    moveTo(destination) {
        this.destination = destination;
        this.state = 'moving';
    }
    
    buildPillbox(position, gameState) {
        if (this.carryingTrees < 3) {
            console.log('Need 3 trees to build pillbox');
            return false;
        }
        
        this.moveTo(position);
        this.buildTarget = {
            type: 'pillbox',
            position: position
        };
        
        // Will start building when arrives
        return true;
    }
    
    buildWall(position, gameState) {
        if (this.carryingTrees < 1) {
            console.log('Need 1 tree to build wall');
            return false;
        }
        
        this.moveTo(position);
        this.buildTarget = {
            type: 'wall',
            position: position
        };
        
        return true;
    }
    
    build(gameState, dt) {
        if (!this.buildTarget) {
            this.state = 'idle';
            return;
        }
        
        this.buildProgress += dt * 20; // 5 seconds to build
        
        if (this.buildProgress >= 100) {
            // Complete building
            if (this.buildTarget.type === 'pillbox') {
                const pillbox = new Pillbox(
                    `pillbox_${Date.now()}`,
                    this.buildTarget.position,
                    this.team
                );
                gameState.pillboxes.push(pillbox);
                this.carryingTrees -= 3;
            } else if (this.buildTarget.type === 'wall') {
                // Convert terrain to wall
                const tileX = Math.floor(this.buildTarget.position.x / 32);
                const tileY = Math.floor(this.buildTarget.position.y / 32);
                if (gameState.terrain[tileY] && gameState.terrain[tileY][tileX] !== undefined) {
                    gameState.terrain[tileY][tileX] = 4; // Building type
                }
                this.carryingTrees -= 1;
            }
            
            this.buildProgress = 0;
            this.buildTarget = null;
            this.state = 'idle';
        }
    }
    
    repair(gameState, dt) {
        // Find nearby damaged structures
        let repairTarget = null;
        
        // Check pillboxes
        gameState.pillboxes.forEach(pillbox => {
            if (pillbox.team !== this.team) return;
            
            const dx = pillbox.position.x - this.position.x;
            const dy = pillbox.position.y - this.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 30 && pillbox.health < pillbox.maxHealth) {
                repairTarget = pillbox;
            }
        });
        
        if (repairTarget) {
            repairTarget.health = Math.min(
                repairTarget.health + dt * 10,
                repairTarget.maxHealth
            );
        } else {
            this.state = 'idle';
        }
    }
    
    harvest(gameState, dt) {
        // Find nearby trees
        const tileX = Math.floor(this.position.x / 32);
        const tileY = Math.floor(this.position.y / 32);
        
        if (gameState.terrain[tileY] && gameState.terrain[tileY][tileX] === 2) { // Forest
            this.buildProgress += dt * 30; // Harvest speed
            
            if (this.buildProgress >= 100) {
                // Convert forest to grass
                gameState.terrain[tileY][tileX] = 0;
                this.carryingTrees = Math.min(this.carryingTrees + 1, this.maxTrees);
                this.buildProgress = 0;
                this.state = 'idle';
                
                console.log(`LGM harvested tree. Carrying: ${this.carryingTrees}/${this.maxTrees}`);
            }
        } else {
            this.state = 'idle';
        }
    }
    
    startHarvesting() {
        this.state = 'harvesting';
        this.buildProgress = 0;
    }
    
    startRepairing() {
        this.state = 'repairing';
    }
    
    takeDamage(damage) {
        this.health -= damage;
        return this.health <= 0;
    }
}

class BuildingSystem {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.pillboxes = [];
        this.lgms = new Map();
        this.walls = [];
        this.nextPillboxId = 1;
        this.nextLGMId = 1;
    }
    
    init() {
        // Generate some initial neutral pillboxes
        const mapWidth = this.engine.config.mapWidth;
        const mapHeight = this.engine.config.mapHeight;
        const tileSize = this.engine.config.tileSize;
        
        // Place 8-12 neutral pillboxes around the map
        const pillboxCount = 8 + Math.floor(Math.random() * 5);
        
        for (let i = 0; i < pillboxCount; i++) {
            const position = {
                x: Math.random() * mapWidth * tileSize,
                y: Math.random() * mapHeight * tileSize
            };
            
            // Make sure not too close to bases
            let validPosition = true;
            this.engine.state.bases.forEach(base => {
                const dx = base.position.x - position.x;
                const dy = base.position.y - position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 300) {
                    validPosition = false;
                }
            });
            
            if (validPosition) {
                const pillbox = new Pillbox(
                    `pillbox_${this.nextPillboxId++}`,
                    position,
                    -1 // Neutral
                );
                this.engine.state.pillboxes.push(pillbox);
            }
        }
        
        console.log(`Generated ${this.engine.state.pillboxes.length} neutral pillboxes`);
    }
    
    update(deltaTime) {
        // Update all pillboxes
        this.engine.state.pillboxes.forEach(pillbox => {
            pillbox.update(this.engine.state, deltaTime);
        });
        
        // Update all LGMs
        this.lgms.forEach(lgm => {
            lgm.update(this.engine.state, deltaTime);
        });
    }
    
    spawnLGM(player) {
        // Check if player already has an LGM
        if (this.lgms.has(player.id)) {
            console.log('Player already has an LGM');
            return null;
        }
        
        const lgm = new LGM(
            `lgm_${this.nextLGMId++}`,
            player,
            player.tank.position
        );
        
        this.lgms.set(player.id, lgm);
        return lgm;
    }
    
    deployLGM(playerId) {
        const player = this.engine.state.players.get(playerId);
        if (!player || !player.tank) return false;
        
        // Check if player has LGM in tank
        if (!player.tank.hasLGM) {
            console.log('No LGM to deploy');
            return false;
        }
        
        const lgm = this.spawnLGM(player);
        if (lgm) {
            player.tank.hasLGM = false;
            return true;
        }
        
        return false;
    }
    
    recallLGM(playerId) {
        const lgm = this.lgms.get(playerId);
        const player = this.engine.state.players.get(playerId);
        
        if (!lgm || !player || !player.tank) return false;
        
        // Check if LGM is close enough
        const dx = lgm.position.x - player.tank.position.x;
        const dy = lgm.position.y - player.tank.position.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 50) {
            player.tank.hasLGM = true;
            player.tank.trees = lgm.carryingTrees; // Transfer resources
            this.lgms.delete(playerId);
            return true;
        }
        
        // Move LGM toward tank
        lgm.moveTo(player.tank.position);
        return false;
    }
    
    commandLGM(playerId, command, target) {
        const lgm = this.lgms.get(playerId);
        if (!lgm) return false;
        
        switch (command) {
            case 'move':
                lgm.moveTo(target);
                break;
                
            case 'harvest':
                lgm.moveTo(target);
                lgm.startHarvesting();
                break;
                
            case 'build_pillbox':
                lgm.buildPillbox(target, this.engine.state);
                break;
                
            case 'build_wall':
                lgm.buildWall(target, this.engine.state);
                break;
                
            case 'repair':
                lgm.moveTo(target);
                lgm.startRepairing();
                break;
                
            default:
                return false;
        }
        
        return true;
    }
    
    capturePillbox(pillbox, team) {
        pillbox.capture(team);
    }
    
    checkPillboxCapture(player) {
        if (!player || !player.tank) return;
        
        this.engine.state.pillboxes.forEach(pillbox => {
            if (pillbox.team !== -1) return; // Already owned
            
            const dx = pillbox.position.x - player.tank.position.x;
            const dy = pillbox.position.y - player.tank.position.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 30) {
                this.capturePillbox(pillbox, player.team);
            }
        });
    }
}

export { Pillbox, LGM, BuildingSystem };
