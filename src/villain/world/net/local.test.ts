import { describe, it, expect } from 'vitest';

import { NetLocalWorld } from './local';
import { bootHeadlessWorld, placeTank, tileToBWorld } from '../../../brain/__sim__/harness';
import { Tank } from '../../../objects/tank';
import MineExplosion from '../../../objects/mine_explosion';

/**
 * Fix-list item 12: the local world (offline play and every headless brain test) spliced
 * destroyed objects out mid-tick, so the next object missed its update, and listed every tank
 * twice. It now behaves as ServerWorld does: null slots, and tanks registered once by addTank().
 */

describe('NetLocalWorld.destroy() during tick()', () => {
  it('doesn\'t skip the next object\'s update', () => {
    const world = new NetLocalWorld();
    const updated: string[] = [];
    class SelfDestructs { constructor(public w: any) {} tick() { updated.push('A'); this.w.destroy(this); } }
    class Plain { constructor(public w: any, public name = '') {} tick() { updated.push(this.name); } }
    world.spawn(SelfDestructs);
    const b = world.spawn(Plain); b.name = 'B';
    const c = world.spawn(Plain); c.name = 'C';

    world.tick();
    expect(updated).toEqual(['A', 'B', 'C']);
    expect(world.objects[0]).toBeNull();          // a null slot, not a splice
    expect(b.idx).toBe(1);
    expect(c.idx).toBe(2);                         // indices stay valid

    updated.length = 0;
    world.tick();
    expect(updated).toEqual(['B', 'C']);           // and the null slot is skipped
  });
});

describe('tanks in the local world', () => {
  it('a spawned tank is listed exactly once, at its tank_idx', () => {
    const world: any = bootHeadlessWorld();
    const second: any = world.spawn(Tank);
    second.spawn(1);
    for (const t of [world.player, second]) {
      expect(world.tanks.filter((x: any) => x === t)).toHaveLength(1);
      expect(world.tanks[t.tank_idx]).toBe(t);
    }
    expect(world.tanks).toHaveLength(2);
  });

  it('destroying a tank removes it, nulls its slot, and renumbers the others', () => {
    const world: any = bootHeadlessWorld();
    const b: any = world.spawn(Tank); b.spawn(1);
    const c: any = world.spawn(Tank); c.spawn(2);
    expect(c.tank_idx).toBe(2);
    const slot = b.idx;

    world.destroy(b);
    expect(world.tanks.includes(b)).toBe(false);
    expect(world.objects[slot]).toBeNull();
    expect(c.tank_idx).toBe(1);
    expect(world.tanks[1]).toBe(c);
  });

  it('a mine explosion beside a tank takes 10 armour, not 20', () => {
    const world: any = bootHeadlessWorld();
    // BoloLocalWorld leaves the map's stand-in world without spawn (no FloodFill in the harness);
    // the mine explosion itself is spawned through the real world.
    let spot: [number, number] | null = null;
    for (let y = 1; y < 255 && !spot; y++) for (let x = 1; x < 255 && !spot; x++) {
      const a = world.map.cellAtTile(x, y), b = world.map.cellAtTile(x + 1, y);
      if (a.isType('.') && b.isType('.') && !a.pill && !a.base && !b.pill && !b.base) spot = [x, y];
    }
    const [tx, ty] = spot!;
    placeTank(world, tx, ty);
    const tank = world.player;
    tank.armour = 40;
    const mined = world.map.cellAtTile(tx + 1, ty);
    mined.setType(null, true, 0);                  // a mine on the tile beside the tank
    world.spawn(MineExplosion, mined);
    for (let i = 0; i < 30; i++) world.tick();
    expect(mined.mine).toBe(false);                // it went off
    expect(tank.armour).toBe(30);
    expect(tank.x).toBe(tileToBWorld(tx));         // (still there, not killed)
  });
});
