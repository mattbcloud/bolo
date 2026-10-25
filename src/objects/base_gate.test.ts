import { describe, it, expect } from 'vitest';

import { bootHeadlessWorld, placeTank, tileToBWorld } from '../brain/__sim__/harness';
import { Tank } from './tank';

/**
 * An enemy tank can't drive onto a base with more than 9 armour while the base's team is in
 * the game; when the team has no tank in the game the gate lifts, and the base can be taken by
 * driving over it. A dead tank waiting to respawn still counts: it used not to, so while a
 * team's only tank was respawning (~5 s) any enemy could take all its bases by driving over them.
 *
 * The headless world is the authority, like the server.
 */

const OWNER_TEAM = 1;

/** Everard, with team 1's only tank (`owner`) holding a base the enemy (team 0) can reach from
 *  the west, the enemy two tiles west of it, facing it. Pillboxes are disarmed so they can't
 *  shoot the enemy while it drives. */
function setup() {
  const world: any = bootHeadlessWorld();
  for (const pill of world.map.pills) pill.armour = 0;

  const open = (x: number, y: number) => {
    const c = world.map.cellAtTile(x, y);
    return c.isType('.', '=') && !c.pill && !c.base && !c.mine;
  };
  const base = world.map.bases.find((b: any) => {
    const [x, y] = [b.cell.x, b.cell.y];
    return open(x - 1, y) && open(x - 2, y) && open(x - 3, y);
  });
  expect(base).toBeTruthy();

  const owner: any = world.spawn(Tank);
  owner.spawn(OWNER_TEAM);
  owner.x = tileToBWorld(20);
  owner.y = tileToBWorld(20);
  owner.updateCell();
  base.owner_idx = owner.tank_idx;
  base.team = OWNER_TEAM;
  base.ref('owner', owner);
  base.updateOwner();
  base.armour = 50;

  const enemy = world.player;
  placeTank(world, base.cell.x - 2, base.cell.y);
  enemy.direction = 0;                     // due east, at the base
  enemy.armour = 40;

  return { world, base, owner, enemy };
}

/** Drive the enemy at the base for `ticks` ticks. */
function driveAtBase(world: any, enemy: any, ticks: number): void {
  enemy.accelerating = true;
  for (let i = 0; i < ticks; i++) world.tick();
  enemy.accelerating = false;
}

describe('an armoured base while its team\'s only tank is respawning', () => {
  it('still blocks an enemy tank and its builder', () => {
    const { base, owner, enemy } = setup();
    owner.kill();
    expect(owner.armour).toBe(255);         // dead, waiting to respawn

    expect(base.ownerTeamHasMembers()).toBe(true);
    expect(base.cell.getTankSpeed(enemy)).toBe(0);
    expect(base.cell.getTankTurn(enemy)).toBe(0);
    expect(base.cell.getManSpeed(enemy.builder.$)).toBe(0);
  });

  it('can\'t be taken by driving over it during the respawn', () => {
    const { world, base, owner, enemy } = setup();
    owner.kill();

    driveAtBase(world, enemy, 200);          // the respawn takes 255 ticks

    expect(owner.armour).toBe(255);          // still respawning
    expect(enemy.x).toBeGreaterThan(tileToBWorld(base.cell.x - 2));   // it drove up to the base,
    expect(enemy.cell === base.cell).toBe(false);                      // but not onto it
    expect(base.team).toBe(OWNER_TEAM);
  });
});

describe('an armoured base whose team has left the game', () => {
  it('can be taken by driving over it, as before', () => {
    const { world, base, owner, enemy } = setup();
    world.destroy(owner);                    // the player leaves: the tank goes at once
    expect(world.tanks.includes(owner)).toBe(false);
    expect(base.ownerTeamHasMembers()).toBe(false);

    driveAtBase(world, enemy, 200);

    expect(base.team).toBe(enemy.team);
  });
});

describe('a base with 9 armour or less', () => {
  it('can be driven over even while its team\'s tank is alive, as before', () => {
    const { world, base, owner, enemy } = setup();
    base.armour = 9;
    // Stop it regenerating past 9 while the enemy drives.
    base._regenCounter = -1e9;

    driveAtBase(world, enemy, 200);

    expect(owner.armour).not.toBe(255);
    expect(base.team).toBe(enemy.team);
  });
});
