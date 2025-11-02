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
    // Update all objects
    for (const obj of this.objects) {
      if (obj && obj.tick) {
        obj.tick();
      }
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

    // Track tanks separately
    if (obj.constructor.name === 'Tank') {
      this.tanks.push(obj);
    }

    return obj;
  }

  destroy(obj: any): void {
    const idx = this.objects.indexOf(obj);
    if (idx !== -1) {
      this.objects.splice(idx, 1);
    }

    // Remove from tanks array if it's a tank
    const tankIdx = this.tanks.indexOf(obj);
    if (tankIdx !== -1) {
      this.tanks.splice(tankIdx, 1);
    }

    if (obj.destroy) {
      obj.destroy();
    }
  }
}

export default NetLocalWorld;
