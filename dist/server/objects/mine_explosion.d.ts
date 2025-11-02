/**
 * Mine explosion
 *
 * An invisible object, which triggers a mine after a short delay. These are always spawned when
 * mines are supposed to be triggered, even if there is no mine on the cell at the time.
 */
import BoloObject from '../object';
export declare class MineExplosion extends BoloObject {
    styled: null;
    lifespan: number;
    cell: any;
    serialization(isCreate: boolean, p: Function): void;
    spawn(cell: any): void;
    anySpawn(): void;
    update(): void;
    asplode(): void;
    spread(): void;
}
export default MineExplosion;
//# sourceMappingURL=mine_explosion.d.ts.map