import { describe, it, expect, afterEach, vi } from 'vitest';

import WorldMap from './world_map';
import EverardIsland from './client/everard';
import { decodeBase64 } from './client/base64';

/** Fix-list item 5: rounding gave the first and last start points half the odds of the others. */
describe('getRandomStart', () => {
  afterEach(() => vi.restoreAllMocks());

  it('picks every start equally often over a sweep of random values', () => {
    const map: any = WorldMap.load(decodeBase64(EverardIsland));
    const n = map.starts.length;
    expect(n).toBeGreaterThan(2);
    const counts = new Map<any, number>();
    const samples = n * 1000;
    let i = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => (i++ + 0.5) / samples);   // even sweep of [0, 1)
    for (let k = 0; k < samples; k++) {
      const s = map.getRandomStart();
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    expect(counts.size).toBe(n);
    for (const c of counts.values()) expect(Math.abs(c - 1000)).toBeLessThanOrEqual(1);
  });
});
