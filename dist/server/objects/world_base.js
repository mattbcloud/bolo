/**
 * The base is a map object, and thus a slightly special case of world object.
 */
import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
const { min, max } = Math;
export class WorldBase extends BoloObject {
    get team() {
        return this._team;
    }
    set team(value) {
        this._team = value;
    }
    /**
     * This is a MapObject; it is constructed differently on the server.
     */
    constructor(world_or_map, x, y, owner_idx, armour, shells, mines) {
        super(arguments.length === 1 ? world_or_map : null);
        this.owner_idx = 255;
        this._team = 255;
        this.styled = true;
        this.armour = 0;
        this.shells = 0;
        this.mines = 0;
        this.refuelCounter = 0;
        if (arguments.length > 1) {
            this.map = world_or_map;
            this.x = (x + 0.5) * TILE_SIZE_WORLD;
            this.y = (y + 0.5) * TILE_SIZE_WORLD;
            this.owner_idx = owner_idx;
            // Don't set team here - it's already initialized to 255 via _team property
            // Will be updated by updateOwner() when owner ref is set
            this.armour = armour;
            this.shells = shells;
            this.mines = mines;
            // Override the cell's type.
            world_or_map.cellAtTile(x, y).setType('=', false, -1);
        }
        // Keep track of owner and position changes.
        this.on('netUpdate', (changes) => {
            // Get the map reference (either from world or directly)
            const map = this.world?.map || this.map;
            if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
                // Update cell reference when position changes
                if (this.x != null && this.y != null && map) {
                    this.cell = map.cellAtWorld(this.x, this.y);
                    this.cell.base = this;
                }
            }
            // Only update owner-derived fields if team wasn't directly updated
            // (since team is now sent via serialization)
            if (changes.hasOwnProperty('owner') && !changes.hasOwnProperty('team')) {
                this.updateOwner();
            }
            // Retile when team changes
            if (changes.hasOwnProperty('team')) {
                this.cell?.retile();
            }
        });
    }
    /**
     * The state information to synchronize.
     */
    serialization(isCreate, p) {
        if (isCreate) {
            p('H', 'x');
            p('H', 'y');
        }
        p('O', 'owner');
        p('B', 'owner_idx');
        p('B', 'team');
        p('O', 'refueling');
        if (this.refueling) {
            p('B', 'refuelCounter');
        }
        p('B', 'armour');
        p('B', 'shells');
        p('B', 'mines');
    }
    /**
     * Helper for common stuff to do when the owner changes.
     */
    updateOwner() {
        if (this.owner) {
            this.owner_idx = this.owner.$.tank_idx;
            this.team = this.owner.$.team;
        }
        // Don't reset owner_idx or team when owner becomes null
        // These values are now sent directly via serialization and should persist
        // The owner reference can be temporarily null during serialization/deserialization
        this.cell?.retile();
    }
    /**
     * Get the tilemap index to draw. This is the index in styled.png.
     */
    getTile() {
        return [16, 0];
    }
    // World updates
    spawn() {
        // No-op for bases - initialization is handled in anySpawn
    }
    anySpawn() {
        this.cell = this.world.map.cellAtWorld(this.x, this.y);
        this.cell.base = this;
    }
    update() {
        // Base resource regeneration (only on server)
        if (this.world.authority) {
            // Formula: 1 unit per 20 seconds per player
            // At 50 ticks/second: 20 seconds = 1000 ticks
            // Probability per tick = playerCount / 1000
            const playerCount = this.world.tanks.filter((t) => t.armour !== 255).length;
            const regenRate = playerCount / 1000;
            if (Math.random() < regenRate) {
                // Regenerate resources up to max capacity (90)
                const MAX_BASE_ARMOUR = 90;
                const MAX_BASE_SHELLS = 90;
                const MAX_BASE_MINES = 90;
                if (this.armour < MAX_BASE_ARMOUR) {
                    this.armour++;
                }
                else if (this.shells < MAX_BASE_SHELLS) {
                    this.shells++;
                }
                else if (this.mines < MAX_BASE_MINES) {
                    this.mines++;
                }
            }
        }
        // Check if we should clear the refueling reference
        if (this.refueling) {
            const tankCell = this.refueling.$.cell;
            const tankArmour = this.refueling.$.armour;
            const shouldClear = (tankCell !== this.cell || tankArmour === 255);
            if (shouldClear) {
                this.ref('refueling', null);
            }
        }
        if (!this.refueling) {
            this.findSubject();
            return;
        }
        if (--this.refuelCounter !== 0)
            return;
        // We're clear to transfer some resources to the tank.
        if (this.armour > 0 && this.refueling.$.armour < 40) {
            const amount = min(5, this.armour, 40 - this.refueling.$.armour);
            this.refueling.$.armour += amount;
            this.armour -= amount;
            this.refuelCounter = 46;
        }
        else if (this.shells > 0 && this.refueling.$.shells < 40) {
            this.refueling.$.shells += 1;
            this.shells -= 1;
            this.refuelCounter = 7;
        }
        else if (this.mines > 0 && this.refueling.$.mines < 40) {
            this.refueling.$.mines += 1;
            this.mines -= 1;
            this.refuelCounter = 7;
        }
        else {
            this.refuelCounter = 1;
        }
    }
    /**
     * Look for someone to refuel, and check if he's claiming us too. Be careful to prevent rapid
     * reclaiming if two tanks are on the same tile.
     */
    findSubject() {
        const tanks = this.world.tanks.filter((tank) => tank.armour !== 255 && tank.cell === this.cell);
        for (const tank of tanks) {
            // Check if tank is an ally (same team) or if base is unclaimed (team 255)
            const isAlly = this.team !== 255 && tank.team === this.team;
            if (isAlly) {
                this.ref('refueling', tank);
                this.refuelCounter = 46;
                break;
            }
            else {
                let canClaim = true;
                for (const other of tanks) {
                    if (other !== tank) {
                        if (!tank.isAlly(other))
                            canClaim = false;
                    }
                }
                if (canClaim) {
                    this.ref('owner', tank);
                    this.updateOwner();
                    // Note: We don't listen for owner destroy events because server-side objects
                    // don't emit events. Instead, owner_idx and team are sent via serialization
                    // and persist even when the owner reference becomes null.
                    this.ref('refueling', tank);
                    this.refuelCounter = 46;
                    break;
                }
            }
        }
    }
    takeShellHit(shell) {
        if (this.owner) {
            for (const pill of this.world.map.pills) {
                if (!pill.inTank && !pill.carried && pill.armour > 0) {
                    if (pill.owner?.$.isAlly(this.owner.$) && distance(this, pill) <= 2304) {
                        pill.aggravate();
                    }
                }
            }
        }
        this.armour = max(0, this.armour - 5);
        return sounds.SHOT_BUILDING;
    }
}
export default WorldBase;
//# sourceMappingURL=world_base.js.map