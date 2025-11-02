/**
 * This module extends the classes defined in the `map` module, and provides the logic, data and
 * hooks that are needed for a full game.
 */
import { TILE_SIZE_WORLD, TILE_SIZE_PIXELS } from './constants';
import { Map, TERRAIN_TYPES, MapCell } from './map';
import * as sounds from './sounds';
import { WorldPillbox } from './objects/world_pillbox';
import { WorldBase } from './objects/world_base';
import { FloodFill } from './objects/flood_fill';
const { round, random, floor } = Math;
const TERRAIN_TYPE_ATTRIBUTES = {
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
function extendTerrainMap() {
    for (const ascii in TERRAIN_TYPE_ATTRIBUTES) {
        const attributes = TERRAIN_TYPE_ATTRIBUTES[ascii];
        const type = TERRAIN_TYPES[ascii];
        for (const key in attributes) {
            type[key] = attributes[key];
        }
    }
}
extendTerrainMap();
// Cell class
export class WorldMapCell extends MapCell {
    constructor(map, x, y, options) {
        super(map, x, y, options);
        this.life = 0;
    }
    isObstacle() {
        return (this.pill?.armour > 0) || this.type.tankSpeed === 0;
    }
    /**
     * Does this cell contain a tank with a boat?
     */
    hasTankOnBoat() {
        for (const tank of this.map.world.tanks) {
            if (tank.armour !== 255 && tank.cell === this) {
                if (tank.onBoat)
                    return true;
            }
        }
        return false;
    }
    getTankSpeed(tank) {
        // Check for a pillbox.
        if (this.pill?.armour > 0)
            return 0;
        // Check for an enemy base.
        if (this.base?.owner) {
            if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
                return 0;
            }
        }
        // Check if we're on a boat.
        if (tank.onBoat && this.isType('^', ' '))
            return 16;
        // Take the land speed.
        return this.type.tankSpeed;
    }
    getTankTurn(tank) {
        // Check for a pillbox.
        if (this.pill?.armour > 0)
            return 0.0;
        // Check for an enemy base.
        if (this.base?.owner) {
            if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
                return 0.0;
            }
        }
        // Check if we're on a boat.
        if (tank.onBoat && this.isType('^', ' '))
            return 1.0;
        // Take the land turn speed.
        return this.type.tankTurn;
    }
    getManSpeed(man) {
        const tank = man.owner.$;
        // Check for a pillbox.
        if (this.pill?.armour > 0)
            return 0;
        // Check for an enemy base.
        if (this.base?.owner) {
            if (!this.base.owner.$.isAlly(tank) && this.base.armour > 9) {
                return 0;
            }
        }
        // Take the land speed.
        return this.type.manSpeed;
    }
    getPixelCoordinates() {
        return [(this.x + 0.5) * TILE_SIZE_PIXELS, (this.y + 0.5) * TILE_SIZE_PIXELS];
    }
    getWorldCoordinates() {
        return [(this.x + 0.5) * TILE_SIZE_WORLD, (this.y + 0.5) * TILE_SIZE_WORLD];
    }
    setType(newType, mine, retileRadius) {
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
        this.map.world?.mapChanged(this, oldType, hadMine, oldLife);
    }
    takeShellHit(shell) {
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
                this.setType(nextType);
            }
            else {
                this.map.world?.mapChanged(this, this.type, this.mine);
            }
        }
        else if (this.isType('#')) {
            this.setType('.');
            sfx = sounds.SHOT_TREE;
        }
        else if (this.isType('=')) {
            const neigh = (() => {
                if (shell.direction >= 224 || shell.direction < 32)
                    return this.neigh(1, 0);
                else if (shell.direction >= 32 && shell.direction < 96)
                    return this.neigh(0, -1);
                else if (shell.direction >= 96 && shell.direction < 160)
                    return this.neigh(-1, 0);
                else
                    return this.neigh(0, 1);
            })();
            if (neigh.isType(' ', '^'))
                this.setType(' ');
        }
        else {
            const nextType = (() => {
                switch (this.type.ascii) {
                    case '|':
                        return '}';
                    case 'b':
                        return ' ';
                }
            })();
            this.setType(nextType);
        }
        if (this.isType(' ')) {
            // Only spawn on server (ClientWorld doesn't have this method)
            if (this.map.world?.spawn) {
                this.map.world.spawn(FloodFill, this);
            }
        }
        return sfx;
    }
    takeExplosionHit() {
        if (this.pill) {
            this.pill.takeExplosionHit();
            return;
        }
        if (this.isType('b')) {
            this.setType(' ');
        }
        else if (!this.isType(' ', '^', 'b')) {
            this.setType('%');
        }
        else {
            return;
        }
        // Only spawn on server (ClientWorld doesn't have this method)
        if (this.map.world?.spawn) {
            this.map.world.spawn(FloodFill, this);
        }
    }
}
// Map class
export class WorldMap extends Map {
    constructor() {
        super();
        this.CellClass = WorldMapCell;
        this.PillboxClass = WorldPillbox;
        this.BaseClass = WorldBase;
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
    static load(buffer) {
        return super.load(buffer);
    }
    /**
     * Override to return WorldMapCell instead of MapCell
     */
    findCenterCell() {
        return super.findCenterCell();
    }
    /**
     * Override to return WorldMapCell instead of MapCell
     */
    cellAtTile(x, y) {
        return super.cellAtTile(x, y);
    }
    /**
     * Get the cell at the given pixel coordinates, or return a dummy cell.
     */
    cellAtPixel(x, y) {
        return this.cellAtTile(floor(x / TILE_SIZE_PIXELS), floor(y / TILE_SIZE_PIXELS));
    }
    /**
     * Get the cell at the given world coordinates, or return a dummy cell.
     */
    cellAtWorld(x, y) {
        return this.cellAtTile(floor(x / TILE_SIZE_WORLD), floor(y / TILE_SIZE_WORLD));
    }
    getRandomStart() {
        return this.starts[round(random() * (this.starts.length - 1))];
    }
}
export default WorldMap;
//# sourceMappingURL=world_map.js.map