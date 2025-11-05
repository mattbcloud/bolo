/**
 * The base is a map object, and thus a slightly special case of world object.
 */
import BoloObject from '../object';
export declare class WorldBase extends BoloObject {
    styled: boolean;
    _team: number | null;
    get team(): number | null;
    set team(value: number | null);
    owner_idx: number;
    armour: number;
    shells: number;
    mines: number;
    refueling?: any;
    refuelCounter: number;
    cell: any;
    owner?: any;
    map: any;
    /**
     * This is a MapObject; it is constructed differently on the server.
     */
    constructor(world_or_map: any, x?: number, y?: number, owner_idx?: number, armour?: number, shells?: number, mines?: number);
    /**
     * The state information to synchronize.
     */
    serialization(isCreate: boolean, p: Function): void;
    /**
     * Helper for common stuff to do when the owner changes.
     */
    updateOwner(): void;
    /**
     * Get the tilemap index to draw. This is the index in styled.png.
     */
    getTile(): [number, number];
    spawn(): void;
    anySpawn(): void;
    update(): void;
    /**
     * Look for someone to refuel, and check if he's claiming us too. Be careful to prevent rapid
     * reclaiming if two tanks are on the same tile.
     */
    findSubject(): void;
    takeShellHit(shell: any): number;
}
export default WorldBase;
//# sourceMappingURL=world_base.d.ts.map