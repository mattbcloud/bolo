/**
 * The base is a map object, and thus a slightly special case of world object.
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';

const { min, max } = Math;

export class WorldBase extends BoloObject {
  styled: boolean;
  // Declare _team as a property but don't initialize it - initialization happens manually in constructor
  declare _team: number | null;

  // Add getter/setter with logging to track all team accesses
  get team(): number | null {
    // Check if there's an own property shadowing this getter
    if (Object.prototype.hasOwnProperty.call(this, 'team')) {
      console.log(`[TEAM GETTER WARNING] Base idx=${this.idx} has OWN PROPERTY 'team' shadowing getter!`);
      console.log(`[TEAM GETTER WARNING] Own property descriptor:`, Object.getOwnPropertyDescriptor(this, 'team'));
    }
    // Log ALL getter accesses for base 25 to debug the issue
    if (this.idx === 25) {
      console.log(`[TEAM GETTER idx=25] Returning _team=${this._team}`);
    }
    return this._team;
  }

  set team(value: number | null) {
    if (this.idx === 25) {
      console.log(`[TEAM SETTER idx=25] BEFORE: _team=${this._team}, about to set to ${value}`);
    }
    if (this.idx !== undefined && this._team !== value) {
      console.log(`[TEAM SETTER] Base idx=${this.idx} setting team from ${this._team} to ${value}`);
      if (value === 255 && this._team !== 255) {
        console.log(`[TEAM SETTER RESET TO 255!!!] Base idx=${this.idx}, stack:`, new Error().stack);
      }
    }
    this._team = value;
    if (this.idx === 25) {
      console.log(`[TEAM SETTER idx=25] AFTER: _team=${this._team}, expected ${value}, match=${this._team === value}`);
    }
    // Verify the value was actually written
    if (this.idx !== undefined && this._team !== value) {
      console.log(`[TEAM SETTER ERROR] Base idx=${this.idx} FAILED to set _team! Expected ${value}, but _team is still ${this._team}`);
    }
  }

  owner_idx: number = 255;
  armour: number;
  shells: number;
  mines: number;
  refueling?: any;
  refuelCounter: number;
  cell: any;
  owner?: any;
  map: any;

  /**
   * This is a MapObject; it is constructed differently on the server.
   */
  constructor(world_or_map: any, x?: number, y?: number, owner_idx?: number, armour?: number, shells?: number, mines?: number) {
    super(arguments.length === 1 ? world_or_map : null);

    // Initialize _team BEFORE any other initialization that might trigger getters/setters
    this._team = 255;
    console.log(`[BASE CONSTRUCTOR] Created base, will be assigned idx, setting _team=255`);

    this.styled = true;
    this.armour = 0;
    this.shells = 0;
    this.mines = 0;
    this.refuelCounter = 0;

    if (arguments.length > 1) {
      this.map = world_or_map;
      this.x = (x! + 0.5) * TILE_SIZE_WORLD;
      this.y = (y! + 0.5) * TILE_SIZE_WORLD;
      this.owner_idx = owner_idx!;
      // Don't set team here - it's already initialized to 255 via _team property
      // Will be updated by updateOwner() when owner ref is set
      this.armour = armour!;
      this.shells = shells!;
      this.mines = mines!;
      // Override the cell's type.
      world_or_map.cellAtTile(x, y).setType('=', false, -1);
    }

    // Keep track of owner and position changes.
    this.on('netUpdate', (changes: any) => {
      console.log(`[BASE netUpdate] Base idx=${this.idx}, changes:`, Object.keys(changes), `team=${this.team}, owner_idx=${this.owner_idx}`);

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
        console.log(`[BASE netUpdate TEAM] Base idx=${this.idx} team changed to ${this.team}`);
        this.cell?.retile();
      }
    });
  }

  /**
   * The state information to synchronize.
   */
  serialization(isCreate: boolean, p: Function): void {
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
  updateOwner(): void {
    console.log(`[BASE updateOwner BEFORE] Base idx=${this.idx}, this.owner=${!!this.owner}, this.team=${this.team}, this.owner_idx=${this.owner_idx}`);
    console.log(`[BASE updateOwner BEFORE] Direct _team field read: ${this._team}`);
    if (this.owner) {
      const targetTeam = this.owner.$.team;
      console.log(`[BASE updateOwner] About to set team to ${targetTeam}`);
      this.owner_idx = this.owner.$.tank_idx;
      this.team = targetTeam;
      console.log(`[BASE updateOwner SET] Base idx=${this.idx}, set owner_idx=${this.owner_idx}, team=${this.team}`);
      // Immediately verify the values were written - check BOTH getter and direct field access
      console.log(`[BASE updateOwner VERIFY] Base idx=${this.idx}, readback via getter: this.team=${this.team}`);
      console.log(`[BASE updateOwner VERIFY] Base idx=${this.idx}, readback via direct field: this._team=${this._team}`);
      console.log(`[BASE updateOwner VERIFY] Base idx=${this.idx}, readback via bracket: this['team']=${(this as any)['team']}`);
      console.log(`[BASE updateOwner VERIFY] Base idx=${this.idx}, readback via bracket: this['_team']=${(this as any)['_team']}`);
    }
    // Don't reset owner_idx or team when owner becomes null
    // These values are now sent directly via serialization and should persist
    // The owner reference can be temporarily null during serialization/deserialization
    this.cell?.retile();
    console.log(`[BASE updateOwner AFTER] Base idx=${this.idx}, final this.team=${this.team}, this.owner_idx=${this.owner_idx}`);
    console.log(`[BASE updateOwner AFTER] Direct _team field read: ${this._team}`);
  }

  /**
   * Get the tilemap index to draw. This is the index in styled.png.
   */
  getTile(): [number, number] {
    return [16, 0];
  }

  // World updates

  spawn(): void {
    // No-op for bases - initialization is handled in anySpawn
  }

  anySpawn(): void {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    this.cell.base = this;
  }

  update(): void {
    // DEBUG: Log that update is being called
    // Removed restriction - log for all bases to debug claim issue
    // console.log(`[BASE update] Base idx=${this.idx} update() called, refueling=${!!this.refueling}`);

    // Base resource regeneration (only on server)
    if (this.world.authority) {
      // Formula: 1 unit per 20 seconds per player
      // At 50 ticks/second: 20 seconds = 1000 ticks
      // Probability per tick = playerCount / 1000
      const playerCount = this.world.tanks.filter((t: any) => t.armour !== 255).length;
      const regenRate = playerCount / 1000;

      if (Math.random() < regenRate) {
        // Regenerate resources up to max capacity (90)
        const MAX_BASE_ARMOUR = 90;
        const MAX_BASE_SHELLS = 90;
        const MAX_BASE_MINES = 90;

        if (this.armour < MAX_BASE_ARMOUR) {
          this.armour++;
        } else if (this.shells < MAX_BASE_SHELLS) {
          this.shells++;
        } else if (this.mines < MAX_BASE_MINES) {
          this.mines++;
        }
      }
    }

    // Check if we should clear the refueling reference
    if (this.refueling) {
      const tankCell = this.refueling.$.cell;
      const tankArmour = this.refueling.$.armour;
      const shouldClear = (tankCell !== this.cell || tankArmour === 255);

      console.log(`[BASE REFUEL CHECK] Base idx=${this.idx}, refueling tank_idx=${this.refueling.$.tank_idx}, tankCell=${tankCell?.x},${tankCell?.y}, baseCell=${this.cell?.x},${this.cell?.y}, cellsMatch=${tankCell === this.cell}, tankArmour=${tankArmour}, shouldClear=${shouldClear}`);

      if (shouldClear) {
        console.log(`[BASE REFUEL CLEAR] Base idx=${this.idx} clearing refueling reference`);
        this.ref('refueling', null);
      }
    }

    if (!this.refueling) {
      this.findSubject();
      return;
    }

    if (--this.refuelCounter !== 0) return;

    // We're clear to transfer some resources to the tank.
    if (this.armour > 0 && this.refueling.$.armour < 40) {
      const amount = min(5, this.armour, 40 - this.refueling.$.armour);
      this.refueling.$.armour += amount;
      this.armour -= amount;
      this.refuelCounter = 46;
    } else if (this.shells > 0 && this.refueling.$.shells < 40) {
      this.refueling.$.shells += 1;
      this.shells -= 1;
      this.refuelCounter = 7;
    } else if (this.mines > 0 && this.refueling.$.mines < 40) {
      this.refueling.$.mines += 1;
      this.mines -= 1;
      this.refuelCounter = 7;
    } else {
      this.refuelCounter = 1;
    }
  }

  /**
   * Look for someone to refuel, and check if he's claiming us too. Be careful to prevent rapid
   * reclaiming if two tanks are on the same tile.
   */
  findSubject(): void {
    const tanks = this.world.tanks.filter(
      (tank: any) => tank.armour !== 255 && tank.cell === this.cell
    );

    if (tanks.length > 0) {
      console.log(`[BASE findSubject] Base idx=${this.idx} at cell (${this.cell?.x},${this.cell?.y}) found ${tanks.length} tanks on same cell`);
      tanks.forEach((tank: any) => {
        console.log(`  [BASE findSubject] Tank tank_idx=${tank.tank_idx}: cell=(${tank.cell?.x},${tank.cell?.y}), team=${tank.team}, armour=${tank.armour}`);
      });
    }

    for (const tank of tanks) {
      // Check if tank is an ally (same team) or if base is unclaimed (team 255)
      const isAlly = this.team !== 255 && tank.team === this.team;

      console.log(`[BASE ALLY CHECK] Base idx=${this.idx}, base.team=${this.team} (type: ${typeof this.team}), tank.team=${tank.team} (type: ${typeof tank.team}), tank_idx=${tank.tank_idx}, isAlly=${isAlly}, check: ${this.team} !== 255 = ${this.team !== 255}, ${tank.team} === ${this.team} = ${tank.team === this.team}`);

      if (isAlly) {
        console.log(`[BASE findSubject] Base idx=${this.idx} refueling ally tank ${tank.tank_idx} (base.team=${this.team}, tank.team=${tank.team})`);
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        console.log(`[BASE findSubject] Base idx=${this.idx} checking if can claim from tank ${tank.tank_idx}, base.team=${this.team}, tank.team=${tank.team}`);
        let canClaim = true;
        for (const other of tanks) {
          if (other !== tank) {
            if (!tank.isAlly(other)) canClaim = false;
          }
        }
        if (canClaim) {
          console.log(`[BASE CLAIM] Base idx=${this.idx} claimed by tank_idx=${tank.tank_idx}, team=${tank.team}`);
          this.ref('owner', tank);
          this.updateOwner();
          console.log(`[BASE CLAIM] After updateOwner: base.owner_idx=${this.owner_idx}, base.team=${this.team}`);
          // Note: We don't listen for owner destroy events because server-side objects
          // don't emit events. Instead, owner_idx and team are sent via serialization
          // and persist even when the owner reference becomes null.
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        } else{
          console.log(`[BASE findSubject] Base idx=${this.idx} cannot claim - other tanks present`);
        }
      }
    }
  }

  takeShellHit(shell: any): number {
    if (this.owner) {
      for (const pill of this.world.map.pills) {
        if (!pill.inTank && !pill.carried && pill.armour > 0) {
          if (pill.owner?.$.isAlly(this.owner.$) && distance(this as any, pill) <= 2304) {
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
