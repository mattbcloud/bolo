/**
 * Map Index
 *
 * Indexes map files from a directory for quick lookup and fuzzy searching.
 */
import * as fs from 'fs';
import * as path from 'path';
export class MapIndex {
    constructor(mapPath, callback) {
        this.nameIndex = {};
        this.fuzzyIndex = {};
        this.mapPath = mapPath;
        this.reindex(callback);
    }
    reindex(callback) {
        this.nameIndex = {};
        this.fuzzyIndex = {};
        const names = this.nameIndex;
        const fuzzy = this.fuzzyIndex;
        const index = (file, cb) => {
            fs.stat(file, (err, stats) => {
                if (err) {
                    console.log(err.toString());
                    return cb?.();
                }
                if (stats.isDirectory()) {
                    fs.readdir(file, (err, subfiles) => {
                        if (err) {
                            console.log(err.toString());
                            return cb?.();
                        }
                        let counter = subfiles.length;
                        for (const subfile of subfiles) {
                            index(path.join(file, subfile), () => {
                                if (--counter === 0)
                                    cb?.();
                            });
                        }
                    });
                }
                else {
                    const m = /([^/]+?)\.map$/i.exec(file);
                    if (m) {
                        const descr = { name: m[1], path: file };
                        names[descr.name] = fuzzy[descr.name.replace(/[\W_]+/g, '')] = descr;
                        cb?.();
                    }
                    else {
                        cb?.();
                    }
                }
            });
        };
        index(this.mapPath, callback);
    }
    get(name) {
        return this.nameIndex[name];
    }
    fuzzy(s) {
        const input = s.replace(/[\W_]+/g, '');
        const matcher = new RegExp(input, 'i');
        const results = [];
        for (const [fuzzed, descr] of Object.entries(this.fuzzyIndex)) {
            if (fuzzed === input) {
                return [descr];
            }
            else if (matcher.test(fuzzed)) {
                results.push(descr);
            }
        }
        return results;
    }
}
export default MapIndex;
//# sourceMappingURL=map_index.js.map