/**
 * You shoot these. Many, in fact. With intent. At your opponent. Or perhaps some other obstacle.
 */
import BoloObject from '../object';
/**
 * This is the interface the handful of destructable objects implement. I'm talking about terrain
 * (thus map cells), tanks, bases and pillboxes. Actually, bases are indestructable. But Hittable
 * sounds too cheesy.
 *
 * The basic premise is a single method `takeShellHit` that receives the Shell object, so that it
 * may possibly inspect its owner. The return value should be an impact sound effect name.
 */
export interface Destructable {
    takeShellHit(shell: Shell): number;
}
export interface ShellOptions {
    direction?: number;
    range?: number;
    onWater?: boolean;
}
export declare class Shell extends BoloObject {
    updatePriority: number;
    styled: boolean;
    direction: number;
    lifespan: number;
    onWater: boolean;
    owner?: any;
    attribution?: any;
    cell: any;
    radians?: number;
    constructor(world: any);
    serialization(isCreate: boolean, p: Function): void;
    /**
     * Helper, called in several places that change shell position.
     */
    updateCell(): void;
    /**
     * Get the 1/16th direction step.
     */
    getDirection16th(): number;
    /**
     * Get the tilemap index to draw. This is the index in base.png.
     */
    getTile(): [number, number];
    spawn(owner: any, options?: ShellOptions): void;
    update(): void;
    move(): void;
    collide(): ['cell' | 'tank', any] | null;
    asplode(x: number, y: number, mode: string): void;
}
export default Shell;
//# sourceMappingURL=shell.d.ts.map