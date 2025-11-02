/**
 * You shoot these. Many, in fact. With intent. At your opponent. Or perhaps some other obstacle.
 */

import { distance, heading } from '../helpers';
import BoloObject from '../object';
import { TILE_SIZE_WORLD, PIXEL_SIZE_WORLD } from '../constants';
import Explosion from './explosion';
import MineExplosion from './mine_explosion';
import * as sounds from '../sounds';

const { round, floor, cos, sin, PI } = Math;

/**
 * This is the interface the handful of destructable objects implement. I'm talking about terrain
 * (thus map cells), tanks, bases and pillboxes. Actually, bases are indestructable. But Hittable
 * sounds too cheesy.
 *
 * The basic premise is a single method `takeShellHit` that receives the Shell object, so that it
 * may possibly inspect its owner. The return value should be an impact sound effect name.
 */
export interface Destructable {
  takeShellHit(shell: Shell): number;
}

export interface ShellOptions {
  direction?: number;
  range?: number;
  onWater?: boolean;
}

export class Shell extends BoloObject {
  updatePriority = 20;
  styled: boolean = false;

  direction: number = 0;
  lifespan: number = 0;
  onWater: boolean = false;
  owner?: any;
  attribution?: any;
  cell: any;
  radians?: number;

  constructor(world: any) {
    super(world);
    // Track position updates.
    this.on('netSync', () => {
      this.updateCell();
    });
  }

  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('B', 'direction');
      p('O', 'owner');
      p('O', 'attribution');
      p('f', 'onWater');
    }

    p('H', 'x');
    p('H', 'y');
    p('B', 'lifespan');
  }

  /**
   * Helper, called in several places that change shell position.
   */
  updateCell(): void {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
  }

  /**
   * Get the 1/16th direction step.
   */
  getDirection16th(): number {
    return round((this.direction - 1) / 16) % 16;
  }

  /**
   * Get the tilemap index to draw. This is the index in base.png.
   */
  getTile(): [number, number] {
    const tx = this.getDirection16th();
    return [tx, 4];
  }

  // World updates

  spawn(owner: any, options?: ShellOptions): void {
    options = options || {};

    this.ref('owner', owner);
    if (this.owner.$.hasOwnProperty('owner_idx')) {
      this.ref('attribution', this.owner.$.owner?.$);
    } else {
      this.ref('attribution', this.owner.$);
    }

    // Default direction is the owner's.
    this.direction = options.direction || this.owner.$.direction;
    // Default lifespan (fired by pillboxes) is 7 tiles.
    this.lifespan = ((options.range || 7) * TILE_SIZE_WORLD) / 32 - 2;
    // Default for onWater (fired by pillboxes) is no.
    this.onWater = options.onWater || false;
    // Start at the owner's location, and move one step away.
    this.x = this.owner.$.x;
    this.y = this.owner.$.y;
    this.move();
  }

  update(): void {
    this.move();
    const collision = this.collide();
    if (collision) {
      const [mode, victim] = collision;
      const sfx = victim.takeShellHit(this);
      let x: number, y: number;
      if (mode === 'cell') {
        [x, y] = this.cell.getWorldCoordinates();
        this.world.soundEffect(sfx, x, y);
      } else {
        // mode === 'tank'
        x = this.x!;
        y = this.y!;
        victim.soundEffect(sfx);
      }
      this.asplode(x, y, mode);
    } else if (this.lifespan-- === 0) {
      this.asplode(this.x!, this.y!, 'eol');
    }
  }

  move(): void {
    if (!this.radians) {
      this.radians = ((256 - this.direction) * 2 * PI) / 256;
    }
    this.x = this.x! + round(cos(this.radians) * 32);
    this.y = this.y! + round(sin(this.radians) * 32);
    this.updateCell();
  }

  collide(): ['cell' | 'tank', any] | null {
    // Check for a collision with a pillbox, but not our owner.
    const pill = this.cell.pill;
    if (pill && pill.armour > 0 && pill !== this.owner?.$) {
      const [x, y] = this.cell.getWorldCoordinates();
      if (distance(this as any, { x, y }) <= 127) {
        return ['cell', pill];
      }
    }

    // Check for collision with tanks. Carefully avoid hitting our owner when fired from a tank.
    // At the same time, remember that a pillbox *can* hit its owner.
    for (const tank of this.world.tanks) {
      if (tank !== this.owner?.$ && tank.armour !== 255) {
        if (distance(this as any, tank) <= 127) {
          return ['tank', tank];
        }
      }
    }

    // When fired from a tank, check for collision with enemy base.
    if (this.attribution?.$ === this.owner?.$) {
      const base = this.cell.base;
      if (base && base.armour > 4) {
        if (this.onWater || (base?.owner && !base.owner.$.isAlly(this.attribution?.$))) {
          return ['cell', base];
        }
      }
    }

    // Check for terrain collision
    const terrainCollision = this.onWater
      ? !this.cell.isType('^', ' ', '%')
      : this.cell.isType('|', '}', '#', 'b');

    if (terrainCollision) {
      return ['cell', this.cell];
    }

    return null;
  }

  asplode(x: number, y: number, mode: string): void {
    for (const tank of this.world.tanks) {
      const builder = tank.builder?.$;
      if (builder) {
        const { inTank, parachuting } = builder.states;
        if (builder.order !== inTank && builder.order !== parachuting) {
          if (mode === 'cell') {
            if (builder.cell === this.cell) builder.kill();
          } else {
            if (distance(this as any, builder) < TILE_SIZE_WORLD / 2) builder.kill();
          }
        }
      }
    }
    // Only spawn/destroy on server (ClientWorld doesn't have these methods)
    if (this.world.spawn && this.world.destroy) {
      this.world.spawn(Explosion, x, y);
      this.world.spawn(MineExplosion, this.cell);
      this.world.destroy(this);
    }
  }
}

export default Shell;
