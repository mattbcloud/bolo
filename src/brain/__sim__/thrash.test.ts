import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;
const GOAL_NAMES: Record<number, string> = {
  0:'PlacePill',1:'Explore',2:'FixPill',3:'GetBase',4:'GetMan',5:'GetPill',
  6:'KillBase',7:'KillMan',8:'KillTank',9:'Refuel',10:'TourBases',12:'NoGoal',
};

/** Diagnose circling + objective thrashing over a full-loop run. */
function run(seed: number, ticks = 4000) {
  const world = bootHeadlessWorld(seed);
  const a4: any = enableBrain(world);
  placeTank(world, 115, 109, false);
  const t = world.player;

  let prevGoal = -1, goalSwitches = 0;
  let prevTile = -1, stallStart = 0, stallEpisodes = 0, maxStall = 0;
  const tileVisits = new Map<number, number>();
  const turnConflicts = { n: 0 };
  let bothTurn = 0;
  const goalHist: Record<string, number> = {};

  for (let i = 0; i < ticks; i++) {
    world.tick();
    const g = a4.currentGoal;
    if (g !== prevGoal) { if (prevGoal >= 0) goalSwitches++; prevGoal = g; }
    goalHist[GOAL_NAMES[g] ?? g] = (goalHist[GOAL_NAMES[g] ?? g] ?? 0) + 1;

    const ccw = !!(a4.steeringWord & 0x04) || !!(a4.firingWord & 0x04);
    const cw  = !!(a4.steeringWord & 0x08) || !!(a4.firingWord & 0x08);
    if (ccw && cw) bothTurn++;

    const tile = (a4.tankTileY << 8) | a4.tankTileX;
    tileVisits.set(tile, (tileVisits.get(tile) ?? 0) + 1);
    if (tile === prevTile) {
      const dur = i - stallStart;
      if (dur > maxStall) maxStall = dur;
      if (dur === 150) stallEpisodes++;
    } else { prevTile = tile; stallStart = i; }
  }
  // revisits: tiles visited many times = circling
  const revisited = [...tileVisits.values()].filter((c) => c >= 20).length;
  const topGoals = Object.entries(goalHist).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, v]) => `${k}:${v}`).join(' ');
  return { seed, goalSwitches, stallEpisodes, maxStall, revisited, bothTurn, topGoals };
}

describe('routing/objective thrash diagnostic', () => {
  it('measures stalls/circling on current nav', () => {
    let sw = 0, st = 0, mx = 0, circ = 0;
    for (const seed of [1000, 8919, 16838]) {
      const r = run(seed);
      sw += r.goalSwitches; st += r.stallEpisodes; mx = Math.max(mx, r.maxStall); circ += r.revisited;
      // eslint-disable-next-line no-console
      console.log(`[thrash] seed=${r.seed} goalSw=${r.goalSwitches} stallEps=${r.stallEpisodes} ` +
        `maxStall=${r.maxStall}t circleTiles=${r.revisited} turnConflict=${r.bothTurn} | ${r.topGoals}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[thrash] TOTALS goalSw=${sw} stallEps=${st} maxStall=${mx} circleTiles=${circ}`);
  });
});
