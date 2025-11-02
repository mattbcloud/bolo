/**
 * Server World
 *
 * Base class for server-side game worlds.
 */
export declare class ServerWorld {
    objects: any[];
    changes: any[];
    tanks: any[];
    static types: any[];
    static typesByName: Map<string, number>;
    constructor();
    registerType(ObjectClass: any): void;
    tick(): void;
    spawn(ObjectClass: any, ...args: any[]): any;
    destroy(obj: any): void;
    dump(obj: any, isCreate?: boolean): number[];
    dumpTick(fullUpdate?: boolean, exclude?: Set<any>): number[];
    onError(ws: any, error: Error): void;
}
export default ServerWorld;
//# sourceMappingURL=server.d.ts.map