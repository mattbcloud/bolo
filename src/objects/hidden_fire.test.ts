import { describe, it, expect } from 'vitest';

import { bootHeadlessWorld, placeTank, tileToBWorld } from '../brain/__sim__/harness';
import { Shell } from './shell';

/**
 * Fix-list item 3: a tank with forest on all four orthogonal sides is hidden from pillboxes,
 * which is legitimate, but it could also fire from there without losing its cover. A shell fired
 * on a diagonal leaves through the corner between two forest tiles and touches neither. Now a
 * hidden tank's shot hits its own cover: the forest tile on the firing side becomes grass, no
 * shell flies, and the tank is exposed on the next tick.
 */

/** A world with the player on open grass, boxed in by forest on all four sides. */
function hiddenTank() {
  const world: any = bootHeadlessWorld();
  const open = (x: number, y: number) => {
    const c = world.map.cellAtTile(x, y);
    return c.isType('.') && !c.pill && !c.base && !c.mine;
  };
  let spot: [number, number] | null = null;
  for (let y = 1; y < 255 && !spot; y++) for (let x = 1; x < 255 && !spot; x++) {
    if (open(x, y) && open(x + 1, y) && open(x - 1, y) && open(x, y + 1) && open(x, y - 1)) spot = [x, y];
  }
  const [tx, ty] = spot!;
  placeTank(world, tx, ty);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) world.map.cellAtTile(tx + dx, ty + dy).setType('#');
  const tank = world.player;
  tank.updateHiddenStatus();
  tank.shells = 10;
  tank.reload = 0;
  tank.shooting = true;
  return { world, tank, tx, ty };
}

const shellsIn = (world: any) => world.objects.filter((o: any) => o instanceof Shell).length;

describe('a hidden tank\'s shot hits its own cover', () => {
  // The quadrants world_map.ts uses for a shot on a road: E for 224-31, N 32-95, W 96-159, S 160-223.
  const cases: Array<[string, number, [number, number]]> = [
    ['east (axis)', 0, [1, 0]], ['north-east (diagonal)', 32, [0, -1]],
    ['north (axis)', 64, [0, -1]], ['north-west (diagonal)', 96, [-1, 0]],
    ['west (axis)', 128, [-1, 0]], ['south-west (diagonal)', 160, [0, 1]],
    ['south (axis)', 192, [0, 1]], ['south-east (diagonal)', 224, [1, 0]],
  ];

  for (const [name, direction, [dx, dy]] of cases) {
    it(`firing ${name} (direction ${direction}) clears the forest tile at (${dx},${dy})`, () => {
      const { world, tank, tx, ty } = hiddenTank();
      expect(tank.hidden).toBe(true);
      tank.direction = direction;
      const before = shellsIn(world);

      tank.shootOrReload();
      expect(world.map.cellAtTile(tx + dx, ty + dy).type.ascii).toBe('.');
      // Only that one tile: the other three are still forest.
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (ox === dx && oy === dy) continue;
        expect(world.map.cellAtTile(tx + ox, ty + oy).type.ascii).toBe('#');
      }
      expect(tank.shells).toBe(9);
      expect(shellsIn(world)).toBe(before);   // no shell flies

      tank.shooting = false;
      tank.update();
      expect(tank.hidden).toBe(false);
    });
  }

  it('fires a normal shell from the same spot once the cover is broken', () => {
    const { world, tank } = hiddenTank();
    tank.direction = 32;
    tank.shootOrReload();
    tank.updateHiddenStatus();
    expect(tank.hidden).toBe(false);
    tank.reload = 0;
    const before = shellsIn(world);
    tank.shootOrReload();
    expect(shellsIn(world)).toBe(before + 1);
    expect(tank.shells).toBe(8);
  });

  it('a tank that isn\'t hidden fires a normal shell, as before', () => {
    const { world, tank, tx, ty } = hiddenTank();
    world.map.cellAtTile(tx + 1, ty).setType('.');   // one side open: not hidden
    tank.updateHiddenStatus();
    expect(tank.hidden).toBe(false);
    const before = shellsIn(world);
    tank.shootOrReload();
    expect(shellsIn(world)).toBe(before + 1);
    expect(tank.shells).toBe(9);
  });

  it('a pillbox that ignored the hidden tank targets it once its cover is broken', () => {
    const { world, tank, tx, ty } = hiddenTank();
    const pill = world.map.pills[0];
    pill.inTank = pill.carried = false;
    pill.team = 255;
    pill.armour = 15;
    pill.x = tileToBWorld(tx); pill.y = tileToBWorld(ty - 4);   // 4 tiles north, well in range
    pill.updateCell();
    pill.reload = pill.speed;

    pill.update();
    expect(pill.haveTarget).toBe(false);   // hidden: not a target

    tank.direction = 64;                    // fire north, toward the pillbox
    tank.shootOrReload();
    tank.shooting = false;
    tank.update();                          // exposed on the next tick
    pill.reload = pill.speed;
    pill.update();
    expect(pill.haveTarget).toBe(true);
    expect(pill.armour).toBe(15);           // the shot hit the cover, not the pillbox
  });
});
