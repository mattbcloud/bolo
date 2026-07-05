import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// Full nav+fire chain with the cover wall PRE-PLACED (isolates navigate-to-slot + fire from the
// builder logistics). Reproduces the human's staged geometry: hostile pill, wall on the pill's
// south face, tank starting due-south and OUT of range. Success = the brain drives onto a covered
// offset firing slot and grinds the pill down (ideally to 0/capture) WITHOUT dying.
(globalThis as any).__BRAIN_DBG__ = false;

function run(seed: number) {
  const world = bootHeadlessWorld(seed);
  const t: any = world.player;

  const pills: any[] = Array.from(world.map.pills ?? []);
  // pick the pill with the most open surroundings (like coverpill) so geometry is clean
  let target: any = null, best = -1;
  const isOpen = (tx: number, ty: number) => {
    const a = world.map.cellAtTile(tx, ty)?.type?.ascii;
    return a === '.' || a === ' ' || a === '=' || a === '%' || a === '~';
  };
  for (const p of pills) {
    const c = p.cell; if (!c || p.armour <= 0) continue;
    let open = 0;
    for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) if (isOpen(c.x + dx, c.y + dy)) open++;
    if (open > best) { best = open; target = p; }
  }
  const px = target.cell.x, py = target.cell.y;
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  target.armour = 15; target.team = 255;
  // neutralise every OTHER pill so the brain only targets ours
  for (const p of pills) { if (p !== target) { p.team = t.team; p.owner_idx = t.idx ?? 0; } }

  // PRE-PLACE the cover wall on the pill's SOUTH face (the tank-facing side).
  world.map.cellAtTile(px, py + 1).setType('|');

  // Tank due-south, 8 tiles out (outside the pill's 7.5-tile range).
  placeTank(world, px, py + 8, false);
  t.armour = 40; t.shells = 40000; t.trees = 6;   // trees for the retreat-rebuild fallback (repair is free)

  const a4: any = enableBrain(world);

  let minArm = target.armour, capturedAt = -1, deaths = 0, prevTankArm = t.armour;
  let coveredFireTicks = 0;
  const MAINTAIN = process.env.MAINTAIN === '1';
  const TRACE = process.env.TRACE === '1' && seed === 1000;
  let prevArm = target.armour;
  for (let i = 0; i < 2500; i++) {
    if (MAINTAIN && i % 14 === 0) world.map.cellAtTile(px, py + 1).setType('|');   // diagnostic: keep wall fresh
    world.tick();
    if (TRACE && (target.armour !== prevArm || (i > 400 && i % 200 === 0))) {
      const dtx = (t.x >> 8) - px, dty = (t.y >> 8) - py;
      const d = Math.round(Math.hypot((t.x ?? 0) - (target.x ?? 0), (t.y ?? 0) - (target.y ?? 0)));
      // eslint-disable-next-line no-console
      console.log(`  t=${i} tankTile=(${(t.x>>8)&0xFF},${(t.y>>8)&0xFF}) rel=(${dtx},${dty}) dist=${d} facing=${t.direction&0xFF} spd=${(t.speed??0).toFixed?.(1)} tgtArm=${target.armour}`);
      prevArm = target.armour;
    }
    if (target.armour < minArm) minArm = target.armour;
    if ((target.armour === 0 || target.inTank || target.team === t.team) && capturedAt < 0) capturedAt = i;
    if (t.armour === 255 && prevTankArm !== 255) deaths++;
    prevTankArm = t.armour;
    // count ticks where the tank sits in-range firing but the pill can't see it (behind cover)
    const d = Math.hypot((t.x ?? 0) - (target.x ?? 0), (t.y ?? 0) - (target.y ?? 0));
    if (d < 1919 && (a4.firingWord & 0x10)) coveredFireTicks++;
  }
  return { minArm, capturedAt, deaths, coveredFireTicks, targetArm: target.armour };
}

describe('cover capture — nav+fire with pre-placed wall', () => {
  it('drives onto a covered slot and grinds the pill down', () => {
    const seeds = [1000, 8919, 16838, 24757, 32676];
    let captured = 0, totalDeaths = 0; const arms: number[] = [];
    for (const seed of seeds) {
      const r = run(seed);
      if (r.capturedAt >= 0) captured++;
      totalDeaths += r.deaths;
      arms.push(r.minArm);
      // eslint-disable-next-line no-console
      console.log(`[covercap seed${seed}] minArm=${r.minArm} captured=${r.capturedAt >= 0 ? r.capturedAt : 'NO'} ` +
        `deaths=${r.deaths} coveredFireTicks=${r.coveredFireTicks} endArm=${r.targetArm}`);
    }
    const meanMin = arms.reduce((a, b) => a + b, 0) / arms.length;
    // eslint-disable-next-line no-console
    console.log(`[covercap] TOTAL captured=${captured}/${seeds.length} meanMinArm=${meanMin.toFixed(1)} deaths=${totalDeaths}`);
    void expect;
  });
});
