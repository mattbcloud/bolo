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
  /** netSpawn's occupied-slot warning is logged once per session. */
  static _warnedOccupiedSpawn: boolean = false;

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
    for (const obj of this.objects) {
      if (!obj) continue;
      obj.prevX = obj.x;
      obj.prevY = obj.y;
      if (obj.tick) obj.tick();
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

    // The server only reuses a slot after destroying its object, so an occupied slot means a
    // DESTROY never arrived. Clean it up as netDestroy would, or the old object's cell reference
    // (cell.pill / cell.base) survives as a ghost. Hardening: no current path does this.
    const occupant = this.objects[idx];
    if (occupant) {
      if (!ClientWorld._warnedOccupiedSpawn) {
        ClientWorld._warnedOccupiedSpawn = true;
        console.warn(`[NETSPAWN] spawn into occupied slot ${idx} (type ${typeIdx}); removing the old object first`);
      }
      this._netRemove(idx, occupant);
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
      this._netRemove(idx, this.objects[idx]);
    }

    // Return the number of bytes consumed (2 bytes for the index)
    return 2;
  }

  /**
   * Take an object out of the world: out of the tanks array if it's a tank, off any map cell
   * that still points back at it, and out of its slot. Shared by netDestroy and netSpawn.
   */
  _netRemove(idx: number, obj: any): void {
    // Remove from tanks array if it's a tank
    // Use type index comparison instead of constructor.name to avoid minification issues
    const TankClass = (this.constructor as typeof ClientWorld).types[3]; // Tank is registered as type index 3
    if (obj.constructor === TankClass) {
      const tankIndex = this.tanks.indexOf(obj);
      if (tankIndex !== -1) {
        this.tanks.splice(tankIndex, 1);
      }
    }

    // Clear the cell's back-reference, but only if it still points at this object.
    const cell = obj.cell;
    if (cell) {
      let changed = false;
      if (cell.pill === obj) { delete cell.pill; changed = true; }
      if (cell.base === obj) { delete cell.base; changed = true; }
      if (changed && cell.retile) cell.retile();
    }

    this.objects[idx] = null;
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
        // Skip objects that were created in this packet (received TINY_UPDATE in same packet)
        // The server excludes these from UPDATE packets on the same tick
        if (exclude && exclude.has(obj)) {
          continue;
        }
        const bytes = obj.load(data, offset + bytesRead, isCreate);
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
