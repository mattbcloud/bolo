import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, placeTank, runNavOnlyScenario } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

// Boat-navigation regression. Goal: make the river network a viable way to cross Everard.
// We measure each leg with runNavOnlyScenario (drives navigateToCoords in isolation) and report
// boat metrics: a clean crossing is reached=true with ~1 board + ~1 disembark and most of the
// trip ridden onBoat; many board/disembark transitions = acquire/disembark thrash.
//
// Crossings discovered from the terrain dump (pure river ' ', no swamp):
//   y=146: land(117) .. river(118-128) .. land(129)   — 11-tile crossing
//   y=152: land(128) .. river(129-136) .. land(137)   — 8-tile crossing
//   y=124: land(98)  .. river(99-107)  .. land(108)   — 9-tile crossing

interface Leg { name: string; ax: number; ay: number; bx: number; by: number; onBoat: boolean }

const LEGS: Leg[] = [
  { name: 'cross-y146-11t', ax: 119, ay: 146, bx: 130, by: 146, onBoat: true },
  { name: 'cross-y152-8t',  ax: 130, ay: 152, bx: 138, by: 152, onBoat: true },
  { name: 'cross-y124-9t',  ax: 100, ay: 124, bx: 109, by: 124, onBoat: true },
];

describe('boat navigation: river crossings', () => {
  for (const leg of LEGS) {
    it(`${leg.name}: rides the river and disembarks`, () => {
      const world = bootHeadlessWorld();
      placeTank(world, leg.ax, leg.ay, leg.onBoat);

      const r = runNavOnlyScenario(world, leg.bx, leg.by, { maxTicks: 2000 });

      // eslint-disable-next-line no-console
      console.log(`[${leg.name}] reached=${r.reached} t=${r.ticksToReach} ` +
        `final=(${r.a4.tankTileX},${r.a4.tankTileY}) board=${r.boardCount} ` +
        `disembark=${r.disembarkCount} onBoatTicks=${r.ticksOnBoat} ` +
        `stalls=${r.stuckEpisodes} recomputes=${r.pathRecomputes} bends=${r.maxBends}`);

      expect(r.reached).toBe(true);
    });
  }
});
