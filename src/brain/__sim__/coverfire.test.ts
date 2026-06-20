import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';
import { buildBrainState, applyControls } from '../aindy_interface';
import { brainOpen, syncBrainState } from '../brain_init';
import { shootPillFromCover } from '../combat';
import { setSpeed } from '../navigation';

(globalThis as any).__BRAIN_DBG__ = false;

function maps() {
  return [
    new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536),
    new Uint8Array(65536).fill(0xFF), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536).fill(0x10),
  ] as const;
}

/** Drive the BRAIN's shootPillFromCover from a fixed diagonal cover position; the
 *  wall is rebuilt on `rebuildEvery` cadence to model a builder maintaining it. */
function run(o: { seed: number; edgeOffset: number; tol: number; rebuildEvery: number; ticks?: number }) {
  const world = bootHeadlessWorld(o.seed);
  const pillObj = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  const px = pillObj.cell.x, py = pillObj.cell.y;
  for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  // Diagonal approach ENE (validated winning bearing), ~6.5tx.
  const ang = (1 / 16) * 2 * Math.PI, ring = 6.5;
  const tankTX = Math.round(px + Math.cos(ang) * ring);
  const tankTY = Math.round(py + Math.sin(ang) * ring);
  const wTX = px + Math.round(Math.cos(ang)), wTY = py + Math.round(Math.sin(ang));
  world.map.cellAtTile(wTX, wTY).setType('|');

  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 60; t.reload = 0;

  const m = maps();
  let tickN = 0;
  const a4: any = brainOpen(buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m));

  let taken = 0, prevArm = t.armour, killedAt = -1, fired = 0;
  const ticks = o.ticks ?? 600;
  for (let i = 0; i < ticks; i++) {
    if (o.rebuildEvery > 0 && i % o.rebuildEvery === 0) world.map.cellAtTile(wTX, wTY).setType('|');
    const state = buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m);
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;
    // find the brain's PillState for our pill
    const pill = (a4.pills ?? []).find((p: any) => (p.tileX & 0xFF) === px && (p.tileY & 0xFF) === py);
    if (pill) {
      setSpeed(a4, 0, t.direction & 0xFF);             // hold position
      if (shootPillFromCover(a4, state, pill, o.edgeOffset, o.tol)) fired++;
    }
    applyControls(t, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick();
    if (t.armour === 255) { taken += 999; break; }
    if (t.armour <= prevArm) taken += prevArm - t.armour;
    prevArm = t.armour;
    if (pillObj.armour === 0 && killedAt < 0) { killedAt = i; break; }
  }
  return { taken, killedAt, fired, pillEnd: pillObj.armour };
}

describe('brain shootPillFromCover — verify + tune', () => {
  it('sweeps edgeOffset/tolerance with a maintained wall', () => {
    const seeds = [1000, 8919, 16838];
    for (const tol of [2, 3, 4]) {
      for (const edgeOffset of [96, 104, 112, 120]) {
        const rows = seeds.map((seed) => run({ seed, edgeOffset, tol, rebuildEvery: 14 }));
        const taken = rows.reduce((a, r) => a + Math.min(999, r.taken), 0) / rows.length;
        const killed = rows.filter((r) => r.killedAt >= 0).length;
        const avgKill = killed ? rows.filter((r) => r.killedAt >= 0).reduce((a, r) => a + r.killedAt, 0) / killed : 0;
        const pillEnd = rows.reduce((a, r) => a + r.pillEnd, 0) / rows.length;
        // eslint-disable-next-line no-console
        console.log(`[cfire] tol=${tol} off=${String(edgeOffset).padStart(3)} ` +
          `taken=${taken.toFixed(1)} killed=${killed}/3 avgKill=${avgKill ? avgKill.toFixed(0) : '—'} ` +
          `meanPillEnd=${pillEnd.toFixed(1)}`);
      }
    }
  });
});
