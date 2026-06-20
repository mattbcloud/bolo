import { describe, it } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank } from './harness';
import { directionTo } from '../pathfinding';

(globalThis as any).__BRAIN_DBG__ = false;

/** Trace steering during travel: heading vs desired waypoint dir, turn bits, tile path. */
describe('steering trace during travel', () => {
  it('logs heading/desired/turn over a travel window', () => {
    const world = bootHeadlessWorld(16838);
    const a4: any = enableBrain(world);
    placeTank(world, 115, 109, false);
    const t = world.player;

    const tiles: string[] = [];
    let lastLog = 0;
    for (let i = 0; i < 1500; i++) {
      world.tick();
      const moving = (t.speed ?? 0) > 4;
      const np = a4.navPath;
      if (!moving || !np || np.length < 2) continue;
      const idx = Math.min(a4.navPathIndex, np.length - 1);
      const wp = np[idx];
      const wpx = wp & 0xFF, wpy = (wp >> 8) & 0xFF;
      const wpBx = (wpx << 8) + 128, wpBy = (wpy << 8) + 128;
      const desired = directionTo(t.x, t.y, wpBx, wpBy) & 0xFF;
      const heading = a4.tankDirection & 0xFF;
      let d = (heading - desired + 256) & 0xFF; if (d > 128) d -= 256; // signed err
      const ccw = (a4.steeringWord & 0x04) || (a4.firingWord & 0x04);
      const cw = (a4.steeringWord & 0x08) || (a4.firingWord & 0x08);
      const turn = ccw && cw ? 'XX' : ccw ? 'CCW' : cw ? 'CW' : '--';
      if (i - lastLog >= 15) {
        lastLog = i;
        // eslint-disable-next-line no-console
        console.log(`t=${String(i).padStart(4)} tile=(${a4.tankTileX},${a4.tankTileY}) hdg=${heading} ` +
          `wp=(${wpx},${wpy}) want=${desired} err=${String(d).padStart(4)} turn=${turn.padEnd(3)} ` +
          `spd=${(t.speed).toFixed(0)} idx=${idx}/${np.length}`);
      }
      tiles.push(`${a4.tankTileX},${a4.tankTileY}`);
    }
    // detect loops: tiles visited multiple times in sequence
    const counts = new Map<string, number>();
    for (const tt of tiles) counts.set(tt, (counts.get(tt) ?? 0) + 1);
    const loopy = [...counts.entries()].filter(([, c]) => c >= 8).sort((a, b) => b[1] - a[1]).slice(0, 8);
    // eslint-disable-next-line no-console
    console.log(`[loops] tiles revisited >=8x while moving: ${loopy.map(([k, c]) => `${k}×${c}`).join('  ')}`);
  });
});
