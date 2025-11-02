/**
 * Network World Object
 *
 * Base class for network-synchronized game objects.
 */
import { WorldObject } from '../object';
export declare class NetWorldObject extends WorldObject {
    _net_type_idx: number;
    constructor(world: any);
    /**
     * Create a reference to another object. In local mode, this just sets the property directly.
     * In networked mode, this would handle serialization of object references.
     */
    ref(propName: string, obj: any): void;
    /**
     * Called each game tick. Delegates to update() if it exists.
     */
    tick(): void;
    dump(isCreate?: boolean): number[];
    load(data: number[], offset: number, isCreate?: boolean): number;
}
export default NetWorldObject;
//# sourceMappingURL=object.d.ts.map