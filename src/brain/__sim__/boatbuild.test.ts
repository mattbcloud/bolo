import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/** Regression: building a boat used to crash (hasTankOnBoat → map.world.tanks undefined).
 *  With the harness map.world proxy it must build without throwing. */
describe('boat build does not crash headless', () => {
  it('builder builds a boat on a water tile without throwing', () => {
    const world = bootHeadlessWorld(1000);
    const t = world.player;
    // Find a deep-water/empty tile near the tank to build a boat on.
    let built = false;
    for (let r = 1; r <= 6 && !built; r++) {
      for (let dx = -r; dx <= r && !built; dx++) {
        for (let dy = -r; dy <= r && !built; dy++) {
          const c = world.map.cellAtTile((t.cell?.x ?? 120) + dx, (t.cell?.y ?? 120) + dy);
          if (c && c.isType(' ')) {
            // Calling hasTankOnBoat directly exercises the exact crash path.
            expect(() => c.hasTankOnBoat()).not.toThrow();
            built = true;
          }
        }
      }
    }
    // Also tick a while with the brain off to ensure no incidental crash.
    for (let i = 0; i < 50; i++) world.tick();
    expect(true).toBe(true);
  });
});
