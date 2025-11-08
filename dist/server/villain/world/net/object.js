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
            // Check if there's a setter for this property and use it
            // This prevents creating an own property that shadows the getter/setter
            const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), propName);
            if (descriptor && descriptor.set) {
                // Use the setter
                descriptor.set.call(this, value);
            }
            else {
                // No setter, use direct assignment
                this[propName] = value;
            }
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