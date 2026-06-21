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
 * Reclaim a FRIENDLY pill the tank did NOT place: the brain should shoot it down to
 * armour 0 and drive onto its cell to COLLECT it (inTank), NOT repair it in place.
 * Drives goalFixPill directly with pillToFixTarget set, isolating the reclaim branch
 * from goal arbitration (selfPlacedPillTiles is empty → not self-placed → reclaim).
 */
function run(seed: number) {
  const world = bootHeadlessWorld(seed);
  const pillObj = (world.map.pills ?? []).find((p: any) => p.armour > 0 && p.cell);
  if (!pillObj) throw new Error('no pill');
  const px = pillObj.cell.x, py = pillObj.cell.y;

  // Open grass around the pill so the tank can approach + drive on.
  for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) {
    const c = world.map.cellAtTile(px + dx, py + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }

  // Make the pill FRIENDLY (same team as the tank) and damaged — the case the user
  // says should be a pickup, not a repair.
  const t = world.player;
  pillObj.team = t.team;
  pillObj.armour = 8;

  // Tank ~5 tiles away, healthy, well-stocked.
  const tankTX = px + 5, tankTY = py;
  t.onBoat = false;
  t.x = tileToBWorld(tankTX); t.y = tileToBWorld(tankTY);
  t.cell = world.map.cellAtWorld(t.x, t.y);
  t.shells = 999999; t.armour = 60; t.reload = 0;

  const m = maps();
  let tickN = 0;
  const a4: any = brainOpen(buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m));

  const startArm = pillObj.armour;
  let maxArm = pillObj.armour;        // tracks any repair (armour climbing)
  let minArm = pillObj.armour;
  let collected = false;
  let collectedAt = -1;

  for (let i = 0; i < 1200; i++) {
    const state = buildBrainState(t, world.map, world.tanks ?? [], tickN++, ...m);
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;

    const pill = (a4.pills ?? []).find((p: any) => (p.tileX & 0xFF) === px && (p.tileY & 0xFF) === py);
    if (pill) {
      a4.pillToFixTarget = pill;
      goalFixPill(a4, state);
    }
    applyControls(t, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick();

    if (typeof pillObj.armour === 'number') { maxArm = Math.max(maxArm, pillObj.armour); minArm = Math.min(minArm, pillObj.armour); }
    const carried = t.getCarryingPillboxes ? t.getCarryingPillboxes().length : 0;
    if (pillObj.inTank || carried > 0) { collected = true; collectedAt = i; break; }
  }

  return { startArm, maxArm, minArm, collected, collectedAt, reclaimFlag: a4.reclaimInProgress };
}

describe('FixPill reclaim — pick up a non-self-placed friendly pill', () => {
  it('collects the pill instead of repairing it', () => {
    const rows = [1000, 8919, 16838].map((seed) => {
      const r = run(seed);
      // eslint-disable-next-line no-console
      console.log(`[reclaim] seed=${seed} start=${r.startArm} min=${r.minArm} max=${r.maxArm} ` +
        `collected=${r.collected} at=${r.collectedAt} reclaimFlag=${r.reclaimFlag}`);
      return r;
    });
    // Reclaim engaged (not repair): the pill was driven DOWN to 0, never repaired up.
    for (const r of rows) {
      expect(r.reclaimFlag).toBe(1);
      expect(r.maxArm).toBeLessThanOrEqual(r.startArm);  // never repaired upward
    }
    // At least one seed should fully collect within the window.
    expect(rows.some((r) => r.collected)).toBe(true);
  });
});
