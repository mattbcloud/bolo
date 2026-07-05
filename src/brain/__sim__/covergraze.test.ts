import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';
import { buildBrainState, applyControls } from '../aindy_interface';
import { brainOpen, syncBrainState } from '../brain_init';
import { shootPillFromCover } from '../combat';
import { setSpeed } from '../navigation';

// Validate the REVERSE-ENGINEERED cover-fire geometry (from live human play): wall on the
// pill's tank-facing (south) face, tank firing from ~6 tiles at a LATERAL offset (~15-30° off
// the wall axis) — NOT point-blank in-line behind the wall. Sweep (lateral offset, range) and
// report, for each, how much damage the tank DEALS to the pill vs how much it TAKES. The
// winning cell should grind the pill toward 0 while taking ~zero fire (the wall eats it).
(globalThis as any).__BRAIN_DBG__ = false;

function maps() {
  return [
    new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536),
    new Uint8Array(65536).fill(0xFF), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536).fill(0x10),
  ] as const;
}

/** Hold the tank at a fixed offset SSW of the pill, wall on the pill's south face, and drive
 *  shootPillFromCover. Wall is rebuilt on cadence to model a builder maintaining it. */
function run(o: { seed: number; lat: number; range: number; ticks?: number }) {
  const world = bootHeadlessWorld(o.seed);
  const pillObj = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  const px = pillObj.cell.x, py = pillObj.cell.y;
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  pillObj.armour = 15; pillObj.team = 255;
  const pillStart = pillObj.armour;

  // Wall on the pill's SOUTH face (the tank-facing side); tank SSW, offset `lat` tiles west
  // of the wall axis, `range` tiles south.
  const wTX = px, wTY = py + 1;
  world.map.cellAtTile(wTX, wTY).setType('|');
  const tankTX = px - o.lat, tankTY = py + o.range;

  const t = world.player;
  t.onBoat = false;
  t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 80; t.reload = 0;
  // Aim the hull roughly at the pill up front so it settles fast.
  t.direction = 0;

  const m = maps();
  let tickN = 0;
  const a4: any = brainOpen(buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m));

  let taken = 0, prevArm = t.armour, killedAt = -1, fired = 0, died = false;
  const ticks = o.ticks ?? 900;
  for (let i = 0; i < ticks; i++) {
    if (i % 14 === 0) world.map.cellAtTile(wTX, wTY).setType('|');   // maintain the wall
    const state = buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m);
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;
    const pill = (a4.pills ?? []).find((p: any) => (p.tileX & 0xFF) === px && (p.tileY & 0xFF) === py);
    if (pill) {
      setSpeed(a4, 0, t.direction & 0xFF);            // hold position (no driving)
      if (shootPillFromCover(a4, state, pill)) fired++;
    }
    applyControls(t, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick();
    if (t.armour === 255) { died = true; taken += 999; break; }
    if (t.armour <= prevArm) taken += prevArm - t.armour;
    prevArm = t.armour;
    if (pillObj.armour === 0 && killedAt < 0) { killedAt = i; break; }
  }
  return { taken, killedAt, fired, dealt: pillStart - pillObj.armour, pillEnd: pillObj.armour, died };
}

describe('cover graze — offset firing geometry (reverse-engineered from live play)', () => {
  it('sweeps lateral offset × range: which cell grinds the pill while staying safe', () => {
    const seeds = [1000, 8919, 16838];
    for (const range of [5, 6, 7]) {
      for (const lat of [0, 1, 2, 3]) {
        const rows = seeds.map((seed) => run({ seed, lat, range }));
        const dealt = rows.reduce((a, r) => a + r.dealt, 0) / rows.length;
        const taken = rows.reduce((a, r) => a + Math.min(999, r.taken), 0) / rows.length;
        const killed = rows.filter((r) => r.killedAt >= 0).length;
        const deaths = rows.filter((r) => r.died).length;
        const avgKill = killed ? Math.round(rows.filter((r) => r.killedAt >= 0).reduce((a, r) => a + r.killedAt, 0) / killed) : 0;
        // eslint-disable-next-line no-console
        console.log(`[graze] range=${range} lat=${lat}  dealt=${dealt.toFixed(1)}/15  taken=${taken.toFixed(1)}  ` +
          `killed=${killed}/3  avgKillTick=${avgKill || '—'}  tankDeaths=${deaths}/3`);
      }
    }
  });
});
