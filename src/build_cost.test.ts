// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';

import { buildCost, buildCharge } from './build_cost';
import WorldMap from './world_map';
import EverardIsland from './client/everard';
import { decodeBase64 } from './client/base64';
import { BoloServerWorld } from './server/application';
import { Tank } from './objects/tank';
import { TILE_SIZE_WORLD } from './constants';
import * as net from './net';

/**
 * Fix-list item 1: the server charged whatever tree count a build order claimed, so an order sent
 * with 0 trees built walls, roads, boats and pillboxes for free. The server now prices the order
 * itself with buildCost(), the same function the client uses to show and send it.
 */

// ── Cells ────────────────────────────────────────────────────────────────────

let map: any;
beforeAll(() => {
  map = WorldMap.load(decodeBase64(EverardIsland));
  map.world = { tanks: [], mapChanged() {} };  // setType() reports here; no world needed
});

/** A fresh cell of a terrain type, optionally with a pill (at an armour) or a base on it. */
let nextX = 20;
function cell(type: string, extra: { pill?: number; base?: boolean } = {}): any {
  const c = map.cellAtTile(nextX++, 20);
  c.setType(type, false, -1);
  delete c.pill; delete c.base; c.mine = false;
  if (extra.pill !== undefined) c.pill = { armour: extra.pill };
  if (extra.base) c.base = {};
  return c;
}

describe('buildCost: the price list', () => {
  it('prices every action on a valid cell', () => {
    expect(buildCost('forest', cell('#'))).toEqual([0, false]);
    expect(buildCost('road', cell('.'))).toEqual([2, false]);
    expect(buildCost('building', cell('.'))).toEqual([2, false]);
    expect(buildCost('repair', cell('}'))).toEqual([1, false]);
    expect(buildCost('boat', cell(' '))).toEqual([5, false]);
    expect(buildCost('pillbox', cell('.'))).toEqual([4, false]);
    expect(buildCost('mine', cell('.'))).toEqual([0, false]);
  });

  it('prices pillbox repair by armour, flexibly', () => {
    for (const [armour, cost] of [[0, 4], [2, 4], [3, 3], [6, 3], [7, 2], [10, 2], [11, 1], [14, 1]]) {
      expect(buildCost('repair', cell('.', { pill: armour })), `armour ${armour}`).toEqual([cost, true]);
    }
  });

  it('has nothing to repair on a pillbox at full armour (15)', () => {
    expect(buildCost('repair', cell('.', { pill: 15 }))).toBeNull();
  });

  it('refuses targets the action can\'t use', () => {
    expect(buildCost('forest', cell('.'))).toBeNull();
    expect(buildCost('road', cell('|'))).toBeNull();
    expect(buildCost('road', cell('='))).toBeNull();
    expect(buildCost('building', cell(' '))).toBeNull();
    expect(buildCost('building', cell('|'))).toBeNull();
    expect(buildCost('building', cell('.', { base: true }))).toBeNull();
    expect(buildCost('repair', cell('|'))).toBeNull();
    expect(buildCost('repair', cell('.'))).toBeNull();
    expect(buildCost('boat', cell('.'))).toBeNull();
    expect(buildCost('pillbox', cell('^'))).toBeNull();
    expect(buildCost('pillbox', cell('.', { pill: 5 }))).toBeNull();
    expect(buildCost('mine', cell(' '))).toBeNull();
    expect(buildCost('teleport', cell('.'))).toBeNull();
  });
});

describe('buildCharge: what an authority charges', () => {
  it('charges the full price for strict orders, or refuses', () => {
    expect(buildCharge('building', cell('.'), 40)).toBe(2);
    expect(buildCharge('building', cell('.'), 1)).toBeNull();
    expect(buildCharge('forest', cell('#'), 0)).toBe(0);
  });

  it('charges what the tank has for a pillbox repair, but never nothing', () => {
    expect(buildCharge('repair', cell('.', { pill: 0 }), 40)).toBe(4);
    expect(buildCharge('repair', cell('.', { pill: 0 }), 2)).toBe(2);
    expect(buildCharge('repair', cell('.', { pill: 0 }), 0)).toBeNull();
  });
});

// ── Client and server agree ──────────────────────────────────────────────────

describe('checkBuildOrder (client) and buildCost (server) agree', () => {
  let check: (tool: string, c: any, trees?: number) => any[];

  beforeAll(async () => {
    const { BoloClientWorldMixin } = await import('./client/world/mixin');
    check = (tool, c, trees = 40) => {
      const inTank = {};
      const player = {
        builder: { $: { order: inTank, states: { inTank } } },
        cell: null, trees, mines: 40,
        getCarryingPillboxes: () => [{}],
      };
      return BoloClientWorldMixin.checkBuildOrder.call({ player }, tool, c);
    };
  });

  const cells = () => [
    ['forest', cell('#')], ['grass', cell('.')], ['wall', cell('|')], ['damaged wall', cell('}')],
    ['water', cell(' ')], ['boat', cell('b')], ['deep sea', cell('^')], ['road', cell('=')],
    ['pill 0', cell('.', { pill: 0 })], ['pill 3', cell('.', { pill: 3 })], ['pill 7', cell('.', { pill: 7 })],
    ['pill 11', cell('.', { pill: 11 })], ['pill 15', cell('.', { pill: 15 })], ['base', cell('.', { base: true })],
  ] as Array<[string, any]>;

  for (const tool of ['forest', 'road', 'building', 'pillbox', 'mine']) {
    it(`tool "${tool}": whatever the client sends, the server prices the same`, () => {
      for (const [name, c] of cells()) {
        const [action, trees] = check(tool, c);
        if (!action) continue;
        const priced = buildCost(action, c);
        expect(priced, `${tool} on ${name} → ${action}`).not.toBeNull();
        if (action !== 'mine') expect(trees, `${tool} on ${name} → ${action}`).toBe(priced![0]);
      }
    });
  }

  it('the client refuses to repair a full pillbox (was armour === 16, which never happens)', () => {
    expect(check('pillbox', cell('.', { pill: 15 }))[0]).toBe(false);
  });

  it('the client sends what the tank has for a short pillbox repair, and nothing with 0 trees', () => {
    expect(check('pillbox', cell('.', { pill: 0 }), 2)).toEqual(['repair', 2, true]);
    expect(check('pillbox', cell('.', { pill: 0 }), 0)[0]).toBe(false);
  });
});

// ── The server's BUILD_ORDER handler ─────────────────────────────────────────

describe('server BUILD_ORDER handler', () => {
  /** A real server world with one tank on open grass, holding `trees`. */
  function setup(trees: number) {
    const world: any = new BoloServerWorld(WorldMap.load(decodeBase64(EverardIsland)));
    const tank: any = world.spawn(Tank, 0);
    // Open grass with grass to the east (the build target).
    let spot: [number, number] | null = null;
    for (let y = 0; y < 256 && !spot; y++) for (let x = 0; x < 255 && !spot; x++) {
      const a = world.map.cellAtTile(x, y), b = world.map.cellAtTile(x + 1, y);
      if (a.isType('.') && b.isType('.') && !a.pill && !a.base && !b.pill && !b.base && !a.mine && !b.mine) spot = [x, y];
    }
    const [tx, ty] = spot!;
    tank.x = (tx + 0.5) * TILE_SIZE_WORLD; tank.y = (ty + 0.5) * TILE_SIZE_WORLD;
    tank.onBoat = false; tank.updateCell();
    tank.trees = trees;
    const ws = { tank };
    const send = (order: string) => world.onSimpleMessage(ws, `${net.BUILD_ORDER},${order}`);
    return { world, tank, builder: tank.builder.$, send, tx, ty, target: world.map.cellAtTile(tx + 1, ty) };
  }

  it('charges 2 for a wall claimed at 0 trees', () => {
    const { tank, builder, send, tx, ty } = setup(10);
    send(`building,0,${tx + 1},${ty}`);
    expect(tank.trees).toBe(8);
    expect(builder.trees).toBe(2);
    expect(builder.order).toBe(builder.states.actions.building);
  });

  it('a tank with 1 tree can\'t build a wall', () => {
    const { tank, builder, send, tx, ty } = setup(1);
    send(`building,2,${tx + 1},${ty}`);
    expect(tank.trees).toBe(1);
    expect(builder.order).toBe(builder.states.inTank);
  });

  it('a 2-tree repair of a pillbox at armour 0 charges 2 and ends at armour 8', () => {
    const { world, tank, builder, send, tx, ty, target } = setup(2);
    const pill = world.map.pills[0];
    pill.armour = 0;
    pill.inTank = pill.carried = false;
    [pill.x, pill.y] = target.getWorldCoordinates();
    pill.updateCell();
    send(`repair,0,${tx + 1},${ty}`);
    expect(tank.trees).toBe(0);
    expect(builder.trees).toBe(2);
    for (let i = 0; i < 200 && builder.order !== builder.states.waiting; i++) builder.update();
    expect(pill.armour).toBe(8);
  });

  it('rejects NaN trees, NaN or out-of-range coordinates, and unknown actions, leaving the tank alone', () => {
    const { tank, builder, send, tx, ty } = setup(10);
    for (const bad of [
      `building,abc,${tx + 1},${ty}`, `building,1.5,${tx + 1},${ty}`, `building,-1,${tx + 1},${ty}`,
      `building,2,abc,${ty}`, `building,2,${tx + 1},`, `building,2,-1,${ty}`, `building,2,256,${ty}`,
      `building,2,${tx + 1},9999`, `teleport,0,${tx + 1},${ty}`,
    ]) {
      send(bad);
      expect(tank.trees, bad).toBe(10);
      expect(builder.order, bad).toBe(builder.states.inTank);
    }
  });

  it('a normal order still works: harvesting forest is free', () => {
    const { world, tank, builder, send, tx, ty } = setup(0);
    world.map.cellAtTile(tx + 1, ty).setType('#');
    send(`forest,0,${tx + 1},${ty}`);
    expect(tank.trees).toBe(0);
    expect(builder.order).toBe(builder.states.actions.forest);
  });
});
