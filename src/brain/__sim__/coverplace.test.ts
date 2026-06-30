import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// Controlled cover-placement test (the live bug: "the builder gets killed while placing
// cover from an unsafe distance"). Unlike capfloor (30 random full maps × 5000 ticks —
// chaotic, can't isolate builder death), this pins ONE pill in a cleared open arena and
// drives the full brain at it from a fixed approach. The only obstacle the builder ever
// faces is the wall it builds, so the signal is clean: does the cover SEQUENCE keep the
// builder alive (vs the old dispatch-while-charging path)?
//
// A/B in one process via the COVER_SAFE env flag the brain reads each tick:
//   COVER_SAFE=0 → old behaviour (builder dispatched mid-charge, tank charges past)
//   COVER_SAFE=1 → new sequence (stop at the ring, build, wait for builder home, edge-fire)
(globalThis as any).__BRAIN_DBG__ = false;

/** One engagement: clear an arena around the most-open pill, approach it, count builder
 *  deaths (transitions into the parachuting state) and whether/when the pill is captured. */
function engage(seed: number, mode: '0' | '1') {
  process.env.COVER_SAFE = mode;
  const world = bootHeadlessWorld(seed);
  const t: any = world.player;

  const isOpen = (tx: number, ty: number) => {
    const a = world.map.cellAtTile(tx, ty)?.type?.ascii;
    return a === '.' || a === ' ' || a === '=' || a === '%' || a === '~';
  };
  // Pick the pill with the most open neighbourhood (so the engagement isn't dominated by
  // terrain), then clear a generous arena to grass so the built wall is the only obstacle.
  let pill: any = null, best = -1;
  for (const p of world.map.pills ?? []) {
    const c = p.cell; if (!c || p.armour <= 0) continue;
    let open = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (isOpen(c.x + dx, c.y + dy)) open++;
    if (open > best) { best = open; pill = p; }
  }
  const px = pill.cell.x, py = pill.cell.y;
  for (let dx = -11; dx <= 11; dx++) for (let dy = -11; dy <= 11; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  pill.armour = 15;   // full, hot pill — the dangerous case
  pill.team = 255;    // ensure the target is neutral (attackable)

  placeTank(world, px + 7, py + 6, false);   // ~9 tiles out, diagonal approach
  t.armour = 60; t.shells = 40000; t.trees = 12;   // stocked so the builder can build at once
  // Force a single-target engagement: make every OTHER pill allied so the brain only ever
  // targets ours (otherwise the goal system wanders off to a far pill and the test is invalid).
  for (const p of world.map.pills ?? []) {
    if (p === pill) continue;
    p.team = t.team; p.owner_idx = t.idx ?? t.owner_idx ?? 0;
  }

  const a4: any = enableBrain(world);

  let manDeaths = 0, prevOrder = 0, parachuteTicks = 0;
  let capturedAt = -1, minArm = pill.armour, tankDeaths = 0, prevTankArm = t.armour;
  const trace = process.env.TRACE === mode;
  const px2 = pill.x ?? (pill.cell.x << 8) + 128, py2 = pill.y ?? (pill.cell.y << 8) + 128;
  const ticks = 1500;
  const topUp = process.env.HEALTHY === '1';   // simulate refuel availability (real games have bases)
  for (let i = 0; i < ticks; i++) {
    if (topUp && mode === '1' && t.armour < 40 && t.armour !== 255) t.armour = 40;
    world.tick();
    if (trace) {
      const bl = (t as any).builder;
      const o = (bl && bl.$ && bl.$.order !== undefined) ? bl.$.order : 0;
      const d = Math.round(Math.hypot((t.x ?? 0) - px2, (t.y ?? 0) - py2));
      if (i < 600 && (i % 25 === 0 || (o === 3 && prevOrder !== 3)))
        // eslint-disable-next-line no-console
        console.log(`  t=${i} dist=${d} mOrder=${o} pillArm=${pill.armour} tankArm=${t.armour} spd=${t.speed}${o === 3 && prevOrder !== 3 ? '  <-- BUILDER KILLED' : ''}`);
    }
    if (pill.armour < minArm) minArm = pill.armour;
    const bldr = (t as any).builder;
    const ord = (bldr && bldr.$ && bldr.$.order !== undefined) ? bldr.$.order : 0;
    if (ord === 3) parachuteTicks++;
    if (ord === 3 && prevOrder !== 3) manDeaths++;
    prevOrder = ord;
    if (t.armour > prevTankArm + 20) tankDeaths++;   // respawn = big armour jump up
    prevTankArm = t.armour;
    if ((pill.armour === 0 || pill.inTank || pill.team === t.team) && capturedAt < 0) capturedAt = i;
  }
  return { manDeaths, parachuteTicks, capturedAt, minArm, tankDeaths };
}

describe('cover placement keeps the builder alive', () => {
  it('A/B: safe sequence vs dispatch-while-charging (single open pill)', () => {
    const seeds = [1000, 8919, 16838, 24757, 32676];
    let oldDeaths = 0, newDeaths = 0, oldPara = 0, newPara = 0, oldCap = 0, newCap = 0;
    for (const seed of seeds) {
      const base = engage(seed, '0');
      const safe = engage(seed, '1');
      oldDeaths += base.manDeaths; newDeaths += safe.manDeaths;
      oldPara += base.parachuteTicks; newPara += safe.parachuteTicks;
      if (base.capturedAt >= 0) oldCap++;
      if (safe.capturedAt >= 0) newCap++;
      // eslint-disable-next-line no-console
      console.log(`[coverplace seed${seed}] OLD deaths=${base.manDeaths} para=${base.parachuteTicks} ` +
        `cap=${base.capturedAt >= 0 ? base.capturedAt : 'NO'} minArm=${base.minArm} tankDeaths=${base.tankDeaths}  ||  ` +
        `NEW deaths=${safe.manDeaths} para=${safe.parachuteTicks} cap=${safe.capturedAt >= 0 ? safe.capturedAt : 'NO'} ` +
        `minArm=${safe.minArm} tankDeaths=${safe.tankDeaths}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[coverplace] TOTAL  OLD: builderDeaths=${oldDeaths} parachuteTicks=${oldPara} captured=${oldCap}/${seeds.length}  ` +
      `||  NEW: builderDeaths=${newDeaths} parachuteTicks=${newPara} captured=${newCap}/${seeds.length}`);
    delete process.env.COVER_SAFE;
    // Guard: the safe sequence must not capture fewer pills and must not kill the builder MORE.
    expect(newCap).toBeGreaterThanOrEqual(oldCap);
    expect(newDeaths).toBeLessThanOrEqual(oldDeaths);
  });
});
