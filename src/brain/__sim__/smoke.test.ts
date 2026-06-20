import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, findObstructedObjective } from './harness';

// Silence the per-50-tick HUD dump + Phase-0 logs during the smoke test.
(globalThis as any).__BRAIN_DBG__ = false;

describe('harness smoke test', () => {
  it('boots a headless world with a map, tank, and objectives', () => {
    const world = bootHeadlessWorld();
    expect(world.map, 'map loaded').toBeTruthy();
    expect(world.player, 'tank spawned').toBeTruthy();
    expect(world.player.x, 'tank has a world position').toBeGreaterThan(0);
    expect((world.map.pills?.length ?? 0) + (world.map.bases?.length ?? 0),
      'Everard exposes pills/bases').toBeGreaterThan(0);
  });

  it('enables the brain and steps 100 ticks without crashing', () => {
    const world = bootHeadlessWorld();
    const a4 = enableBrain(world);
    const startTile = [a4.tankTileX, a4.tankTileY];
    for (let i = 0; i < 100; i++) world.tick();
    // Just prove the loop runs and the brain has live state.
    expect(Number.isFinite(a4.tankTileX)).toBe(true);
    const obj = findObstructedObjective(world, a4, a4.tankTileX, a4.tankTileY);
    // Report what we'd test against (not an assertion of the bug yet).
    // eslint-disable-next-line no-console
    console.log(`[smoke] start=${startTile} now=(${a4.tankTileX},${a4.tankTileY}) ` +
      `objective=${obj ? `${obj.kind}(${obj.x},${obj.y}) obstructed=${obj.obstructed}` : 'none'}`);
    expect(true).toBe(true);
  });
});
