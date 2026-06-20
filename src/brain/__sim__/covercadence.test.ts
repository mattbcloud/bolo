import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const TILE = 256;
function dirToward(tx: number, ty: number, ax: number, ay: number): number {
  const rad = Math.atan2(ay - ty, ax - tx);
  return (((Math.round(256 - (rad * 256) / (2 * Math.PI))) % 256) + 256) % 256;
}

/**
 * Validated cover geometry (from covergeo search): diagonal approach at ~6.5tx,
 * wall on the pill neighbor toward the tank, aim at pill center + perpendicular
 * edge offset. Test how the win degrades as wall rebuild cadence slows — this
 * tells us how fast the real builder must rebuild.
 *
 * rebuildEvery: 1 = perfect; N = re-stamp the wall to '|' every N ticks (a broken
 * wall stays broken until the next stamp); 0 = never rebuild after initial.
 */
function engage(seed: number, rebuildEvery: number, ticks = 600) {
  const world = bootHeadlessWorld(seed);
  const pill = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  const px = pill.cell.x, py = pill.cell.y, pcx = pill.x, pcy = pill.y;
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  // diagonal approach: tank ENE of pill (ang≈22.5°)
  const ang = (1 / 16) * 2 * Math.PI;
  const ring = 6.5;
  const tankTX = Math.round(px + Math.cos(ang) * ring);
  const tankTY = Math.round(py + Math.sin(ang) * ring);
  const wTX = px + Math.round(Math.cos(ang));   // pill neighbor toward tank
  const wTY = py + Math.round(Math.sin(ang));
  const ux = Math.cos(ang), uy = Math.sin(ang);
  const perpX = -uy, perpY = ux;
  const off = 120;
  const aimX = pcx + perpX * off, aimY = pcy + perpY * off;

  world.map.cellAtTile(wTX, wTY).setType('|');
  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 60; t.reload = 0;

  let taken = 0, prevArm = t.armour, prevPill = pill.armour, killedAt = -1, wallBreaks = 0, wasWall = true;
  for (let i = 0; i < ticks; i++) {
    if (rebuildEvery > 0 && (i % rebuildEvery === 0)) world.map.cellAtTile(wTX, wTY).setType('|');
    const isWall = world.map.cellAtTile(wTX, wTY).isType('|');
    if (wasWall && !isWall) wallBreaks++;
    wasWall = isWall;
    t.shooting = false; t.accelerating = false; t.braking = false;
    t.turningClockwise = false; t.turningCounterClockwise = false;
    t.direction = dirToward(t.x, t.y, aimX, aimY);
    t.shooting = true; t.braking = true;
    world.tick();
    if (t.armour === 255) { taken += 999; break; }
    if (t.armour <= prevArm) taken += prevArm - t.armour;
    prevArm = t.armour;
    if (pill.armour < prevPill) prevPill = pill.armour;
    if (pill.armour === 0 && killedAt < 0) { killedAt = i; break; }
  }
  return { taken, killedAt, wallBreaks, pillEnd: pill.armour };
}

describe('cover rebuild-cadence sensitivity', () => {
  it('measures win vs rebuild interval (how fast must the builder be?)', () => {
    const seeds = [1000, 8919, 16838];
    for (const rebuildEvery of [1, 14, 25, 40, 0]) {
      const rows = seeds.map((s) => engage(s, rebuildEvery));
      const taken = rows.reduce((a, r) => a + r.taken, 0) / rows.length;
      const killed = rows.filter((r) => r.killedAt >= 0).length;
      const avgKill = rows.filter((r) => r.killedAt >= 0).reduce((a, r) => a + r.killedAt, 0) / Math.max(1, killed);
      const pillEnd = rows.reduce((a, r) => a + Math.min(15, r.pillEnd), 0) / rows.length;
      const label = rebuildEvery === 0 ? 'never' : rebuildEvery === 1 ? 'perfect(1t)' : `every ${rebuildEvery}t`;
      // eslint-disable-next-line no-console
      console.log(`[cad] rebuild=${label.padEnd(11)} taken=${taken.toFixed(1)} killed=${killed}/3 ` +
        `avgKillTick=${killed ? avgKill.toFixed(0) : '—'} meanPillEnd=${pillEnd.toFixed(1)}`);
    }
  });
});
