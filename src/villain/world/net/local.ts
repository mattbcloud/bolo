/**
 * Local World
 *
 * Base class for local (non-networked) game worlds.
 */

export class NetLocalWorld {
  objects: any[] = [];
  tanks: any[] = [];
  static types: any[] = [];
  static typesByName: Map<string, number> = new Map();

  constructor() {}

  registerType(ObjectClass: any): void {
    const typeId = (this.constructor as typeof NetLocalWorld).types.length;
    (this.constructor as typeof NetLocalWorld).types.push(ObjectClass);
    (this.constructor as typeof NetLocalWorld).typesByName.set(ObjectClass.name, typeId);
  }

  insert(obj: any): void {
    obj.idx = this.objects.length;
    this.objects.push(obj);
  }

  tick(): void {
    for (const obj of this.objects) {
      if (!obj) continue;
      obj.prevX = obj.x;
      obj.prevY = obj.y;
      if (obj.tick) obj.tick();
    }
  }

  spawn(ObjectClass: any, ...args: any[]): any {
    const obj = new ObjectClass(this);
    this.insert(obj);

    // Call the object's spawn method if it exists, passing the remaining arguments
    if (obj.spawn && typeof obj.spawn === 'function') {
      obj.spawn(...args);
    }

    // Call anySpawn if it exists - used for client/server common initialization
    if (obj.anySpawn && typeof obj.anySpawn === 'function') {
      obj.anySpawn();
    }

    // Tanks register themselves: Tank.anySpawn() calls addTank(), which also sets tank_idx.
    // Pushing here as well listed every tank twice (a mine blast then hit it twice; fix-list 12).

    return obj;
  }

  /**
   * As ServerWorld.destroy (fix-list 12): leave a null in the object's slot instead of splicing.
   * Objects destroy themselves inside their own update() (shells, explosions), and a splice during
   * tick() slid the next object into the freed slot, so it missed that tick's update; it also left
   * every later object's `idx` stale.
   */
  destroy(obj: any): void {
    // The object's own clean-up first (a tank drops its pillboxes and destroys its builder).
    if (obj.destroy) {
      obj.destroy();
    }

    if (this.objects[obj.idx] === obj) {
      this.objects[obj.idx] = null;
    }

    // Remove from tanks through removeTank (WorldMixin), which renumbers tank_idx and the map
    // objects' owner_idx, as on the server.
    const tankIdx = this.tanks.indexOf(obj);
    if (tankIdx !== -1) {
      if (typeof (this as any).removeTank === 'function') {
        (this as any).removeTank(obj);
      } else {
        this.tanks.splice(tankIdx, 1);
      }
    }
  }
}

export default NetLocalWorld;
