import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

const TILE = 256;
function dirToward(tx: number, ty: number, ax: number, ay: number): number {
  const rad = Math.atan2(ay - ty, ax - tx);
  return (((Math.round(256 - (rad * 256) / (2 * Math.PI))) % 256) + 256) % 256;
}
function setupArena(world: any, pill: any) {
  const px = pill.cell.x, py = pill.cell.y;
  for (let dx = -12; dx <= 4; dx++)
    for (let dy = -8; dy <= 8; dy++) {
      const c = world.map.cellAtTile(px + dx, py + dy);
      if (c && !c.pill && !c.base) c.setType('.');
    }
  return { px, py };
}
function freshPill() {
  const world = bootHeadlessWorld();
  const pill = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  return { world, pill, ...setupArena(world, pill) };
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** Run a per-tick driver until pill neutralized or budget elapses. Returns summary. */
function runEngagement(name: string, drive: (ctx: any) => void, ticks = 1500) {
  const { world, pill, px, py } = freshPill();
  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(px - 7); t.y = tileToBWorld(py);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 9999; t.armour = 40; t.reload = 0; t.direction = 0;

  let deaths = 0, prevArm = t.armour, neutralizedAt = -1;
  let minPill = pill.armour;
  for (let i = 0; i < ticks; i++) {
    if (t.armour === 255 && prevArm !== 255) { deaths++; }
    prevArm = t.armour;
    // reset controls each tick
    t.shooting = false; t.accelerating = false; t.braking = false;
    t.turningClockwise = false; t.turningCounterClockwise = false;
    drive({ world, t, pill, px, py, i });
    world.tick();
    minPill = Math.min(minPill, pill.armour);
    if (pill.armour === 0 && neutralizedAt < 0) { neutralizedAt = i; break; }
  }
  const d = dist(t.x, t.y, pill.x, pill.y) / TILE;
  // eslint-disable-next-line no-console
  console.log(`[strat] ${name.padEnd(22)} neutralized@${neutralizedAt < 0 ? 'NO ' : neutralizedAt} ` +
    `minPillArm=${minPill} deaths=${deaths} endArm=${t.armour === 255 ? 'DEAD' : t.armour} endDist=${d.toFixed(1)}tx`);
}

describe('pill engagement strategy comparison', () => {
  it('compares charge / hold-at-range / hit-and-run', () => {
    // pill center in world units
    const aimAt = (t: any, pill: any) => dirToward(t.x, t.y, pill.x, pill.y);

    // A) Charge to point blank, fire continuously (≈ current brain behavior).
    runEngagement('charge-pointblank', ({ t, pill }) => {
      t.direction = aimAt(t, pill);
      t.shooting = true; t.accelerating = true;
    });

    // B) Hold stationary at current spot (~7 tiles), fire.
    runEngagement('hold-7tx-static', ({ t, pill }) => {
      t.direction = aimAt(t, pill);
      t.shooting = true; t.braking = true;
    });

    // C) Hold at a target range band ~6.5tx: creep to hold distance, fire.
    runEngagement('hold-6.5tx-regulated', ({ t, pill }) => {
      t.direction = aimAt(t, pill);
      const d = dist(t.x, t.y, pill.x, pill.y) / TILE;
      t.shooting = true;
      if (d > 6.7) t.accelerating = true;       // too far: close in
      else if (d < 6.3) t.braking = true;        // too close: hold (no reverse)
      else t.braking = true;
    });

    // D) Hit-and-run: dash to ~6tx firing, retreat past ~8tx, repeat.
    let phase = 'in';
    runEngagement('hit-and-run', ({ t, pill }) => {
      const d = dist(t.x, t.y, pill.x, pill.y) / TILE;
      if (phase === 'in') {
        t.direction = aimAt(t, pill);
        t.accelerating = true; t.shooting = true;
        if (d <= 6.0) phase = 'out';
      } else {
        // turn away and run
        t.direction = (dirToward(t.x, t.y, pill.x, pill.y) + 128) % 256;
        t.accelerating = true;
        if (d >= 8.2) phase = 'in';
      }
    });
  });
});
