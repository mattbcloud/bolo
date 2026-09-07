import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, makeLatentDriver, placeTank, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';

/**
 * WHERE DO THE WASTED SHELLS GO? — stationary targets only.
 *
 * A stationary target is the case that should be perfect. Nothing about it is a prediction
 * problem: the bearing does not change, so however long the command loop is, the tank can take
 * as long as it likes to settle on the right heading and then fire. Latency should cost time,
 * not accuracy. Any miss here is the brain's own aim, and every one of them is a wasted shell.
 *
 * This measures the aim at the moment that actually matters — when the shell SPAWNS — rather
 * than when the trigger was pulled, because the two are not the same tick. `Tank.shootOrReload`
 * only fires when `reload` has counted down to 0, so a trigger held down during a swing releases
 * its shell at whatever bearing the hull has reached by the time the gun is ready.
 */
(globalThis as any).__BRAIN_DBG__ = false;

interface Shot {
  /** |hull facing - true bearing to target| at the tick the shell spawned, in direction units. */
  errAtSpawn: number;
  /** ...and at the tick the trigger was first asserted. */
  errAtTrigger: number;
  /** Hull rotation on the spawn tick. */
  omegaAtSpawn: number;
  /** Ticks the trigger was held before the gun was ready to fire it. */
  heldTicks: number;
  hit: boolean;
  /** Tick the shell left the barrel, so shells still in the air at the end can be excluded. */
  firedAt: number;
}

function bearingOf(ax: number, ay: number, bx: number, by: number): number {
  return ((Math.atan2(-(by - ay), bx - ax) * 128) / Math.PI + 256) % 256;
}

function angErr(facing: number, bearing: number): number {
  let e = facing - bearing;
  while (e > 128) e -= 256;
  while (e < -128) e += 256;
  return Math.abs(e);
}

function run(seed: number, dx: number, dy: number, cmdLatency: number) {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;

  const cx = 120, cy = 120;
  for (let ox = -12; ox <= 12; ox++) for (let oy = -12; oy <= 12; oy++) {
    const c = world.map.cellAtTile(cx + ox, cy + oy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { b.team = 0; b.owner_idx = 0; }

  placeTank(world, cx, cy, false);
  ai.armour = 40; ai.shells = 40; ai.team = 0;

  const enemy: any = world.spawn(Tank);
  enemy.spawn(1);
  enemy.x = tileToBWorld(cx + dx);
  enemy.y = tileToBWorld(cy + dy);
  enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
  enemy.onBoat = false;
  enemy.armour = 40;
  enemy.shooting = false;
  enemy.speed = 0;

  const driver = makeLatentDriver(world, { cmdLatency });

  const shots: Shot[] = [];
  let prevShells = ai.shells, prevArm = enemy.armour;
  let prevFacing: number | null = null, prevShooting = false;
  let triggerTick = -1, errAtTrigger = 0, tick = 0;

  for (; tick < 2500; tick++) {
    enemy.x = tileToBWorld(cx + dx);
    enemy.y = tileToBWorld(cy + dy);
    enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
    enemy.shooting = false;

    driver.step();

    let omega = 0;
    if (prevFacing !== null) {
      let d = ai.direction - prevFacing;
      if (d > 128) d -= 256; if (d < -128) d += 256;
      omega = d;
    }
    prevFacing = ai.direction;

    const bearing = bearingOf(ai.x, ai.y, enemy.x, enemy.y);

    if (ai.shooting && !prevShooting) {
      triggerTick = tick;
      errAtTrigger = angErr(ai.direction, bearing);
    }
    prevShooting = ai.shooting;

    // A shell spawned on exactly the tick `shells` drops (shootOrReload runs inside world.tick).
    if (ai.shells < prevShells) {
      prevShells = ai.shells;
      shots.push({
        errAtSpawn: angErr(ai.direction, bearing),
        errAtTrigger: triggerTick >= 0 ? errAtTrigger : NaN,
        omegaAtSpawn: Math.abs(omega),
        heldTicks: triggerTick >= 0 ? tick - triggerTick : NaN,
        hit: false,
        firedAt: tick,
      });
      triggerTick = -1;
    }
    // Damage lands a whole flight time later, and with a 13-tick reload against a ~32-tick
    // flight there are two or three shells in the air at once — so credit it to the OLDEST
    // unresolved shot. Shells land in the order they were fired.
    if (enemy.armour < prevArm) {
      prevArm = enemy.armour;
      const pending = shots.find((sh) => !sh.hit);
      if (pending) pending.hit = true;
    }
    if (ai.shells <= 0 || enemy.armour <= 0) break;
  }
  // A shell travels 32 world units a tick, so one fired at 7 tiles is in the air for ~56 ticks.
  // The run stops the moment the target dies, with two or three still flying — counting those as
  // misses understates the hit rate by exactly the length of the barrage.
  const flightTicks = Math.ceil(Math.hypot(dx, dy) * 256 / 32) + 8;
  return shots.filter((sh) => sh.hit || sh.firedAt <= tick - flightTicks);
}

const CASES: Array<[number, number, number]> = [
  [1000, 4, 0], [2000, 0, 4], [3000, 5, 5], [4000, 6, 3], [5000, 3, -4],
];

function sweep(cmdLatency: number, trace = false) {
  const all: Shot[] = [];
  for (const [seed, dx, dy] of CASES) {
    const r = run(seed, dx, dy, cmdLatency);
    // eslint-disable-next-line no-console
    if (trace) console.log(`    enemy@(+${dx},+${dy}) shots=${r.length} hits=${r.filter((x) => x.hit).length}`);
    all.push(...r);
  }
  const n = all.length || 1;
  const hits = all.filter((s) => s.hit).length;
  const mean = (f: (s: Shot) => number) => all.reduce((a, s) => a + (f(s) || 0), 0) / n;
  return {
    shots: all.length,
    hits,
    hitRate: hits / n,
    errAtSpawn: mean((s) => s.errAtSpawn),
    errAtTrigger: mean((s) => s.errAtTrigger),
    omegaAtSpawn: mean((s) => s.omegaAtSpawn),
    heldTicks: mean((s) => s.heldTicks),
    // The shells that were never going to land: a shell misses a 127-unit target once the
    // bearing is off by more than asin(127/dist) — about 2 units at 7 tiles.
    movingAtSpawn: all.filter((s) => s.omegaAtSpawn > 1e-9).length / n,
  };
}

const pct = (n: number) => `${(100 * n).toFixed(1)}%`;

describe('stationary-target accuracy', () => {
  it('reports where the shells actually go', () => {
    for (const lat of [0, 2, 4, 6]) {
      const r = sweep(lat, true);
      // eslint-disable-next-line no-console
      console.log(
        `[stationary] lat=${lat}t shots=${r.shots} hitRate=${pct(r.hitRate)}  ` +
        `errAtSpawn=${r.errAtSpawn.toFixed(2)}u errAtTrigger=${r.errAtTrigger.toFixed(2)}u ` +
        `movingAtSpawn=${pct(r.movingAtSpawn)} |omega|=${r.omegaAtSpawn.toFixed(2)}u/t ` +
        `heldTicks=${r.heldTicks.toFixed(1)}`,
      );
    }
    expect(true).toBe(true);
  });

  it('does not waste shells on a target that is not going anywhere', () => {
    // A stationary target cannot be a prediction problem, so latency must cost time and nothing
    // else. Every one of these shells is one the tank had to drive back to a base to replace.
    for (const lat of [0, 2, 4, 6]) {
      const r = sweep(lat);
      expect(r.hitRate, `lat=${lat}: hit rate on a stationary target`).toBeGreaterThan(0.95);
      // A shell hits within 127 units of centre, which at 7 tiles is 2.9 direction units, so
      // this is the bound that matters and it has real headroom. About a unit of what remains is
      // the deliberate truncation in `directionTo` — see the note in combat.ts `shoot`.
      expect(r.errAtSpawn, `lat=${lat}: aim error when the shell actually left`).toBeLessThan(1.5);
    }
  });
});
