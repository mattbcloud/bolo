/**
 * Network World Object
 *
 * Base class for network-synchronized game objects.
 */
import { WorldObject } from '../object';
import { buildPacker, buildUnpacker } from '../../../struct';
export class NetWorldObject extends WorldObject {
    constructor(world) {
        super(world);
        this._net_type_idx = 0;
    }
    /**
     * Create a reference to another object. In local mode, this just sets the property directly.
     * In networked mode, this would handle serialization of object references.
     */
    ref(propName, obj) {
        // Log ref changes for bases to track owner changes
        if (this.constructor.name === 'WorldBase' && propName === 'owner') {
            console.log(`[BASE ref()] Base idx=${this.idx} ref('owner', ${obj ? 'tank_' + obj.tank_idx : 'null'})`);
        }
        this[propName] = obj ? { $: obj } : null;
    }
    /**
     * Called each game tick. Delegates to update() if it exists.
     */
    tick() {
        if (this.update) {
            this.update();
        }
    }
    // Serialize this object's state
    dump(isCreate = false) {
        if (!this.serialization) {
            return [];
        }
        const packer = buildPacker();
        this.serialization(isCreate, (format, propName, options) => {
            let value = this[propName];
            // Apply transform if provided
            if (options?.tx) {
                value = options.tx(value);
            }
            if (format === 'O') {
                // Object reference: serialize as index
                const refObj = value?.$;
                const idx = refObj?.idx ?? 0xffff;
                packer('H', idx);
            }
            else {
                // Regular value
                packer(format, value);
            }
        });
        return packer.finish();
    }
    // Deserialize this object's state
    load(data, offset, isCreate = false) {
        console.log(`[LOAD] ${this.constructor.name} idx=${this.idx} load() called, isCreate=${isCreate}, world.authority=${this.world?.authority}`);
        if (!this.serialization) {
            return 0;
        }
        const unpacker = buildUnpacker(data, offset);
        const changes = {};
        this.serialization(isCreate, (format, propName, options) => {
            let value;
            if (format === 'O') {
                // Object reference: deserialize from index
                const idx = unpacker('H');
                if (idx === 0xffff) {
                    value = null;
                }
                else {
                    // Store as { $: objectAtIndex } only if the object exists
                    const refObj = this.world.objects[idx];
                    value = refObj ? { $: refObj } : null;
                }
            }
            else {
                value = unpacker(format);
            }
            // Apply receive transform if provided
            if (options?.rx) {
                value = options.rx(value);
            }
            // Debug logging for base owner_idx and team
            if (this.constructor.name === 'WorldBase' && (propName === 'owner_idx' || propName === 'team')) {
                console.log(`[LOAD PROPERTY] WorldBase idx=${this.idx} setting ${propName}=${value}, world.authority=${this.world?.authority}`);
                console.log(`[LOAD PROPERTY] Current value of ${propName}:`, this[propName]);
            }
            this[propName] = value;
            changes[propName] = value;
        });
        // Emit netUpdate event for objects that listen to it
        if (this.emit) {
            this.emit('netUpdate', changes);
        }
        return unpacker.finish();
    }
}
export default NetWorldObject;
//# sourceMappingURL=object.js.map