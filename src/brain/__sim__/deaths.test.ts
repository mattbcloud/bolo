import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const GOAL: Record<number, string> = {
  0:'PlacePill',1:'Explore',2:'FixPill',3:'GetBase',4:'GetMan',5:'GetPill',
  6:'KillBase',7:'KillMan',8:'KillTank',9:'Refuel',10:'TourBases',12:'NoGoal',
};

/**
 * Death-cause diagnostic over the eval seeds. Classifies each death:
 *   COMBAT  — armour was low (<=12) just before → killed by accumulated shell/mine fire.
 *   DROWN   — armour was healthy (>12) then jumped to the 255 dead-sentinel in one tick
 *             with no gradual decline → sank in deep water / boat sink.
 * Also records the goal + onBoat at the moment of death, and how many ticks the
 * armour had been declining (sustained-fire duration). Run with PP_LOOKAHEAD to
 * match the follower under test; hand-revert the follower for the A/B.
 */
function run(trials = 30, ticks = 5000, baseSeed = 1000) {
  const causes = { COMBAT: 0, DROWN: 0 };
  const byGoal: Record<string, number> = {};
  let onBoatDeaths = 0;
  let totalDeaths = 0;

  for (let k = 0; k < trials; k++) {
    const world = bootHeadlessWorld(baseSeed + k * 7919);
    const a4: any = enableBrain(world);
    placeTank(world, 115, 109, false);
    const t: any = world.player;

    let prevArmour = t.armour;
    let declineStart = -1;                 // tick armour last started dropping
    let lastGoal = a4.currentGoal, lastBoat = !!t.onBoat;

    for (let i = 0; i < ticks; i++) {
      world.tick();
      const a = t.armour;
      if (a !== 255) {
        // Track armour decline window + last-known live context.
        if (a < prevArmour && declineStart < 0) declineStart = i;
        if (a >= prevArmour) declineStart = -1;          // healed/steady → reset
        lastGoal = a4.currentGoal; lastBoat = !!t.onBoat;
      } else if (prevArmour !== 255) {
        // Death transition this tick.
        totalDeaths++;
        const cause = prevArmour <= 12 ? 'COMBAT' : 'DROWN';
        causes[cause]++;
        const g = GOAL[lastGoal] ?? String(lastGoal);
        byGoal[`${cause}:${g}`] = (byGoal[`${cause}:${g}`] ?? 0) + 1;
        if (lastBoat) onBoatDeaths++;
        declineStart = -1;
      }
      prevArmour = a;
    }
  }
  return { totalDeaths, causes, onBoatDeaths, byGoal, trials };
}

describe('death-cause diagnostic', () => {
  it('classifies deaths over the eval seeds', () => {
    const r = run();
    const perTrial = (r.totalDeaths / r.trials).toFixed(2);
    // eslint-disable-next-line no-console
    console.log(`[deaths] total=${r.totalDeaths} perTrial=${perTrial} ` +
      `COMBAT=${r.causes.COMBAT} DROWN=${r.causes.DROWN} onBoat=${r.onBoatDeaths}`);
    const top = Object.entries(r.byGoal).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`).join('  ');
    // eslint-disable-next-line no-console
    console.log(`[deaths] byCause:goal  ${top}`);
  });
});
