import { describe, it, expect } from 'vitest';
import { bootHeadlessWorld, enableBrain, placeTank, tileToBWorld } from './harness';
import { Tank } from '../../objects/tank';
import { checkBarriers } from '../combat';
import { directionTo } from '../pathfinding';

// KillTank BLIND-FIRE harness (user: "tanks shooting blindly during KillTank even when there is
// no enemy tank nearby"). This is the testing PROCESS: instrument every shot the AI fires and
// classify it as legitimate vs blind. A shot is BLIND when, at the moment of firing, the line to
// the enemy is obstructed (no LOS → the shell hits terrain, never the tank) OR the enemy is far
// off the gun's aim cone (firing into empty space, e.g. a stale lead point). Ground truth for a
// legit hit = the enemy's armour actually dropping.
//
// Scenarios:
//   clear  — open ground, enemy in the open  → shots SHOULD land (control).
//   wall   — a wall between AI and enemy      → NO shot can connect → every shot fired is blind.
//   gone   — enemy engaged then teleported far→ AI must STOP firing at the vacated spot.
(globalThis as any).__BRAIN_DBG__ = false;

const AIM_CONE = 8;   // dir-units (~11°). Beyond this the gun isn't pointed at the enemy.

function measure(opts: {
  seed: number; dx: number; dy: number;
  wall?: boolean; goneAtTick?: number; ticks?: number;
}) {
  const world = bootHeadlessWorld(opts.seed);
  const ai: any = world.player;
  const cx = 120, cy = 120;

  for (let ex = -13; ex <= 13; ex++) for (let ey = -13; ey <= 13; ey++) {
    const c = world.map.cellAtTile(cx + ex, cy + ey);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { b.team = 0; b.owner_idx = 0; }

  placeTank(world, cx, cy, false);
  ai.armour = 40; ai.shells = 40; ai.team = 0;

  const enemy: any = world.spawn(Tank);
  enemy.spawn(1);
  const place = (tx: number, ty: number) => {
    enemy.x = tileToBWorld(tx); enemy.y = tileToBWorld(ty);
    enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
  };
  place(cx + opts.dx, cy + opts.dy);
  enemy.onBoat = false; enemy.armour = 40; enemy.shooting = false; enemy.speed = 0;

  // WALL: fully ENCLOSE the enemy in a wall ring so the AI can NEVER obtain line of sight. Any
  // shot fired at it is therefore unambiguously blind (it can only hit the wall). This isolates
  // the "fires without LOS" defect from the legitimate "reposition around a short wall" behaviour.
  if (opts.wall) {
    const ex0 = cx + opts.dx, ey0 = cy + opts.dy;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      if (a === 0 && b === 0) continue;               // leave the enemy's own tile
      const c = world.map.cellAtTile(ex0 + a, ey0 + b);
      if (c && !c.pill && !c.base) c.setType('|');     // wall ring
    }
  }

  const a4: any = enableBrain(world);

  let shots = 0, prevShells = ai.shells, minArm = enemy.armour, hitsFar = 0;
  let blindNoLOS = 0, blindOffAim = 0, legit = 0;
  const ticks = opts.ticks ?? 1500;

  for (let i = 0; i < ticks; i++) {
    if (opts.goneAtTick != null && i === opts.goneAtTick) place(cx + 40, cy + 40); // enemy flees far
    world.tick();
    if (opts.goneAtTick != null && i >= opts.goneAtTick) { place(cx + 40, cy + 40); enemy.armour = 40; }

    if (ai.shells < prevShells) {
      const n = prevShells - ai.shells; prevShells = ai.shells;
      shots += n;
      const los = checkBarriers(a4, ai.x, ai.y, enemy.x, enemy.y) === 0;
      const bearing = directionTo(ai.x, ai.y, enemy.x, enemy.y) & 0xFF;
      const face = (ai.direction ?? 0) & 0xFF;
      const err = Math.min((face - bearing + 256) & 0xFF, (bearing - face + 256) & 0xFF);
      const dist = Math.hypot(ai.x - enemy.x, ai.y - enemy.y);
      const inRange = dist <= 2048;
      if (!los) blindNoLOS += n;
      else if (err > AIM_CONE || !inRange) blindOffAim += n;
      else legit += n;
    }
    if (enemy.armour < minArm) minArm = enemy.armour;
    if (opts.goneAtTick != null && enemy.armour < 40) hitsFar += (40 - enemy.armour);
  }

  return {
    shots, legit, blindNoLOS, blindOffAim,
    enemyDamage: Math.max(0, 40 - minArm),
    goal: a4.currentGoal,
  };
}

// ── HIT EFFICIENCY vs enemy motion ────────────────────────────────────────────
// Ground-truths "wasted shots" as damage-per-shot: pin an INVINCIBLE enemy (armour never lets it
// die/respawn) at ~5 tiles, refill the AI's shells each tick so it keeps firing (no refuel break),
// and drive it through motion patterns. Lead-aim predicts a straight line, so juking / stopping is
// where it should waste shots. efficiency = damage dealt / shots fired (1.0 = every shell connects).
function measureEfficiency(seed: number, motion: 'still' | 'straight' | 'juke' | 'stopgo') {
  const world = bootHeadlessWorld(seed);
  const ai: any = world.player;
  const cx = 120, cy = 120;
  for (let ex = -14; ex <= 14; ex++) for (let ey = -14; ey <= 14; ey++) {
    const c = world.map.cellAtTile(cx + ex, cy + ey);
    if (c && !c.pill && !c.base) c.setType('.');
  }
  for (const p of (world.map.pills ?? [])) { p.team = 0; p.owner_idx = 0; }
  for (const b of (world.map.bases ?? [])) { b.team = 0; b.owner_idx = 0; }
  placeTank(world, cx, cy, false);
  ai.armour = 40; ai.shells = 40; ai.team = 0;

  const enemy: any = world.spawn(Tank);
  enemy.spawn(1);
  const baseX = cx + 5, baseY = cy;
  enemy.x = tileToBWorld(baseX); enemy.y = tileToBWorld(baseY);
  enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
  enemy.onBoat = false; enemy.armour = 200; enemy.shooting = false;

  const a4: any = enableBrain(world);
  let shots = 0, prevShells = ai.shells, hits = 0;
  const N = 1600, SPD = 3.5 * 256, LEG = 40;
  for (let i = 0; i < N; i++) {
    // Slide the enemy in X (toward/away). NOTE: this changes RANGE (5→8.5 tiles) as well as motion,
    // so lower dmg/shot on the moving patterns is partly shells falling short at the far end, not
    // purely lead-aim. (A constant-range lateral variant is the cleaner isolation — future work.)
    let ox = 0;
    if (motion === 'straight') ox = ((i % (2 * LEG)) < LEG ? (i % LEG) : (LEG - (i % LEG))) / LEG * SPD - SPD / 2;
    else if (motion === 'juke') { const leg = Math.floor(i / 20) & 1; ox = (leg ? -1 : 1) * (i % 20) / 20 * SPD; }
    else if (motion === 'stopgo') ox = ((Math.floor(i / 60) & 1) === 0) ? (i % 60) / 60 * SPD : SPD;
    enemy.x = (tileToBWorld(baseX) + Math.round(ox)) & 0xFFFF;
    enemy.y = tileToBWorld(baseY);
    enemy.cell = world.map.cellAtWorld(enemy.x, enemy.y);
    enemy.direction = ox >= 0 ? 0 : 128;
    enemy.shooting = false;

    const armBefore = enemy.armour;
    world.tick();
    if (enemy.armour < armBefore) hits += armBefore - enemy.armour;
    enemy.armour = 200;                       // keep it alive for the whole window
    if (ai.shells < prevShells) shots += prevShells - ai.shells;
    ai.shells = 40; prevShells = 40;          // never run dry → stays in KillTank
  }
  return { shots, hits, eff: shots ? hits / shots : 0 };
}

describe('KillTank hit efficiency vs motion', () => {
  it('measures damage-per-shot across still / straight / juke / stopgo', () => {
    for (const m of ['still', 'straight', 'juke', 'stopgo'] as const) {
      const r = measureEfficiency(1000, m);
      // r.eff is damage-per-shot; a shell does 5 (or 10) armour, so ÷5 ≈ hit rate.
      // eslint-disable-next-line no-console
      console.log(`[eff ${m.padEnd(8)}] shots=${r.shots} damage=${r.hits} dmg/shot=${r.eff.toFixed(1)} ≈hit${Math.min(100, Math.round(r.eff / 5 * 100))}%`);
    }
    // Baselines only fire this as a measurement; assert the AI at least engages (fires) each pattern.
    expect(measureEfficiency(1000, 'still').shots).toBeGreaterThan(0);
  });
});

describe('KillTank does not fire blindly', () => {
  it('CLEAR control: fires legit shots that connect', () => {
    const r = measure({ seed: 1000, dx: 5, dy: 0 });
    // eslint-disable-next-line no-console
    console.log(`[los CLEAR] shots=${r.shots} legit=${r.legit} blindNoLOS=${r.blindNoLOS} ` +
      `blindOffAim=${r.blindOffAim} enemyDamage=${r.enemyDamage}`);
    expect(r.enemyDamage).toBeGreaterThan(0);              // it does hit an open enemy
    // Legit shots dominate; a couple of no-LOS reads are the respawn artifact (the enemy teleports
    // to its spawn on death, so a few in-flight shots momentarily have no line to the far respawn).
    expect(r.legit).toBeGreaterThan(r.blindNoLOS * 5);
    expect(r.blindNoLOS).toBeLessThanOrEqual(3);
  });

  it('WALL: must NOT fire at an enemy with no line of sight', () => {
    let totalShots = 0, totalBlind = 0, totalDamage = 0;
    for (const [seed, dx, dy] of [[1000, 6, 0], [2000, 0, 6], [3000, 5, 4]] as const) {
      const r = measure({ seed, dx, dy, wall: true });
      totalShots += r.shots; totalBlind += r.blindNoLOS; totalDamage += r.enemyDamage;
      // eslint-disable-next-line no-console
      console.log(`[los WALL @(+${dx},+${dy})] shots=${r.shots} blindNoLOS=${r.blindNoLOS} ` +
        `blindOffAim=${r.blindOffAim} enemyDamage=${r.enemyDamage} goal=${r.goal}`);
    }
    // eslint-disable-next-line no-console
    console.log(`[los WALL] TOTAL shots=${totalShots} blindNoLOS=${totalBlind} enemyDamage=${totalDamage}`);
    // The FIX target: an enemy behind a wall can't be hit, so the AI should reposition for LOS,
    // NOT spray shells into the wall. Until the LOS gate lands this documents the blind-fire count.
    expect(totalDamage, 'shots into a wall never damage the enemy').toBe(0);
    expect(totalBlind, 'AI should not fire without line of sight').toBe(0);
  });

  it('GONE: must stop firing after the enemy vacates the spot', () => {
    const r = measure({ seed: 1000, dx: 5, dy: 0, goneAtTick: 300, ticks: 1200 });
    // eslint-disable-next-line no-console
    console.log(`[los GONE] shots=${r.shots} legit=${r.legit} blindNoLOS=${r.blindNoLOS} ` +
      `blindOffAim=${r.blindOffAim} (shots after enemy fled = blindOffAim)`);
    // After the enemy is 40 tiles away, KillTank should drop it / stop firing at the old spot.
    expect(r.blindOffAim, 'AI should not keep firing where the enemy used to be').toBe(0);
  });
});
