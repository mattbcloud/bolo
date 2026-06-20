import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * Clean circling metric (doc-prescribed): count ticks where the tank has stayed
 * confined to a <=2-tile bounding box over the trailing window. The mid-path
 * orbit (idx frozen, oscillating between two adjacent tiles for hundreds-to-
 * thousands of ticks) lights this up; smooth path-following does not. Combat
 * cover-firing also confines the tank, but that code is identical across the
 * conditions under test, so the DIFFERENCE isolates the follower's contribution.
 */
function run(seed: number, ticks = 5000) {
  const world = bootHeadlessWorld(seed);
  const a4: any = enableBrain(world);
  placeTank(world, 115, 109, false);

  const W = 200;                 // trailing window (ticks)
  const xs: number[] = [];
  const ys: number[] = [];
  let confined = 0;              // total confined ticks
  let cur = 0, maxRun = 0;       // longest continuous confined stretch

  for (let i = 0; i < ticks; i++) {
    world.tick();
    xs.push(a4.tankTileX); ys.push(a4.tankTileY);
    if (xs.length > W) { xs.shift(); ys.shift(); }
    if (xs.length === W) {
      const spanX = Math.max(...xs) - Math.min(...xs);
      const spanY = Math.max(...ys) - Math.min(...ys);
      if (spanX <= 2 && spanY <= 2) { confined++; cur++; if (cur > maxRun) maxRun = cur; }
      else cur = 0;
    }
  }
  return { seed, confined, maxRun };
}

describe('circling metric', () => {
  it('measures confined-region ticks over >=8 seeds', () => {
    const seeds = [1000, 2000, 8919, 12345, 16838, 22222, 31337, 44444];
    let totC = 0, totM = 0;
    for (const s of seeds) {
      const r = run(s);
      totC += r.confined; totM = Math.max(totM, r.maxRun);
      // eslint-disable-next-line no-console
      console.log(`[circle] seed=${r.seed} confinedTicks=${r.confined} maxStretch=${r.maxRun}t`);
    }
    // eslint-disable-next-line no-console
    console.log(`[circle] MEAN confinedTicks=${(totC / seeds.length).toFixed(0)} (over ${seeds.length} seeds, 5000t each) maxStretch=${totM}t`);
  });
});
