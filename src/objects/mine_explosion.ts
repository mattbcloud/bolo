/**
 * Mine explosion
 *
 * An invisible object, which triggers a mine after a short delay. These are always spawned when
 * mines are supposed to be triggered, even if there is no mine on the cell at the time.
 */

import { TILE_SIZE_WORLD } from '../constants';
import { distance } from '../helpers';
import BoloObject from '../object';
import * as sounds from '../sounds';
import Explosion from './explosion';

export class MineExplosion extends BoloObject {
  styled: null = null;
  lifespan: number = 0;
  cell: any;

  serialization(isCreate: boolean, p: Function): void {
    if (isCreate) {
      p('H', 'x');
      p('H', 'y');
    }

    p('B', 'lifespan');
  }

  // World updates

  spawn(cell: any): void {
    [this.x, this.y] = cell.getWorldCoordinates();
    this.lifespan = 10;
  }

  anySpawn(): void {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
  }

  update(): void {
    if (this.lifespan-- === 0) {
      // Only run on server (ClientWorld doesn't have spawn/destroy methods)
      if (this.world.spawn && this.world.destroy) {
        if (this.cell && this.cell.mine) this.asplode();
        this.world.destroy(this);
      }
    }
  }

  asplode(): void {
    this.cell.setType(null, false, 0);

    this.cell.takeExplosionHit();
    for (const tank of this.world.tanks) {
      if (tank.armour !== 255 && distance(this as any, tank) < 384) {
        tank.takeMineHit();
      }
      const builder = tank.builder?.$;
      if (builder) {
        const { inTank, parachuting } = builder.states;
        if (builder.order !== inTank && builder.order !== parachuting) {
          if (distance(this as any, builder) < TILE_SIZE_WORLD / 2) {
            builder.kill();
          }
        }
      }
    }

    if (this.world.spawn) {
      this.world.spawn(Explosion, this.x, this.y);
    }
    this.soundEffect(sounds.MINE_EXPLOSION);
    this.spread();
  }

  spread(): void {
    if (!this.world.spawn) return;  // Only run on server
    let n = this.cell.neigh(1, 0);
    if (!n.isEdgeCell()) this.world.spawn(MineExplosion, n);
    n = this.cell.neigh(0, 1);
    if (!n.isEdgeCell()) this.world.spawn(MineExplosion, n);
    n = this.cell.neigh(-1, 0);
    if (!n.isEdgeCell()) this.world.spawn(MineExplosion, n);
    n = this.cell.neigh(0, -1);
    if (!n.isEdgeCell()) this.world.spawn(MineExplosion, n);
  }
}

export default MineExplosion;
