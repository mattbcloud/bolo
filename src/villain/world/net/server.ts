/**
 * Server World
 *
 * Base class for server-side game worlds.
 */

export class ServerWorld {
  objects: any[] = [];
  changes: any[] = [];
  tanks: any[] = [];
  static types: any[] = [];
  static typesByName: Map<string, number> = new Map();

  constructor() {}

  registerType(ObjectClass: any): void {
    const typeId = (this.constructor as typeof ServerWorld).types.length;
    (this.constructor as typeof ServerWorld).types.push(ObjectClass);
    (this.constructor as typeof ServerWorld).typesByName.set(ObjectClass.name, typeId);
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
    obj.idx = this.objects.length;

    // Set the network type index based on the object's class
    const className = obj.constructor.name;
    const typeIdx = (this.constructor as typeof ServerWorld).typesByName.get(className);

    if (typeIdx !== undefined) {
      obj._net_type_idx = typeIdx;
    } else {
      console.error(`[SPAWN ERROR] No type index found for ${className}!`);
    }

    this.objects.push(obj);
    this.changes.push(['create', obj, obj.idx]);

    // Call the object's spawn method if it exists, passing the remaining arguments
    if (obj.spawn && typeof obj.spawn === 'function') {
      obj.spawn(...args);
    }

    // Call anySpawn if it exists - used for client/server common initialization
    // Note: Tank's anySpawn() calls addTank() which adds to this.tanks, so we don't add here
    if (obj.anySpawn && typeof obj.anySpawn === 'function') {
      obj.anySpawn();
    }

    return obj;
  }

  destroy(obj: any): void {
    // Call the object's destroy method first (e.g., to drop pillboxes)
    if (obj.destroy && typeof obj.destroy === 'function') {
      obj.destroy();
    }

    const idx = obj.idx;
    this.objects[idx] = null;
    this.changes.push(['destroy', obj, idx]);

    // Remove from tanks array if it's a tank
    const tankIdx = this.tanks.indexOf(obj);
    if (tankIdx !== -1) {
      // Call removeTank if available (from WorldMixin), otherwise remove directly
      if (typeof (this as any).removeTank === 'function') {
        (this as any).removeTank(obj);
      } else {
        this.tanks.splice(tankIdx, 1);
      }
    }
  }

  dump(obj: any, isCreate: boolean = false): number[] {
    if (obj.dump) {
      return obj.dump(isCreate);
    }
    return [];
  }

  dumpTick(fullUpdate: boolean = false, exclude?: Set<any>): number[] {
    const data: number[] = [];
    for (const obj of this.objects) {
      if (obj && obj.dump) {
        // Skip objects that were just created this tick - they're sent via TINY_UPDATE
        if (exclude && exclude.has(obj)) {
          continue;
        }
        data.push(...obj.dump(fullUpdate));
      }
    }
    return data;
  }

  onError(ws: any, error: Error): void {
    console.error('Server error:', error);
  }
}

export default ServerWorld;
