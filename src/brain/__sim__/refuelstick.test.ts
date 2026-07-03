import { describe, it, expect } from 'vitest';
import { A4State } from '../a4_state';
import { chooseRefuelBase } from '../goal_selectors';

// The tank must STAY on the base it's refuelling at until that base is empty, instead of switching
// to another base the moment its stock dips below the arrival threshold (15). That switching is why
// the red tank ping-ponged two bases and never topped up past ~15 armour.
describe('refuel base commit (stays put until the base is empty)', () => {
  function mkBase(tileX: number, tileY: number, stock: number, distTiles: number): any {
    return {
      isAlly: true, isEnemy: false, tileX, tileY, armor: stock,
      distToTank: distTiles * 256, oronaBase: { armour: stock, shells: stock },
    };
  }

  function run(homeStock: number) {
    const a4 = new A4State();
    a4.tankTileX = 50; a4.tankTileY = 50;
    const home = mkBase(50, 50, homeStock, 0);   // the base we're sitting on (low stock)
    const other = mkBase(57, 50, 40, 7);         // a full base 7 tiles away
    a4.bases = [home, other] as any;
    const state: any = { tank: { armor: 15, shells: 3 } };   // still needs fuel
    return { pick: chooseRefuelBase(a4, state), home, other };
  }

  it('commits to the current base while it still has stock, even below the 15 arrival threshold', () => {
    // Home base has only 8 stock (< 15) — the normal pick would skip it and send us 7 tiles away.
    const low = run(8);
    expect(low.pick).toBe(low.home);   // commit: stay and drain it
  });

  it('leaves for another base once the current one is empty', () => {
    const empty = run(0);
    expect(empty.pick).toBe(empty.other);   // nothing left here → go to the full base
  });
});
