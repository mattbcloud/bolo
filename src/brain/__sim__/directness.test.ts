import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, evaluateFullLoop } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/** Mean path winding ratio (path tiles travelled / straight-line Chebyshev dist). */
function pathRatios(seed: number, ticks = 3000): { mean: number; n: number; worst: number } {
  const world = bootHeadlessWorld(seed);
  const a4: any = enableBrain(world);
  placeTank(world, 115, 109, false);
  let last: any = null, sum = 0, n = 0, worst = 1;
  for (let i = 0; i < ticks; i++) {
    world.tick();
    const np = a4.navPath;
    if (np && np !== last && np.length >= 3) {
      last = np;
      const s = np[0], e = np[np.length - 1];
      const cheb = Math.max(Math.abs((s & 0xFF) - (e & 0xFF)), Math.abs(((s >> 8) & 0xFF) - ((e >> 8) & 0xFF)));
      if (cheb >= 3) {
        const ratio = (np.length - 1) / cheb;
        sum += ratio; n++; worst = Math.max(worst, ratio);
      }
    }
  }
  return { mean: n ? sum / n : 1, n, worst };
}

describe('A* path directness vs wall penalty', () => {
  it('A/B wall penalty: path winding + captures', () => {
    for (const pen of [30, 12, 6, 0]) {
      (globalThis as any).__BRAIN_WALLPEN = pen;
      let sumMean = 0, sumWorst = 0, sumN = 0;
      for (const seed of [1000, 8919, 16838]) {
        const r = pathRatios(seed);
        sumMean += r.mean; sumWorst = Math.max(sumWorst, r.worst); sumN += r.n;
      }
      const ev = evaluateFullLoop([115, 109], { trials: 12, ticks: 5000, baseSeed: 1000 });
      // eslint-disable-next-line no-console
      console.log(`[pen=${String(pen).padStart(2)}] meanRatio=${(sumMean / 3).toFixed(2)} ` +
        `worstRatio=${sumWorst.toFixed(2)} paths=${sumN} | N=12 cap=${ev.meanCaptures.toFixed(2)} ` +
        `deaths=${ev.meanDeaths.toFixed(2)}`);
    }
    (globalThis as any).__BRAIN_WALLPEN = 30;
  });
});
