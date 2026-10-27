// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';
import { fileURLToPath } from 'url';
import { Application, BoloServerWorld } from './application';
import WorldMap from '../world_map';
import * as net from '../net';
import { MINE_SEEN_NEAR_TILES } from './hidden_mines';

/**
 * Hidden mines, a game option. With it on, the server tells a player about a mine only if:
 *   - their team laid it (tank or builder), or
 *   - an enemy dropped it from the back of a tank within 8 tiles of them, or
 *   - their tank has come up to it (one square in front).
 * A player who has seen a mine keeps seeing it. Mines in the map file are anyone's to find.
 * With the option off, everyone sees every mine, as before.
 *
 * Each test reads what the server actually sends each fake connection.
 */

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../');
const everard = fs.readFileSync(path.join(root, 'maps/Everard Island.map'));
const TILE = 256;
const at = (t: number) => t * TILE + TILE / 2;

/** A fake player connection that records every MAPCHANGE the server sends it. */
function connect(world: any) {
  const mines = new Map<string, boolean>();
  let dump: number[] | null = null;
  const ws: any = {
    on() {}, ping() {}, bufferedAmount: 0, readyState: 1,
    send(msg: string) {
      if (msg.startsWith('{') || msg.startsWith('[')) return;
      const bytes = [...Buffer.from(msg, 'base64')];
      if (!dump) { dump = bytes; return; }
      // MAPCHANGE is 'M', x, y, ascii, life, mine. Scan for it (other messages can't match
      // all six bytes at a real cell).
      for (let i = 0; i + 5 < bytes.length; i++) {
        if (bytes[i] !== net.MAPCHANGE_MESSAGE) continue;
        const [x, y, ascii, , mine] = bytes.slice(i + 1, i + 6);
        const cell = world.map.cellAtTile(x, y);
        if (cell.type.ascii.charCodeAt(0) !== ascii || mine > 1) continue;
        mines.set(`${x},${y}`, mine === 1);
      }
    },
  };
  world.onConnect(ws);
  return {
    ws,
    /** Whether this player's map shows a mine at (x, y): the connect-time map, then changes. */
    seesMine(x: number, y: number): boolean {
      const k = `${x},${y}`;
      if (mines.has(k)) return mines.get(k)!;
      return dumpMine(dump!, x, y);
    },
    join(team: number, nick: string) {
      world.onJoinMessage(ws, { nick, team });
      world.tick();
      world.tick();
      return ws.tank;
    },
  };
}

/** The mine flag of (x, y) in a connect-time map dump, decoded with the client's own loader. */
function dumpMine(dump: number[], x: number, y: number): boolean {
  const map = WorldMap.load(dump);
  return map.cellAtTile(x, y).mine;
}

/** A game on Everard with an open patch of grass to work on. */
function game(hiddenMines: boolean) {
  const world: any = new BoloServerWorld(WorldMap.load(everard));
  world.hiddenMines = hiddenMines;
  for (const pill of world.map.pills) pill.armour = 0;     // nothing shoots anyone
  // A row of grass to lay mines on, well away from the island's pillboxes and bases.
  const [gx, gy] = findGrassRow(world, 24);
  return { world, gx, gy };
}

/** Paint a `len`×5 strip of grass in open sea (well inside the mined map edge) and return the
 *  tile at the start of its middle row. */
function findGrassRow(world: any, len: number): [number, number] {
  for (let oy = 24; oy < 200; oy += 4) {
    for (let ox = 24; ox < 200; ox += 4) {
      let clear = true;
      for (let y = oy - 3; clear && y <= oy + 3; y++) {
        for (let x = ox - 1; clear && x <= ox + len; x++) {
          const c = world.map.cellAtTile(x, y);
          if (!c.isType('^') || c.base || c.pill) clear = false;
        }
      }
      if (!clear) continue;
      for (let y = oy - 2; y <= oy + 2; y++) {
        for (let x = ox; x < ox + len; x++) world.map.cellAtTile(x, y).setType('.', false, -1);
      }
      return [ox, oy];
    }
  }
  throw new Error('no open sea');
}

/** Put `tank` at tile (x, y) facing `direction` (0 = east, 64 = north, 128 = west). */
function place(tank: any, x: number, y: number, direction = 0) {
  tank.x = at(x);
  tank.y = at(y);
  tank.direction = direction;
  tank.speed = 0;
  tank.onBoat = false;
  tank.updateCell();
}

/** `tank` drops one mine from its back (the tile behind it). */
function dropMine(world: any, tank: any) {
  tank.mines = 10;
  tank.layingMine = true;
  world.tick();
  tank.layingMine = false;
  world.tick();
}

describe('hidden mines off', () => {
  it('every player sees every mine', () => {
    const { world, gx, gy } = game(false);
    const a = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    b.join(1, 'bravo');
    place(ta, gx + 5, gy, 0);
    dropMine(world, ta);
    expect(world.map.cellAtTile(gx + 4, gy).mine).toBe(true);
    expect(a.seesMine(gx + 4, gy)).toBe(true);
    expect(b.seesMine(gx + 4, gy)).toBe(true);
  });
});

describe('hidden mines on', () => {
  it('a dropped mine is shown to the team but not to a distant enemy', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world), mate = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    const tm = mate.join(0, 'mate');
    const tb = b.join(1, 'bravo');
    place(ta, gx + 5, gy, 0);
    place(tm, gx + 20, gy - 1, 0);
    place(tb, gx + 5 + MINE_SEEN_NEAR_TILES + 6, gy + 1, 0);
    dropMine(world, ta);
    expect(world.map.cellAtTile(gx + 4, gy).mine).toBe(true);
    expect(a.seesMine(gx + 4, gy)).toBe(true);
    expect(mate.seesMine(gx + 4, gy)).toBe(true);
    expect(b.seesMine(gx + 4, gy)).toBe(false);
  });

  it('an enemy within 8 tiles sees a mine dropped from a tank, and keeps seeing it', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    const tb = b.join(1, 'bravo');
    place(ta, gx + 5, gy, 0);
    place(tb, gx + 5 + MINE_SEEN_NEAR_TILES - 1, gy + 1, 0);
    dropMine(world, ta);
    expect(b.seesMine(gx + 4, gy)).toBe(true);

    // It drives away; the mine stays on its map.
    place(tb, gx + 22, gy + 1, 0);
    for (let i = 0; i < 20; i++) world.tick();
    world.map.cellAtTile(gx + 4, gy).setType('.', true, 0);   // a life change on the tile
    for (let i = 0; i < 2; i++) world.tick();
    expect(b.seesMine(gx + 4, gy)).toBe(true);
  });

  it('a mine laid by a builder is not shown to a watching enemy', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    const tb = b.join(1, 'bravo');
    place(ta, gx + 2, gy, 0);
    place(tb, gx + 10, gy + 1, 128);
    ta.mines = 10;
    ta.builder.$.performOrder('mine', 0, world.map.cellAtTile(gx + 5, gy));
    for (let i = 0; i < 200 && !world.map.cellAtTile(gx + 5, gy).mine; i++) world.tick();
    world.tick();
    expect(world.map.cellAtTile(gx + 5, gy).mine).toBe(true);
    expect(a.seesMine(gx + 5, gy)).toBe(true);
    expect(b.seesMine(gx + 5, gy)).toBe(false);
  });

  it('a tank sees a hidden mine one square in front of it', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    const tb = b.join(1, 'bravo');
    place(ta, gx + 5, gy, 0);
    place(tb, gx + 20, gy + 1, 0);
    dropMine(world, ta);
    expect(b.seesMine(gx + 4, gy)).toBe(false);

    place(tb, gx + 6, gy, 128);                 // one square east of it, facing west
    world.tick();
    world.tick();
    expect(b.seesMine(gx + 4, gy)).toBe(false); // two squares: not yet
    place(tb, gx + 5, gy, 128);
    world.tick();
    world.tick();
    expect(b.seesMine(gx + 4, gy)).toBe(true);
  });

  it('a hidden mine still goes off under an enemy, and its crater shows to all', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world), b = connect(world);
    const ta = a.join(0, 'alpha');
    const tb = b.join(1, 'bravo');
    place(ta, gx + 5, gy, 0);
    place(tb, gx + 20, gy, 128);
    dropMine(world, ta);
    place(ta, gx + 12, gy - 1, 0);
    const armour = tb.armour;
    place(tb, gx + 4, gy, 128);                 // straight onto it
    tb.checkNewCell(world.map.cellAtTile(gx + 5, gy));
    for (let i = 0; i < 30; i++) world.tick();
    expect(tb.armour).toBeLessThan(armour);
    expect(world.map.cellAtTile(gx + 4, gy).mine).toBe(false);
    expect(b.seesMine(gx + 4, gy)).toBe(false);
    expect(a.seesMine(gx + 4, gy)).toBe(false);
  });

  it('a player joining later sees their own team\'s mines and not the enemy\'s', () => {
    const { world, gx, gy } = game(true);
    const a = connect(world);
    const ta = a.join(0, 'alpha');
    place(ta, gx + 5, gy, 0);
    dropMine(world, ta);

    const mate = connect(world), enemy = connect(world);
    expect(mate.seesMine(gx + 4, gy)).toBe(false);   // the connect-time map: nobody's mines
    mate.join(0, 'mate');
    enemy.join(1, 'bravo');
    expect(mate.seesMine(gx + 4, gy)).toBe(true);
    expect(enemy.seesMine(gx + 4, gy)).toBe(false);
  });

  it('mines from the map file are hidden from everyone until found', () => {
    const { world, gx, gy } = game(true);
    world.map.cellAtTile(gx + 4, gy).setType('.', true, 0);
    const a = connect(world);
    const ta = a.join(0, 'alpha');
    place(ta, gx + 12, gy, 0);
    world.tick();
    expect(a.seesMine(gx + 4, gy)).toBe(false);
    place(ta, gx + 5, gy, 128);
    world.tick();
    world.tick();
    expect(a.seesMine(gx + 4, gy)).toBe(true);
  });
});

describe('the option over the API', () => {
  let app: Application;
  let base: string;

  beforeAll(async () => {
    app = new Application({ general: { base: '', maxgames: 5 }, web: { port: 0, log: false } } as any);
    app.listen(0);
    await new Promise(r => app.httpServer.once('listening', r));
    base = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
    const start = Date.now();
    while (!app.demo && Date.now() - start < 10_000) await new Promise(r => setTimeout(r, 20));
  });

  afterAll(() => {
    app.loop.stop();
    app.httpServer.close();
  });

  const create = async (body: any) => {
    const res = await fetch(`${base}/api/games`, { method: 'POST', body: JSON.stringify(body) });
    expect(res.status).toBe(200);
    return app.games[(await res.json()).gid];
  };

  it('stores hiddenMines, and leaving it out means off', async () => {
    expect((await create({ mapName: 'Everard Island', hiddenMines: true })).hiddenMines).toBe(true);
    expect((await create({ mapName: 'Everard Island' })).hiddenMines).toBe(false);
    expect((await create({ mapName: 'Everard Island', hiddenMines: 'yes' })).hiddenMines).toBe(false);
  });
});
