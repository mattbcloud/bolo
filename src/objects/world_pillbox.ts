/**
 * The pillbox is a map object, and thus a slightly special case of world object.
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance, heading } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Shell from './shell';

const { min, max, round, ceil, PI, cos, sin } = Math;

export class WorldPillbox extends BoloObject {
  styled: boolean;
  team: number | null = 255;
  owner_idx: number;
  armour: number;
  speed: number;
  coolDown: number;
  reload: number;
  inTank: boolean;
  carried: boolean;
  haveTarget: boolean;
  cell: any;
  owner?: any;
  map: any;

  /**
   * This is a MapObject; it is constructed differently on the server.
   */
  constructor(world_or_map: any, x?: number, y?: number, owner_idx?: number, armour?: number, speed?: number) {
    super(arguments.length === 1 ? world_or_map : null);

    this.styled = true;
    this.owner_idx = 255;
    this.armour = 0;
    this.speed = 0;
    this.coolDown = 0;
    this.reload = 0;
    this.inTank = false;
    this.carried = false;
    this.haveTarget = false;
    this.cell = null;

    if (arguments.length > 1) {
      this.map = world_or_map;
      this.x = (x! + 0.5) * TILE_SIZE_WORLD;
      this.y = (y! + 0.5) * TILE_SIZE_WORLD;
      this.owner_idx = owner_idx!;
      this.armour = armour!;
      this.speed = speed!;
    }

    // Keep track of owner and position changes.
    this.on('netUpdate', (changes: any) => {
      if (changes.hasOwnProperty('x') || changes.hasOwnProperty('y')) {
        this.updateCell();
      }
      if (changes.hasOwnProperty('inTank') || changes.hasOwnProperty('carried')) {
        this.updateCell();
      }
      // Only update owner-derived fields if team wasn't directly updated
      // (since team is now sent via serialization)
      if (changes.hasOwnProperty('owner') && !changes.hasOwnProperty('team')) {
        this.updateOwner();
      }
      if (changes.hasOwnProperty('armour')) {
        this.cell?.retile();
      }
      // Retile when team changes
      if (changes.hasOwnProperty('team')) {
        this.cell?.retile();
      }
    });
  }

  /**
   * Helper that updates the cell reference, and ensures a back-reference as well.
   */
  updateCell(): void {
    if (this.cell) {
      delete this.cell.pill;
      this.cell.retile();
    }
    if (this.inTank || this.carried) {
      this.cell = null;
    } else {
      this.cell = this.world.map.cellAtWorld(this.x, this.y);
      this.cell.pill = this;
      this.cell.retile();
    }
  }

  /**
   * Helper for common stuff to do when the owner changes.
   */
  updateOwner(): void {
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
   * The state information to synchronize.
   */
  serialization(isCreate: boolean, p: Function): void {
    p('O', 'owner');
    p('B', 'owner_idx');
    p('B', 'team');

    p('f', 'inTank');
    p('f', 'carried');
    p('f', 'haveTarget');

    // Send position after flags so deserializer knows whether to read it
    if (!this.inTank && !this.carried) {
      p('H', 'x');
      p('H', 'y');
    } else {
      this.x = this.y = null;
    }

    p('B', 'armour');
    p('B', 'speed');
    p('B', 'coolDown');
    p('B', 'reload');
  }

  /**
   * Get the tilemap index to draw. This is the index in styled.png.
   * Returns [column, row] where row should always be 0 because the renderer
   * uses prestyled tilemaps to apply team colors.
   */
  getTile(): [number, number] {
    // Always use row 0 - the renderer applies team colors via prestyling
    const row = 0;

    if (this.armour === 0) {
      return [18, row];
    } else {
      return [16 + this.armour, row];
    }
  }

  /**
   * Called when dropped by a tank, or placed by a builder.
   */
  placeAt(cell: any): void {
    this.inTank = this.carried = false;
    [this.x, this.y] = cell.getWorldCoordinates();
    this.updateCell();
    this.reset();
  }

  // World updates

  spawn(): void {
    this.reset();
  }

  reset(): void {
    this.coolDown = 32;
    this.reload = 0;
  }

  anySpawn(): void {
    this.updateCell();
  }

  update(): void {
    if (this.inTank || this.carried) return;

    if (this.armour === 0) {
      this.haveTarget = false;

      for (const tank of this.world.tanks) {
        if (tank.armour !== 255 && tank.cell === this.cell) {
          this.inTank = true;
          this.x = this.y = null;
          this.updateCell();
          this.ref('owner', tank);
          this.updateOwner();
          break;
        }
      }
      return;
    }

    this.reload = min(this.speed, this.reload + 1);
    if (--this.coolDown === 0) {
      this.coolDown = 32;
      this.speed = min(100, this.speed + 1);
    }
    if (this.reload < this.speed) return;

    let target: any = null;
    let targetDistance = Infinity;
    for (const tank of this.world.tanks) {
      // Pillbox shoots at tanks that are:
      // 1. Alive (armour !== 255)
      // 2. Not on the same team (neutral pillbox shoots at all, team pillbox only shoots enemies)
      // 3. Not hidden in forest
      const isEnemy = (this.team === null || this.team === 255)
        ? true  // Neutral pillbox shoots at everyone
        : (tank.team !== this.team);  // Team pillbox only shoots enemies

      if (tank.armour !== 255 && isEnemy && !tank.hidden) {
        const d = distance(this as any, tank);
        if (d <= 2048 && d < targetDistance) {
          target = tank;
          targetDistance = d;
        }
      }
    }

    if (!target) {
      this.haveTarget = false;
      return;
    }

    // On the flank from idle to targetting, don't fire immediatly.
    if (this.haveTarget) {
      // FIXME: This code needs some helpers, taken from Tank.
      const rad = ((256 - target.getDirection16th() * 16) * 2 * PI) / 256;
      const x = target.x + (targetDistance / 32) * round(cos(rad) * ceil(target.speed));
      const y = target.y + (targetDistance / 32) * round(sin(rad) * ceil(target.speed));
      const direction = 256 - (heading(this as any, { x, y }) * 256) / (2 * PI);
      // Only spawn on server (ClientWorld doesn't have this method)
      if (this.world.spawn) {
        this.world.spawn(Shell, this, { direction });
      }
      this.soundEffect(sounds.SHOOTING);
    }
    this.haveTarget = true;
    this.reload = 0;
  }

  aggravate(): void {
    this.coolDown = 32;
    this.speed = max(6, round(this.speed / 2));
  }

  takeShellHit(shell: any): number {
    this.aggravate();
    this.armour = max(0, this.armour - 1);
    this.cell.retile();
    return sounds.SHOT_BUILDING;
  }

  takeExplosionHit(): void {
    this.armour = max(0, this.armour - 5);
    this.cell.retile();
  }

  repair(trees: number): number {
    const used = min(trees, ceil((15 - this.armour) / 4));
    this.armour = min(15, this.armour + used * 4);
    this.cell.retile();
    return used;
  }
}

export default WorldPillbox;
