import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, tileToBWorld } from './harness';

// Live bug: a low-armour tank parked 1 tile DIAGONALLY from its ally refuel base couldn't re-land
// on it (ctrl:ACC|CW spd=0, onCell=0 for 200+ ticks), even though it had refuelled on that same
// base earlier via an ORTHOGONAL approach. Reproduce: put an ally base with stock in a cleared
// arena, drop a low-armour tank on each of the 8 neighbours, and check it drives ONTO the base
// cell and refuels. Diagonal starts are the ones that failed live.
(globalThis as any).__BRAIN_DBG__ = false;

function run(seed: number, dx: number, dy: number) {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;

  // Pick an ally-able base, clear a grass arena around it, make it OUR team with full stock.
  const base: any = (world.map.bases ?? [])[0];
  const bx = base.cell?.x ?? base.x, by = base.cell?.y ?? base.y;
  for (let ex = -6; ex <= 6; ex++) for (let ey = -6; ey <= 6; ey++) {
    const c = world.map.cellAtTile(bx + ex, by + ey);
    if (c && !c.pill && c !== base.cell) c.setType('.');
  }
  base.team = 0; base.owner_idx = 0; base.armour = 90; base.shells = 90; base.mines = 0;
  // Neutralise other pills/bases so the tank isn't lured elsewhere.
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { if (b !== base) { b.team = 0; b.owner_idx = 0; } }

  // Low-armour tank on the (dx,dy) neighbour of the base → it must want to refuel and land on it.
  placeTank(world, bx + dx, by + dy, false);
  ai.armour = 10; ai.shells = 6; ai.team = 0;

  const a4: any = enableBrain(world);

  let onCellTicks = 0, landedAt = -1, maxArmour = ai.armour;
  for (let i = 0; i < 1200; i++) {
    world.tick();
    const onCell = ai.cell === base.cell;
    if (onCell) { onCellTicks++; if (landedAt < 0) landedAt = i; }
    if (ai.armour > maxArmour) maxArmour = ai.armour;
    if (ai.armour >= 40) break;   // fully refuelled → success
  }
  return { landedAt, onCellTicks, maxArmour, refuelled: maxArmour > 10 };
}

describe('refuel: land on a diagonally-adjacent base', () => {
  it('reaches the base cell and refuels from every neighbour (esp. diagonals)', () => {
    const neighbours: Array<[string, number, number]> = [
      ['N', 0, -1], ['S', 0, 1], ['E', 1, 0], ['W', -1, 0],
      ['NE', 1, -1], ['NW', -1, -1], ['SE', 1, 1], ['SW', -1, 1],
    ];
    let landed = 0, refuelled = 0;
    for (const [name, dx, dy] of neighbours) {
      const r = run(4242, dx, dy);
      if (r.landedAt >= 0) landed++;
      if (r.refuelled) refuelled++;
      // eslint-disable-next-line no-console
      console.log(`[refuel from ${name.padEnd(2)}] landedAt=${r.landedAt} onCellTicks=${r.onCellTicks} ` +
        `maxArmour=${r.maxArmour} refuelled=${r.refuelled}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[refuel] landed=${landed}/8 refuelled=${refuelled}/8`);
    expect(landed, 'the tank must reach the base cell from every neighbour, including diagonals').toBe(8);
  });
});
