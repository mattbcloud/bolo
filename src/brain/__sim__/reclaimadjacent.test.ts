import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';
import { buildBrainState, applyControls } from '../aindy_interface';
import { brainOpen, syncBrainState } from '../brain_init';
import { goalFixPill } from '../goal_handlers';

(globalThis as any).__BRAIN_DBG__ = false;

function maps() {
  return [
    new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536),
    new Uint8Array(65536).fill(0xFF), new Uint8Array(65536), new Uint8Array(65536), new Uint8Array(65536).fill(0x10),
  ] as const;
}

/**
 * Point-blank reclaim freeze (live: belle/dsfsdf frozen on FixPill next to a friendly pill).
 * The tank STARTS one tile from a friendly armoured pill it must reclaim (shoot down to 0, then
 * drive on). checkBarriers' 2-sample DDA false-blocks LOS at this range when the tank sits N/W of
 * the pill (the single midpoint rounds onto the pill's own tile = terrain 12 = barrier). The old
 * _reclaimPill then set spd=8 + navigateToCoords(navX,navY) — but navX/navY is ~where the tank
 * already is, so it never moved and NEVER FIRED → the pill stayed armoured forever.
 * Expectation: from every adjacent tile the tank shoots the pill down to 0 (or collects it).
 */
function run(seed: number, dir: [number, number]) {
  const world = bootHeadlessWorld(seed);
  const pillObj = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  if (!pillObj) throw new Error('no pill');
  const px = pillObj.cell.x, py = pillObj.cell.y;

  // Open grass around the pill so the tank can fire + drive on (leave the pill tile intact).
  for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }

  // Friendly, damaged pill — reclaim (pickup), not repair.
  const t = world.player;
  pillObj.team = t.team;
  pillObj.armour = 8;

  // Tank starts ADJACENT (1 tile away in the given direction), healthy, well-stocked.
  const tankTX = px + dir[0], tankTY = py + dir[1];
  t.onBoat = false;
  t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 60; t.reload = 0;

  const m = maps();
  let tickN = 0;
  const a4: any = brainOpen(buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m));

  const startArm = pillObj.armour;
  let minArm = pillObj.armour;
  let collected = false;

  for (let i = 0; i < 600; i++) {
    const state = buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m);
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;

    const pill = (a4.pills ?? []).find((p: any) => (p.tileX & 0xFF) === px && (p.tileY & 0xFF) === py);
    if (pill) { a4.pillToFixTarget = pill; goalFixPill(a4, state); }
    applyControls(t, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick();

    if (typeof pillObj.armour === 'number') minArm = Math.min(minArm, pillObj.armour);
    const carried = t.getCarryingPillboxes ? t.getCarryingPillboxes().length : 0;
    if (pillObj.inTank || carried > 0) { collected = true; break; }
  }

  return { startArm, minArm, collected };
}

describe('FixPill reclaim — point-blank (adjacent) must still fire', () => {
  const DIRS: Record<string, [number, number]> = {
    north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  };
  for (const [name, dir] of Object.entries(DIRS)) {
    it(`shoots the pill down from the ${name} neighbour`, () => {
      const r = run(1000, dir);
      // eslint-disable-next-line no-console
      console.log(`[reclaim-adj] ${name} start=${r.startArm} min=${r.minArm} collected=${r.collected}`);
      // The reclaim must make progress: the pill is driven to 0 (then collected). A freeze
      // leaves minArm === startArm (never fired).
      expect(r.minArm).toBe(0);
    });
  }
});
