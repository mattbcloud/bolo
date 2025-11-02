/**
 * Map Index
 *
 * Indexes map files from a directory for quick lookup and fuzzy searching.
 */

import * as fs from 'fs';
import * as path from 'path';

interface MapDescriptor {
  name: string;
  path: string;
}

export class MapIndex {
  mapPath: string;
  nameIndex: Record<string, MapDescriptor> = {};
  fuzzyIndex: Record<string, MapDescriptor> = {};

  constructor(mapPath: string, callback?: () => void) {
    this.mapPath = mapPath;
    this.reindex(callback);
  }

  reindex(callback?: () => void): void {
    this.nameIndex = {};
    this.fuzzyIndex = {};

    const names = this.nameIndex;
    const fuzzy = this.fuzzyIndex;

    const index = (file: string, cb?: () => void): void => {
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
                if (--counter === 0) cb?.();
              });
            }
          });
        } else {
          const m = /([^/]+?)\.map$/i.exec(file);
          if (m) {
            const descr: MapDescriptor = { name: m[1], path: file };
            names[descr.name] = fuzzy[descr.name.replace(/[\W_]+/g, '')] = descr;
            cb?.();
          } else {
            cb?.();
          }
        }
      });
    };

    index(this.mapPath, callback);
  }

  get(name: string): MapDescriptor | undefined {
    return this.nameIndex[name];
  }

  fuzzy(s: string): MapDescriptor[] {
    const input = s.replace(/[\W_]+/g, '');
    const matcher = new RegExp(input, 'i');
    const results: MapDescriptor[] = [];
    for (const [fuzzed, descr] of Object.entries(this.fuzzyIndex)) {
      if (fuzzed === input) {
        return [descr];
      } else if (matcher.test(fuzzed)) {
        results.push(descr);
      }
    }
    return results;
  }
}

export default MapIndex;
