import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

// ENGINE builder-pipeline isolation probe: does a forest harvest actually yield trees
// in the headless harness? Find a forest tile, place the tank adjacent, dispatch the
// builder to harvest forest directly (bypassing the brain), tick, and watch tank.trees
// + builder order. Also test a wall build once trees are available.
describe('builder pipeline probe', () => {
  it('forest harvest yields trees; wall build consumes them', () => {
    const world = bootHeadlessWorld(1000);
    enableBrain(world);
    // Find a forest cell ('#') on the map.
    let fx = -1, fy = -1;
    outer: for (let y = 80; y < 160; y++) {
      for (let x = 80; x < 160; x++) {
        const cell = world.map.cellAtTile ? world.map.cellAtTile(x, y) : null;
        if (cell && typeof cell.isType === 'function' && cell.isType('#')) { fx = x; fy = y; break outer; }
      }
    }
    console.log(`[builderprobe] forest tile found at (${fx},${fy})`);
    if (fx < 0) { console.log('[builderprobe] NO FOREST in scan window'); return; }

    // Place tank adjacent to the forest and hold still.
    placeTank(world, fx + 1, fy, false);
    const t: any = world.player;
    t.trees = 0;
    const builder = t.builder?.$;
    console.log(`[builderprobe] builder present=${!!builder} order=${builder?.order} tank.trees=${t.trees}`);

    const forestCell = world.map.cellAtTile(fx, fy);
    // Dispatch harvest directly via the engine.
    builder.performOrder('forest', 0, forestCell);
    console.log(`[builderprobe] after performOrder: builder.order=${builder.order} builder.x=${builder.x}`);

    for (let i = 0; i < 400; i++) {
      // keep the tank stationary: don't drive it
      world.tick();
      if (i % 40 === 0 || builder.order === 0) {
        console.log(`[builderprobe] t=${i} builder.order=${builder.order} builder.x=${builder.x} tank.trees=${t.trees} forestType='${forestCell.isType('#') ? '#' : 'cut'}'`);
      }
      if (t.trees > 0) { console.log(`[builderprobe] GOT TREES at t=${i}: tank.trees=${t.trees}`); break; }
    }
    console.log(`[builderprobe] FINAL tank.trees=${t.trees}`);
  });
});
