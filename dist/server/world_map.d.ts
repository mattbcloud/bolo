/**
 * This module extends the classes defined in the `map` module, and provides the logic, data and
 * hooks that are needed for a full game.
 */
import { Map, MapCell, TerrainType } from './map';
export declare class WorldMapCell extends MapCell {
    life: number;
    constructor(map: Map, x: number, y: number, options?: {
        isDummy?: boolean;
    });
    isObstacle(): boolean;
    /**
     * Does this cell contain a tank with a boat?
     */
    hasTankOnBoat(): boolean;
    getTankSpeed(tank: any): number;
    getTankTurn(tank: any): number;
    getManSpeed(man: any): number;
    getPixelCoordinates(): [number, number];
    getWorldCoordinates(): [number, number];
    setType(newType: string | number | TerrainType | null, mine?: boolean, retileRadius?: number): void;
    takeShellHit(shell: any): number;
    takeExplosionHit(): void;
}
export declare class WorldMap extends Map {
    CellClass: typeof WorldMapCell;
    PillboxClass: any;
    BaseClass: any;
    world: any;
    constructor();
    /**
     * Override to return WorldMap instead of Map
     */
    static load(buffer: ArrayLike<number>): WorldMap;
    /**
     * Override to return WorldMapCell instead of MapCell
     */
    findCenterCell(): WorldMapCell;
    /**
     * Override to return WorldMapCell instead of MapCell
     */
    cellAtTile(x: number, y: number): WorldMapCell;
    /**
     * Get the cell at the given pixel coordinates, or return a dummy cell.
     */
    cellAtPixel(x: number, y: number): WorldMapCell;
    /**
     * Get the cell at the given world coordinates, or return a dummy cell.
     */
    cellAtWorld(x: number, y: number): WorldMapCell;
    getRandomStart(): any;
}
export default WorldMap;
//# sourceMappingURL=world_map.d.ts.map