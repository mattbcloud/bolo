/**
 * An explosion is really just a static animation.
 */
import BoloObject from '../object';
export declare class Explosion extends BoloObject {
    styled: boolean;
    lifespan: number;
    serialization(isCreate: boolean, p: Function): void;
    getTile(): [number, number];
    spawn(x: number, y: number): void;
    update(): void;
}
export default Explosion;
//# sourceMappingURL=explosion.d.ts.map