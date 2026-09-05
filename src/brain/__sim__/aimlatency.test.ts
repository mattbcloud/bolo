import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, makeLatentDriver, placeTank, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';

/**
 * DOES THE AIM LOOP SURVIVE A NETWORK ROUND TRIP?
 *
 * The gun is hull-fixed: aiming IS rotating the hull, and the hull is rotated by holding a turn
 * flag. In a real game the brain holds that flag from the far end of a WebSocket — it asks for a
 * turn, the server acts on it a few ticks later, and the resulting facing comes back a few ticks
 * after that. `turnTowardsDir` closes that loop with a deadband sized for ONE tick of overshoot
 * (pathfinding.ts), so under a multi-tick delay it is a bang-bang controller with dead time: it
 * commands past the bearing, sees the overshoot late, reverses, and hunts.
 *
 * Every fire gate then reads that same stale facing, so the moment the brain believes it is on
 * target is the moment the real hull is sweeping THROUGH the target. That is the reported
 * behaviour — "it points in the general direction and fires while sweeping across, hitting by
 * chance" — and no zero-latency harness can show it.
 *
 * This measures hit rate against latency. Damage is the ground truth: 40 armour, each shell that
 * connects takes 5, so damage/5 is hits and hits/shots is the hit rate.
 */
(globalThis as any).__BRAIN_DBG__ = false;

interface Result {
  shots: number;
  hits: number;
  hitRate: number;
  /** Share of trigger pulls taken while the hull was actually rotating. */
  fireWhileTurning: number;
  /** Mean |facing - true bearing| in direction units (256 = full circle) at the trigger pull. */
  aimErr: number;
  /** Share of turning ticks on which the commanded direction flipped — the visible jerk. */
  cmdReversals: number;
  /** What the brain's own estimator concluded the loop's dead time was. */
  loopDelay: number;
}

function run(seed: number, dx: number, dy: number, cmdLatency: number, moving = false): Result {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;

  // Cleared arena: nothing between the two tanks but open ground, so a miss is the brain's.
  const cx = 120, cy = 120;
  for (let ox = -12; ox <= 12; ox++) for (let oy = -12; oy <= 12; oy++) {
    const c = world.map.cellAtTile(cx + ox, cy + oy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  // Everything else already ours, so KillTank is the only goal worth having.
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

  let shots = 0, prevShells = ai.shells, minArm = enemy.armour;
  let fires = 0, firesWhileTurning = 0, aimErrSum = 0;
  let turnTicks = 0, cmdReversals = 0, prevCmd = 0;
  let prevFacing: number | null = null, prevShooting = false;

  for (let i = 0; i < 2000; i++) {
    if (moving) {
      // A player juking side to side: constant velocity within each leg, reversing every ~5 tiles.
      const period = 160;
      const leg = Math.floor(i / period) & 1;
      const p = (i % period) / period;
      const off = Math.round((leg ? (1 - p) : p) * 5 * 256) - 640;
      enemy.x = tileToBWorld(cx + dx) + off;
      enemy.y = tileToBWorld(cy + dy);
      enemy.direction = leg ? 128 : 0;
    } else {
      enemy.x = tileToBWorld(cx + dx);
      enemy.y = tileToBWorld(cy + dy);
    }
    enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
    enemy.shooting = false;

    driver.step();

    // Did the hull actually rotate this tick? (The engine's truth, not the brain's belief.)
    let hullTurning = false;
    if (prevFacing !== null) {
      let d = ai.direction - prevFacing;
      if (d > 128) d -= 256; if (d < -128) d += 256;
      hullTurning = Math.abs(d) > 1e-9;
      if (hullTurning) turnTicks++;
    }
    prevFacing = ai.direction;

    const cmd = ai.turningCounterClockwise ? 1 : ai.turningClockwise ? -1 : 0;
    if (cmd !== 0 && prevCmd !== 0 && cmd !== prevCmd) cmdReversals++;
    if (cmd !== 0) prevCmd = cmd;

    // A trigger pull is the false->true edge of the shooting flag.
    if (ai.shooting && !prevShooting) {
      fires++;
      if (hullTurning) firesWhileTurning++;
      const bearing = ((Math.atan2(-(enemy.y - ai.y), enemy.x - ai.x) * 256) / (Math.PI * 2) + 256) % 256;
      let e = ai.direction - bearing;
      if (e > 128) e -= 256; if (e < -128) e += 256;
      aimErrSum += Math.abs(e);
    }
    prevShooting = ai.shooting;

    if (ai.shells < prevShells) { shots += prevShells - ai.shells; prevShells = ai.shells; }
    if (enemy.armour < minArm) minArm = enemy.armour;
    if (ai.shells <= 0 || enemy.armour <= 0) break;
  }

  const hits = (40 - minArm) / 5;   // 5 armour per shell that lands
  return {
    shots, hits,
    loopDelay: driver.a4.aimLoopDelay,
    hitRate: shots ? hits / shots : 0,
    fireWhileTurning: fires ? firesWhileTurning / fires : 0,
    aimErr: fires ? aimErrSum / fires : 0,
    cmdReversals: turnTicks ? cmdReversals / turnTicks : 0,
  };
}

/** Average a set of placements at one latency, so a single lucky geometry cannot carry the number. */
function sweep(cmdLatency: number, moving: boolean): Result {
  const cases: Array<[number, number, number]> = [
    [1000, 4, 0], [2000, 0, 4], [3000, 5, 5], [4000, 6, 3], [5000, 3, -4],
  ];
  const acc: Result = { shots: 0, hits: 0, hitRate: 0, fireWhileTurning: 0, aimErr: 0, cmdReversals: 0, loopDelay: 0 };
  for (const [seed, dx, dy] of cases) {
    const r = run(seed, dx, dy, cmdLatency, moving);
    acc.shots += r.shots; acc.hits += r.hits;
    acc.fireWhileTurning += r.fireWhileTurning / cases.length;
    acc.aimErr += r.aimErr / cases.length;
    acc.cmdReversals += r.cmdReversals / cases.length;
    acc.loopDelay += r.loopDelay / cases.length;
  }
  acc.hitRate = acc.shots ? acc.hits / acc.shots : 0;
  return acc;
}

const pct = (n: number) => `${(100 * n).toFixed(1)}%`;

describe('aim under network latency', () => {
  it('measures hit rate as the command loop gets longer', () => {
    for (const moving of [false, true]) {
      // eslint-disable-next-line no-console
      console.log(`\n[aim-latency] ${moving ? 'MOVING' : 'STATIONARY'} enemy`);
      for (const lat of [0, 2, 4, 6]) {
        const r = sweep(lat, moving);
        // eslint-disable-next-line no-console
        console.log(
          `  cmdLatency=${lat}t  shots=${r.shots} hits=${r.hits} hitRate=${pct(r.hitRate)}  ` +
          `fireWhileTurning=${pct(r.fireWhileTurning)} aimErr=${r.aimErr.toFixed(1)}u ` +
          `cmdReversals=${pct(r.cmdReversals)} measuredDelay=${r.loopDelay.toFixed(1)}t`,
        );
      }
    }
    // Measurement only — the assertions live in the regression tests below.
    expect(true).toBe(true);
  });

  it('never pulls the trigger while the hull is swinging', () => {
    // The heart of it. Before, at a 4-tick command latency, 74% of shots left the barrel
    // mid-swing and the mean aim error at the trigger was 16 direction units — 23 degrees, on a
    // STATIONARY target in an empty arena. The shots that landed did so by coincidence.
    for (const lat of [2, 4, 6]) {
      const r = sweep(lat, false);
      expect(r.fireWhileTurning, `cmdLatency=${lat}: shots taken mid-swing`).toBeLessThan(0.05);
      expect(r.aimErr, `cmdLatency=${lat}: aim error at the trigger`).toBeLessThan(8);
    }
  });

  it('still lands shots when the command loop is a network round trip long', () => {
    // Latency used to take the aim apart: 75% hit rate at zero latency, 5% at four ticks.
    // A tank that cannot shoot straight over a connection cannot play the game, so the floor
    // here is deliberately close to the zero-latency number rather than a token above zero.
    for (const lat of [2, 4, 6]) {
      const stationary = sweep(lat, false);
      expect(stationary.hitRate, `cmdLatency=${lat}: hit rate vs a stationary tank`)
        .toBeGreaterThan(0.5);

      // ...and against a moving one it must still finish the job. Five engagements, eight hits
      // to kill: 40 hits is five kills, and the point of the fix is that latency stops deciding
      // whether the brain can kill anything at all.
      const moving = sweep(lat, true);
      expect(moving.hits, `cmdLatency=${lat}: hits landed on a juking tank`)
        .toBeGreaterThanOrEqual(32);
    }
  });

  it('measures the loop it is actually flying, rather than assuming one', () => {
    // The lead is only as good as the dead-time estimate behind it, and that number cannot be
    // configured — it belongs to the player's connection. The brain times its own commands: a
    // turn asked for at a standstill, out to the server and back, is two one-way trips.
    const local = sweep(0, false);
    expect(local.loopDelay, 'a local game has no round trip to measure').toBeLessThan(1);

    const remote = sweep(6, false);
    expect(remote.loopDelay, 'a 6-tick uplink is a 12-tick loop; do not under-read it')
      .toBeGreaterThan(7);
  });
});
