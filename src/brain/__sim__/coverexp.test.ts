import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';
import { checkBarriers } from '../combat';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * Cover-exposure diagnostic. During GetPill within pill range, measure how often
 * the tank actually has a shell-blocking barrier between it and the pill centre
 * (cover present) vs none (exposed), and attribute armour loss to each. If the
 * tank is overwhelmingly EXPOSED while in range — and takes its damage there —
 * the cover logistics (wall not built/maintained in time) is the death driver,
 * and pre-building cover before slugging it out should help.
 */
function run(trials = 30, ticks = 5000, baseSeed = 1000) {
  let inRange = 0, covered = 0, exposed = 0;
  let dmgCovered = 0, dmgExposed = 0;

  for (let k = 0; k < trials; k++) {
    const world = bootHeadlessWorld(baseSeed + k * 7919);
    const a4: any = enableBrain(world);
    placeTank(world, 115, 109, false);
    const t: any = world.player;
    let prevArm = t.armour;

    for (let i = 0; i < ticks; i++) {
      world.tick();
      const arm = t.armour;
      const dmg = (arm !== 255 && arm < prevArm) ? prevArm - arm : 0;

      // GetPill (goal 5) with a target, tank alive, within attack range (<=7.75tx).
      const pill = a4.pillToGetTarget;
      if (a4.currentGoal === 5 && pill && arm !== 255 && t.x != null) {
        const pillCx = ((pill.tileX & 0xFF) << 8) + 128;
        const pillCy = ((pill.tileY & 0xFF) << 8) + 128;
        const dist = Math.hypot(t.x - pillCx, t.y - pillCy);
        if (dist <= 1984) {                        // 0x07C0
          inRange++;
          const hasCover = checkBarriers(a4, t.x, t.y, pillCx, pillCy) > 0;
          if (hasCover) { covered++; dmgCovered += dmg; }
          else { exposed++; dmgExposed += dmg; }
        }
      }
      prevArm = arm;
    }
  }
  return { inRange, covered, exposed, dmgCovered, dmgExposed };
}

describe('cover-exposure diagnostic', () => {
  it('measures covered vs exposed in-range GetPill time + damage', () => {
    const r = run();
    const pct = (n: number) => r.inRange ? (100 * n / r.inRange).toFixed(0) : '0';
    // eslint-disable-next-line no-console
    console.log(`[coverexp] inRangeTicks=${r.inRange} covered=${r.covered}(${pct(r.covered)}%) ` +
      `exposed=${r.exposed}(${pct(r.exposed)}%)`);
    // eslint-disable-next-line no-console
    console.log(`[coverexp] armourLost  covered=${r.dmgCovered}  exposed=${r.dmgExposed}  ` +
      `(${r.dmgExposed + r.dmgCovered > 0 ? (100 * r.dmgExposed / (r.dmgExposed + r.dmgCovered)).toFixed(0) : 0}% of in-range damage taken EXPOSED)`);
  });
});
