/**
 * Flood fill
 *
 * An invisible object, which implements the slow but sure flooding when a crater or new tile of
 * river is created.
 */
import BoloObject from '../object';
export declare class FloodFill extends BoloObject {
    styled: null;
    lifespan: number;
    cell: any;
    neighbours: any[];
    serialization(isCreate: boolean, p: Function): void;
    spawn(cell: any): void;
    anySpawn(): void;
    update(): void;
    canGetWet(): boolean;
    flood(): void;
    spread(): void;
}
export default FloodFill;
//# sourceMappingURL=flood_fill.d.ts.map