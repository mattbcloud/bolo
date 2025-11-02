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
    let ticked = 0;
    for (const obj of this.objects) {
      if (obj && obj.tick) {
        obj.tick();
        ticked++;
      }
    }
    if (ticked > 0) {
      console.log(`[SERVERWORLD TICK] Called tick() on ${ticked} objects out of ${this.objects.length} total`);
    }
  }

  spawn(ObjectClass: any, ...args: any[]): any {
    console.log('[SPAWN] Called with', ObjectClass.name);
    const obj = new ObjectClass(this);
    obj.idx = this.objects.length;

    // Set the network type index based on the object's class
    const className = obj.constructor.name;
    const typeIdx = (this.constructor as typeof ServerWorld).typesByName.get(className);
    console.log(`[SPAWN] Spawning ${className}, typeIdx=${typeIdx}, typesByName has ${(this.constructor as typeof ServerWorld).typesByName.size} entries`);

    // Debug: dump the entire typesByName map
    console.log('[SPAWN] typesByName contents:');
    (this.constructor as typeof ServerWorld).typesByName.forEach((value, key) => {
      console.log(`  ${key} => ${value}`);
    });

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
    const idx = obj.idx;
    console.log(`[DESTROY] Destroying ${obj.constructor.name} at idx=${idx}`);
    this.objects[idx] = null;
    this.changes.push(['destroy', obj, idx]);

    // Remove from tanks array if it's a tank
    const tankIdx = this.tanks.indexOf(obj);
    if (tankIdx !== -1) {
      this.tanks.splice(tankIdx, 1);
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
          console.log(`[dumpTick] Skipping obj[${obj.idx}] (${obj.constructor.name}) - created this tick`);
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
