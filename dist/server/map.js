/**
 * This module contains everything needed to read, manipulate and save the BMAP format for Bolo
 * maps. It's the same format that's used by the original Bolo and WinBolo. This is one of the few
 * modules that is useful on it's own.
 */
import { MAP_SIZE_TILES } from './constants';
const { round, floor, min } = Math;
export const TERRAIN_TYPES = [
    { ascii: '|', description: 'building' },
    { ascii: ' ', description: 'river' },
    { ascii: '~', description: 'swamp' },
    { ascii: '%', description: 'crater' },
    { ascii: '=', description: 'road' },
    { ascii: '#', description: 'forest' },
    { ascii: ':', description: 'rubble' },
    { ascii: '.', description: 'grass' },
    { ascii: '}', description: 'shot building' },
    { ascii: 'b', description: 'river with boat' },
    { ascii: '^', description: 'deep sea' },
];
function createTerrainMap() {
    for (const type of TERRAIN_TYPES) {
        TERRAIN_TYPES[type.ascii] = type;
    }
}
createTerrainMap();
// Cell class
export class MapCell {
    constructor(map, x, y, options) {
        this.map = map;
        this.x = x;
        this.y = y;
        this.type = TERRAIN_TYPES['^'];
        this.mine = this.isEdgeCell();
        // This is just a unique index for this cell; used in a couple of places for convenience.
        this.idx = y * MAP_SIZE_TILES + x;
    }
    /**
     * Get the cell at offset +dx+,+dy+ from this cell.
     * Most commonly used to get one of the neighbouring cells.
     * Will return a dummy deep sea cell if the location is off the map.
     */
    neigh(dx, dy) {
        return this.map.cellAtTile(this.x + dx, this.y + dy);
    }
    /**
     * Check whether the cell is one of the give types.
     */
    isType(...types) {
        for (let i = 0; i < arguments.length; i++) {
            const type = arguments[i];
            if (this.type === type || this.type.ascii === type)
                return true;
        }
        return false;
    }
    isEdgeCell() {
        return this.x <= 20 || this.x >= 236 || this.y <= 20 || this.y >= 236;
    }
    getNumericType() {
        if (this.type.ascii === '^')
            return -1;
        let num = TERRAIN_TYPES.indexOf(this.type);
        if (this.mine)
            num += 8;
        return num;
    }
    setType(newType, mine, retileRadius) {
        retileRadius = retileRadius ?? 1;
        const oldType = this.type;
        const hadMine = this.mine;
        if (mine !== undefined)
            this.mine = mine;
        if (typeof newType === 'string') {
            this.type = TERRAIN_TYPES[newType];
            if (newType.length !== 1 || !this.type) {
                throw new Error(`Invalid terrain type: ${newType}`);
            }
        }
        else if (typeof newType === 'number') {
            if (newType >= 10) {
                newType -= 8;
                this.mine = true;
            }
            else {
                this.mine = false;
            }
            this.type = TERRAIN_TYPES[newType];
            if (!this.type) {
                throw new Error(`Invalid terrain type: ${newType}`);
            }
        }
        else if (newType !== null) {
            this.type = newType;
        }
        if (this.isEdgeCell())
            this.mine = true;
        if (retileRadius >= 0) {
            this.map.retile(this.x - retileRadius, this.y - retileRadius, this.x + retileRadius, this.y + retileRadius);
        }
    }
    /**
     * Helper for retile methods. Short-hand for notifying the view of a retile.
     * Also takes care of drawing mines.
     */
    setTile(tx, ty) {
        if (this.mine && !this.pill && !this.base)
            ty += 10;
        this.map.view.onRetile(this, tx, ty);
    }
    /**
     * Retile this cell. See map#retile.
     */
    retile() {
        if (this.pill) {
            this.setTile(this.pill.armour, 2);
        }
        else if (this.base) {
            this.setTile(16, 0);
        }
        else {
            switch (this.type.ascii) {
                case '^':
                    this.retileDeepSea();
                    break;
                case '|':
                    this.retileBuilding();
                    break;
                case ' ':
                    this.retileRiver();
                    break;
                case '~':
                    this.setTile(7, 1);
                    break;
                case '%':
                    this.setTile(5, 1);
                    break;
                case '=':
                    this.retileRoad();
                    break;
                case '#':
                    this.retileForest();
                    break;
                case ':':
                    this.setTile(4, 1);
                    break;
                case '.':
                    this.setTile(2, 1);
                    break;
                case '}':
                    this.setTile(8, 1);
                    break;
                case 'b':
                    this.retileBoat();
                    break;
            }
        }
    }
    retileDeepSea() {
        // We only care if our neighbours are deep sea, water or land.
        const neighbourSignificance = (dx, dy) => {
            const n = this.neigh(dx, dy);
            if (n.isType('^'))
                return 'd';
            if (n.isType(' ', 'b'))
                return 'w';
            return 'l';
        };
        const above = neighbourSignificance(0, -1);
        const aboveRight = neighbourSignificance(1, -1);
        const right = neighbourSignificance(1, 0);
        const belowRight = neighbourSignificance(1, 1);
        const below = neighbourSignificance(0, 1);
        const belowLeft = neighbourSignificance(-1, 1);
        const left = neighbourSignificance(-1, 0);
        const aboveLeft = neighbourSignificance(-1, -1);
        if (aboveLeft !== 'd' && above !== 'd' && left !== 'd' && right === 'd' && below === 'd') {
            this.setTile(10, 3);
        }
        else if (aboveRight !== 'd' && above !== 'd' && right !== 'd' && left === 'd' && below === 'd') {
            this.setTile(11, 3);
        }
        else if (belowRight !== 'd' && below !== 'd' && right !== 'd' && left === 'd' && above === 'd') {
            this.setTile(13, 3);
        }
        else if (belowLeft !== 'd' && below !== 'd' && left !== 'd' && right === 'd' && above === 'd') {
            this.setTile(12, 3);
        }
        else if (left === 'w' && right === 'd') {
            this.setTile(14, 3);
        }
        else if (below === 'w' && above === 'd') {
            this.setTile(15, 3);
        }
        else if (above === 'w' && below === 'd') {
            this.setTile(16, 3);
        }
        else if (right === 'w' && left === 'd') {
            this.setTile(17, 3);
        }
        else {
            this.setTile(0, 0);
        }
    }
    retileBuilding() {
        // We only care if our neighbours are buildings or not.
        const neighbourSignificance = (dx, dy) => {
            const n = this.neigh(dx, dy);
            if (n.isType('|', '}'))
                return 'b';
            return 'o';
        };
        const above = neighbourSignificance(0, -1);
        const aboveRight = neighbourSignificance(1, -1);
        const right = neighbourSignificance(1, 0);
        const belowRight = neighbourSignificance(1, 1);
        const below = neighbourSignificance(0, 1);
        const belowLeft = neighbourSignificance(-1, 1);
        const left = neighbourSignificance(-1, 0);
        const aboveLeft = neighbourSignificance(-1, -1);
        // Complex building tile selection logic
        if (aboveLeft === 'b' &&
            above === 'b' &&
            aboveRight === 'b' &&
            left === 'b' &&
            right === 'b' &&
            belowLeft === 'b' &&
            below === 'b' &&
            belowRight === 'b') {
            this.setTile(17, 1);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveRight !== 'b' &&
            aboveLeft !== 'b' &&
            belowRight !== 'b' &&
            belowLeft !== 'b') {
            this.setTile(30, 1);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveRight !== 'b' &&
            aboveLeft !== 'b' &&
            belowRight !== 'b' &&
            belowLeft === 'b') {
            this.setTile(22, 2);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveRight !== 'b' &&
            aboveLeft === 'b' &&
            belowRight !== 'b' &&
            belowLeft !== 'b') {
            this.setTile(23, 2);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveRight !== 'b' &&
            aboveLeft !== 'b' &&
            belowRight === 'b' &&
            belowLeft !== 'b') {
            this.setTile(24, 2);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveRight === 'b' &&
            aboveLeft !== 'b' &&
            belowRight !== 'b' &&
            belowLeft !== 'b') {
            this.setTile(25, 2);
        }
        else if (aboveLeft === 'b' &&
            above === 'b' &&
            left === 'b' &&
            right === 'b' &&
            belowLeft === 'b' &&
            below === 'b' &&
            belowRight === 'b') {
            this.setTile(16, 2);
        }
        else if (above === 'b' &&
            aboveRight === 'b' &&
            left === 'b' &&
            right === 'b' &&
            belowLeft === 'b' &&
            below === 'b' &&
            belowRight === 'b') {
            this.setTile(17, 2);
        }
        else if (aboveLeft === 'b' &&
            above === 'b' &&
            aboveRight === 'b' &&
            left === 'b' &&
            right === 'b' &&
            belowLeft === 'b' &&
            below === 'b') {
            this.setTile(18, 2);
        }
        else if (aboveLeft === 'b' &&
            above === 'b' &&
            aboveRight === 'b' &&
            left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            belowRight === 'b') {
            this.setTile(19, 2);
        }
        else if (left === 'b' &&
            right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            aboveRight === 'b' &&
            belowLeft === 'b' &&
            aboveLeft !== 'b' &&
            belowRight !== 'b') {
            this.setTile(20, 2);
        }
        else if (left === 'b' &&
            right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            belowRight === 'b' &&
            aboveLeft === 'b' &&
            aboveRight !== 'b' &&
            belowLeft !== 'b') {
            this.setTile(21, 2);
        }
        else if (above === 'b' &&
            left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            belowRight === 'b' &&
            aboveRight === 'b') {
            this.setTile(8, 2);
        }
        else if (above === 'b' &&
            left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            belowLeft === 'b' &&
            aboveLeft === 'b') {
            this.setTile(9, 2);
        }
        else if (above === 'b' &&
            left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            belowLeft === 'b' &&
            belowRight === 'b') {
            this.setTile(10, 2);
        }
        else if (above === 'b' &&
            left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            aboveLeft === 'b' &&
            aboveRight === 'b') {
            this.setTile(11, 2);
        }
        else if (above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            right !== 'b' &&
            belowLeft === 'b' &&
            aboveLeft !== 'b') {
            this.setTile(12, 2);
        }
        else if (above === 'b' &&
            below === 'b' &&
            right === 'b' &&
            belowRight === 'b' &&
            left !== 'b' &&
            aboveRight !== 'b') {
            this.setTile(13, 2);
        }
        else if (above === 'b' &&
            below === 'b' &&
            right === 'b' &&
            aboveRight === 'b' &&
            belowRight !== 'b') {
            this.setTile(14, 2);
        }
        else if (above === 'b' &&
            below === 'b' &&
            left === 'b' &&
            aboveLeft === 'b' &&
            belowLeft !== 'b') {
            this.setTile(15, 2);
        }
        else if (right === 'b' &&
            above === 'b' &&
            left === 'b' &&
            below !== 'b' &&
            aboveLeft !== 'b' &&
            aboveRight !== 'b') {
            this.setTile(26, 1);
        }
        else if (right === 'b' &&
            below === 'b' &&
            left === 'b' &&
            belowLeft !== 'b' &&
            belowRight !== 'b') {
            this.setTile(27, 1);
        }
        else if (right === 'b' &&
            above === 'b' &&
            below === 'b' &&
            aboveRight !== 'b' &&
            belowRight !== 'b') {
            this.setTile(28, 1);
        }
        else if (below === 'b' &&
            above === 'b' &&
            left === 'b' &&
            aboveLeft !== 'b' &&
            belowLeft !== 'b') {
            this.setTile(29, 1);
        }
        else if (left === 'b' &&
            right === 'b' &&
            above === 'b' &&
            aboveRight === 'b' &&
            aboveLeft !== 'b') {
            this.setTile(4, 2);
        }
        else if (left === 'b' &&
            right === 'b' &&
            above === 'b' &&
            aboveLeft === 'b' &&
            aboveRight !== 'b') {
            this.setTile(5, 2);
        }
        else if (left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            belowLeft === 'b' &&
            belowRight !== 'b') {
            this.setTile(6, 2);
        }
        else if (left === 'b' &&
            right === 'b' &&
            below === 'b' &&
            above !== 'b' &&
            belowRight === 'b' &&
            belowLeft !== 'b') {
            this.setTile(7, 2);
        }
        else if (right === 'b' && above === 'b' && below === 'b') {
            this.setTile(0, 2);
        }
        else if (left === 'b' && above === 'b' && below === 'b') {
            this.setTile(1, 2);
        }
        else if (right === 'b' && left === 'b' && below === 'b') {
            this.setTile(2, 2);
        }
        else if (right === 'b' && above === 'b' && left === 'b') {
            this.setTile(3, 2);
        }
        else if (right === 'b' && below === 'b' && belowRight === 'b') {
            this.setTile(18, 1);
        }
        else if (left === 'b' && below === 'b' && belowLeft === 'b') {
            this.setTile(19, 1);
        }
        else if (right === 'b' && above === 'b' && aboveRight === 'b') {
            this.setTile(20, 1);
        }
        else if (left === 'b' && above === 'b' && aboveLeft === 'b') {
            this.setTile(21, 1);
        }
        else if (right === 'b' && below === 'b') {
            this.setTile(22, 1);
        }
        else if (left === 'b' && below === 'b') {
            this.setTile(23, 1);
        }
        else if (right === 'b' && above === 'b') {
            this.setTile(24, 1);
        }
        else if (left === 'b' && above === 'b') {
            this.setTile(25, 1);
        }
        else if (left === 'b' && right === 'b') {
            this.setTile(11, 1);
        }
        else if (above === 'b' && below === 'b') {
            this.setTile(12, 1);
        }
        else if (right === 'b') {
            this.setTile(13, 1);
        }
        else if (left === 'b') {
            this.setTile(14, 1);
        }
        else if (below === 'b') {
            this.setTile(15, 1);
        }
        else if (above === 'b') {
            this.setTile(16, 1);
        }
        else {
            this.setTile(6, 1);
        }
    }
    retileRiver() {
        // We only care if our neighbours are road, water, or land.
        const neighbourSignificance = (dx, dy) => {
            const n = this.neigh(dx, dy);
            if (n.isType('='))
                return 'r';
            if (n.isType('^', ' ', 'b'))
                return 'w';
            return 'l';
        };
        const above = neighbourSignificance(0, -1);
        const right = neighbourSignificance(1, 0);
        const below = neighbourSignificance(0, 1);
        const left = neighbourSignificance(-1, 0);
        if (above === 'l' && below === 'l' && right === 'l' && left === 'l') {
            this.setTile(30, 2);
        }
        else if (above === 'l' && below === 'l' && right === 'w' && left === 'l') {
            this.setTile(26, 2);
        }
        else if (above === 'l' && below === 'l' && right === 'l' && left === 'w') {
            this.setTile(27, 2);
        }
        else if (above === 'l' && below === 'w' && right === 'l' && left === 'l') {
            this.setTile(28, 2);
        }
        else if (above === 'w' && below === 'l' && right === 'l' && left === 'l') {
            this.setTile(29, 2);
        }
        else if (above === 'l' && left === 'l') {
            this.setTile(6, 3);
        }
        else if (above === 'l' && right === 'l') {
            this.setTile(7, 3);
        }
        else if (below === 'l' && left === 'l') {
            this.setTile(8, 3);
        }
        else if (below === 'l' && right === 'l') {
            this.setTile(9, 3);
        }
        else if (below === 'l' && above === 'l' && below === 'l') {
            this.setTile(0, 3);
        }
        else if (left === 'l' && right === 'l') {
            this.setTile(1, 3);
        }
        else if (left === 'l') {
            this.setTile(2, 3);
        }
        else if (below === 'l') {
            this.setTile(3, 3);
        }
        else if (right === 'l') {
            this.setTile(4, 3);
        }
        else if (above === 'l') {
            this.setTile(5, 3);
        }
        else {
            this.setTile(1, 0);
        }
    }
    retileRoad() {
        // We only care if our neighbours are road, water, or land.
        const neighbourSignificance = (dx, dy) => {
            const n = this.neigh(dx, dy);
            if (n.isType('='))
                return 'r';
            if (n.isType('^', ' ', 'b'))
                return 'w';
            return 'l';
        };
        const above = neighbourSignificance(0, -1);
        const aboveRight = neighbourSignificance(1, -1);
        const right = neighbourSignificance(1, 0);
        const belowRight = neighbourSignificance(1, 1);
        const below = neighbourSignificance(0, 1);
        const belowLeft = neighbourSignificance(-1, 1);
        const left = neighbourSignificance(-1, 0);
        const aboveLeft = neighbourSignificance(-1, -1);
        if (aboveLeft !== 'r' &&
            above === 'r' &&
            aboveRight !== 'r' &&
            left === 'r' &&
            right === 'r' &&
            belowLeft !== 'r' &&
            below === 'r' &&
            belowRight !== 'r') {
            this.setTile(11, 0);
        }
        else if (above === 'r' && left === 'r' && right === 'r' && below === 'r') {
            this.setTile(10, 0);
        }
        else if (left === 'w' && right === 'w' && above === 'w' && below === 'w') {
            this.setTile(26, 0);
        }
        else if (right === 'r' && below === 'r' && left === 'w' && above === 'w') {
            this.setTile(20, 0);
        }
        else if (left === 'r' && below === 'r' && right === 'w' && above === 'w') {
            this.setTile(21, 0);
        }
        else if (above === 'r' && left === 'r' && below === 'w' && right === 'w') {
            this.setTile(22, 0);
        }
        else if (right === 'r' && above === 'r' && left === 'w' && below === 'w') {
            this.setTile(23, 0);
        }
        else if (above === 'w' && below === 'w') {
            this.setTile(24, 0); // and (left === 'r' || right === 'r')
        }
        else if (left === 'w' && right === 'w') {
            this.setTile(25, 0); // and (above === 'r' || below === 'r')
        }
        else if (above === 'w' && below === 'r') {
            this.setTile(16, 0);
        }
        else if (right === 'w' && left === 'r') {
            this.setTile(17, 0);
        }
        else if (below === 'w' && above === 'r') {
            this.setTile(18, 0);
        }
        else if (left === 'w' && right === 'r') {
            this.setTile(19, 0);
        }
        else if (right === 'r' &&
            below === 'r' &&
            above === 'r' &&
            (aboveRight === 'r' || belowRight === 'r')) {
            this.setTile(27, 0);
        }
        else if (left === 'r' &&
            right === 'r' &&
            below === 'r' &&
            (belowLeft === 'r' || belowRight === 'r')) {
            this.setTile(28, 0);
        }
        else if (left === 'r' &&
            above === 'r' &&
            below === 'r' &&
            (belowLeft === 'r' || aboveLeft === 'r')) {
            this.setTile(29, 0);
        }
        else if (left === 'r' &&
            right === 'r' &&
            above === 'r' &&
            (aboveRight === 'r' || aboveLeft === 'r')) {
            this.setTile(30, 0);
        }
        else if (left === 'r' && right === 'r' && below === 'r') {
            this.setTile(12, 0);
        }
        else if (left === 'r' && above === 'r' && below === 'r') {
            this.setTile(13, 0);
        }
        else if (left === 'r' && right === 'r' && above === 'r') {
            this.setTile(14, 0);
        }
        else if (right === 'r' && above === 'r' && below === 'r') {
            this.setTile(15, 0);
        }
        else if (below === 'r' && right === 'r' && belowRight === 'r') {
            this.setTile(6, 0);
        }
        else if (below === 'r' && left === 'r' && belowLeft === 'r') {
            this.setTile(7, 0);
        }
        else if (above === 'r' && left === 'r' && aboveLeft === 'r') {
            this.setTile(8, 0);
        }
        else if (above === 'r' && right === 'r' && aboveRight === 'r') {
            this.setTile(9, 0);
        }
        else if (below === 'r' && right === 'r') {
            this.setTile(2, 0);
        }
        else if (below === 'r' && left === 'r') {
            this.setTile(3, 0);
        }
        else if (above === 'r' && left === 'r') {
            this.setTile(4, 0);
        }
        else if (above === 'r' && right === 'r') {
            this.setTile(5, 0);
        }
        else if (right === 'r' || left === 'r') {
            this.setTile(0, 1);
        }
        else if (above === 'r' || below === 'r') {
            this.setTile(1, 1);
        }
        else {
            this.setTile(10, 0);
        }
    }
    retileForest() {
        // Check in which directions we have adjoining forest.
        const above = this.neigh(0, -1).isType('#');
        const right = this.neigh(1, 0).isType('#');
        const below = this.neigh(0, 1).isType('#');
        const left = this.neigh(-1, 0).isType('#');
        if (!above && !left && right && below) {
            this.setTile(9, 9);
        }
        else if (!above && left && !right && below) {
            this.setTile(10, 9);
        }
        else if (above && left && !right && !below) {
            this.setTile(11, 9);
        }
        else if (above && !left && right && !below) {
            this.setTile(12, 9);
        }
        else if (above && !left && !right && !below) {
            this.setTile(16, 9);
        }
        else if (!above && !left && !right && below) {
            this.setTile(15, 9);
        }
        else if (!above && left && !right && !below) {
            this.setTile(14, 9);
        }
        else if (!above && !left && right && !below) {
            this.setTile(13, 9);
        }
        else if (!above && !left && !right && !below) {
            this.setTile(8, 9);
        }
        else {
            this.setTile(3, 1);
        }
    }
    retileBoat() {
        // We only care if our neighbours are water or land.
        const neighbourSignificance = (dx, dy) => {
            const n = this.neigh(dx, dy);
            if (n.isType('^', ' ', 'b'))
                return 'w';
            return 'l';
        };
        const above = neighbourSignificance(0, -1);
        const right = neighbourSignificance(1, 0);
        const below = neighbourSignificance(0, 1);
        const left = neighbourSignificance(-1, 0);
        if (above !== 'w' && left !== 'w') {
            this.setTile(15, 6);
        }
        else if (above !== 'w' && right !== 'w') {
            this.setTile(16, 6);
        }
        else if (below !== 'w' && right !== 'w') {
            this.setTile(17, 6);
        }
        else if (below !== 'w' && left !== 'w') {
            this.setTile(14, 6);
        }
        else if (left !== 'w') {
            this.setTile(12, 6);
        }
        else if (right !== 'w') {
            this.setTile(13, 6);
        }
        else if (below !== 'w') {
            this.setTile(10, 6);
        }
        else {
            this.setTile(11, 6);
        }
    }
}
// View class
/**
 * This is an interface for map views. Map views are responsible for actually displaying the map on
 * the screen. This class also functions as the do-nothing dummy implementation. You need not
 * inherit from this class, just make sure whatever view object you use responds to the methods
 * declared here.
 */
export class MapView {
    /**
     * Called every time a tile changes, with the tile reference and the new tile coordinates to use.
     * This is also called on Map#setView, once for every tile.
     */
    onRetile(cell, tx, ty) { }
}
// Map objects
/**
 * The following are interfaces and dummy default implementations of map objects. If a subclass
 * of `Map` wishes to use different classes for map objects, it simply needs to define new classes
 * with similar constructors and exposing the same attributes.
 */
export class MapObject {
    constructor(map) {
        this.x = 0;
        this.y = 0;
        this.map = map;
        this.cell = map.cells[this.y][this.x];
    }
}
export class Pillbox extends MapObject {
    constructor(map, x, y, owner_idx, armour, speed) {
        super(map);
        this.x = x;
        this.y = y;
        this.owner_idx = owner_idx;
        this.armour = armour;
        this.speed = speed;
        // Update cell reference after setting x and y
        this.cell = map.cells[this.y][this.x];
    }
}
export class Base extends MapObject {
    constructor(map, x, y, owner_idx, armour, shells, mines) {
        super(map);
        this.x = x;
        this.y = y;
        this.owner_idx = owner_idx;
        this.armour = armour;
        this.shells = shells;
        this.mines = mines;
        // Update cell reference after setting x and y
        this.cell = map.cells[this.y][this.x];
    }
}
export class Start extends MapObject {
    constructor(map, x, y, direction) {
        super(map);
        this.x = x;
        this.y = y;
        this.direction = direction;
        // Update cell reference after setting x and y
        this.cell = map.cells[this.y][this.x];
    }
}
// Map class
export class Map {
    /**
     * Initialize the map array.
     */
    constructor() {
        this.CellClass = MapCell;
        this.PillboxClass = Pillbox;
        this.BaseClass = Base;
        this.StartClass = Start;
        this.pills = [];
        this.bases = [];
        this.starts = [];
        this.cells = [];
        this.view = new MapView();
        this.cells = new Array(MAP_SIZE_TILES);
        for (let y = 0; y < MAP_SIZE_TILES; y++) {
            const row = (this.cells[y] = new Array(MAP_SIZE_TILES));
            for (let x = 0; x < MAP_SIZE_TILES; x++) {
                row[x] = new this.CellClass(this, x, y);
            }
        }
    }
    setView(view) {
        this.view = view;
        this.retile();
    }
    /**
     * Get the cell at the given tile coordinates, or return a dummy cell.
     */
    cellAtTile(x, y) {
        const cell = this.cells[y]?.[x];
        if (cell)
            return cell;
        return new this.CellClass(this, x, y, { isDummy: true });
    }
    /**
     * Iterate over the map cells, either the complete map or a specific area.
     * The callback function will have each cell available as +this+.
     */
    each(cb, sx, sy, ex, ey) {
        const startX = sx !== undefined && sx >= 0 ? sx : 0;
        const startY = sy !== undefined && sy >= 0 ? sy : 0;
        const endX = ex !== undefined && ex < MAP_SIZE_TILES ? ex : MAP_SIZE_TILES - 1;
        const endY = ey !== undefined && ey < MAP_SIZE_TILES ? ey : MAP_SIZE_TILES - 1;
        for (let y = startY; y <= endY; y++) {
            const row = this.cells[y];
            for (let x = startX; x <= endX; x++) {
                cb.call(row[x], row[x]);
            }
        }
        return this;
    }
    /**
     * Clear the map, or a specific area, by filling it with deep sea tiles.
     * Note: this will not do any retiling!
     */
    clear(sx, sy, ex, ey) {
        this.each(function () {
            this.type = TERRAIN_TYPES['^'];
            this.mine = this.isEdgeCell();
        }, sx, sy, ex, ey);
    }
    /**
     * Recalculate the tile cache for each cell, or for a specific area.
     */
    retile(sx, sy, ex, ey) {
        this.each(function () {
            this.retile();
        }, sx, sy, ex, ey);
    }
    /**
     * Find the cell at the center of the 'painted' map area.
     */
    findCenterCell() {
        let t = MAP_SIZE_TILES - 1, l = MAP_SIZE_TILES - 1;
        let b = 0, r = 0;
        this.each(function (c) {
            if (l > c.x)
                l = c.x;
            if (r < c.x)
                r = c.x;
            if (t > c.y)
                t = c.y;
            if (b < c.y)
                b = c.y;
        });
        if (l > r) {
            t = l = 0;
            b = r = MAP_SIZE_TILES - 1;
        }
        const x = round(l + (r - l) / 2);
        const y = round(t + (b - t) / 2);
        return this.cellAtTile(x, y);
    }
    // Saving and loading
    /**
     * Dump the map to an array of octets in BMAP format.
     */
    dump(options) {
        options = options || {};
        // Private helper for collecting consecutive cells of the same type.
        const consecutiveCells = (row, cb) => {
            let currentType = null;
            let startx = null;
            let count = 0;
            for (let x = 0; x < row.length; x++) {
                const cell = row[x];
                const num = cell.getNumericType();
                if (currentType === num) {
                    count++;
                    continue;
                }
                if (currentType !== null) {
                    cb(currentType, count, startx);
                }
                currentType = num;
                startx = x;
                count = 1;
            }
            if (currentType !== null) {
                cb(currentType, count, startx);
            }
        };
        // Private helper for encoding an array of nibbles to an array of octets.
        const encodeNibbles = (nibbles) => {
            const octets = [];
            let val = null;
            for (let i = 0; i < nibbles.length; i++) {
                let nibble = nibbles[i] & 0x0f;
                if (i % 2 === 0) {
                    val = nibble << 4;
                }
                else {
                    octets.push(val + nibble);
                    val = null;
                }
            }
            if (val !== null)
                octets.push(val);
            return octets;
        };
        // Process options.
        const pills = options.noPills ? [] : this.pills;
        const bases = options.noBases ? [] : this.bases;
        const starts = options.noStarts ? [] : this.starts;
        // Build the header.
        let data = [];
        for (const c of 'BMAPBOLO')
            data.push(c.charCodeAt(0));
        data.push(1, pills.length, bases.length, starts.length);
        for (const p of pills)
            data.push(p.x, p.y, p.owner_idx, p.armour, p.speed);
        for (const b of bases)
            data.push(b.x, b.y, b.owner_idx, b.armour, b.shells, b.mines);
        for (const s of starts)
            data.push(s.x, s.y, s.direction);
        // While building the map data, we collect sequences and runs.
        // What follows are helpers to deal with flushing these two arrays to data.
        let run = null;
        let seq = null;
        let sx = 0, ex = 0, y = 0;
        // Flush the current run, and push it to data.
        const flushRun = () => {
            if (!run)
                return;
            flushSequence();
            const octets = encodeNibbles(run);
            data.push(octets.length + 4, y, sx, ex);
            data = data.concat(octets);
            run = null;
        };
        // Ensure there's enough space in the run, or start a new one.
        const ensureRunSpace = (numNibbles) => {
            if (!((255 - 4) * 2 - run.length < numNibbles))
                return;
            flushRun();
            run = [];
            sx = ex;
        };
        // Flush the current sequence, and push it to the run.
        const flushSequence = () => {
            if (!seq)
                return;
            // Prevent infinite recursion.
            const localSeq = seq;
            seq = null;
            ensureRunSpace(localSeq.length + 1);
            run.push(localSeq.length - 1);
            run = run.concat(localSeq);
            ex += localSeq.length;
        };
        // Build the runs of map data.
        for (const row of this.cells) {
            y = row[0].y;
            run = null;
            sx = ex = 0;
            seq = null;
            consecutiveCells(row, (type, count, x) => {
                // Deep sea cells are simply omitted in the map data.
                if (type === -1) {
                    flushRun(); // The previous run ends here.
                    return;
                }
                // Create the new run of we're at the start.
                if (!run) {
                    run = [];
                    sx = ex = x;
                }
                // Add a long sequence if we have 3 or more of the same type in a row.
                if (count > 2) {
                    // Flush existing short sequence.
                    flushSequence();
                    // Add long sequences until count is exhausted.
                    // Because the size is a nibble, we can only encode sequences of 2..9.
                    while (count > 2) {
                        ensureRunSpace(2);
                        const seqLen = min(count, 9);
                        run.push(seqLen + 6, type);
                        ex += seqLen;
                        count -= seqLen;
                    }
                    // Fall-through, the remaining count may allow for a short sequence.
                }
                while (count > 0) {
                    // Add the short sequence.
                    if (!seq)
                        seq = [];
                    seq.push(type);
                    // Flush if we run out of space.
                    if (seq.length === 8)
                        flushSequence();
                    count--;
                }
            });
        }
        // Flush any remaining stuff.
        flushRun();
        // The sentinel.
        data.push(4, 0xff, 0xff, 0xff);
        return data;
    }
    /**
     * Load a map from +buffer+. The buffer is treated as an array of numbers
     * representing octets. So a node.js Buffer will work.
     */
    static load(buffer) {
        // Helper for reading slices out of the buffer.
        let filePos = 0;
        const readBytes = (num, msg) => {
            let sub;
            try {
                // FIXME: This is lame, but ensures we're not dealing with a Buffer object.
                // The only reason for that is because we can't pass a Buffer as a splat.
                sub = [];
                for (let i = filePos; i < filePos + num; i++) {
                    sub.push(buffer[i]);
                }
            }
            catch (e) {
                throw new Error(msg);
            }
            filePos += num;
            return sub;
        };
        // Read the header.
        const magic = readBytes(8, 'Not a Bolo map.');
        for (let i = 0; i < 'BMAPBOLO'.length; i++) {
            const c = 'BMAPBOLO'[i];
            if (c.charCodeAt(0) !== magic[i]) {
                throw new Error('Not a Bolo map.');
            }
        }
        const [version, numPills, numBases, numStarts] = readBytes(4, 'Incomplete header');
        if (version !== 1) {
            throw new Error(`Unsupported map version: ${version}`);
        }
        // Allocate the map.
        const map = new this();
        // Read the map objects.
        const pillsData = [];
        for (let i = 0; i < numPills; i++) {
            pillsData.push(readBytes(5, 'Incomplete pillbox data'));
        }
        const basesData = [];
        for (let i = 0; i < numBases; i++) {
            basesData.push(readBytes(6, 'Incomplete base data'));
        }
        const startsData = [];
        for (let i = 0; i < numStarts; i++) {
            startsData.push(readBytes(3, 'Incomplete player start data'));
        }
        // Read map data.
        while (true) {
            const [dataLen, y, sx, ex] = readBytes(4, 'Incomplete map data');
            const actualDataLen = dataLen - 4;
            if (actualDataLen === 0 && y === 0xff && sx === 0xff && ex === 0xff)
                break;
            const run = readBytes(actualDataLen, 'Incomplete map data');
            let runPos = 0;
            const takeNibble = () => {
                const index = floor(runPos);
                const nibble = index === runPos ? (run[index] & 0xf0) >> 4 : run[index] & 0x0f;
                runPos += 0.5;
                return nibble;
            };
            let x = sx;
            while (x < ex) {
                const seqLen = takeNibble();
                if (seqLen < 8) {
                    for (let i = 1; i <= seqLen + 1; i++) {
                        map.cellAtTile(x++, y).setType(takeNibble(), undefined, -1);
                    }
                }
                else {
                    const type = takeNibble();
                    for (let i = 1; i <= seqLen - 6; i++) {
                        map.cellAtTile(x++, y).setType(type, undefined, -1);
                    }
                }
            }
        }
        // Instantiate the map objects. Late, so they can do postprocessing on the map.
        map.pills = pillsData.map((args) => new map.PillboxClass(map, ...args));
        map.bases = basesData.map((args) => new map.BaseClass(map, ...args));
        map.starts = startsData.map(([x, y, direction]) => new map.StartClass(map, x, y, direction));
        return map;
    }
}
Map.CellClass = MapCell;
Map.PillboxClass = Pillbox;
Map.BaseClass = Base;
Map.StartClass = Start;
//# sourceMappingURL=map.js.map