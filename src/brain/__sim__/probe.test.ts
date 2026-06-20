import { describe, it } from 'vitest';
import { bootHeadlessWorld, tileToBWorld } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/** Probe-only: understand pill/shell/damage plumbing headless. Not an assertion suite. */
describe('cover engagement probe', () => {
  it('lists pills and their teams', () => {
    const world = bootHeadlessWorld();
    const pills = world.map.pills ?? [];
    // eslint-disable-next-line no-console
    console.log(`[probe] ${pills.length} pills`);
    for (const p of pills.slice(0, 8)) {
      const c = p.cell ?? p;
      // eslint-disable-next-line no-console
      console.log(`  pill tile=(${c.x},${c.y}) armour=${p.armour} team=${p.team} ` +
        `speed=${p.speed} inWorld=${!!p.world} x=${p.x} y=${p.y}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[probe] world.tanks=${world.tanks?.length} player.team=${world.player.team}`);
  });

  it('tank fires a shell and damages a clear-LOS pill; pill fires back', () => {
    const world = bootHeadlessWorld();
    const pills = world.map.pills ?? [];
    // pick a pill with armour>0
    const pill = pills.find((p: any) => p.armour > 0 && p.cell);
    if (!pill) { console.log('[probe] no armoured pill'); return; }
    const px = pill.cell.x, py = pill.cell.y;

    // Clear a horizontal corridor to grass so shells travel unobstructed.
    for (let dx = -8; dx <= 0; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = world.map.cellAtTile(px + dx, py + dy);
        if (cell && !cell.pill && !cell.base) cell.setType('.');
      }
    }

    // Place tank 6 tiles due west (negative x), facing east (direction toward pill).
    const t = world.player;
    t.onBoat = false;
    t.x = tileToBWorld(px - 6);
    t.y = tileToBWorld(py);
    t.cell = world.map.cellAtWorld(t.x, t.y);
    // direction 0 in this engine: shell moves cos(radians),sin(radians) with
    // radians=(256-dir)*2pi/256. dir=0 → radians=2pi → cos=1,sin=0 → +x (east). Good.
    t.direction = 0;
    t.shells = 40; t.armour = 40; t.reload = 0;

    const pillArmour0 = pill.armour, tankArmour0 = t.armour;
    let shotsFired = 0, prevShells = t.shells;
    for (let i = 0; i < 400; i++) {
      t.shooting = true;          // fire in hull direction, stationary
      t.accelerating = false; t.braking = true;
      world.tick();
      if (t.shells < prevShells) { shotsFired++; prevShells = t.shells; }
    }
    // eslint-disable-next-line no-console
    console.log(`[probe] over 400t: shotsFired=${shotsFired} ` +
      `pill ${pillArmour0}->${pill.armour} (dealt ${pillArmour0 - pill.armour}) ` +
      `tank ${tankArmour0}->${t.armour} (taken ${(t.armour === 255 ? 'DIED' : tankArmour0 - t.armour)}) ` +
      `tankpos=(${(t.x/256)|0},${(t.y/256)|0})`);
  });

  it('a wall between tank and pill blocks the tank shell', () => {
    const world = bootHeadlessWorld();
    const pills = world.map.pills ?? [];
    const pill = pills.find((p: any) => p.armour > 0 && p.cell);
    if (!pill) return;
    const px = pill.cell.x, py = pill.cell.y;
    for (let dx = -8; dx <= 0; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = world.map.cellAtTile(px + dx, py + dy);
        if (cell && !cell.pill && !cell.base) cell.setType('.');
      }
    }
    // wall one tile west of the pill
    world.map.cellAtTile(px - 1, py).setType('|');

    const t = world.player;
    t.onBoat = false;
    t.x = tileToBWorld(px - 6); t.y = tileToBWorld(py);
    t.cell = world.map.cellAtWorld(t.x, t.y);
    t.direction = 0; t.shells = 40; t.armour = 40; t.reload = 0;
    const wall0 = world.map.cellAtTile(px - 1, py).type.ascii;
    const pillArmour0 = pill.armour;
    for (let i = 0; i < 400; i++) {
      t.shooting = true; t.accelerating = false; t.braking = true;
      world.tick();
    }
    const wallNow = world.map.cellAtTile(px - 1, py).type.ascii;
    // eslint-disable-next-line no-console
    console.log(`[probe] WALL test: pill ${pillArmour0}->${pill.armour} (dealt ${pillArmour0 - pill.armour}) ` +
      `wall '${wall0}'->'${wallNow}' tank armour ${t.armour}`);
  });
});
