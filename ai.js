// ai.js - AI Bot System for Bolo
class AIBot {
    constructor(id, name, team, difficulty = 'medium') {
        this.id = id;
        this.name = name;
        this.team = team;
        this.difficulty = difficulty;
        
        // AI state
        this.state = 'idle';
        this.target = null;
        this.destination = null;
        this.path = [];
        this.lastFire = 0;
        this.reactionTime = this.getReactionTime(difficulty);
        this.accuracy = this.getAccuracy(difficulty);
        
        // Behavior weights
        this.behaviors = {
            aggressive: difficulty === 'hard' ? 0.7 : difficulty === 'medium' ? 0.5 : 0.3,
            defensive: difficulty === 'hard' ? 0.2 : difficulty === 'medium' ? 0.3 : 0.5,
            strategic: difficulty === 'hard' ? 0.1 : difficulty === 'medium' ? 0.2 : 0.2
        };
        
        // Memory
        this.memory = {
            lastEnemySeen: null,
            lastDamageFrom: null,
            knownMines: new Set(),
            knownPillboxes: new Map()
        };
    }
    
    getReactionTime(difficulty) {
        switch (difficulty) {
            case 'easy': return 1000;
            case 'medium': return 500;
            case 'hard': return 200;
            default: return 500;
        }
    }
    
    getAccuracy(difficulty) {
        switch (difficulty) {
            case 'easy': return 0.4;
            case 'medium': return 0.7;
            case 'hard': return 0.9;
            default: return 0.7;
        }
    }
    
    update(gameState, deltaTime) {
        const myPlayer = gameState.players.get(this.id);
        if (!myPlayer || !myPlayer.tank || myPlayer.tank.isDestroyed) return null;
        
        // Sense environment
        const threats = this.detectThreats(gameState, myPlayer);
        const objectives = this.identifyObjectives(gameState, myPlayer);
        
        // Decide action based on state
        let action = null;
        
        switch (this.state) {
            case 'idle':
                action = this.idleBehavior(gameState, myPlayer, threats, objectives);
                break;
                
            case 'attacking':
                action = this.attackBehavior(gameState, myPlayer, threats);
                break;
                
            case 'defending':
                action = this.defendBehavior(gameState, myPlayer, threats);
                break;
                
            case 'capturing':
                action = this.captureBehavior(gameState, myPlayer, objectives);
                break;
                
            case 'retreating':
                action = this.retreatBehavior(gameState, myPlayer, threats);
                break;
        }
        
        return action;
    }
    
    detectThreats(gameState, myPlayer) {
        const threats = [];
        const myPos = myPlayer.tank.position;
        const sightRange = 500;
        
        // Check enemy tanks
        gameState.players.forEach(player => {
            if (player.id === this.id) return;
            if (player.team === this.team) return;
            if (!player.tank || player.tank.isDestroyed) return;
            
            const distance = this.getDistance(myPos, player.tank.position);
            if (distance <= sightRange) {
                threats.push({
                    type: 'tank',
                    id: player.id,
                    position: player.tank.position,
                    distance: distance,
                    health: player.tank.health,
                    threat: this.calculateThreatLevel(player, distance)
                });
            }
        });
        
        // Check enemy pillboxes
        gameState.pillboxes.forEach(pillbox => {
            if (pillbox.team === this.team || pillbox.team === -1) return;
            
            const distance = this.getDistance(myPos, pillbox.position);
            if (distance <= sightRange) {
                threats.push({
                    type: 'pillbox',
                    id: pillbox.id,
                    position: pillbox.position,
                    distance: distance,
                    threat: 0.5
                });
            }
        });
        
        // Sort by threat level
        threats.sort((a, b) => b.threat - a.threat);
        
        return threats;
    }
    
    identifyObjectives(gameState, myPlayer) {
        const objectives = [];
        const myPos = myPlayer.tank.position;
        
        // Enemy bases
        gameState.bases.forEach(base => {
            if (base.team !== this.team) {
                objectives.push({
                    type: 'base',
                    position: base.position,
                    distance: this.getDistance(myPos, base.position),
                    priority: 1.0
                });
            }
        });
        
        // Neutral pillboxes
        gameState.pillboxes.forEach(pillbox => {
            if (pillbox.team === -1) {
                objectives.push({
                    type: 'pillbox',
                    position: pillbox.position,
                    distance: this.getDistance(myPos, pillbox.position),
                    priority: 0.5
                });
            }
        });
        
        // Sort by priority and distance
        objectives.sort((a, b) => {
            const scoreA = a.priority / (a.distance / 100);
            const scoreB = b.priority / (b.distance / 100);
            return scoreB - scoreA;
        });
        
        return objectives;
    }
    
    calculateThreatLevel(player, distance) {
        let threat = 1.0;
        
        // Distance factor
        threat *= (500 - distance) / 500;
        
        // Health factor
        threat *= player.tank.health / 100;
        
        // Ammo factor
        threat *= player.tank.ammo > 0 ? 1.0 : 0.3;
        
        return threat;
    }
    
    idleBehavior(gameState, myPlayer, threats, objectives) {
        // Check for nearby threats
        if (threats.length > 0 && threats[0].distance < 300) {
            this.state = 'attacking';
            this.target = threats[0];
            return this.attackBehavior(gameState, myPlayer, threats);
        }
        
        // Decide next objective based on behavior weights
        const roll = Math.random();
        
        if (roll < this.behaviors.aggressive && threats.length > 0) {
            // Hunt enemies
            this.state = 'attacking';
            this.target = threats[0];
        } else if (roll < this.behaviors.aggressive + this.behaviors.strategic && objectives.length > 0) {
            // Capture objectives
            this.state = 'capturing';
            this.destination = objectives[0].position;
        } else {
            // Patrol
            this.destination = this.getRandomPatrolPoint(gameState);
        }
        
        return this.moveToward(myPlayer, this.destination);
    }
    
    attackBehavior(gameState, myPlayer, threats) {
        if (!this.target || threats.length === 0) {
            this.state = 'idle';
            return null;
        }
        
        // Update target to closest threat
        this.target = threats[0];
        
        const myPos = myPlayer.tank.position;
        const targetPos = this.target.position;
        const distance = this.target.distance;
        
        const actions = [];
        
        // Aim and fire
        if (distance < 400 && myPlayer.tank.ammo > 0) {
            const now = Date.now();
            if (now - this.lastFire > this.reactionTime) {
                // Add prediction based on target velocity if it's a tank
                let aimPos = { ...targetPos };
                
                if (this.target.type === 'tank') {
                    const targetPlayer = gameState.players.get(this.target.id);
                    if (targetPlayer && targetPlayer.tank.velocity) {
                        // Simple prediction
                        const timeToHit = distance / 300; // projectile speed
                        aimPos.x += targetPlayer.tank.velocity.x * timeToHit * 0.5;
                        aimPos.y += targetPlayer.tank.velocity.y * timeToHit * 0.5;
                    }
                }
                
                // Add inaccuracy
                const spread = (1 - this.accuracy) * 50;
                aimPos.x += (Math.random() - 0.5) * spread;
                aimPos.y += (Math.random() - 0.5) * spread;
                
                actions.push({
                    type: 'fire',
                    target: aimPos
                });
                
                this.lastFire = now;
            }
        }
        
        // Movement
        if (distance > 350) {
            // Move closer
            actions.push(this.moveToward(myPlayer, targetPos));
        } else if (distance < 150) {
            // Too close, back up
            actions.push(this.moveAway(myPlayer, targetPos));
        } else {
            // Strafe
            actions.push(this.strafe(myPlayer, targetPos));
        }
        
        // Check if should retreat
        if (myPlayer.tank.health < 30) {
            this.state = 'retreating';
        }
        
        return actions.length > 0 ? actions : null;
    }
    
    defendBehavior(gameState, myPlayer, threats) {
        // Find friendly base
        const friendlyBase = gameState.bases.find(b => b.team === this.team);
        if (!friendlyBase) {
            this.state = 'idle';
            return null;
        }
        
        const myPos = myPlayer.tank.position;
        const basePos = friendlyBase.position;
        const distanceToBase = this.getDistance(myPos, basePos);
        
        // Stay near base
        if (distanceToBase > 200) {
            return this.moveToward(myPlayer, basePos);
        }
        
        // Attack nearby threats
        if (threats.length > 0 && threats[0].distance < 400) {
            return this.attackBehavior(gameState, myPlayer, threats);
        }
        
        // Patrol around base
        const angle = Date.now() / 5000;
        const patrolPos = {
            x: basePos.x + Math.cos(angle) * 150,
            y: basePos.y + Math.sin(angle) * 150
        };
        
        return this.moveToward(myPlayer, patrolPos);
    }
    
    captureBehavior(gameState, myPlayer, objectives) {
        if (!this.destination || objectives.length === 0) {
            this.state = 'idle';
            return null;
        }
        
        const myPos = myPlayer.tank.position;
        const distance = this.getDistance(myPos, this.destination);
        
        // Reached objective
        if (distance < 50) {
            this.state = 'idle';
            return null;
        }
        
        // Move to objective
        return this.moveToward(myPlayer, this.destination);
    }
    
    retreatBehavior(gameState, myPlayer, threats) {
        // Find friendly base
        const friendlyBase = gameState.bases.find(b => b.team === this.team);
        
        if (friendlyBase) {
            const distance = this.getDistance(myPlayer.tank.position, friendlyBase.position);
            
            // Reached safety
            if (distance < 100) {
                this.state = 'defending';
            }
            
            return this.moveToward(myPlayer, friendlyBase.position);
        }
        
        // No base, just run from threats
        if (threats.length > 0) {
            return this.moveAway(myPlayer, threats[0].position);
        }
        
        this.state = 'idle';
        return null;
    }
    
    moveToward(myPlayer, targetPos) {
        const myPos = myPlayer.tank.position;
        const angle = Math.atan2(targetPos.y - myPos.y, targetPos.x - myPos.x);
        const currentAngle = myPlayer.tank.rotation;
        
        let angleDiff = angle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        
        const actions = [];
        
        // Turn toward target
        if (Math.abs(angleDiff) > 0.1) {
            if (angleDiff > 0) {
                actions.push({ type: 'turn', direction: 'right' });
            } else {
                actions.push({ type: 'turn', direction: 'left' });
            }
        }
        
        // Move forward if roughly aligned
        if (Math.abs(angleDiff) < 0.5) {
            actions.push({ type: 'move', direction: 'forward' });
        }
        
        return actions.length > 0 ? actions : null;
    }
    
    moveAway(myPlayer, threatPos) {
        const myPos = myPlayer.tank.position;
        const angle = Math.atan2(myPos.y - threatPos.y, myPos.x - threatPos.x);
        const targetPos = {
            x: myPos.x + Math.cos(angle) * 100,
            y: myPos.y + Math.sin(angle) * 100
        };
        
        return this.moveToward(myPlayer, targetPos);
    }
    
    strafe(myPlayer, targetPos) {
        const myPos = myPlayer.tank.position;
        const angle = Math.atan2(targetPos.y - myPos.y, targetPos.x - myPos.x);
        
        // Perpendicular movement
        const strafeAngle = angle + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
        const strafePos = {
            x: myPos.x + Math.cos(strafeAngle) * 50,
            y: myPos.y + Math.sin(strafeAngle) * 50
        };
        
        return this.moveToward(myPlayer, strafePos);
    }
    
    getRandomPatrolPoint(gameState) {
        const mapWidth = gameState.terrain[0].length * 32;
        const mapHeight = gameState.terrain.length * 32;
        
        return {
            x: Math.random() * mapWidth,
            y: Math.random() * mapHeight
        };
    }
    
    getDistance(pos1, pos2) {
        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

class BotManager {
    constructor(gameEngine) {
        this.engine = gameEngine;
        this.bots = new Map();
        this.updateInterval = 100; // Update bots every 100ms
        this.lastUpdate = 0;
        this.botIdCounter = -1000; // Negative IDs for bots
    }
    
    addBot(name, team, difficulty = 'medium') {
        const botId = `bot_${this.botIdCounter--}`;
        const bot = new AIBot(botId, name, team, difficulty);
        
        // Add bot as player to game
        this.engine.addPlayer({
            id: botId,
            name: `🤖 ${name}`,
            team: team,
            isBot: true
        });
        
        this.bots.set(botId, bot);
        console.log(`Added bot: ${name} (${difficulty}) to team ${team}`);
        
        return botId;
    }
    
    removeBot(botId) {
        if (this.bots.has(botId)) {
            this.engine.removePlayer(botId);
            this.bots.delete(botId);
            console.log(`Removed bot: ${botId}`);
        }
    }
    
    update(deltaTime) {
        this.lastUpdate += deltaTime;
        
        if (this.lastUpdate < this.updateInterval) {
            return;
        }
        
        this.lastUpdate = 0;
        
        const gameState = this.engine.getState();
        
        this.bots.forEach(bot => {
            const actions = bot.update(gameState, this.updateInterval);
            
            if (actions) {
                // Apply bot actions
                if (Array.isArray(actions)) {
                    actions.forEach(action => {
                        this.engine.applyInput(bot.id, action, gameState.frame);
                    });
                } else {
                    this.engine.applyInput(bot.id, actions, gameState.frame);
                }
            }
        });
    }
    
    clearBots() {
        this.bots.forEach((bot, id) => {
            this.engine.removePlayer(id);
        });
        this.bots.clear();
    }
    
    getBotCount() {
        return this.bots.size;
    }
}

export { AIBot, BotManager };
