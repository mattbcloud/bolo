import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';
import { distance } from '../../helpers';
import { directionTo } from '../pathfinding';

// Two tanks driving toward the same point must NOT end up stacked on the same tile.
// Live 2v2: "beano" + "Jeans" (team3) pinned on the exact same tile [70,160] (both refuelling at
// one base) — the engine's collision was only a 1-unit/tick nudge, overwhelmed by their drive
// toward the shared target. Classic Bolo bounces tanks apart (winbolo: escalating nudges).
(globalThis as any).__BRAIN_DBG__ = false;

function run() {
  const world = bootHeadlessWorld();
  const cx = 120, cy = 120;
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
    const c = world.map.cellAtTile(cx + dx, cy + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }

  const a: any = world.player;
  a.spawn(0);
  a.x = tileToBWorld(cx - 5); a.y = tileToBWorld(cy);
  a.cell = world.map.cellAtWorld(a.x, a.y);
  a.onBoat = false; a.armour = 40; a.direction = 0;      // face EAST → toward the centre

  const b: any = world.spawn(Tank);
  b.spawn(0);
  b.x = tileToBWorld(cx + 5); b.y = tileToBWorld(cy);
  b.cell = world.map.cellAtWorld(b.x, b.y);
  b.onBoat = false; b.armour = 40; b.direction = 128;    // face WEST → toward the centre

  // Each keeps driving straight AT the other (like two allies converging on one base and staying),
  // so the collision must hold persistently — not just survive a single pass-through.
  let settledMinSep = Infinity;
  for (let i = 0; i < 600; i++) {
    a.accelerating = true; a.braking = false; a.direction = directionTo(a.x, a.y, b.x, b.y) & 0xFF;
    b.accelerating = true; b.braking = false; b.direction = directionTo(b.x, b.y, a.x, a.y) & 0xFF;
    world.tick();
    // Measure separation only once they've had time to converge (settled window).
    if (i >= 200) settledMinSep = Math.min(settledMinSep, distance(a, b));
  }
  return { settledMinSep: Math.round(settledMinSep) };
}

describe('tank-tank collision: tanks do not stack on one tile', () => {
  it('two tanks converging on a point stay separated (~1 tile)', () => {
    const r = run();
    // eslint-disable-next-line no-console
    console.log(`[tank-collision] settledMinSep=${r.settledMinSep} (1 tile = 256 world units)`);
    // A tank is ~1 tile wide; two allies driving into each other must be held apart, not stacked.
    // A hard stack collapses to well under a tile; require they never overlap below ~most of a tile.
    expect(r.settledMinSep).toBeGreaterThanOrEqual(230);
  });
});
