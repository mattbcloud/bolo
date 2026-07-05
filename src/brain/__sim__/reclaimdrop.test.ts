import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// A tank that dies while carrying pillboxes DROPS them on the ground at armour 0 (tank.ts
// dropPillboxes → placeAt; carried pills are armour 0). ANY tank driving onto an armour-0 pill
// picks it up (world_pillbox.ts:182 — no team check), so those boxes are a free pickup for
// whoever reaches them first. The tank must go back and RECLAIM its own. The blocker was
// fixPillGoalCost's blanket trees-gate: an armour-0 pill scored treesNeeded=4, so a low-on-trees
// tank (typical right after death) could never select FixPill to pick it up. This test drops a
// friendly armour-0 pill on the ground near a 0-tree tank and checks it gets reclaimed.
(globalThis as any).__BRAIN_DBG__ = false;

function run(seed: number) {
  const world = bootHeadlessWorld(seed);
  const t: any = world.player;

  const pills: any[] = Array.from(world.map.pills ?? []);
  // clear a clean arena around the first pill and use it as the "dropped" box
  const target = pills.find((p) => p.cell && p.armour >= 0);
  const px = target.cell.x, py = target.cell.y;
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  // Neutralise every OTHER pill so this is the only thing to act on.
  for (const p of pills) { if (p !== target) { p.team = t.team; p.owner_idx = t.idx ?? 0; p.armour = 15; } }

  // The dropped box: our team, ON the map, armour 0 (a free pickup).
  target.team = t.team; target.owner_idx = t.idx ?? 0; target.armour = 0;
  target.inTank = false; target.carried = false;

  // Tank a few tiles away with ZERO trees (as after a death) but some shells + armour.
  placeTank(world, px + 5, py + 4, false);
  t.armour = 40; t.shells = 40; t.trees = 0;

  const a4: any = enableBrain(world);
  const carriedStart = t.getCarryingPillboxes().length;

  let pickedAt = -1;
  for (let i = 0; i < 1500; i++) {
    world.tick();
    if (t.getCarryingPillboxes().length > carriedStart && pickedAt < 0) { pickedAt = i; break; }
  }
  return { carriedStart, pickedAt, endCarried: t.getCarryingPillboxes().length };
}

describe('reclaim a pillbox dropped on death', () => {
  it('a low-on-trees tank goes back and picks up its dropped (armour-0) box', () => {
    const seeds = [1000, 8919, 16838, 24757, 32676];
    let picked = 0;
    for (const seed of seeds) {
      const r = run(seed);
      if (r.pickedAt >= 0) picked++;
      // eslint-disable-next-line no-console
      console.log(`[reclaimdrop seed${seed}] pickedUp=${r.pickedAt >= 0 ? `t=${r.pickedAt}` : 'NO'} endCarried=${r.endCarried}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[reclaimdrop] TOTAL pickedUp=${picked}/${seeds.length}`);
    expect(picked, 'a 0-tree tank must reclaim its dropped armour-0 pill').toBeGreaterThanOrEqual(4);
  });
});
