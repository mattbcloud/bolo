import { describe, it, expect } from 'vitest';

import { bootHeadlessWorld, tileToBWorld } from '../brain/__sim__/harness';
import { Shell } from './shell';
import { Tank } from './tank';

/**
 * Fix-list items 2 and 4: a shell's reach depended on its heading. It moved by a rounded step
 * (31.4 to 32.65 units long depending on heading) a fixed number of times, so a tank's shells
 * outranged a pillbox's 1,919-unit targeting on some headings (item 2) and a pillbox's own shells
 * fell short of a tank at the edge of its range on others (item 4). Shells now move by an exact
 * 32-unit step, rounded to integers per move, so every shell travels range × 256 units.
 */

const HIT_RADIUS = 127;

/** A world, a shooter parked in open deep sea (nothing to hit within 8 tiles), and a fire(). */
function range_rig() {
  const world: any = bootHeadlessWorld();
  const shooter: any = world.player;
  shooter.x = tileToBWorld(40);
  shooter.y = tileToBWorld(40);
  shooter.updateCell();
  /** Fire one shell and fly it to its end; returns every position it occupied. */
  const fire = (direction: number, range: number, owner: any = shooter): Array<[number, number]> => {
    const shell = world.spawn(Shell, owner, { direction, range });
    const path: Array<[number, number]> = [[shell.x, shell.y]];
    for (let i = 0; i < 100 && world.objects.includes(shell); i++) {
      shell.update();
      path.push([shell.x, shell.y]);
    }
    return path;
  };
  return { world, shooter, fire };
}

/** Distance from the firing point to where the shell ended, for every heading. */
function reaches(range: number): number[] {
  const { shooter, fire } = range_rig();
  const out: number[] = [];
  // Aim the shooter too, as a tank's own shots use its direction.
  for (let dir = 0; dir < 256; dir++) {
    shooter.direction = dir;
    const path = fire(dir, range);
    const [x, y] = path[path.length - 1];
    out.push(Math.hypot(x - shooter.x, y - shooter.y));
  }
  return out;
}

describe('every shell reaches exactly range × 256 units, on every heading', () => {
  it('range 7 (the default and the maximum): 1,792 ± 1 on all 256 headings', () => {
    const r = reaches(7);
    const [lo, hi] = [Math.min(...r), Math.max(...r)];
    console.log(`[reach] range 7 over 256 headings: travel ${lo.toFixed(1)}..${hi.toFixed(1)} ` +
      `→ reach with the 127 hit radius ${(lo + HIT_RADIUS).toFixed(1)}..${(hi + HIT_RADIUS).toFixed(1)}`);
    for (const d of r) expect(Math.abs(d - 1792)).toBeLessThanOrEqual(1);
  });

  it('every tank range, 1 to 7 tiles in half-tile steps', () => {
    for (let range = 1; range <= 7; range += 0.5) {
      for (const d of reaches(range)) expect(Math.abs(d - range * 256), `range ${range}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('neither side outranges the other', () => {
  /** A pillbox (the map's first) moved to open sea, armed, aimed at a tank `dist` away on `dir`. */
  function duel(dist: number, bearing: number) {
    const rig = range_rig();
    const { world, shooter } = rig;
    const pill = world.map.pills[0];
    pill.inTank = pill.carried = false;
    pill.team = 255;
    pill.armour = 15;
    pill.x = shooter.x; pill.y = shooter.y;   // the pillbox sits where the shooter was…
    pill.updateCell();
    const tank: any = world.spawn(Tank);
    tank.spawn(1);
    const rad = (bearing / 256) * 2 * Math.PI;
    tank.x = Math.round(pill.x + Math.cos(rad) * dist);   // …and the tank `dist` away
    tank.y = Math.round(pill.y - Math.sin(rad) * dist);
    // Off the boat: a hit knocks a tank off its boat, and in deep sea that sinks it.
    tank.armour = 40; tank.speed = 0; tank.effectiveSpeed = 0; tank.hidden = false; tank.onBoat = false;
    tank.updateCell();
    shooter.x = shooter.y = null; shooter.armour = 255;   // out of the way
    return { ...rig, pill, tank };
  }

  /** Let the pillbox fire until it has spent a few shells; did any hit the tank? */
  function pillHits(dist: number, bearing: number): { targeted: boolean; hit: boolean } {
    const { world, pill, tank } = duel(dist, bearing);
    let targeted = false;
    pill.reload = pill.speed;
    for (let t = 0; t < 400 && tank.armour === 40; t++) {
      pill.update();
      targeted ||= pill.haveTarget;
      for (const obj of [...world.objects]) if (obj instanceof Shell) obj.update();
      if (pill.reload === 0) pill.reload = pill.speed;   // keep it firing
    }
    return { targeted, hit: tank.armour !== 40 };
  }

  it('a pillbox hits a stationary tank 1,915 away on every bearing', () => {
    for (let bearing = 0; bearing < 256; bearing += 4) {
      expect(pillHits(1915, bearing + 0.37), `bearing ${bearing}`).toEqual({ targeted: true, hit: true });
    }
  });

  it('a pillbox does not target a tank 1,925 away', () => {
    for (let bearing = 0; bearing < 256; bearing += 16) {
      expect(pillHits(1925, bearing).targeted, `bearing ${bearing}`).toBe(false);
    }
  });

  it('a tank at range 7 never reaches a point more than 1,919 + 1 away, on any heading', () => {
    for (const d of reaches(7)) expect(d + HIT_RADIUS).toBeLessThanOrEqual(1920);
  });
});

describe('client and server agree on a shell\'s line', () => {
  it('a shell re-seeded from a server position continues along the same line', () => {
    const { shooter, fire, world } = range_rig();
    const dir = 37;
    shooter.direction = dir;
    const server = fire(dir, 7);

    // A second shell plays the client: after a few moves, the "server" overwrites its position
    // (a netSync), and it must carry on through the same points the server's shell visits.
    const client = world.spawn(Shell, shooter, { direction: dir, range: 7 });
    for (let i = 0; i < 5; i++) client.update();
    const [sx, sy] = server[20];
    client.x = sx; client.y = sy;
    for (let i = 21; i < 30; i++) {
      client.update();
      expect(Math.abs(client.x - server[i][0]), `move ${i}`).toBeLessThanOrEqual(1);
      expect(Math.abs(client.y - server[i][1]), `move ${i}`).toBeLessThanOrEqual(1);
    }
  });
});

describe('Shell.spawn direction', () => {
  it('a requested direction of 0 flies due east, whatever way the owner faces (fix-list 19)', () => {
    const { world, shooter } = range_rig();
    shooter.direction = 100;                     // facing roughly west-north-west
    const shell = world.spawn(Shell, shooter, { direction: 0 });
    expect(shell.direction).toBe(0);
    const [x0, y0] = [shell.x, shell.y];
    shell.update();
    expect(shell.x - x0).toBe(32);
    expect(shell.y - y0).toBe(0);
  });
});
