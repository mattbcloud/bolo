/**
 * Server World
 *
 * Base class for server-side game worlds.
 */
export class ServerWorld {
    constructor() {
        this.objects = [];
        this.changes = [];
        this.tanks = [];
    }
    registerType(ObjectClass) {
        const typeId = this.constructor.types.length;
        this.constructor.types.push(ObjectClass);
        this.constructor.typesByName.set(ObjectClass.name, typeId);
    }
    tick() {
        // Update all objects
        for (const obj of this.objects) {
            if (obj && obj.tick) {
                obj.tick();
            }
        }
    }
    spawn(ObjectClass, ...args) {
        const obj = new ObjectClass(this);
        obj.idx = this.objects.length;
        // Set the network type index based on the object's class
        const className = obj.constructor.name;
        const typeIdx = this.constructor.typesByName.get(className);
        if (typeIdx !== undefined) {
            obj._net_type_idx = typeIdx;
        }
        else {
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
    destroy(obj) {
        const idx = obj.idx;
        this.objects[idx] = null;
        this.changes.push(['destroy', obj, idx]);
        // Remove from tanks array if it's a tank
        const tankIdx = this.tanks.indexOf(obj);
        if (tankIdx !== -1) {
            // Call removeTank if available (from WorldMixin), otherwise remove directly
            if (typeof this.removeTank === 'function') {
                this.removeTank(obj);
            }
            else {
                this.tanks.splice(tankIdx, 1);
            }
        }
    }
    dump(obj, isCreate = false) {
        if (obj.dump) {
            return obj.dump(isCreate);
        }
        return [];
    }
    dumpTick(fullUpdate = false, exclude) {
        const data = [];
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
    onError(ws, error) {
        console.error('Server error:', error);
    }
}
ServerWorld.types = [];
ServerWorld.typesByName = new Map();
export default ServerWorld;
//# sourceMappingURL=server.js.map