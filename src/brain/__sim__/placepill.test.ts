import { describe, it, expect } from 'vitest';
import { A4State } from '../a4_state';
import { placePillGoalCost } from '../goal_selectors';

// Tanks must DEPLOY captured pillboxes, not hoard them. Carrying 2+ → place the excess now (cost 1,
// wins over GetBase/Explore); carrying exactly 1 → keep it for the cover method while there's a
// pill to hunt, else place it. (Live bug: tanks driving around with 3+ undeployed pills.)
describe('captured pills get placed instead of hoarded', () => {
  function setup(pillsCarried: number, huntablePill: boolean) {
    const a4 = new A4State();
    a4.baseToBuildTarget = { tileX: 10, tileY: 10 } as any;   // a base to place at exists
    a4.pillToGetTarget = huntablePill
      ? ({ armour: 15, distToTank: 1500, defenderCount: 0, captureDifficulty: 0 } as any)
      : null;
    const state: any = { tank: { pillsCarried, ammo: 8 } };
    return { a4, state };
  }

  it('places the EXCESS when carrying 2+ even if there is a pill to hunt', () => {
    const { a4, state } = setup(3, true);
    expect(placePillGoalCost(a4, state)).toBe(1);   // don't hoard — deploy
  });

  it('reserves the single pill for cover while a pill is huntable', () => {
    const { a4, state } = setup(1, true);
    expect(placePillGoalCost(a4, state)).toBe(0xFFFE);   // keep 1 as cover
  });

  it('places the single pill when there is nothing to hunt with it', () => {
    const { a4, state } = setup(1, false);
    expect(placePillGoalCost(a4, state)).toBe(1);
  });

  it('cannot place with no base target', () => {
    const { a4, state } = setup(3, true);
    a4.baseToBuildTarget = null;
    expect(placePillGoalCost(a4, state)).toBe(0xFFFF);
  });
});
