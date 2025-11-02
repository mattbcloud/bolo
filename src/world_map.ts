/**
 * This module extends the classes defined in the `map` module, and provides the logic, data and
 * hooks that are needed for a full game.
 */

import { TILE_SIZE_WORLD, TILE_SIZE_PIXELS } from './constants';
import { Map, TERRAIN_TYPES, MapCell, TerrainType } from './map';
import * as sounds from './sounds';
import { WorldPillbox } from './objects/world_pillbox';
import { WorldBase } from './objects/world_base';
import { FloodFill } from './objects/flood_fill';

const { round, random, floor } = Math;

// Terrain data

/**
 * Extend `TERRAIN_TYPES` with additional attributes that matter to the game.
 */

interface TerrainTypeAttributes {
  tankSpeed: number;
  tankTurn: number;
  manSpeed: number;
}

const TERRAIN_TYPE_ATTRIBUTES: Record<string, TerrainTypeAttributes> = {
  '|': { tankSpeed: 0, tankTurn: 0.0, manSpeed: 0 },
  ' ': { tankSpeed: 3, tankTurn: 0.25, manSpeed: 0 },
  '~': { tankSpeed: 3, tankTurn: 0.25, manSpeed: 4 },
  '%': { tankSpeed: 3, tankTurn: 0.25, manSpeed: 4 },
  '=': { tankSpeed: 16, tankTurn: 1.0, manSpeed: 16 },
  '#': { tankSpeed: 6, tankTurn: 0.5, manSpeed: 8 },
  ':': { tankSpeed: 3, tankTurn: 0.25, manSpeed: 4 },
  '.': { tankSpeed: 12, tankTurn: 1.0, manSpeed: 16 },
  '}': { tankSpeed: 0, tankTurn: 0.0, manSpeed: 0 },
  b: { tankSpeed: 16, tankTurn: 1.0, manSpeed: 16 },
  '^': { tankSpeed: 3, tankTurn: 0.5, manSpeed: 0 },
};

function extendTerrainMap(): void {
  for (const ascii in TERRAIN_TYPE_ATTRIBUTES) {
    const attributes = TERRAIN_TYPE_ATTRIBUTES[ascii];
    const type = (TERRAIN_TYPES as any)[ascii] as TerrainType;
    for (const key in attributes) {
      (type as any)[key] = (attributes as any)[key];
    }
  }
}

extendTerrainMap();

// Cell class

export class WorldMapCell extends MapCell {
  life: number = 0;

  constructor(map: Map, x: number, y: number, options?: { isDummy?: boolean }) {
    super(map, x, y, options);
  }

  isObstacle(): boolean {
    return (this.pill?.armour > 0) || (this.type as any).tankSpeed === 0;
  }

  /**
   * Does this cell contain a tank with a boat?
   */
  hasTankOnBoat(): boolean {
    for (const tank of (this.map as unknown as WorldMap).world.tanks) {
      if (tank.armour !== 255 && tank.cell === this) {
        if (tank.onBoat) return true;
      }
    }
    return false;
  }

  getTankSpeed(tank: any): number {
    // Check for a pillbox.
    if (this.pill?.armour > 0) return 0;
    // Check for an enemy base.
    if (this.base?.owner) {
      if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
        return 0;
      }
    }
    // Check if we're on a boat.
    if (tank.onBoat && this.isType('^', ' ')) return 16;
    // Take the land speed.
    return (this.type as any).tankSpeed;
  }

  getTankTurn(tank: any): number {
    // Check for a pillbox.
    if (this.pill?.armour > 0) return 0.0;
    // Check for an enemy base.
    if (this.base?.owner) {
      if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
        return 0.0;
      }
    }
    // Check if we're on a boat.
    if (tank.onBoat && this.isType('^', ' ')) return 1.0;
    // Take the land turn speed.
    return (this.type as any).tankTurn;
  }

  getManSpeed(man: any): number {
    const tank = man.owner.$;
    // Check for a pillbox.
    if (this.pill?.armour > 0) return 0;
    // Check for an enemy base.
    if (this.base?.owner) {
      if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
        return 0;
      }
    }
    // Take the land speed.
    return (this.type as any).manSpeed;
  }

  getPixelCoordinates(): [number, number] {
    return [(this.x + 0.5) * TILE_SIZE_PIXELS, (this.y + 0.5) * TILE_SIZE_PIXELS];
  }

  getWorldCoordinates(): [number, number] {
    return [(this.x + 0.5) * TILE_SIZE_WORLD, (this.y + 0.5) * TILE_SIZE_WORLD];
  }

  setType(newType: string | number | TerrainType | null, mine?: boolean, retileRadius?: number): void {
    const oldType = this.type;
    const hadMine = this.mine;
    const oldLife = this.life;

    super.setType(newType, mine, retileRadius);

    this.life = (() => {
      switch (this.type.ascii) {
        case '.':
          return 5;
        case '}':
          return 5;
        case ':':
          return 5;
        case '~':
          return 4;
        default:
          return 0;
      }
    })();

    (this.map as unknown as WorldMap).world?.mapChanged(this, oldType, hadMine, oldLife);
  }

  takeShellHit(shell: any): number {
    // FIXME: check for a mine
    let sfx = sounds.SHOT_BUILDING;

    if (this.isType('.', '}', ':', '~')) {
      if (--this.life === 0) {
        const nextType = (() => {
          switch (this.type.ascii) {
            case '.':
              return '~';
            case '}':
              return ':';
            case ':':
              return ' ';
            case '~':
              return ' ';
          }
        })();
        this.setType(nextType!);
      } else {
        (this.map as unknown as WorldMap).world?.mapChanged(this, this.type, this.mine);
      }
    } else if (this.isType('#')) {
      this.setType('.');
      sfx = sounds.SHOT_TREE;
    } else if (this.isType('=')) {
      const neigh = (() => {
        if (shell.direction >= 224 || shell.direction < 32) return this.neigh(1, 0);
        else if (shell.direction >= 32 && shell.direction < 96) return this.neigh(0, -1);
        else if (shell.direction >= 96 && shell.direction < 160) return this.neigh(-1, 0);
        else return this.neigh(0, 1);
      })();
      if (neigh.isType(' ', '^')) this.setType(' ');
    } else {
      const nextType = (() => {
        switch (this.type.ascii) {
          case '|':
            return '}';
          case 'b':
            return ' ';
        }
      })();
      this.setType(nextType!);
    }

    if (this.isType(' ')) {
      // Only spawn on server (ClientWorld doesn't have this method)
      if ((this.map as unknown as WorldMap).world?.spawn) {
        (this.map as unknown as WorldMap).world.spawn(FloodFill, this);
      }
    }

    return sfx;
  }

  takeExplosionHit(): void {
    if (this.pill) {
      this.pill.takeExplosionHit();
      return;
    }

    if (this.isType('b')) {
      this.setType(' ');
    } else if (!this.isType(' ', '^', 'b')) {
      this.setType('%');
    } else {
      return;
    }

    // Only spawn on server (ClientWorld doesn't have this method)
    if ((this.map as unknown as WorldMap).world?.spawn) {
      (this.map as unknown as WorldMap).world.spawn(FloodFill, this);
    }
  }
}

// Map class

export class WorldMap extends Map {
  CellClass = WorldMapCell;
  PillboxClass = WorldPillbox as any;
  BaseClass = WorldBase as any;

  world: any;

  constructor() {
    super();
    // The parent constructor created MapCell instances, but we need WorldMapCell instances.
    // Re-create all cells with the correct class.
    for (let y = 0; y < this.cells.length; y++) {
      const row = this.cells[y];
      for (let x = 0; x < row.length; x++) {
        const oldCell = row[x];
        const newCell = new this.CellClass(this, x, y);
        // Copy the state from the old cell
        newCell.type = oldCell.type;
        newCell.mine = oldCell.mine;
        row[x] = newCell;
      }
    }
  }

  /**
   * Override to return WorldMap instead of Map
   */
  static load(buffer: ArrayLike<number>): WorldMap {
    return super.load(buffer) as WorldMap;
  }

  /**
   * Override to return WorldMapCell instead of MapCell
   */
  findCenterCell(): WorldMapCell {
    return super.findCenterCell() as WorldMapCell;
  }

  /**
   * Override to return WorldMapCell instead of MapCell
   */
  cellAtTile(x: number, y: number): WorldMapCell {
    return super.cellAtTile(x, y) as WorldMapCell;
  }

  /**
   * Get the cell at the given pixel coordinates, or return a dummy cell.
   */
  cellAtPixel(x: number, y: number): WorldMapCell {
    return this.cellAtTile(floor(x / TILE_SIZE_PIXELS), floor(y / TILE_SIZE_PIXELS)) as WorldMapCell;
  }

  /**
   * Get the cell at the given world coordinates, or return a dummy cell.
   */
  cellAtWorld(x: number, y: number): WorldMapCell {
    return this.cellAtTile(floor(x / TILE_SIZE_WORLD), floor(y / TILE_SIZE_WORLD)) as WorldMapCell;
  }

  getRandomStart(): any {
    return this.starts[round(random() * (this.starts.length - 1))];
  }
}

export default WorldMap;
