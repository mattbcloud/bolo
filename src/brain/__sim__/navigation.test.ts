import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, placeTank, runNavOnlyScenario } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

// Everard has a solid land corridor at y≈106-112, x≈105-126 (grass/road).
const START  = { x: 106, y: 109 };
const TARGET = { x: 124, y: 109 };

describe('navigation: land corridor (nav-only, no combat)', () => {
  it('reaches a target 18 tiles away across passable land', () => {
    const world = bootHeadlessWorld();
    placeTank(world, START.x, START.y, /* onBoat */ false);

    const r = runNavOnlyScenario(world, TARGET.x, TARGET.y, { maxTicks: 2500 });

    // eslint-disable-next-line no-console
    console.log(`[land-nav] reached=${r.reached} t=${r.ticksToReach} ` +
      `final=(${r.a4.tankTileX},${r.a4.tankTileY}) bends=${r.maxBends} ` +
      `stalls=${r.stuckEpisodes} recomputes=${r.pathRecomputes}`);

    expect(r.reached, 'tank should reach the target across open land').toBe(true);
    expect(r.stuckEpisodes, 'no long stalls on a clear corridor').toBe(0);
  });
});
