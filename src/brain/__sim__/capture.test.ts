import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/** Does the brain capture a nearly/fully-neutralised pill when healthy and close? */
describe('capture-after-neutralize', () => {
  for (const startArmour of [0, 1, 3]) {
    it(`captures an open pill pre-set to armour ${startArmour}`, () => {
      const world = bootHeadlessWorld(1000);
      const a4: any = enableBrain(world);
      const isOpen = (tx: number, ty: number) => {
        const c = world.map.cellAtTile(tx, ty)?.type?.ascii;
        return c === '.' || c === ' ' || c === '=' || c === '%';
      };
      let pill: any = null, best = -1;
      for (const p of world.map.pills ?? []) {
        const c = p.cell; if (!c || p.armour <= 0) continue;
        let open = 0;
        for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (isOpen(c.x + dx, c.y + dy)) open++;
        if (open > best) { best = open; pill = p; }
      }
      const px = pill.cell.x, py = pill.cell.y;
      placeTank(world, px + 4, py + 3, false);
      const t = world.player;
      t.armour = 40; t.shells = 40;
      pill.armour = startArmour;

      let capturedAt = -1;
      for (let i = 0; i < 1200; i++) {
        world.tick();
        if ((pill.team === t.team || pill.owner === t.team) && capturedAt < 0) { capturedAt = i; break; }
      }
      // eslint-disable-next-line no-console
      console.log(`[cap] startArm=${startArmour} captured=${capturedAt >= 0 ? `YES@${capturedAt}` : 'NO'} ` +
        `pillArmEnd=${pill.armour} pillTeam=${pill.team} tankArm=${t.armour} ` +
        `tankTile=(${a4.tankTileX},${a4.tankTileY}) pill=(${px},${py})`);
    });
  }
});
