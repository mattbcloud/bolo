import { describe, it, expect } from 'vitest';
import { A4State } from '../a4_state';
import { killManGoalCost, killTankGoalCost, killBaseGoalCost } from '../goal_selectors';

// A tank with 0 ammo can't kill anything, so KillMan/KillTank/KillBase must NOT win goal selection
// (else it endlessly circles an enemy it can't shoot and starves Refuel — the live "ammo=0 tank
// flip-flopping KillMan/KillTank, spinning in place" bug). They must yield (0xFFFF) at 0 ammo, and
// return a real (finite) cost once the tank has shells.
describe('kill goals yield when out of ammo', () => {
  const enemyTank: any = { active: true, isEnemy: true, attackable: true, distanceMetric: 1000 };
  const enemyMan: any  = { active: true, isEnemy: true, attackable: true, distanceMetric: 1000 };
  const enemyBase: any = { index: 0, isAlly: false, distToTank: 1000 };

  function setup(ammo: number) {
    const a4 = new A4State();
    a4.manToKillTarget  = enemyMan;
    a4.tankToKillTarget = enemyTank;
    a4.killBaseTarget   = enemyBase;
    const state: any = { tank: { ammo } };
    return { a4, state };
  }

  it('returns 0xFFFF at 0 ammo, finite with ammo', () => {
    const dry = setup(0);
    expect(killManGoalCost(dry.a4, dry.state)).toBe(0xFFFF);
    expect(killTankGoalCost(dry.a4, dry.state)).toBe(0xFFFF);
    expect(killBaseGoalCost(dry.a4, dry.state)).toBe(0xFFFF);

    const armed = setup(8);
    expect(killManGoalCost(armed.a4, armed.state)).toBeLessThan(0xFFFF);
    expect(killTankGoalCost(armed.a4, armed.state)).toBeLessThan(0xFFFF);
  });
});
