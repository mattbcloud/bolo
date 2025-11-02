/**
 * Base World Object
 *
 * Base class for all game objects in the world.
 */

import { EventEmitter } from '../event-emitter';

export class WorldObject extends EventEmitter {
  world: any;
  idx: number = -1;
  x: number | null = null;
  y: number | null = null;

  constructor(world: any) {
    super();
    this.world = world;
  }

  destroy(): void {
    // Override in subclasses
  }

  tick(): void {
    // Override in subclasses
  }
}

export default WorldObject;
