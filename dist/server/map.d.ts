/**
 * This module contains everything needed to read, manipulate and save the BMAP format for Bolo
 * maps. It's the same format that's used by the original Bolo and WinBolo. This is one of the few
 * modules that is useful on it's own.
 */
/**
 * All the different terrain types we know about, indexed both by the numeric ID used in the
 * binary BMAP format, as well as by ASCII code we use here in Orona.
 */
export interface TerrainType {
    ascii: string;
    description: string;
}
export declare const TERRAIN_TYPES: TerrainType[] & {
    [key: string]: TerrainType;
};
export declare class MapCell {
    map: Map;
    x: number;
    y: number;
    type: TerrainType;
    mine: boolean;
    idx: number;
    pill?: any;
    base?: any;
    constructor(map: Map, x: number, y: number, options?: {
        isDummy?: boolean;
    });
    /**
     * Get the cell at offset +dx+,+dy+ from this cell.
     * Most commonly used to get one of the neighbouring cells.
     * Will return a dummy deep sea cell if the location is off the map.
     */
    neigh(dx: number, dy: number): MapCell;
    /**
     * Check whether the cell is one of the give types.
     */
    isType(...types: string[]): boolean;
    isEdgeCell(): boolean;
    getNumericType(): number;
    setType(newType: string | number | TerrainType | null, mine?: boolean, retileRadius?: number): void;
    /**
     * Helper for retile methods. Short-hand for notifying the view of a retile.
     * Also takes care of drawing mines.
     */
    setTile(tx: number, ty: number): void;
    /**
     * Retile this cell. See map#retile.
     */
    retile(): void;
    retileDeepSea(): void;
    retileBuilding(): void;
    retileRiver(): void;
    retileRoad(): void;
    retileForest(): void;
    retileBoat(): void;
}
/**
 * This is an interface for map views. Map views are responsible for actually displaying the map on
 * the screen. This class also functions as the do-nothing dummy implementation. You need not
 * inherit from this class, just make sure whatever view object you use responds to the methods
 * declared here.
 */
export declare class MapView {
    /**
     * Called every time a tile changes, with the tile reference and the new tile coordinates to use.
     * This is also called on Map#setView, once for every tile.
     */
    onRetile(cell: MapCell, tx: number, ty: number): void;
}
/**
 * The following are interfaces and dummy default implementations of map objects. If a subclass
 * of `Map` wishes to use different classes for map objects, it simply needs to define new classes
 * with similar constructors and exposing the same attributes.
 */
export declare class MapObject {
    map: Map;
    x: number;
    y: number;
    cell: MapCell;
    constructor(map: Map);
}
export declare class Pillbox extends MapObject {
    owner_idx: number;
    armour: number;
    speed: number;
    constructor(map: Map, x: number, y: number, owner_idx: number, armour: number, speed: number);
}
export declare class Base extends MapObject {
    owner_idx: number;
    armour: number;
    shells: number;
    mines: number;
    constructor(map: Map, x: number, y: number, owner_idx: number, armour: number, shells: number, mines: number);
}
export declare class Start extends MapObject {
    direction: number;
    constructor(map: Map, x: number, y: number, direction: number);
}
export declare class Map {
    static CellClass: typeof MapCell;
    static PillboxClass: typeof Pillbox;
    static BaseClass: typeof Base;
    static StartClass: typeof Start;
    CellClass: typeof MapCell;
    PillboxClass: typeof Pillbox;
    BaseClass: typeof Base;
    StartClass: typeof Start;
    view: MapView;
    pills: Pillbox[];
    bases: Base[];
    starts: Start[];
    cells: MapCell[][];
    /**
     * Initialize the map array.
     */
    constructor();
    setView(view: MapView): void;
    /**
     * Get the cell at the given tile coordinates, or return a dummy cell.
     */
    cellAtTile(x: number, y: number): MapCell;
    /**
     * Iterate over the map cells, either the complete map or a specific area.
     * The callback function will have each cell available as +this+.
     */
    each(cb: (this: MapCell, cell: MapCell) => void, sx?: number, sy?: number, ex?: number, ey?: number): this;
    /**
     * Clear the map, or a specific area, by filling it with deep sea tiles.
     * Note: this will not do any retiling!
     */
    clear(sx?: number, sy?: number, ex?: number, ey?: number): void;
    /**
     * Recalculate the tile cache for each cell, or for a specific area.
     */
    retile(sx?: number, sy?: number, ex?: number, ey?: number): void;
    /**
     * Find the cell at the center of the 'painted' map area.
     */
    findCenterCell(): MapCell;
    /**
     * Dump the map to an array of octets in BMAP format.
     */
    dump(options?: {
        noPills?: boolean;
        noBases?: boolean;
        noStarts?: boolean;
    }): number[];
    /**
     * Load a map from +buffer+. The buffer is treated as an array of numbers
     * representing octets. So a node.js Buffer will work.
     */
    static load(buffer: ArrayLike<number>): Map;
}
//# sourceMappingURL=map.d.ts.map