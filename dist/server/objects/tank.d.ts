/**
 * The Tank class contains all the logic you need to tread well. (And all the other logic needed
 * to punish you if you don't.)
 */
import BoloObject from '../object';
import Shell from './shell';
export declare class Tank extends BoloObject {
    styled: boolean;
    team: number | null;
    hidden: boolean;
    speed: number;
    effectiveSpeed: number;
    _prevX: number;
    _prevY: number;
    slideTicks: number;
    slideDirection: number;
    accelerating: boolean;
    braking: boolean;
    direction: number;
    turningClockwise: boolean;
    turningCounterClockwise: boolean;
    turnSpeedup: number;
    shells: number;
    mines: number;
    armour: number;
    trees: number;
    reload: number;
    shooting: boolean;
    layingMine: boolean;
    firingRange: number;
    kills: number;
    deaths: number;
    waterTimer: number;
    onBoat: boolean;
    respawnTimer?: number;
    fireball?: any;
    builder?: any;
    cell: any;
    spawnCount: number;
    /**
     * Tanks are only ever spawned and destroyed on the server.
     */
    constructor(world: any);
    /**
     * Keep the player list updated.
     */
    anySpawn(): void;
    /**
     * Helper, called in several places that change tank position.
     */
    updateCell(): void;
    /**
     * (Re)spawn the tank. Initializes all state. Only ever called on the server.
     */
    reset(): void;
    serialization(isCreate: boolean, p: Function): void;
    /**
     * Get the 1/16th direction step.
     * FIXME: Should move our angle-related calculations to a separate module or so.
     */
    getDirection16th(): number;
    getSlideDirection16th(): number;
    /**
     * Return an array of pillboxes this tank is carrying.
     */
    getCarryingPillboxes(): any[];
    /**
     * Get the tilemap index to draw. This is the index in styled.png.
     */
    getTile(): [number, number];
    /**
     * Check if tank is hidden in forest (surrounded by forest on all 4 sides).
     */
    updateHiddenStatus(): void;
    /**
     * Tell whether the other tank is an ally.
     */
    isAlly(other: Tank): boolean;
    /**
     * Whether forest cover conceals this tank from `viewer`.
     *
     * Cover hides a tank from the ENEMY, never from its own side: a team keeps track of its own
     * members under the trees, which is what makes cover a tactic rather than a way to lose your
     * team mates. `isAlly` already folds in "is the viewer themselves", so a player always sees
     * their own tank.
     *
     * A viewer with no tank of their own — before joining, or between death and respawn — is on
     * nobody's side and sees no hidden tanks, which is the same default the call sites had before.
     *
     * The overview map has always worked this way ("Team mates are always known to their own
     * team, forest cover included", overview.ts:522); this is the main view catching up.
     */
    isHiddenFrom(viewer: Tank | null | undefined): boolean;
    /**
     * Adjust the firing range.
     */
    increaseRange(): void;
    decreaseRange(): void;
    /**
     * We've taken a hit. Check if we were killed, otherwise slide and possibly kill our boat.
     */
    takeShellHit(shell: Shell): number;
    /**
     * We've taken a hit from a mine. Mostly similar to the above.
     */
    takeMineHit(): void;
    spawn(team: number): void;
    update(): void;
    destroy(): void;
    death(): boolean;
    shootOrReload(): void;
    layMine(): void;
    turn(): void;
    accelerate(): void;
    fixPosition(): void;
    move(): void;
    checkNewCell(oldcell: any): void;
    leaveBoat(oldcell: any): void;
    enterBoat(): void;
    sink(): void;
    kill(): void;
    /**
     * Drop all pillboxes we own in a neat square area.
     */
    dropPillboxes(): void;
}
export default Tank;
//# sourceMappingURL=tank.d.ts.map