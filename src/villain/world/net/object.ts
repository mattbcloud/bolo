/**
 * Network World Object
 *
 * Base class for network-synchronized game objects.
 */

import { WorldObject } from '../object';
import { buildPacker, buildUnpacker } from '../../../struct';

export class NetWorldObject extends WorldObject {
  _net_type_idx: number = 0;

  constructor(world: any) {
    super(world);
  }

  /**
   * Create a reference to another object. In local mode, this just sets the property directly.
   * In networked mode, this would handle serialization of object references.
   */
  ref(propName: string, obj: any): void {
    // Log ref changes for bases to track owner changes
    if (this.constructor.name === 'WorldBase' && propName === 'owner') {
      console.log(`[BASE ref()] Base idx=${(this as any).idx} ref('owner', ${obj ? 'tank_' + obj.tank_idx : 'null'})`);
    }
    (this as any)[propName] = obj ? { $: obj } : null;
  }

  /**
   * Called each game tick. Delegates to update() if it exists.
   */
  tick(): void {
    if ((this as any).update) {
      (this as any).update();
    }
  }

  // Serialize this object's state
  dump(isCreate: boolean = false): number[] {
    if (!(this as any).serialization) {
      return [];
    }

    const packer = buildPacker();

    (this as any).serialization(isCreate, (format: string, propName: string, options?: any) => {
      let value = (this as any)[propName];

      // Apply transform if provided
      if (options?.tx) {
        value = options.tx(value);
      }

      if (format === 'O') {
        // Object reference: serialize as index
        const refObj = value?.$;
        const idx = refObj?.idx ?? 0xffff;
        packer('H', idx);
      } else {
        // Regular value
        packer(format as any, value);
      }
    });

    return packer.finish();
  }

  // Deserialize this object's state
  load(data: number[], offset: number, isCreate: boolean = false): number {
    console.log(`[LOAD] ${this.constructor.name} idx=${(this as any).idx} load() called, isCreate=${isCreate}, world.authority=${(this as any).world?.authority}`);

    if (!(this as any).serialization) {
      return 0;
    }

    const unpacker = buildUnpacker(data, offset);
    const changes: any = {};

    (this as any).serialization(isCreate, (format: string, propName: string, options?: any) => {
      let value: any;

      if (format === 'O') {
        // Object reference: deserialize from index
        const idx = unpacker('H') as number;
        if (idx === 0xffff) {
          value = null;
        } else {
          // Store as { $: objectAtIndex } only if the object exists
          const refObj = this.world.objects[idx];
          value = refObj ? { $: refObj } : null;
        }
      } else {
        value = unpacker(format as any);
      }

      // Apply receive transform if provided
      if (options?.rx) {
        value = options.rx(value);
      }

      // Debug logging for base owner_idx and team
      if (this.constructor.name === 'WorldBase' && (propName === 'owner_idx' || propName === 'team')) {
        console.log(`[LOAD PROPERTY] WorldBase idx=${(this as any).idx} setting ${propName}=${value}, world.authority=${(this as any).world?.authority}`);
        console.log(`[LOAD PROPERTY] Current value of ${propName}:`, (this as any)[propName]);
      }

      (this as any)[propName] = value;
      changes[propName] = value;
    });

    // Emit netUpdate event for objects that listen to it
    if ((this as any).emit) {
      (this as any).emit('netUpdate', changes);
    }

    return unpacker.finish();
  }
}

export default NetWorldObject;
