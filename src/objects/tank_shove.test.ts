import { describe, it, expect } from 'vitest';

import { bootHeadlessWorld, placeTank, tileToBWorld } from '../brain/__sim__/harness';
import { Tank } from './tank';

/**
 * Tanks push each other apart, but a push never carries a tank past the edge of a wall: it stops
 * where a driving tank would stop (64 units short of the wall tile). And a tank on a solid tile
 * (a building put up under it, say) always gets off it: its tile follows its position, so the
 * nudge carries it out instead of rocking it on the tile's edge for good.
 *
 * Each test paints its own field of grass in the deep sea round Everard (well inside the mined
 * map edge), so the island's terrain can't decide the outcome.
 */

const W = 16;
const H = 12;

function setup() {
  const world: any = bootHeadlessWorld();
  const [ox, oy] = findOpenSea(world);
  for (let y = oy; y < oy + H; y++) {
    for (let x = ox; x < ox + W; x++) world.map.cellAtTile(x, y).setType('.', false);
  }
  const cx = ox + 6;
  const cy = oy + 6;
  const a: any = world.player;
  placeTank(world, cx, cy);
  a.direction = 0;
  return { world, a, cx, cy, cell: (x: number, y: number) => world.map.cellAtTile(x, y) };
}

/** The top-left of a (W+2)×(H+2) block of deep sea with no base or pillbox. */
function findOpenSea(world: any): [number, number] {
  for (let oy = 24; oy < 200; oy += 4) {
    for (let ox = 24; ox < 200; ox += 4) {
      let clear = true;
      for (let y = oy - 1; clear && y <= oy + H; y++) {
        for (let x = ox - 1; clear && x <= ox + W; x++) {
          const c = world.map.cellAtTile(x, y);
          if (!c.isType('^') || c.base || c.pill) clear = false;
        }
      }
      if (clear) return [ox, oy];
    }
  }
  throw new Error('no open sea');
}

/** A second tank, on team 0 (a teammate), at world position (x, y), facing east. */
function teammate(world: any, x: number, y: number): any {
  const b: any = world.spawn(Tank);
  b.spawn(0);
  b.x = x;
  b.y = y;
  b.onBoat = false;
  b.direction = 0;
  b.updateCell();
  return b;
}

const solid = (t: any) => t.cell.getTankSpeed(t) === 0;

describe('two tanks pushing each other', () => {
  it('on open ground, still separate to about 272 units', () => {
    const { world, a } = setup();
    const b = teammate(world, a.x + 40, a.y + 10);
    for (let i = 0; i < 60; i++) world.tick();
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(270);
  });

  it('a tank shoved toward a wall stops at the wall\'s edge, and can drive away', () => {
    const { world, a, cx, cy, cell } = setup();
    for (let y = cy - 3; y <= cy + 3; y++) cell(cx + 1, y).setType('|', false);
    const wallEdge = (cx + 1) * 256;

    // A teammate drives into it from the west, at the wall, for 5 s.
    const b = teammate(world, a.x - 200, a.y);
    b.accelerating = true;
    let deepest = 0;
    for (let i = 0; i < 250; i++) {
      world.tick();
      deepest = Math.max(deepest, a.x);
      expect(solid(a)).toBe(false);
    }
    expect(deepest).toBeLessThanOrEqual(wallEdge - 64);

    // The shove ends; it turns and drives away.
    b.accelerating = false;
    b.x -= 2000;
    b.updateCell();
    const startDir = a.direction;
    a.turningClockwise = true;
    for (let i = 0; i < 30; i++) world.tick();
    a.turningClockwise = false;
    expect(a.direction).not.toBe(startDir);
    const [x0, y0] = [a.x, a.y];
    a.accelerating = true;
    for (let i = 0; i < 60; i++) world.tick();
    expect(Math.hypot(a.x - x0, a.y - y0)).toBeGreaterThan(256);
  });

  it('a tank shoved onto a mine sets it off', () => {
    const { world, a, cx, cy, cell } = setup();
    const mined = cell(cx + 1, cy);
    mined.setType('.', true);
    const b = teammate(world, a.x - 120, a.y);
    b.accelerating = true;
    let blown = false;
    for (let i = 0; i < 120 && !blown; i++) {
      world.tick();
      blown = !mined.mine;
    }
    expect(blown).toBe(true);
  });
});

describe('a tank on a solid tile', () => {
  it('leaves a building put up under it within about 130 ticks, then drives and turns', () => {
    const { world, a, cx, cy, cell } = setup();
    cell(cx, cy).setType('|', false);
    expect(solid(a)).toBe(true);

    const t = (() => {
      for (let i = 1; i <= 1000; i++) {
        world.tick();
        if (!solid(a)) return i;
      }
      return Infinity;
    })();
    expect(t).toBeLessThanOrEqual(130);
    expect(a.cell === world.map.cellAtWorld(a.x, a.y)).toBe(true);

    const startDir = a.direction;
    a.turningClockwise = true;
    for (let i = 0; i < 30; i++) world.tick();
    a.turningClockwise = false;
    expect(a.direction).not.toBe(startDir);
    const [x0, y0] = [a.x, a.y];
    a.accelerating = true;
    for (let i = 0; i < 60; i++) world.tick();
    expect(Math.hypot(a.x - x0, a.y - y0)).toBeGreaterThan(256);
  });

  it('leaves a dead pillbox that is repaired under it', () => {
    const world: any = bootHeadlessWorld();
    // One with open ground to the north, where the tank is parked (the nudge heads for the
    // nearest tile edge, so it gets out on that side).
    const pill = world.map.pills.find((p: any) => p.cell.neigh(0, -1).isType('.', '='));
    const a: any = world.player;
    for (const p of world.map.pills) p.armour = 0;      // no pillbox shoots it
    placeTank(world, pill.cell.x, pill.cell.y);
    a.updateCell();
    a.y -= 40;                                          // parked north of the tile's centre
    a.updateCell();
    expect(a.cell === pill.cell).toBe(true);

    // A friendly builder repairs it before the tank picks it up.
    pill.team = a.team;
    pill.armour = 15;
    expect(solid(a)).toBe(true);
    let t = Infinity;
    for (let i = 1; i <= 1000 && t === Infinity; i++) {
      world.tick();
      pill.armour = 15;
      if (!solid(a)) t = i;
    }
    expect(t).toBeLessThanOrEqual(130);
  });

  it('with buildings all round, stays put without breaking the tick', () => {
    const { world, a, cx, cy, cell } = setup();
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) cell(cx + dx, cy + dy).setType('|', false);
    for (let i = 0; i < 300; i++) world.tick();
    expect(a.armour).not.toBe(255);
    expect(Math.abs(a.x - tileToBWorld(cx))).toBeLessThanOrEqual(256);
  });
});
