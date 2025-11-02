/**
 * Base World Object
 *
 * Base class for all game objects in the world.
 */
import { EventEmitter } from '../event-emitter';
export class WorldObject extends EventEmitter {
    constructor(world) {
        super();
        this.idx = -1;
        this.x = null;
        this.y = null;
        this.world = world;
    }
    destroy() {
        // Override in subclasses
    }
    tick() {
        // Override in subclasses
    }
}
export default WorldObject;
//# sourceMappingURL=object.js.map