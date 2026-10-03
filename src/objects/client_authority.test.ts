import { describe, it, expect, beforeAll } from 'vitest';

import { bootHeadlessWorld, placeTank, tileToBWorld } from '../brain/__sim__/harness';
import { Shell } from './shell';
import { Tank } from './tank';

/**
 * Fix-list items 11 and 14: the browser client must not apply game effects it isn't
 * authoritative for. The server decides hits, damage, deaths and pickups and sends the results;
 * a client that also applied them showed phantom damage, phantom deaths, and "ghost" pillboxes
 * dropped by a death that only happened in that one browser.
 *
 * A real headless world (real map, real objects) stands in for both sides: as built it is
 * authority=true, like the server; flipping `authority` to false makes it behave like the
 * browser's world for every method under test.
 */

/** A world, as the server (authority=true) or as a browser client (authority=false). */
function makeWorld(authority: boolean): any {
  const world = bootHeadlessWorld();
  world.authority = authority;
  // The map's own back-reference is what terrain hits consult.
  world.map.world.authority = authority;
  return world;
}

/** A grass tile whose west, south-west and south neighbours are also plain grass with no
 *  pill or base: room for a tank and its 3-pill drop cluster, and a clear run-up for a shell. */
function findOpenGrass(world: any): [number, number] {
  const ok = (x: number, y: number) => {
    const c = world.map.cellAtTile(x, y);
    return c.isType('.') && !c.pill && !c.base && !c.mine;
  };
  for (let y = 0; y < 256; y++) {
    for (let x = 2; x < 255; x++) {
      if (ok(x, y) && ok(x - 1, y) && ok(x - 1, y + 1) && ok(x, y + 1) && ok(x - 2, y)) return [x, y];
    }
  }
  throw new Error('no open grass on the test map');
}

/** A second tank, far away, to own the shell (a tank can't shoot itself). */
function spawnShooter(world: any): any {
  const shooter = world.spawn(Tank);
  shooter.spawn(1);
  shooter.x = tileToBWorld(10);
  shooter.y = tileToBWorld(10);
  shooter.updateCell();
  return shooter;
}

/** A shell one step west of `target`, heading east, so its next move lands on the target. */
function shellAbout(world: any, shooter: any, target: any): any {
  const shell = world.spawn(Shell, shooter, { direction: 0 });
  shell.direction = 0;          // 0 = due east (+x)
  shell.radians = undefined;
  shell.x = target.x - 32;      // one 32-unit step short
  shell.y = target.y;
  shell.updateCell();
  return shell;
}

/** Give `tank` some pills exactly as a pick-up does (WorldPillbox.update()). */
function carryPills(world: any, tank: any, n: number): any[] {
  const pills = world.map.pills.filter((p: any) => !p.inTank && !p.carried).slice(0, n);
  for (const pill of pills) {
    pill.armour = 0;
    pill.inTank = true;
    pill.x = pill.y = null;
    pill.updateCell();
    pill.ref('owner', tank);
    pill.updateOwner();
  }
  return pills;
}

/** Every map cell that still references one of `pills`. */
function cellsReferencing(world: any, pills: any[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  world.map.each((cell: any) => { if (pills.includes(cell.pill)) found.push([cell.x, cell.y]); });
  return found;
}

describe('bug 11: shells', () => {
  it('a client shell does not damage the tank it reaches, and stops there', () => {
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const target = world.player;
    target.armour = 40;
    const deaths = target.deaths;
    const shell = shellAbout(world, spawnShooter(world), target);

    shell.update();
    expect(target.armour).toBe(40);
    expect(target.slideTicks).toBe(0);
    expect(target.deaths).toBe(deaths);
    expect(shell.spent).toBe(true);

    // A spent shell does nothing at all on later ticks: it can't hit again or keep flying.
    const [x, y] = [shell.x, shell.y];
    shell.update();
    shell.update();
    expect([shell.x, shell.y]).toEqual([x, y]);
    expect(target.armour).toBe(40);
  });

  it('a client shell cannot kill, however low the armour', () => {
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const target = world.player;
    target.armour = 2;
    const pills = carryPills(world, target, 3);
    const shell = shellAbout(world, spawnShooter(world), target);

    shell.update();
    expect(target.armour).toBe(2);
    expect(target.x).not.toBeNull();
    expect(pills.every((p) => p.inTank)).toBe(true);
  });

  it('a server shell still damages: armour -5, slide started, shell destroyed', () => {
    const world = makeWorld(true);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const target = world.player;
    target.armour = 40;
    const shell = shellAbout(world, spawnShooter(world), target);

    shell.update();
    expect(target.armour).toBe(35);
    expect(target.slideTicks).toBe(8);
    expect(shell.spent).toBeFalsy();
    expect(world.objects.includes(shell)).toBe(false);
  });
});

describe('bug 14: a death on the client does not drop pillboxes', () => {
  it('client kill(): carried pills stay in the tank and no cell references them', () => {
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const tank = world.player;
    const pills = carryPills(world, tank, 3);

    tank.kill();
    expect(pills.map((p) => p.inTank)).toEqual([true, true, true]);
    expect(cellsReferencing(world, pills)).toEqual([]);
  });

  it('server kill(): the 3 pills land in the expected cluster', () => {
    const world = makeWorld(true);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const tank = world.player;
    const pills = carryPills(world, tank, 3);

    tank.kill();
    expect(pills.map((p) => p.inTank)).toEqual([false, false, false]);
    // The tank's tile, the one to its left, and the one below-left.
    const key = ([x, y]: [number, number]) => `${x},${y}`;
    expect(cellsReferencing(world, pills).map(key).sort())
      .toEqual([[tx, ty], [tx - 1, ty], [tx - 1, ty + 1]].map((c) => key(c as [number, number])).sort());
  });

  it('client destroy() (sinking) does not drop pills either', () => {
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const tank = world.player;
    const pills = carryPills(world, tank, 2);
    delete world.destroy;  // the browser's world has no destroy()

    tank.destroy();
    expect(pills.every((p) => p.inTank)).toBe(true);
    expect(cellsReferencing(world, pills)).toEqual([]);
  });

  it('a client death changes no score: deaths and kills come from the server', () => {
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    placeTank(world, tx, ty);
    const tank = world.player;
    const deaths = tank.deaths;
    tank.takeMineHit();
    tank.sink();
    expect(tank.deaths).toBe(deaths);
  });
});

describe('bug 11: pillbox, base and terrain hits are no-ops on the client', () => {
  const someShell = (world: any) => ({ direction: 0, attribution: { $: world.player }, owner: { $: world.player } });

  for (const authority of [false, true]) {
    const side = authority ? 'server' : 'client';

    it(`pillbox (${side})`, () => {
      const world = makeWorld(authority);
      const pill = world.map.pills[0];
      pill.armour = 15;
      pill.takeShellHit(someShell(world));
      expect(pill.armour).toBe(authority ? 14 : 15);
    });

    it(`base (${side})`, () => {
      const world = makeWorld(authority);
      const base = world.map.bases[0];
      base.armour = 50;
      base.takeShellHit(someShell(world));
      expect(base.armour).toBe(authority ? 45 : 50);
    });

    it(`terrain: forest (${side})`, () => {
      const world = makeWorld(authority);
      let forest: any = null;
      world.map.each((c: any) => { if (!forest && c.isType('#') && !c.pill && !c.base) forest = c; });
      forest.takeShellHit(someShell(world));
      expect(forest.type.ascii).toBe(authority ? '.' : '#');
    });
  }

  it('a map whose world has no `authority` field (the brain harness) still applies hits', () => {
    const world = bootHeadlessWorld();  // stand-in map.world, no authority field
    let forest: any = null;
    world.map.each((c: any) => { if (!forest && c.isType('#') && !c.pill && !c.base) forest = c; });
    forest.takeShellHit({ direction: 0 });
    expect(forest.type.ascii).toBe('.');
  });
});

describe('bug 14 safety net: _reconcilePillCells repairs wrong cell references', () => {
  let reconcile: (world: any) => void;

  beforeAll(async () => {
    (globalThis as any).WebSocket ??= class {};
    const M: any = await import('../client/world/client');
    const proto = (M.BoloClientWorld ?? M.default).prototype;
    reconcile = (world: any) => {
      world._pillCells ??= new Set();
      world._notePillCells = proto._notePillCells;
      proto._reconcilePillCells.call(world);
    };
  });

  it('clears a cell still pointing at a pill that is in a tank', () => {
    const world = makeWorld(false);
    const pill = world.map.pills[0];
    const cell = pill.cell;
    reconcile(world);                 // remembers the cell
    pill.inTank = true;               // the pill left, but its cell was never told
    pill.cell = null;
    reconcile(world);
    expect(cell.pill).toBeUndefined();
  });

  it('clears a cell pointing at a pillbox object that is no longer in the world', () => {
    const world = makeWorld(false);
    const pill = world.map.pills[0];
    const cell = pill.cell;
    reconcile(world);
    world.map.pills = world.map.pills.slice(1);  // the object was replaced or removed
    reconcile(world);
    expect(cell.pill).toBeUndefined();
  });

  it('restores a real pill whose reference an overlapping correction deleted', () => {
    // Two pills each move one tile west in the same UPDATE, in object order. A moves first,
    // onto C's old cell, overwriting C's reference there. Then C moves, and C.updateCell()
    // deletes "its" old cell's reference, which is now A's. A ends up undrawn and unsolid.
    const world = makeWorld(false);
    const [tx, ty] = findOpenGrass(world);
    const [A, C] = world.map.pills.slice(0, 2);
    const at = (p: any, x: number) => { p.inTank = p.carried = false; p.x = tileToBWorld(x); p.y = tileToBWorld(ty); p.updateCell(); };
    at(A, tx); at(C, tx - 1);
    reconcile(world);

    at(A, tx - 1);
    at(C, tx - 2);
    expect(world.map.cellAtTile(tx - 1, ty).pill).toBeUndefined();  // the defect

    reconcile(world);
    expect(world.map.cellAtTile(tx - 1, ty).pill).toBe(A);
    expect(world.map.cellAtTile(tx - 2, ty).pill).toBe(C);
    expect(world.map.cellAtTile(tx, ty).pill).toBeUndefined();
  });

  it('leaves a correct map alone', () => {
    const world = makeWorld(false);
    const before = world.map.pills.map((p: any) => p.cell);
    reconcile(world);
    reconcile(world);
    expect(world.map.pills.map((p: any) => p.cell)).toEqual(before);
    expect(world.map.pills.every((p: any) => p.cell.pill === p)).toBe(true);
  });
});
