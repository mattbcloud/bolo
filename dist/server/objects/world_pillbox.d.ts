/**
 * The pillbox is a map object, and thus a slightly special case of world object.
 */
import BoloObject from '../object';
export declare class WorldPillbox extends BoloObject {
    styled: boolean;
    private _teamValue;
    get team(): number | null;
    set team(value: number | null);
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
    constructor(world_or_map: any, x?: number, y?: number, owner_idx?: number, armour?: number, speed?: number);
    /**
     * Helper that updates the cell reference, and ensures a back-reference as well.
     */
    updateCell(): void;
    /**
     * Helper for common stuff to do when the owner changes.
     */
    updateOwner(): void;
    /**
     * The state information to synchronize.
     */
    serialization(isCreate: boolean, p: Function): void;
    /**
     * Get the tilemap index to draw. This is the index in styled.png.
     * Returns [column, row] where row determines the team color:
     * - row 0: neutral (yellow)
     * - row 1: team RED
     * - row 2: team BLUE
     */
    getTile(): [number, number];
    /**
     * Called when dropped by a tank, or placed by a builder.
     */
    placeAt(cell: any): void;
    spawn(): void;
    reset(): void;
    anySpawn(): void;
    update(): void;
    aggravate(): void;
    takeShellHit(shell: any): number;
    takeExplosionHit(): void;
    repair(trees: number): number;
}
export default WorldPillbox;
//# sourceMappingURL=world_pillbox.d.ts.map