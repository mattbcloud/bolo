import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// Diagnose the noRoute stalls: run the deaths seed set, count ticks where the brain
// is stuck noLocalRouteFlag=1, and dump the [NOROUTE] reason (heap overflow? genuinely
// unreachable? wet path available?). __NOROUTE_DBG__ makes computePath log on null.
(globalThis as any).__BRAIN_DBG__ = false;
(globalThis as any).__NOROUTE_DBG__ = true;

describe('noroute diagnostic', () => {
  it('reports noRoute stall ticks + reasons over seeds', () => {
    const trials = 8, ticks = 5000, baseSeed = 1000;
    let noRouteTicks = 0, totalTicks = 0;
    let overflowNulls = 0, genuineNulls = 0;
    for (let k = 0; k < trials; k++) {
      const world = bootHeadlessWorld(baseSeed + k * 7919);
      const a4: any = enableBrain(world);
      placeTank(world, 115, 109, false);
      let prevNull = 0;
      for (let i = 0; i < ticks; i++) {
        world.tick();
        totalTicks++;
        if (a4.noLocalRouteFlag) noRouteTicks++;
        // detect a fresh null compute by overflow flag
        if (a4.noLocalRouteFlag && !prevNull) {
          if (a4.__navHeapOverflow) overflowNulls++; else genuineNulls++;
        }
        prevNull = a4.noLocalRouteFlag;
      }
    }
    console.log(`[noroute] noRouteTicks=${noRouteTicks}/${totalTicks} (${(100*noRouteTicks/totalTicks).toFixed(1)}%) ` +
      `freshNulls: overflow=${overflowNulls} genuine=${genuineNulls}`);
  });
});
