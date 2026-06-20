import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';
import { resetStaticTerrainCache } from '../aindy_interface';

// Does a built wall become VISIBLE in the brain's worldMap? The brain caches a static
// terrain layer (aindy_interface _staticTerrainMap) and only overlays pills/bases each
// tick. Walls are terrain → if the cache is never invalidated on a build, the brain
// (and checkBarriers / cover detection) can NEVER see a wall it builds.
describe('built wall visibility in brain worldMap', () => {
  it('a built wall should appear in a4.worldMap', () => {
    const world = bootHeadlessWorld(1000);
    const a4: any = enableBrain(world);
    // Park the tank on open ground; find a buildable land tile next to it.
    placeTank(world, 110, 110, false);
    const t: any = world.player;
    t.trees = 10;
    world.tick();  // let buildBrainState populate worldMap once

    // Find a buildable ('.' grass / '=' road) tile adjacent to the tank.
    let bx = -1, by = -1;
    for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]] as const) {
      const c = world.map.cellAtTile(110 + dx, 110 + dy);
      if (c && !c.base && !c.pill && !c.isType('b','^','#','}','|',' ')) { bx = 110 + dx; by = 110 + dy; break; }
    }
    console.log(`[wallvis] build target (${bx},${by}) type='${world.map.cellAtTile(bx,by)?.type}'`);
    const buildCell = world.map.cellAtTile(bx, by);
    const before = a4.worldMap[(by << 8) | bx] & 0x0F;
    const builder = t.builder.$;
    builder.performOrder('building', 2, buildCell);
    console.log(`[wallvis] after performOrder builder.order=${builder.order} builder.x=${builder.x}`);

    // Tick until the cell actually becomes a wall ('|') in the REAL map.
    // Re-issue the order each tick if the builder returns to tank without building
    // (so a brain control write can't silently cancel it).
    let builtTick = -1;
    for (let i = 0; i < 400; i++) {
      if (builder.order === 0 && !buildCell.isType('|')) builder.performOrder('building', 2, buildCell);
      world.tick();
      if (buildCell.isType('|')) { builtTick = i; break; }
    }
    const realIsWall = buildCell.isType('|');
    const wmAfter = a4.worldMap[(by << 8) | bx] & 0x0F;

    // Now force a cache rebuild and re-sync, and check again.
    resetStaticTerrainCache();
    world.tick();
    const wmAfterReset = a4.worldMap[(by << 8) | bx] & 0x0F;

    console.log(`[wallvis] before=${before} realIsWall=${realIsWall}@${builtTick} ` +
      `worldMapAfterBuild=${wmAfter} worldMapAfterCacheReset=${wmAfterReset} (wall terrain=0)`);
  });
});
