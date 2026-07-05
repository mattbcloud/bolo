import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';

// Does the AI actually LAND SHOTS on an enemy tank? (User: "I don't see it landing shots.")
// Pins a stationary enemy tank a few tiles from the AI in a cleared arena and drives the full
// brain, tracking: goal selection (should be KillTank=8), shots fired (player.shells consumed),
// ticks the gun is firing, and the enemy's armour over time (the ground truth for "landing shots").
(globalThis as any).__BRAIN_DBG__ = false;

const GOAL_NAMES: Record<number, string> = {
  0: 'PlacePill', 1: 'Explore', 2: 'FixPill', 3: 'GetBase', 4: 'GetMan', 5: 'GetPill',
  6: 'KillBase', 7: 'KillMan', 8: 'KillTank', 9: 'Refuel', 10: 'TourBases', 12: 'NoGoal',
};

function run(seed: number, enemyDx: number, enemyDy: number, moving = false) {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;

  // Clear a generous grass arena so terrain never blocks the engagement — the only thing
  // between the AI and the enemy is open ground, so a miss is the brain's, not the map's.
  const cx = 120, cy = 120;
  for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
    const c = world.map.cellAtTile(cx + dx, cy + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }

  // Neutralise every pill/base to the AI's team so they don't out-compete KillTank for the goal
  // (we want to isolate the tank-vs-tank engagement).
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { b.team = 0; b.owner_idx = 0; }

  placeTank(world, cx, cy, false);
  ai.armour = 40; ai.shells = 40; ai.team = 0;

  // Spawn a stationary ENEMY tank (team 1) enemyDx/dy tiles away on cleared ground.
  const enemy: any = world.spawn(Tank);
  enemy.spawn(1);                          // team 1 → enemy of team 0
  enemy.x = tileToBWorld(cx + enemyDx);
  enemy.y = tileToBWorld(cy + enemyDy);
  enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
  enemy.onBoat = false;
  enemy.armour = 40;
  enemy.shooting = false;                  // don't fire back — we only measure the AI's offense
  enemy.speed = 0;

  const a4: any = enableBrain(world);

  let firedTicks = 0, shotsFired = 0, prevShells = ai.shells;
  let minEnemyArmour = enemy.armour;
  const goalCounts: Record<number, number> = {};
  const trace = process.env.TRACE === '1' && seed === 1000;
  let prevArm = enemy.armour;

  for (let i = 0; i < 2000; i++) {
    if (moving) {
      // Straight-line strafe that reverses every ~5 tiles (a real player dodging side to side) —
      // constant velocity within each leg, which is what linear lead-aim is designed to hit.
      const period = 160;                       // ticks per leg
      const leg = Math.floor(i / period) & 1;   // alternate direction
      const p = (i % period) / period;          // 0..1 along the leg
      const off = Math.round((leg ? (1 - p) : p) * 5 * 256) - 640;  // -640..+640 sweep
      enemy.x = tileToBWorld(cx + enemyDx) + off;
      enemy.y = tileToBWorld(cy + enemyDy);
      enemy.direction = leg ? 128 : 0;          // moving -x or +x
    } else {
      // keep the enemy pinned & alive-but-stationary (it has no brain; guard against drift)
      enemy.x = tileToBWorld(cx + enemyDx);
      enemy.y = tileToBWorld(cy + enemyDy);
    }
    enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
    enemy.shooting = false;

    world.tick();

    if (ai.shooting) firedTicks++;
    if (ai.shells < prevShells) { shotsFired += prevShells - ai.shells; prevShells = ai.shells; }
    if (enemy.armour < minEnemyArmour) minEnemyArmour = enemy.armour;
    const g = a4.currentGoal;
    goalCounts[g] = (goalCounts[g] ?? 0) + 1;

    if (trace && (enemy.armour !== prevArm || i % 250 === 0)) {
      const d = Math.round(Math.hypot(ai.x - enemy.x, ai.y - enemy.y));
      const face = ai.direction ?? ai.facingDir ?? 0;
      // eslint-disable-next-line no-console
      console.log(`  t=${i} goal=${GOAL_NAMES[g] ?? g} dist=${d} aiShells=${ai.shells} enemyArm=${enemy.armour} aiFace=${face} shooting=${ai.shooting ? 1 : 0}`);
      prevArm = enemy.armour;
    }
    if (ai.shells <= 0) break;              // ran dry — enough signal
  }

  const dominantGoal = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    shotsFired, firedTicks, minEnemyArmour,
    damage: 40 - minEnemyArmour,
    dominantGoal: `${GOAL_NAMES[+dominantGoal[0]] ?? dominantGoal[0]}(${dominantGoal[1]})`,
  };
}

describe('KillTank lands shots on an enemy tank', () => {
  it('fires and damages a stationary enemy across several offsets', () => {
    // cardinal + diagonal placements at a few ranges (all within KillTank cost≤2 = ≤10 tiles)
    const cases: Array<[number, number, number]> = [
      [1000, 4, 0], [2000, 0, 4], [3000, 5, 5], [4000, 6, 3], [5000, 3, -4],
    ];
    let totalShots = 0, totalDamage = 0, engaged = 0;
    for (const [seed, dx, dy] of cases) {
      const r = run(seed, dx, dy);
      if (r.shotsFired > 0) engaged++;
      totalShots += r.shotsFired;
      totalDamage += r.damage;
      // eslint-disable-next-line no-console
      console.log(`[killtank enemy@(+${dx},+${dy})] goal=${r.dominantGoal} shotsFired=${r.shotsFired} ` +
        `firingTicks=${r.firedTicks} enemyDamage=${r.damage} (minArm=${r.minEnemyArmour})`);
    }
    // eslint-disable-next-line no-console
    console.log(`[killtank] TOTAL shotsFired=${totalShots} enemyDamage=${totalDamage} engaged=${engaged}/${cases.length}`);
    expect(engaged, 'the AI should fire at the enemy tank in most placements').toBeGreaterThanOrEqual(3);
    expect(totalDamage, 'shots should actually connect and reduce enemy armour').toBeGreaterThan(0);
  });

  it('MOVING enemy: how much damage does it land on a juking target?', () => {
    const cases: Array<[number, number, number]> = [
      [1000, 4, 0], [2000, 5, 2], [3000, 3, 4], [4000, 6, 1], [5000, 4, -3],
    ];
    let totalShots = 0, totalDamage = 0, kills = 0;
    for (const [seed, dx, dy] of cases) {
      const r = run(seed, dx, dy, true);
      totalShots += r.shotsFired;
      totalDamage += r.damage;
      if (r.minEnemyArmour <= 0) kills++;
      // eslint-disable-next-line no-console
      console.log(`[killtank-MOVING enemy@(+${dx},+${dy})] shotsFired=${r.shotsFired} ` +
        `firingTicks=${r.firedTicks} enemyDamage=${r.damage}/40 killed=${r.minEnemyArmour <= 0}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[killtank-MOVING] TOTAL shotsFired=${totalShots} enemyDamage=${totalDamage} kills=${kills}/${cases.length} ` +
      `(hit rate ≈ ${totalShots ? Math.round((totalDamage / totalShots) * 100) : 0}% of shots connect)`);
    // No hard gate — this is a measurement of accuracy vs a moving target.
    expect(totalShots).toBeGreaterThan(0);
  });
});
