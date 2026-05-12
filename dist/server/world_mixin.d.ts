/**
 * World mixin
 *
 * Common logic between all bolo world classes.
 */
export interface BoloWorldMixin {
    tanks: any[];
    authority: boolean;
    map: any;
    boloInit(): void;
    addTank(tank: any): void;
    removeTank(tank: any): void;
    reclaimTeamObjects(tank: any): void;
    getAllMapObjects(): any[];
    spawnMapObjects(): void;
    resolveMapObjectOwners(): void;
    insert(obj: any): void;
}
export declare const BoloWorldMixin: {
    /**
     * If only we could extend constructors using mixins.
     */
    boloInit(this: any): void;
    addTank(this: any, tank: any): void;
    /**
     * When a player joins, any base or pillbox that belongs to their team but
     * has no current owner (abandoned when the last same-team player left) is
     * re-assigned to this tank.  This restores the owner reference used by
     * getTankSpeed() / getTankTurn() so that enemies must fire on the base to
     * deplete its armour before they can drive over and claim it.
     *
     * Only objects with owner_idx === 255 (explicitly abandoned) and a matching
     * team colour are touched; objects already owned by another tank are left
     * alone.
     */
    reclaimTeamObjects(this: any, tank: any): void;
    removeTank(this: any, tank: any): void;
    /**
     * A helper method which returns all map objects.
     */
    getAllMapObjects(this: any): any[];
    /**
     * The special spawning logic for MapObjects. These are created when the map is loaded, which is
     * before the World is created. We emulate `spawn` here for these objects.
     */
    spawnMapObjects(this: any): void;
    /**
     * Resolve pillbox and base owner indices to the actual tanks. This method is only really useful
     * on the server. Because of the way serialization works, the client doesn't get the see invalid
     * owner indices. (As can be seen in `ServerWorld#serialize`.) It is called whenever a player
     * joins or leaves the game.
     */
    resolveMapObjectOwners(this: any): void;
};
export default BoloWorldMixin;
//# sourceMappingURL=world_mixin.d.ts.map