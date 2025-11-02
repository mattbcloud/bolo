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
  team: number | null = 255;
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
      this.team = 255;  // Will be updated by updateOwner() when owner ref is set
      this.armour = armour!;
      this.shells = shells!;
      this.mines = mines!;
      // Override the cell's type.
      world_or_map.cellAtTile(x, y).setType('=', false, -1);
    }

    // Keep track of owner and position changes.
    this.on('netUpdate', (changes: any) => {
      console.log(`[BASE netUpdate] Base idx=${this.idx}, changes:`, Object.keys(changes), `team=${this.team}, owner_idx=${this.owner_idx}`);

      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        // Update cell reference when position changes
        if (this.x != null && this.y != null) {
          this.cell = this.world.map.cellAtWorld(this.x, this.y);
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
    if (this.owner) {
      this.owner_idx = this.owner.$.tank_idx;
      this.team = this.owner.$.team;
      console.log(`[BASE updateOwner SET] Base idx=${this.idx}, set owner_idx=${this.owner_idx}, team=${this.team}`);
      // Immediately verify the values were written
      console.log(`[BASE updateOwner VERIFY] Base idx=${this.idx}, readback: this.owner_idx=${this.owner_idx}, this.team=${this.team}`);
    }
    // Don't reset owner_idx or team when owner becomes null
    // These values are now sent directly via serialization and should persist
    // The owner reference can be temporarily null during serialization/deserialization
    this.cell?.retile();
    console.log(`[BASE updateOwner AFTER] Base idx=${this.idx}, final this.team=${this.team}, this.owner_idx=${this.owner_idx}`);
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
    // DEBUG: Log that update is being called (only for base 16 to reduce spam)
    if (this.idx === 16) {
      console.log(`[BASE update] Base idx=${this.idx} update() called, refueling=${!!this.refueling}`);
    }

    if (this.refueling && (this.refueling.$.cell !== this.cell || this.refueling.$.armour === 255)) {
      this.ref('refueling', null);
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
    // Debug: Check tank positions relative to this base (logging once per second max per base)
    const debugTanks = this.world.tanks.filter((tank: any) => tank.armour !== 255);
    if (debugTanks.length > 0 && this.idx === 16 && Math.random() < 0.05) {  // Only log for base 16, 5% of the time
      console.log(`[BASE findSubject DEBUG] Base idx=${this.idx} at cell (${this.cell?.x},${this.cell?.y})`);
      debugTanks.forEach((tank: any) => {
        const cellMatch = tank.cell === this.cell;
        console.log(`  Tank idx=${tank.tank_idx}: cell=(${tank.cell?.x},${tank.cell?.y}), armour=${tank.armour}, cellMatch=${cellMatch}`);
      });
    }

    const tanks = this.world.tanks.filter(
      (tank: any) => tank.armour !== 255 && tank.cell === this.cell
    );

    if (tanks.length > 0) {
      console.log(`[BASE findSubject] Base idx=${this.idx} found ${tanks.length} tanks on same cell`);
    }

    for (const tank of tanks) {
      if (this.owner?.$.isAlly(tank)) {
        console.log(`[BASE findSubject] Base idx=${this.idx} refueling ally tank ${tank.tank_idx}`);
        this.ref('refueling', tank);
        this.refuelCounter = 46;
        break;
      } else {
        console.log(`[BASE findSubject] Base idx=${this.idx} checking if can claim from tank ${tank.tank_idx}, hasOwner=${!!this.owner}`);
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
          this.owner.$.on('destroy', () => {
            this.ref('owner', null);
            this.updateOwner();
          });
          this.ref('refueling', tank);
          this.refuelCounter = 46;
          break;
        } else {
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
