import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * ACCEPTANCE TEST — "smartly go after objectives."
 *
 * The brain fires at and damages pills but (currently) never commits to
 * finishing+capturing one — it thrashes between targets and captures nothing.
 * This test asserts the end goal: capture at least one pill in a bounded run.
 *
 * EXPECTED: RED now (0 captures). GREEN once target-commitment is fixed.
 */
describe('objectives: the brain captures pills', () => {
  it('captures at least one pill within 6000 ticks from a land start', () => {
    const world = bootHeadlessWorld();
    const a4 = enableBrain(world);
    placeTank(world, 115, 109, false); // land corridor, full shells

    const myTeam = world.player.team;
    let captures = 0;
    const owned = new Set<any>();

    for (let tick = 0; tick < 6000; tick++) {
      world.tick();
      for (const p of (world.map.pills ?? [])) {
        const ownedByMe = p.owner === myTeam || p.team === myTeam;
        const key = p.cell ? `${p.cell.x},${p.cell.y}` : `${p.x},${p.y}`;
        if (ownedByMe && !owned.has(key)) { owned.add(key); captures++; }
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[objectives] team=${myTeam} pillsCaptured=${captures} finalGoal=${a4.currentGoal} ` +
      `finalTile=(${a4.tankTileX},${a4.tankTileY}) shells=${world.player.shells}`);

    expect(captures, 'brain should capture at least one pill').toBeGreaterThanOrEqual(1);
  });
});
