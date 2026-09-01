import { describe, it, expect } from 'vitest';
import { linearAim } from '../combat';
import { computeDistanceBetween, locationFromDir } from '../pathfinding';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * LEAD TIME IS FLIGHT TIME, AND FLIGHT TIME IS LINEAR IN DISTANCE.
 *
 * shell.ts move() steps a CONSTANT `round(cos*32), round(sin*32)` every tick — 32 world units per
 * tick at every range — so a shell covers `dist` in exactly `dist / 32` ticks. That is the only
 * number `linearAim` should lead by.
 *
 * It used to lead by `sqrt(dist * 2.6 + 1.5)`, which is neither that curve nor the same dimension:
 * it coincides with dist/32 only at dist 2662 (10.4 tiles), beyond the tank's own 7-tile reach, and
 * everywhere a shot is actually taken it over-leads by 15-21 ticks. Against a tank moving ~8 units
 * per tick that is ~150 world units of aim-off, wider than the shell's 127-unit collision radius,
 * so the shell sails past IN FRONT of its target.
 *
 * Measured over ~460 shots at a strafing tank in a cleared arena: 67.3% hit / 31.9% flew wide
 * before, 89.8% / 9.3% after. Against a STATIONARY tank it was 98.7% both ways — the aim was never
 * the problem, only the lead. (User report: "isn't shooting straight... missing wide 3/5 shells.")
 */
describe('linearAim leads by the shell flight time', () => {
  const state: any = { tank: { shellCount: 14 } };
  const SHELL_UNITS_PER_TICK = 32;   // shell.ts move()

  // Target 4 tiles east of us, running north at 8 world units per tick.
  const SRC_X = 100 * 256 + 128, SRC_Y = 100 * 256 + 128;
  const TGT_X = 104 * 256 + 128, TGT_Y = 100 * 256 + 128;
  const NORTH = 64, SPEED = 8;

  it('leads by exactly distance/32 ticks of target motion', () => {
    const aim = linearAim(state, SRC_X, SRC_Y, TGT_X, TGT_Y, NORTH, SPEED);
    const dist = computeDistanceBetween(SRC_X, SRC_Y, TGT_X, TGT_Y);
    const expectedTicks = Math.round(dist / SHELL_UNITS_PER_TICK);   // 1024/32 = 32
    const expected = locationFromDir(NORTH, expectedTicks * SPEED, TGT_X, TGT_Y);

    expect(expectedTicks).toBe(32);
    expect(aim.x).toBe(expected.x & 0xFFFF);
    expect(aim.y).toBe(expected.y & 0xFFFF);

    // And the lead is a real displacement of the right size, not a no-op.
    const lead = computeDistanceBetween(TGT_X, TGT_Y, aim.x, aim.y);
    expect(lead).toBeGreaterThan(240);
    expect(lead).toBeLessThan(272);          // 32 ticks * 8 = 256
  });

  it('scales linearly with range, so it never over-leads up close', () => {
    // The old sqrt curve was worst at short range (21 ticks too many at 2 tiles). Walk out from
    // 2 to 7 tiles and require the lead to track dist/32 at every step.
    for (let tiles = 2; tiles <= 7; tiles++) {
      const tx = (100 + tiles) * 256 + 128;
      const aim = linearAim(state, SRC_X, SRC_Y, tx, TGT_Y, NORTH, SPEED);
      const dist = computeDistanceBetween(SRC_X, SRC_Y, tx, TGT_Y);
      const lead = computeDistanceBetween(tx, TGT_Y, aim.x, aim.y);
      const ticks = lead / SPEED;
      expect(Math.abs(ticks - dist / SHELL_UNITS_PER_TICK),
        `lead at ${tiles} tiles should be flight time`).toBeLessThanOrEqual(1);
    }
  });

  it('does not lead a stationary target at all', () => {
    const aim = linearAim(state, SRC_X, SRC_Y, TGT_X, TGT_Y, NORTH, 0);
    expect(aim.x).toBe(TGT_X);
    expect(aim.y).toBe(TGT_Y);
  });
});
