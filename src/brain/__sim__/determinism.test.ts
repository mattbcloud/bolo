import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// Determinism guard. The headless harness seeds Math.random and freezes the wall clock
// so the SAME seed must produce the SAME trajectory every run. This once failed because
// world_map.ts captured `const { random } = Math` at module load — pinning the ORIGINAL
// unseeded RNG, which getRandomStart() then used to pick each spawn's start DIRECTION, so
// the same seed diverged run-to-run (the long-standing "heisenbug" that made every capture
// metric untrustworthy). If this test goes red again, something re-introduced an unseeded
// entropy source (a captured Math.random, an unfrozen clock, or address-dependent iteration).
(globalThis as any).__BRAIN_DBG__ = false;

function fingerprint(seed: number, ticks: number): number {
  const world = bootHeadlessWorld(seed);
  const t: any = world.player;
  const pills: any[] = Array.from(world.map.pills ?? []);
  const target = pills.find((p) => p.armour > 0 && p.cell);
  const px = target.cell.x, py = target.cell.y;
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  target.armour = 15; target.team = 255;
  for (const p of pills) { if (p !== target) { p.team = t.team; p.owner_idx = t.idx ?? 0; } }
  world.map.cellAtTile(px, py + 1).setType('|');
  placeTank(world, px, py + 8, false);
  t.armour = 40; t.shells = 40000; t.trees = 6;
  enableBrain(world);
  let fp = 0;
  for (let i = 0; i < ticks; i++) {
    world.tick();
    fp = (Math.imul(fp, 31) + (((t.x & 0xFFFF) << 16) | (t.y & 0xFFFF))) | 0;
  }
  return fp;
}

describe('sim determinism', () => {
  it('same seed produces the same trajectory (no unseeded entropy)', () => {
    const a = fingerprint(1000, 300);
    const b = fingerprint(1000, 300);
    const c = fingerprint(1000, 300);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('different seeds explore the seeded (still deterministic) policy', () => {
    // Not required to differ, but a healthy seed sweep usually does; assert only determinism.
    expect(fingerprint(8919, 300)).toBe(fingerprint(8919, 300));
  });
});
