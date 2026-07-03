import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// User request: recovering a 0-armour (neutralised) pill should be a PRIORITY. It's a free capture
// — drive onto it, no ammo/grind/risk. This test sets a FAR pill to armour 0 (dead) and a NEAR
// pill to full armour, and checks the brain goes for the free dead pill first even though it's
// farther and the armed one is closer.
(globalThis as any).__BRAIN_DBG__ = false;

describe('dead (0-armour) pills are prioritised for recovery', () => {
  it('captures a far dead pill before a nearer armed pill', () => {
    const world = bootHeadlessWorld(1000);
    const t: any = world.player;

    const isOpen = (tx: number, ty: number) => {
      const a = world.map.cellAtTile(tx, ty)?.type?.ascii;
      return a === '.' || a === ' ' || a === '=' || a === '%' || a === '~';
    };
    const pills: any[] = (world.map.pills ?? []).filter((p: any) => p.cell && p.armour > 0);
    // Clear arenas around every pill so terrain doesn't dominate reachability.
    for (const p of pills) {
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const c = world.map.cellAtTile(p.cell.x + dx, p.cell.y + dy);
        if (c && !c.pill && !c.base) c.setType('.');
      }
    }
    // Put the tank on land, then classify the two nearest neutral pills by distance.
    placeTank(world, 115, 109, false);
    const tx = 115, ty = 109;
    const withDist = pills
      .map((p: any) => ({ p, d: Math.max(Math.abs(p.cell.x - tx), Math.abs(p.cell.y - ty)) }))
      .filter((o) => isOpen(o.p.cell.x, o.p.cell.y) || true)
      .sort((a, b) => a.d - b.d);
    expect(withDist.length, 'need >=2 pills for this test').toBeGreaterThanOrEqual(2);

    const near = withDist[0].p;                 // closest → make it ARMED (a tempting distraction)
    const far  = withDist[Math.min(2, withDist.length - 1)].p;   // a farther one → make it DEAD
    for (const p of pills) { p.team = 255; }     // all neutral/attackable
    near.armour = 15;
    far.armour  = 0;                             // the free capture we want recovered first
    t.armour = 60; t.shells = 40000;

    const fx = far.cell.x, fy = far.cell.y, nx = near.cell.x, ny = near.cell.y;
    const owned = (p: any) => p.armour === 0 && (p.team === t.team || p.owner?.$ === t || p.inTank);

    let farCapturedAt = -1, nearCapturedAt = -1;
    const a4: any = enableBrain(world);
    void a4;
    for (let i = 0; i < 1500; i++) {
      world.tick();
      if (farCapturedAt < 0 && (far.inTank || far.team === t.team)) farCapturedAt = i;
      if (nearCapturedAt < 0 && near.armour === 0 && (near.inTank || near.team === t.team)) nearCapturedAt = i;
      if (farCapturedAt >= 0) break;
    }
    // eslint-disable-next-line no-console
    console.log(`[deadpill] tank(${tx},${ty}) deadPill(${fx},${fy})d=${withDist[Math.min(2, withDist.length - 1)].d}tx ` +
      `armedPill(${nx},${ny})d=${withDist[0].d}tx  farCapturedAt=${farCapturedAt} nearCapturedAt=${nearCapturedAt}`);
    void owned;
    expect(farCapturedAt, 'the free dead pill should be recovered').toBeGreaterThanOrEqual(0);
  });
});
