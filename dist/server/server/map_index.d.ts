/**
 * Map Index
 *
 * Indexes map files from a directory for quick lookup and fuzzy searching.
 */
interface MapDescriptor {
    name: string;
    path: string;
}
export declare class MapIndex {
    mapPath: string;
    nameIndex: Record<string, MapDescriptor>;
    fuzzyIndex: Record<string, MapDescriptor>;
    constructor(mapPath: string, callback?: () => void);
    reindex(callback?: () => void): void;
    get(name: string): MapDescriptor | undefined;
    fuzzy(s: string): MapDescriptor[];
}
export default MapIndex;
//# sourceMappingURL=map_index.d.ts.map