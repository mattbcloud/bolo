/**
 * Client World
 *
 * Base class for client-side game worlds.
 */

export class ClientWorld {
  objects: any[] = [];
  tanks: any[] = [];
  static types: any[] = [];
  static typesByName: Map<string, number> = new Map();
  _isSynchronized: boolean = false;

  constructor() {}

  registerType(ObjectClass: any): void {
    const typeId = (this.constructor as typeof ClientWorld).types.length;
    (this.constructor as typeof ClientWorld).types.push(ObjectClass);
    (this.constructor as typeof ClientWorld).typesByName.set(ObjectClass.name, typeId);
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

  netSpawn(data: number[], offset: number): number {
    // Extract the type index (1 byte) and object index (2 bytes, unsigned short big-endian/network byte order)
    const typeIdx = data[offset];
    const idx = (data[offset + 1] << 8) | data[offset + 2];

    // Get the object class from the types array
    const ObjectClass = (this.constructor as typeof ClientWorld).types[typeIdx];

    if (!ObjectClass) {
      throw new Error(`Unknown object type index: ${typeIdx}`);
    }

    console.log(`[netSpawn] Creating ${ObjectClass.name} at idx=${idx} (typeIdx=${typeIdx})`);

    // Create an instance of the object
    const obj = new ObjectClass(this);
    obj._net_type_idx = typeIdx;
    obj.idx = idx;

    // Mark that this object was created via CREATE message
    // This prevents netTick() from trying to load initial state for it
    obj._createdViaMessage = true;

    // Ensure array is large enough to hold this index (preserve sparse structure)
    while (this.objects.length <= idx) {
      this.objects.push(null);
    }

    // Place object at the server-specified index
    this.objects[idx] = obj;

    // Track tanks separately
    // Use ObjectClass comparison instead of constructor.name to avoid minification issues
    const TankClass = (this.constructor as typeof ClientWorld).types[3]; // Tank is registered as type index 3
    if (ObjectClass === TankClass) {
      // Check if this tank already exists in the tanks array (prevent duplicates)
      const existingIndex = this.tanks.findIndex((t: any) => t && t.idx === obj.idx);
      if (existingIndex === -1) {
        // Tank doesn't exist, add it
        this.tanks.push(obj);
      } else {
        // Tank already exists, replace it
        console.log(`[netSpawn] Tank at idx=${obj.idx} already exists in tanks array, replacing`);
        this.tanks[existingIndex] = obj;
      }
    }

    // Return the number of bytes consumed (3 bytes: typeIdx + idx)
    return 3;
  }

  netDestroy(data: number[], offset: number): number {
    // Extract the object index (unsigned short, 2 bytes, big-endian/network byte order)
    const idx = (data[offset] << 8) | data[offset + 1];

    // Mark the object as destroyed (set to null)
    if (this.objects[idx]) {
      const obj = this.objects[idx];

      // Remove from tanks array if it's a tank
      // Use type index comparison instead of constructor.name to avoid minification issues
      const TankClass = (this.constructor as typeof ClientWorld).types[3]; // Tank is registered as type index 3
      if (obj.constructor === TankClass) {
        const tankIndex = this.tanks.indexOf(obj);
        if (tankIndex !== -1) {
          this.tanks.splice(tankIndex, 1);
        }
      }

      this.objects[idx] = null;
    }

    // Return the number of bytes consumed (2 bytes for the index)
    return 2;
  }

  netUpdate(obj: any, data: number[], offset: number): number {
    if (obj && obj.load) {
      return obj.load(data, offset);
    }
    return 0;
  }

  netTick(data: number[], offset: number, exclude?: Set<any>): number {
    // Before synchronization, this is the initial full update with creation fields
    // After synchronization, these are regular updates with only update fields
    const isCreate = !this._isSynchronized;

    // Iterate through all objects and load their state
    let bytesRead = 0;
    for (let i = 0; i < this.objects.length; i++) {
      const obj = this.objects[i];
      if (obj && obj.load) {
        // Skip objects created via CREATE message until they receive TINY_UPDATE
        // The server excludes these from UPDATE packets
        if (obj._createdViaMessage) {
          console.log(`[netTick] Skipping obj[${i}] (${obj.constructor.name}) - created via message, waiting for TINY_UPDATE`);
          continue;
        }
        // Skip objects that were created in this packet (received TINY_UPDATE in same packet)
        // The server excludes these from UPDATE packets on the same tick
        if (exclude && exclude.has(obj)) {
          console.log(`[netTick] Skipping obj[${i}] (${obj.constructor.name}) - created in this packet`);
          continue;
        }
        console.log(`[netTick] Loading obj[${i}] (${obj.constructor.name}) at offset ${offset + bytesRead}, isCreate=${isCreate}`);
        const bytes = obj.load(data, offset + bytesRead, isCreate);
        console.log(`[netTick] obj[${i}] consumed ${bytes} bytes`);
        bytesRead += bytes;
      }
    }
    return bytesRead;
  }

  netRestore(): void {
    // Stub implementation
  }

  failure(message: string): void {
    console.error('Client error:', message);
  }
}

export default ClientWorld;
