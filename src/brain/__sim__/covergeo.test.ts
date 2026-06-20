import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const TILE = 256;
function dirToward(tx: number, ty: number, ax: number, ay: number): number {
  const rad = Math.atan2(ay - ty, ax - tx);
  return (((Math.round(256 - (rad * 256) / (2 * Math.PI))) % 256) + 256) % 256;
}

describe('cover geometry search (perfect wall): low-taken + nonzero-dealt', () => {
  it('searches tank angle x perpendicular aim offset, wall between tank and pill', () => {
    const seed = 1000;
    const world = bootHeadlessWorld(seed);
    const pill = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
    const px = pill.cell.x, py = pill.cell.y, pcx = pill.x, pcy = pill.y;
    // big grass arena, once
    for (let dx = -12; dx <= 12; dx++)
      for (let dy = -12; dy <= 12; dy++) {
        const c = world.map.cellAtTile(px + dx, py + dy);
        if (c && !c.pill && !c.base) c.setType('.');
      }
    const t = world.player;
    t.onBoat = false;

    function trial(tankTX: number, tankTY: number, wTX: number, wTY: number, aimX: number, aimY: number, ticks: number) {
      // reset pill + tank + clear any leftover wall by re-grassing the ring
      pill.armour = 15; pill.speed = 50; pill.reload = 0; pill.coolDown = 32; pill.haveTarget = false;
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const c = world.map.cellAtTile(px + dx, py + dy);
        if (c && !c.pill && !c.base) c.setType('.');
      }
      t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
      t.cell = world.map.cellAtWorld(t.x, t.y);
      t.shells = 999999; t.armour = 60; t.reload = 0;
      let taken = 0, dealt = 0, prevArm = t.armour, prevPill = pill.armour;
      for (let i = 0; i < ticks; i++) {
        world.map.cellAtTile(wTX, wTY).setType('|');
        t.shooting = false; t.accelerating = false; t.braking = false;
        t.turningClockwise = false; t.turningCounterClockwise = false;
        t.direction = dirToward(t.x, t.y, aimX, aimY);
        t.shooting = true; t.braking = true;
        world.tick();
        if (t.armour === 255) { taken += 999; break; }
        if (t.armour <= prevArm) taken += prevArm - t.armour;
        prevArm = t.armour;
        if (pill.armour < prevPill) dealt += prevPill - pill.armour;
        prevPill = pill.armour;
      }
      return { taken, dealt };
    }

    const ring = 6.5;
    const hits: string[] = [];
    let best = { dealt: -1, taken: 999, desc: '' };
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * 2 * Math.PI;
      const tankTX = Math.round(px + Math.cos(ang) * ring);
      const tankTY = Math.round(py + Math.sin(ang) * ring);
      // unit vector pill->tank; wall tile = pill neighbor toward tank
      const ux = Math.cos(ang), uy = Math.sin(ang);
      const wTX = px + Math.round(ux), wTY = py + Math.round(uy);
      // perpendicular unit (screen space)
      const perpX = -uy, perpY = ux;
      for (let k = -4; k <= 4; k++) {
        const off = k * 40; // world units along perpendicular
        const aimX = pcx + perpX * off, aimY = pcy + perpY * off;
        const r = trial(tankTX, tankTY, wTX, wTY, aimX, aimY, 300);
        if (r.dealt > best.dealt || (r.dealt === best.dealt && r.taken < best.taken)) {
          best = { dealt: r.dealt, taken: r.taken, desc: `ang=${a}/16 tank=(${tankTX},${tankTY}) wall=(${wTX},${wTY}) perpOff=${off}` };
        }
        if (r.dealt >= 4 && r.taken <= 2) {
          hits.push(`dealt=${r.dealt} taken=${r.taken} ang=${a}/16 tank=(${tankTX},${tankTY}) wall=(${wTX},${wTY}) perpOff=${off}`);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[geo] pill@(${px},${py}); 16 angles x 9 aim offsets, perfect wall, 300t each`);
    // eslint-disable-next-line no-console
    console.log(`[geo] BEST: ${best.desc} dealt=${best.dealt} taken=${best.taken}`);
    // eslint-disable-next-line no-console
    console.log(`[geo] asymmetric hits (dealt>=4 & taken<=2): ${hits.length}`);
    for (const h of hits.slice(0, 30)) console.log('   ' + h);
  });
});
