/**
 * A fireball is the trail of fire left by a dying tank.
 */
import BoloObject from '../object';
export declare class Fireball extends BoloObject {
    styled: null;
    direction: number;
    largeExplosion: boolean;
    lifespan: number;
    dx?: number;
    dy?: number;
    serialization(isCreate: boolean, p: Function): void;
    /**
     * Get the 1/16th direction step.
     */
    getDirection16th(): number;
    spawn(x: number, y: number, direction: number, largeExplosion: boolean): void;
    update(): void;
    wreck(): boolean;
    move(): void;
    explode(): void;
}
export default Fireball;
//# sourceMappingURL=fireball.d.ts.map