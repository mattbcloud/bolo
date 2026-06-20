import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const G: Record<number, string> = {
  0:'PlacePill',1:'Explore',2:'FixPill',3:'GetBase',4:'GetMan',5:'GetPill',
  6:'KillBase',7:'KillMan',8:'KillTank',9:'Refuel',10:'TourBases',12:'NoGoal',
};

/** When the tank parks at one tile for a while, dump nav/goal diagnostics to see WHY. */
describe('stall mechanism trace', () => {
  it('logs nav state during long stalls', () => {
    for (const seed of [8919, 1000]) {
      const world = bootHeadlessWorld(seed);
      const a4: any = enableBrain(world);
      placeTank(world, 115, 109, false);
      const t = world.player;
      let prevTile = -1, stallStart = 0, logged = 0;
      // eslint-disable-next-line no-console
      console.log(`=== seed ${seed} ===`);
      for (let i = 0; i < 4000; i++) {
        world.tick();
        const tile = (a4.tankTileY << 8) | a4.tankTileX;
        if (tile !== prevTile) { prevTile = tile; stallStart = i; continue; }
        const dur = i - stallStart;
        // log a few snapshots into a sustained stall
        if (dur > 150 && (dur % 300 === 0) && logged < 14) {
          logged++;
          const goal = G[a4.currentGoal] ?? a4.currentGoal;
          // current goal target tile (best-effort)
          let tgt = '—';
          if (a4.currentGoal === 3 && a4.baseToGetTarget) tgt = `base(${a4.baseToGetTarget.tileX},${a4.baseToGetTarget.tileY}) d=${(a4.baseToGetTarget.distToTank>>8)}tx`;
          else if (a4.currentGoal === 5 && a4.pillToGetTarget) tgt = `pill(${a4.pillToGetTarget.tileX},${a4.pillToGetTarget.tileY})`;
          const npLen = a4.navPath ? a4.navPath.length : 0;
          // eslint-disable-next-line no-console
          console.log(`  t=${i} stall=${dur}t tile=(${a4.tankTileX},${a4.tankTileY}) goal=${goal} ${tgt} ` +
            `navCache=${a4.navCacheValid} noRoute=${a4.noLocalRouteFlag} navPathLen=${npLen} ` +
            `idx=${a4.navPathIndex} blockedTile=${a4.navStallBlockedTile===0xFFFF?'-':a4.navStallBlockedTile} ` +
            `spd=${t.speed} s=0x${(a4.steeringWord>>>0).toString(16)} f=0x${(a4.firingWord>>>0).toString(16)} arm=${t.armour}`);
        }
      }
    }
  });
});
