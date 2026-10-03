// @vitest-environment node
import { describe, it, expect } from 'vitest';

import WorldMap from '../world_map';
import EverardIsland from '../client/everard';
import { decodeBase64 } from '../client/base64';
import { BoloServerWorld } from '../server/application';
import { FloodFill } from './flood_fill';

/**
 * Fix-list item 9: FloodFills multiplied exponentially across a crater field. A crater next to
 * two flooded tiles got two FloodFills; the second re-flooded the (already wet) tile and spread
 * again, so duplicates multiplied along every path through the field. A FloodFill that started on
 * a crater now does nothing once that crater has already flooded.
 */

/** The flood() before the fix, to measure against. */
function unfixedFlood(this: any): void {
  if (this.canGetWet()) {
    this.cell.setType(' ', false);
    this.spread();
  }
}

/**
 * A real server world with an N×N crater field framed by grass (deep sea counts as water, so the
 * frame keeps the scenario to one water tile), touching water at ONE corner only. The field's own
 * FloodFills expired dry long ago; the water gets in through the corner crater. The front then
 * spreads diagonally, and before the fix each crater collected one FloodFill per monotone path
 * from the corner, a binomial count: about C(2N, N) in total (923 for 6x6). Runs until no
 * FloodFill is left; returns how many were spawned and the final terrain of the area.
 */
function runCraterField(n: number, opts: { unfixed?: boolean; boatInsteadOfRiver?: boolean } = {}) {
  const world: any = new BoloServerWorld(WorldMap.load(decodeBase64(EverardIsland)));
  const x0 = 20, y0 = 20;   // open sea, well away from the island
  const cell = (x: number, y: number) => world.map.cellAtTile(x, y);
  for (let y = y0 - 2; y <= y0 + n + 1; y++) for (let x = x0 - 3; x <= x0 + n + 1; x++) cell(x, y).setType('.', false, -1);
  cell(x0 - 1, y0).setType(' ', false, -1);   // the one water tile, beside the corner crater
  for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) cell(x, y).setType('%', false, -1);

  const origFlood = FloodFill.prototype.flood;
  if (opts.unfixed) FloodFill.prototype.flood = unfixedFlood;
  let spawned = 0;
  const origSpawn = world.spawn.bind(world);
  world.spawn = (type: any, ...args: any[]) => {
    if (type === FloodFill) spawned++;
    return origSpawn(type, ...args);
  };
  try {
    world.spawn(FloodFill, cell(x0, y0));      // water reaches the corner crater
    const pending = () => world.objects.some((o: any) => o instanceof FloodFill);
    for (let t = 0; t < 20000 && pending(); t++) world.tick();
    expect(pending()).toBe(false);
  } finally {
    FloodFill.prototype.flood = origFlood;
  }

  let terrain = '';
  for (let y = y0 - 1; y <= y0 + n; y++) {
    for (let x = x0 - 2; x <= x0 + n; x++) terrain += cell(x, y).type.ascii;
    terrain += '\n';
  }
  return { spawned, terrain };
}

describe('flood fill across a crater field', () => {
  for (const n of [6, 8]) {
    it(`${n}x${n}: spawns at most a small multiple of N², and floods exactly as before`, () => {
      const before = runCraterField(n, { unfixed: true });
      const after = runCraterField(n);
      console.log(`[flood] ${n}x${n} crater field: FloodFills spawned ${before.spawned} before the fix, ${after.spawned} after`);
      expect(after.spawned).toBeLessThanOrEqual(3 * n * n);
      expect(after.spawned).toBeLessThan(before.spawned);
      expect(after.terrain).toBe(before.terrain);
      // Every crater ended up as water.
      expect(after.terrain).not.toContain('%');
    });
  }

  it('a sunk boat next to a crater still floods the crater', () => {
    const world: any = new BoloServerWorld(WorldMap.load(decodeBase64(EverardIsland)));
    const cell = (x: number, y: number) => world.map.cellAtTile(x, y);
    for (let y = 18; y <= 22; y++) for (let x = 18; x <= 24; x++) cell(x, y).setType('.', false, -1);
    for (let y = 18; y <= 22; y++) cell(19, y).setType(' ', false, -1);   // a river…
    cell(20, 20).setType('b', false, -1);   // …with a boat moored on its bank, about to be sunk
    cell(21, 20).setType('%', false, -1);   // the crater beside it
    cell(22, 20).setType('%', false, -1);   // and one more beyond, reached only by spreading

    cell(20, 20).takeExplosionHit();        // sinks the boat: 'b' -> ' ' and a FloodFill there
    expect(cell(20, 20).type.ascii).toBe(' ');
    for (let t = 0; t < 200 && world.objects.some((o: any) => o instanceof FloodFill); t++) world.tick();

    expect(cell(21, 20).type.ascii).toBe(' ');
    expect(cell(22, 20).type.ascii).toBe(' ');
  });
});
