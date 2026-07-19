import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';

// KillTank must YIELD when its target is unroutable — otherwise the tank commits to KillTank
// (cheapest goal) and freezes forever trying to path to an enemy it cannot reach. Live 2v2:
// "nerp" (shells 40) picked KillTank vs a team3 tank 8tx away that was parked on a nav-blocked
// (tank-occupied / stacked) tile → route:miss → idle forever, never yielding to the routable
// GetPill(cost 3). Mirrors FixPill's noRoute-abandon safety, which KillTank lacked.
//
// Repro: ring the enemy with WALLS so A* can never reach it (no boat escape either) and neutralise
// every pill/base to the AI's team, so KillTank is the only finite-cost goal and is selected. The
// unreachable target stands in for the live tank-blocked/stacked tile.
(globalThis as any).__BRAIN_DBG__ = false;

const GOAL_KILLTANK = 8;

function run(seed: number) {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;
  const cx = 120, cy = 120;

  // Clear a grass arena.
  for (let dx = -15; dx <= 15; dx++) for (let dy = -15; dy <= 15; dy++) {
    const c = world.map.cellAtTile(cx + dx, cy + dy);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  // Neutralise pills/bases to the AI's team so KillTank is the only real goal.
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { b.team = 0; b.owner_idx = 0; }

  // Enemy 10 tiles north, RINGED WITH WALLS → unroutable on foot, no boat helps.
  const ex = cx, ey = cy - 10;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (dx === 0 && dy === 0) continue;
    const c = world.map.cellAtTile(ex + dx, ey + dy);
    if (c && !c.pill && !c.base) c.setType('|');   // wall
  }

  placeTank(world, cx, cy, false);
  ai.armour = 40; ai.shells = 40; ai.team = 0;

  const enemy: any = world.spawn(Tank);
  enemy.spawn(1);
  enemy.x = tileToBWorld(ex); enemy.y = tileToBWorld(ey);
  enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
  enemy.onBoat = false; enemy.armour = 40; enemy.shooting = false; enemy.speed = 0;

  const a4: any = enableBrain(world);

  const startTile = `${a4.tankTileX},${a4.tankTileY}`;
  const goalCounts: Record<number, number> = {};
  let leftStart = false;
  for (let i = 0; i < 1200; i++) {
    enemy.x = tileToBWorld(ex); enemy.y = tileToBWorld(ey);  // keep it pinned
    world.tick();
    const g = a4.currentGoal;
    goalCounts[g] = (goalCounts[g] ?? 0) + 1;
    if (`${a4.tankTileX},${a4.tankTileY}` !== startTile) leftStart = true;
  }
  const killTankTicks = goalCounts[GOAL_KILLTANK] ?? 0;
  const finalGoalKillTank = a4.currentGoal === GOAL_KILLTANK;
  return { killTankTicks, finalGoalKillTank, yieldArmed: (a4.killTankFailedUntilTick ?? 0) > 0, leftStart, total: 1200 };
}

describe('KillTank yields on an unroutable target (no freeze)', () => {
  it('does not stay pinned on KillTank against an unreachable enemy', () => {
    const r = run(1000);
    // eslint-disable-next-line no-console
    console.log(`[killtank-noroute] killTankTicks=${r.killTankTicks}/${r.total} finalGoalKillTank=${r.finalGoalKillTank} yieldArmed=${r.yieldArmed} leftStart=${r.leftStart}`);
    // The yield must fire: KillTank must not dominate the entire run, and the noRoute cooldown arms.
    expect(r.yieldArmed).toBe(true);
    expect(r.finalGoalKillTank).toBe(false);
  });
});
