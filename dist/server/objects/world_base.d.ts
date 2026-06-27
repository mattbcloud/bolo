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
    private _regenCounter;
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
     * True if the base's owning team currently has at least one live tank in the game.
     *
     * When FALSE the base is effectively abandoned (its team disconnected / has no members):
     * per the Bolo rule the armour gate is lifted so ANY tank can drive across and claim it,
     * without first shooting it down. Relying on the `owner` ref being nulled on disconnect was
     * fragile — a base that kept a stale owner ref stayed gated forever (one base un-claimable
     * while siblings claimed fine). Checking live team membership directly is robust to that.
     */
    ownerTeamHasMembers(): boolean;
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