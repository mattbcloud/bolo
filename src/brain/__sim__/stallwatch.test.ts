import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain } from './harness';

// Repro for the LIVE "tank plays fine for 10+ min then freezes on GetPill" stall: run the full brain
// in the real world for a long stretch and watch for a tank that stops moving while a NAVIGATION goal
// (GetPill/GetBase/GetMan/KillTank/Refuel-transit) is active with a valid route — i.e. spd≈0 stuck on
// the same tile for a long time. When detected, dump the accumulated a4 state that could deadlock the
// follower (boat latch, nav path index, stall block, cover cool/hold, refuel state) so the root cause
// is visible without needing the exact live map. This is a diagnostic harness, not a pass/fail gate.
(globalThis as any).__BRAIN_DBG__ = false;

const GOALS = ['PlacePill', 'Explore', 'FixPill', 'GetBase', 'GetMan', 'GetPill',
               'KillBase', 'KillMan', 'KillTank', 'Refuel', 'TourBases'];

function run(seed: number, ticks: number) {
  const world = bootHeadlessWorld(seed);
  const t: any = world.player;
  const a4: any = enableBrain(world);

  let sameTileSince = 0, prevTX = -1, prevTY = -1;
  const stalls: any[] = [];
  let lastStallReportTick = -99999;

  for (let i = 0; i < ticks; i++) {
    world.tick();
    if (t.armour === 255) { prevTX = -1; sameTileSince = i; continue; }   // dead → skip
    const tx = (t.x >> 8) & 0xFF, ty = (t.y >> 8) & 0xFF;
    if (tx === prevTX && ty === prevTY) {
      // stuck on the same tile: flag if it persists on a MOVEMENT goal (not refuel-sit-on-base)
      const goal = a4.currentGoal;
      const onBase = (goal === 9 && a4.refuelState === 4);        // legitimately sitting to refuel
      const isNavGoal = goal === 3 || goal === 4 || goal === 5 || goal === 8 || (goal === 9 && !onBase);
      if (isNavGoal && (i - sameTileSince) > 600 && (i - lastStallReportTick) > 600) {
        lastStallReportTick = i;
        stalls.push({
          tick: i, stuckTicks: i - sameTileSince, goal: GOALS[goal] ?? goal, tile: `(${tx},${ty})`,
          spd: (t.speed ?? 0).toFixed?.(1), armour: t.armour, shells: t.shells,
          boatNeeded: a4.boatNeeded, onBoat: t.onBoat, navPathIndex: a4.navPathIndex,
          navPathLen: a4.navPath ? a4.navPath.length : 0,
          navStallBlock: a4.navStallBlockedTile, noLocalRoute: a4.noLocalRouteFlag,
          refuelState: a4.refuelState, coverCoolUntil: a4.coverCoolUntil, coverFireHold: a4.coverFireHold,
          coverTilePill: a4.coverTilePill, boatFailUntil: a4.boatFailedUntilTick,        });
      }
    } else {
      prevTX = tx; prevTY = ty; sameTileSince = i;
    }
  }
  return stalls;
}

describe('extended-play stall watchdog (GetPill/GetBase freeze repro)', () => {
  it('runs long games and reports any nav-goal freeze with accumulated state', () => {
    const seeds = [1000, 8919, 16838, 24757];
    const TICKS = 40000;   // ~27 min of play at 25 tps
    let total = 0;
    for (const seed of seeds) {
      const stalls = run(seed, TICKS);
      total += stalls.length;
      for (const s of stalls) {
        // eslint-disable-next-line no-console
        console.log(`[STALL seed${seed}] t=${s.tick} ${s.goal} stuck ${s.stuckTicks}t @${s.tile} spd=${s.spd} ` +
          `arm=${s.armour} sh=${s.shells} boatNeeded=${s.boatNeeded} onBoat=${s.onBoat} navIdx=${s.navPathIndex}/${s.navPathLen} ` +
          `stallBlk=${s.navStallBlock} noRoute=${s.noLocalRoute} refuelSt=${s.refuelState} ` +
          `coolUntil=${s.coverCoolUntil} fireHold=${s.coverFireHold} covPill=${s.coverTilePill} `);
      }
      if (stalls.length === 0) {
        // eslint-disable-next-line no-console
        console.log(`[STALL seed${seed}] no nav-goal freeze in ${TICKS} ticks`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[STALL] TOTAL freezes across ${seeds.length} long games = ${total}`);
  });
});
