import { describe, it, expect, vi, afterEach } from 'vitest';

import { ClientWorld } from './client';

/**
 * Hardening: netSpawn into a slot that still holds an object (a DESTROY that never arrived)
 * cleans the old object up as netDestroy does, so its cell reference can't survive as a ghost.
 * No current server path does this.
 */

class Cell {
  pill?: any;
  base?: any;
  retiles = 0;
  retile() { this.retiles++; }
}
class Pill { cell: Cell | null = null; constructor(public world: any) {} }
class Base { cell: Cell | null = null; constructor(public world: any) {} }
class Shell { constructor(public world: any) {} }
class Tank { constructor(public world: any) {} }

// Own statics, so the registered types don't leak into ClientWorld. Tank must be type 3.
class TestWorld extends ClientWorld {
  static types: any[] = [];
  static typesByName: Map<string, number> = new Map();
}
const PILL = 0, BASE = 1, SHELL = 2, TANK = 3;

function makeWorld(): TestWorld {
  const world = new TestWorld();
  for (const T of [Pill, Base, Shell, Tank]) world.registerType(T);
  return world;
}
const spawnMsg = (type: number, idx: number) => [type, idx >> 8, idx & 0xff];
const destroyMsg = (idx: number) => [idx >> 8, idx & 0xff];

/** Spawn a pillbox at `idx` and plant it on `cell`, as its netUpdate would. */
function spawnPlacedPill(world: TestWorld, idx: number, cell: Cell): Pill {
  world.netSpawn(spawnMsg(PILL, idx), 0);
  const pill = world.objects[idx] as Pill;
  pill.cell = cell;
  cell.pill = pill;
  return pill;
}

afterEach(() => {
  ClientWorld._warnedOccupiedSpawn = false;
  vi.restoreAllMocks();
});

describe('ClientWorld.netSpawn into an occupied slot', () => {
  it('clears the old pillbox\'s cell, puts the new object in place, and changes nothing else', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeWorld();
    const oldCell = new Cell();
    const otherCell = new Cell();
    const oldPill = spawnPlacedPill(world, 5, oldCell);
    const otherPill = spawnPlacedPill(world, 2, otherCell);
    world.netSpawn(spawnMsg(TANK, 7), 0);
    const tank = world.objects[7];
    const before = world.objects.slice();

    world.netSpawn(spawnMsg(SHELL, 5), 0);

    // The old cell no longer references the old pillbox.
    expect(oldCell.pill).toBeUndefined();
    expect('pill' in oldCell).toBe(false);
    expect(oldCell.retiles).toBe(1);
    // The new object is in place.
    expect(world.objects[5]).toBeInstanceOf(Shell);
    expect(world.objects[5] === oldPill).toBe(false);
    expect(world.objects[5].idx).toBe(5);
    // Nothing else changes.
    expect(world.objects.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      if (i !== 5) expect(world.objects[i] === before[i]).toBe(true);
    }
    expect(otherCell.pill === otherPill).toBe(true);
    expect(otherCell.retiles).toBe(0);
    expect(world.tanks.length).toBe(1);
    expect(world.tanks[0] === tank).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('leaves a cell alone that already points at a different object', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeWorld();
    const cell = new Cell();
    spawnPlacedPill(world, 4, cell);
    const newer = new Pill(world);
    cell.pill = newer;            // the cell has since been taken by another pill

    world.netSpawn(spawnMsg(PILL, 4), 0);

    expect(cell.pill === newer).toBe(true);
    expect(cell.retiles).toBe(0);
  });

  it('clears a base\'s cell the same way', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeWorld();
    const cell = new Cell();
    world.netSpawn(spawnMsg(BASE, 3), 0);
    const base = world.objects[3];
    base.cell = cell;
    cell.base = base;

    world.netSpawn(spawnMsg(BASE, 3), 0);

    expect('base' in cell).toBe(false);
    expect(world.objects[3] === base).toBe(false);
  });

  it('drops an old tank from the tanks list', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeWorld();
    world.netSpawn(spawnMsg(TANK, 6), 0);
    expect(world.tanks.length).toBe(1);

    world.netSpawn(spawnMsg(SHELL, 6), 0);

    expect(world.tanks.length).toBe(0);
  });

  it('warns once per session, and not at all for an empty slot', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const world = makeWorld();
    world.netSpawn(spawnMsg(SHELL, 1), 0);
    expect(warn).not.toHaveBeenCalled();

    world.netSpawn(spawnMsg(SHELL, 1), 0);
    world.netSpawn(spawnMsg(SHELL, 1), 0);
    makeWorld().netSpawn(spawnMsg(SHELL, 1), 0);
    const w2 = makeWorld();
    w2.netSpawn(spawnMsg(SHELL, 1), 0);
    w2.netSpawn(spawnMsg(SHELL, 1), 0);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('[NETSPAWN]');
  });
});

describe('ClientWorld.netDestroy', () => {
  it('empties the slot and clears the cell reference it shares with netSpawn', () => {
    const world = makeWorld();
    const cell = new Cell();
    spawnPlacedPill(world, 2, cell);

    world.netDestroy(destroyMsg(2), 0);

    expect(world.objects[2]).toBeNull();
    expect('pill' in cell).toBe(false);
  });
});
