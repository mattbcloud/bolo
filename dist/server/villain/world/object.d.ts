/**
 * Base World Object
 *
 * Base class for all game objects in the world.
 */
import { EventEmitter } from '../event-emitter';
export declare class WorldObject extends EventEmitter {
    world: any;
    idx: number;
    x: number | null;
    y: number | null;
    constructor(world: any);
    destroy(): void;
    tick(): void;
}
export default WorldObject;
//# sourceMappingURL=object.d.ts.map