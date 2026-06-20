import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const TILE = 256;
function dirToward(tx: number, ty: number, ax: number, ay: number): number {
  const rad = Math.atan2(ay - ty, ax - tx);
  return (((Math.round(256 - (rad * 256) / (2 * Math.PI))) % 256) + 256) % 256;
}
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/**
 * Measure RATES while the tank is alive (respawn-independent): hold the tank at a
 * fixed range band and fire. Optionally keep a wall between tank and pill, and
 * optionally auto-rebuild it every tick (perfect-builder upper bound on cover).
 * Aim center or at the pill edge. Stop at first death; report per-100t rates.
 */
function measure(opts: {
  seed: number; holdTx: number; wall: boolean; rebuild: boolean;
  aimEdge: boolean; ticks?: number;
}) {
  const world = bootHeadlessWorld(opts.seed);
  const pill = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  const px = pill.cell.x, py = pill.cell.y;
  for (let dx = -12; dx <= 4; dx++)
    for (let dy = -8; dy <= 8; dy++) {
      const c = world.map.cellAtTile(px + dx, py + dy);
      if (c && !c.pill && !c.base) c.setType('.');
    }
  const wallTX = px - 1, wallTY = py;
  if (opts.wall) world.map.cellAtTile(wallTX, wallTY).setType('|');

  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(px - opts.holdTx); t.y = tileToBWorld(py);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 40; t.reload = 0;

  // Edge aim: aim at the pill's NORTH edge (offset up ~half a tile) so the shell
  // grazes past a wall sitting due-west; center aim hits straight through.
  const aimX = pill.x, aimY = pill.y + (opts.aimEdge ? -110 : 0);

  const ticks = opts.ticks ?? 1200;
  let taken = 0, dealt = 0, aliveTicks = 0, prevArm = t.armour, prevPill = pill.armour, died = false;
  for (let i = 0; i < ticks; i++) {
    if (opts.wall && opts.rebuild) world.map.cellAtTile(wallTX, wallTY).setType('|');
    t.shooting = false; t.accelerating = false; t.braking = false;
    t.turningClockwise = false; t.turningCounterClockwise = false;
    t.direction = dirToward(t.x, t.y, aimX, aimY);
    const d = dist(t.x, t.y, pill.x, pill.y) / TILE;
    t.shooting = true;
    if (d > opts.holdTx + 0.2) t.accelerating = true; else t.braking = true;
    world.tick();
    if (t.armour === 255) { died = true; break; }
    aliveTicks++;
    if (t.armour > prevArm) { /* regen */ } else taken += prevArm - t.armour;
    prevArm = t.armour;
    if (pill.armour < prevPill) dealt += prevPill - pill.armour;
    prevPill = pill.armour;
  }
  return { taken, dealt, aliveTicks, died, pillEnd: pill.armour };
}

function avg(rows: ReturnType<typeof measure>[], pick: (r: any) => number) {
  return rows.reduce((s, r) => s + pick(r), 0) / rows.length;
}

describe('cover upper-bound (perfect rebuild) vs no cover', () => {
  it('compares damage-taken rate with and without maintained cover', () => {
    const seeds = [1000, 8919, 16838, 24757, 32676];
    const configs = [
      { name: 'no-wall center @6.5', holdTx: 6.5, wall: false, rebuild: false, aimEdge: false },
      { name: 'wall-1x   edge   @6.5', holdTx: 6.5, wall: true,  rebuild: false, aimEdge: true },
      { name: 'wall-RBLD edge   @6.5', holdTx: 6.5, wall: true,  rebuild: true,  aimEdge: true },
      { name: 'wall-RBLD center @6.5', holdTx: 6.5, wall: true,  rebuild: true,  aimEdge: false },
      { name: 'no-wall center @7.0', holdTx: 7.0, wall: false, rebuild: false, aimEdge: false },
    ];
    for (const cfg of configs) {
      const rows = seeds.map((seed) => measure({ seed, ...cfg }));
      const takenRate = avg(rows, (r) => r.taken / Math.max(1, r.aliveTicks) * 100);
      const dealtRate = avg(rows, (r) => r.dealt / Math.max(1, r.aliveTicks) * 100);
      const deaths = rows.filter((r) => r.died).length;
      const meanPillEnd = avg(rows, (r) => r.pillEnd);
      // eslint-disable-next-line no-console
      console.log(`[bound] ${cfg.name}  taken/100t=${takenRate.toFixed(2)} ` +
        `dealt/100t=${dealtRate.toFixed(2)} deaths=${deaths}/5 meanPillEnd=${meanPillEnd.toFixed(1)}`);
    }
  });
});
