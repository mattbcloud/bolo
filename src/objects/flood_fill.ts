/**
 * Flood fill
 *
 * An invisible object, which implements the slow but sure flooding when a crater or new tile of
 * river is created.
 */

import BoloObject from '../object';

export class FloodFill extends BoloObject {
  styled: null = null;
  lifespan: number = 0;
  cell: any;
  neighbours: any[] = [];

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
    this.lifespan = 16;
  }

  anySpawn(): void {
    this.cell = this.world.map.cellAtWorld(this.x, this.y);
    this.neighbours = [
      this.cell.neigh(1, 0),
      this.cell.neigh(0, 1),
      this.cell.neigh(-1, 0),
      this.cell.neigh(0, -1),
    ];
  }

  update(): void {
    if (this.lifespan-- === 0) {
      this.flood();
      // Only destroy on server (ClientWorld doesn't have this method)
      if (this.world.destroy) {
        this.world.destroy(this);
      }
    }
  }

  canGetWet(): boolean {
    let result = false;
    for (const n of this.neighbours) {
      if (!n.base && !n.pill && n.isType(' ', '^', 'b')) {
        result = true;
        break;
      }
    }
    return result;
  }

  flood(): void {
    if (this.canGetWet()) {
      this.cell.setType(' ', false);
      this.spread();
    }
  }

  spread(): void {
    // Only spawn on server (ClientWorld doesn't have this method)
    if (!this.world.spawn) return;
    for (const n of this.neighbours) {
      if (!n.base && !n.pill && n.isType('%')) {
        this.world.spawn(FloodFill, n);
      }
    }
  }
}

export default FloodFill;
