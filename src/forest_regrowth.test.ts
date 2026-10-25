import { describe, it, expect } from 'vitest';

import { bootHeadlessWorld, placeTank } from './brain/__sim__/harness';
import { ForestRegrowth, REGROW_HOLD_TICKS, regrowScore } from './forest_regrowth';
import BoloWorldMixin from './world_mixin';

/**
 * Forest regrowth, as in the 1989 Bolo: the best-scoring candidate grows a tree once it has
 * stayed the best for REGROW_HOLD_TICKS (10 s). It runs in every authoritative world.
 */

/** A random source that always picks tile (x, y). */
const pick = (x: number, y: number) => {
  let n = 0;
  return () => ((n++ % 2 === 0 ? x : y) + 0.5) / 256;
};

/** A grass tile scoring exactly 1 (nothing on it, no forest or buildings around), at least
 *  3 tiles from every tile in `awayFrom`, so ringing one with forest can't touch another. */
function openGrass(world: any, awayFrom: any[] = []): any {
  for (let y = 2; y < 254; y++) {
    for (let x = 2; x < 254; x++) {
      const c = world.map.cellAtTile(x, y);
      if (awayFrom.some(o => Math.abs(o.x - x) < 3 && Math.abs(o.y - y) < 3)) continue;
      if (regrowScore(c) !== 1) continue;
      if (!c.isType('.')) continue;
      return c;
    }
  }
  throw new Error('no open grass');
}

/** Surround `cell` with forest. */
function ringWithForest(cell: any): void {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx || dy) cell.neigh(dx, dy).setType('#');
  }
}

describe('regrowScore', () => {
  it('a grass tile ringed by forest scores far above open grass', () => {
    const world = bootHeadlessWorld();
    const open = openGrass(world);
    const ringed = openGrass(world, [open]);
    ringWithForest(ringed);
    expect(regrowScore(open)).toBe(1);
    expect(regrowScore(ringed)).toBe(81);           // 1.0 × (1 + 8)²
  });

  it('weights terrain: swamp 0.5, crater and rubble 0.3, road 0.05, forest and water 0', () => {
    const world = bootHeadlessWorld();
    const c = openGrass(world);
    const scores: Record<string, number> = {};
    for (const t of ['~', '%', ':', '=', '#', ' ', '^', '|']) {
      c.setType(t);
      scores[t] = regrowScore(c);
    }
    expect(scores).toEqual({ '~': 0.5, '%': 0.3, ':': 0.3, '=': 0.05, '#': 0, ' ': 0, '^': 0, '|': 0 });
  });

  it('road in a built-up area scores at or below zero', () => {
    const world = bootHeadlessWorld();
    const c = openGrass(world);
    c.setType('=');
    c.neigh(1, 0).setType('|');
    c.neigh(-1, 0).setType('}');
    expect(regrowScore(c)).toBeCloseTo(0.05 - 2);
  });

  it('a base, pillbox, live tank or mine tile scores 0', () => {
    const world = bootHeadlessWorld();
    expect(regrowScore(world.map.bases[0].cell)).toBe(0);
    expect(regrowScore(world.map.pills[0].cell)).toBe(0);

    const mined = openGrass(world);
    mined.setType(null, true, 0);
    expect(regrowScore(mined)).toBe(0);

    const occupied = openGrass(world, [mined]);
    placeTank(world, occupied.x, occupied.y);
    expect(regrowScore(occupied)).toBe(0);
  });
});

describe('ForestRegrowth', () => {
  it('grows a tree once the best candidate has held for 500 ticks, not before', () => {
    const world = bootHeadlessWorld();
    const g = openGrass(world);
    const regrowth = new ForestRegrowth();
    const random = pick(g.x, g.y);

    regrowth.tick(world.map, random);                // g becomes the best
    expect(regrowth.best === g).toBe(true);
    for (let i = 1; i < REGROW_HOLD_TICKS; i++) {
      expect(regrowth.tick(world.map, random)).toBeNull();
    }
    expect(g.isType('.')).toBe(true);                // 499 ticks: not yet
    expect(regrowth.tick(world.map, random) === g).toBe(true);
    expect(g.isType('#')).toBe(true);                // 500: a tree
    expect(regrowth.best).toBeNull();                // and the search starts over
  });

  it('a better candidate replaces the best and restarts the clock', () => {
    const world = bootHeadlessWorld();
    const g = openGrass(world);
    const h = openGrass(world, [g]);
    ringWithForest(h);
    const regrowth = new ForestRegrowth();

    regrowth.tick(world.map, pick(g.x, g.y));
    for (let i = 0; i < 300; i++) regrowth.tick(world.map, pick(g.x, g.y));
    regrowth.tick(world.map, pick(h.x, h.y));        // h (81) beats g (1)
    expect(regrowth.best === h).toBe(true);
    for (let i = 1; i < REGROW_HOLD_TICKS; i++) regrowth.tick(world.map, pick(g.x, g.y));
    expect(g.isType('.')).toBe(true);
    expect(h.isType('.')).toBe(true);
    regrowth.tick(world.map, pick(g.x, g.y));
    expect(h.isType('#')).toBe(true);
    expect(g.isType('.')).toBe(true);
  });

  it('no tree grows on a candidate that a mine or a tank reaches during the hold', () => {
    for (const block of ['mine', 'tank']) {
      const world = bootHeadlessWorld();
      const g = openGrass(world);
      const regrowth = new ForestRegrowth();
      const random = pick(g.x, g.y);

      regrowth.tick(world.map, random);
      if (block === 'mine') g.setType(null, true, 0);
      else placeTank(world, g.x, g.y);
      for (let i = 0; i < REGROW_HOLD_TICKS; i++) regrowth.tick(world.map, random);

      expect([block, g.isType('#')]).toEqual([block, false]);
    }
  });
});

describe('growForest() in the worlds', () => {
  it('the offline world grows trees as it ticks', () => {
    const world = bootHeadlessWorld();
    const forest = () => { let n = 0; world.map.each((c: any) => { if (c.isType('#')) n++; }); return n; };
    const before = forest();
    for (let i = 0; i < 3000; i++) world.tick();     // 60 s
    expect(forest()).toBeGreaterThan(before);
  });

  it('a networked client never grows a tree', () => {
    const world = bootHeadlessWorld();
    const g = openGrass(world);
    const client: any = { authority: false, map: world.map, random: pick(g.x, g.y) };
    for (let i = 0; i <= REGROW_HOLD_TICKS + 1; i++) {
      expect(BoloWorldMixin.growForest.call(client)).toBeNull();
    }
    expect(g.isType('.')).toBe(true);
  });

  it('uses the world\'s own random source when it has one', () => {
    const world = bootHeadlessWorld();
    const g = openGrass(world);
    const server: any = { authority: true, map: world.map, random: pick(g.x, g.y) };
    for (let i = 0; i <= REGROW_HOLD_TICKS; i++) BoloWorldMixin.growForest.call(server);
    expect(g.isType('#')).toBe(true);
  });
});
