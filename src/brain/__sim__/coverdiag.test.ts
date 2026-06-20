import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/** Watch one full-brain engagement: does the tank get trees, build a wall, fire from cover? */
describe('cover logistics diagnostic', () => {
  it('logs tree/build/wall/capture activity over a run', () => {
    const world = bootHeadlessWorld(1000);
    const a4 = enableBrain(world);
    placeTank(world, 115, 109, false);
    const t = world.player;

    let buildDispatches = 0, forestDispatches = 0, wallTilesBuilt = 0, maxTrees = 0;
    const wallsSeen = new Set<string>();
    // Wrap buildOrder to count dispatches.
    const origBuild = (world as any).buildOrder.bind(world);
    (world as any).buildOrder = (action: string, trees: number, cell: any) => {
      if (action === 'building') buildDispatches++;
      if (action === 'forest') forestDispatches++;
      return origBuild(action, trees, cell);
    };

    for (let i = 0; i < 5000; i++) {
      world.tick();
      maxTrees = Math.max(maxTrees, t.trees ?? 0);
      // count wall tiles that exist near any pill
      if (i % 200 === 0) {
        for (const p of world.map.pills ?? []) {
          const c = p.cell; if (!c) continue;
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
            const cell = world.map.cellAtTile(c.x + dx, c.y + dy);
            if (cell?.isType('|')) wallsSeen.add(`${c.x + dx},${c.y + dy}`);
          }
        }
      }
    }
    wallTilesBuilt = wallsSeen.size;
    let captured = 0;
    for (const p of world.map.pills ?? []) if (p.team === t.team || p.owner === t.team) captured++;
    // eslint-disable-next-line no-console
    console.log(`[diag] buildDispatches=${buildDispatches} forestDispatches=${forestDispatches} ` +
      `maxTrees=${maxTrees} wallTilesNearPills=${wallTilesBuilt} captured=${captured} ` +
      `endArmour=${t.armour} endTrees=${t.trees}`);
  });
});
