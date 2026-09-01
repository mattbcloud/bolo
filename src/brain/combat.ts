/**
 * Combat Functions — aIndy3.1 TypeScript Port
 *
 * Ported functions:
 *   TurnTowardsDir      (0x017b6a) — tank rotation controller (full decode)
 *   AimAt               (0x0026cc) — generic aim + fire
 *   LinearAim           (0x014D4C) — ballistic lead calculator
 *   OnTarget            (0x015940) — aim accuracy validator
 *   Shoot               (0x017876) — main fire controller (rate limited)
 *   ShootPill           (0x011e0a) — pill-specific fire with trajectory validation
 *   CheckBarriers       (0x00a9ae) — obstacle count between two points
 *   ChooseAttackPosition (0x010e7e) — 40-sector AP spiral search
 *   AdjustTankAtAP      (0x0117de) — fine-tune position at attack position
 *   DoCommonStuff       (0x008212) — per-tick opportunistic action engine
 *
 * References:
 *   combat_helpers_decode.md, shootpill_decode.md, chooseattackposition_real_decode.md,
 *   turntowardsdir_decode.md, adjusttankatap_decode.md, checkbarriers_decode.md,
 *   docommonstuff_decode.md, tactical_helpers_decode.md
 */

import { A4State } from './a4_state.js';
import type { BrainState, PillState } from './aindy_interface.js';
import { tickCount, signedWord } from './aindy_interface.js';
import {
  directionTo, computeDistanceBetween, locationFromDir,
  computeDirectionDelta, turnTowardsDir,
} from './pathfinding.js';
import { doBuilding as _doBuilding, dropMines as _dropMines } from './building.js';

// TurnTowardsDir is imported from pathfinding.ts (the canonical implementation).
// Re-exported here for callers that import from combat.ts:
export { turnTowardsDir } from './pathfinding.js';

// ─────────────────────────────────────────────────────────────────────────────
// AimAt (0x0026cc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AimAt — Turn toward target and fire in one of two modes.
 *
 * Mode 0 (close-range): fire immediately if shellCount < 14.
 * Mode 1 (ranged): gate on distance vs shot range midpoint ± 64.
 *
 * See tactical_helpers_decode.md §AimAt.
 */
export function aimAt(
  a4: A4State,
  state: BrainState,
  targetX: number,
  targetY: number,
  mode: number,
): void {
  const tank = state.tank;
  const dist = computeDistanceBetween(tank.x, tank.y, targetX, targetY);
  const rangeMid = (tank.shellCount & 0xFF) << 7;   // byte[52] × 128

  // Turn toward target with tolerance=0 (verified from assembly 0x002702)
  const targetDir = directionTo(tank.x, tank.y, targetX, targetY);
  turnTowardsDir(a4, tank.facingDir, targetDir, 0);

  if (mode === 0) {
    // Close-range fire
    if ((tank.shellCount & 0xFF) < 14) {
      a4.steeringWord |= 0x10;   // FORWARD (fire while moving)
    }
  } else {
    // Ranged fire: gate on distance relative to shot range
    const shortRange = Math.max(0, rangeMid - 64);
    const longRange  = rangeMid + 64;
    if (dist < shortRange) {
      a4.steeringWord |= 0x20;   // close fire (BRAKE / close-range trigger)
    } else if (dist > longRange) {
      a4.steeringWord |= 0x10;   // long fire (FORWARD toward target)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LinearAim (0x014D4C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LinearAim — Compute predicted aim position to hit a moving target.
 *
 * Uses projectile travel time to lead the shot.
 * Full original uses SANE FP with lfd_x/y_slopes; this port uses Math equivalents.
 *
 * Lead time: distance / 32 ticks — a shell moves a constant 32 world units per tick.
 * Lead position: target + velocity_vector × lead_ticks.
 *
 * @returns { x, y } predicted aim position (BWorld)
 */
export function linearAim(
  state: BrainState,
  srcX: number, srcY: number,
  tgtX: number, tgtY: number,
  tgtVelDir: number,     // target's direction of movement (0-255)
  tgtSpeed: number,      // target's speed (arbitrary units)
): { x: number; y: number } {
  const tank = state.tank;
  const dist = computeDistanceBetween(srcX, srcY, tgtX, tgtY);

  // Lead time = flight time, and a shell's flight time is exactly linear in distance: shell.ts
  // move() steps a CONSTANT round(cos*32), round(sin*32) every tick, i.e. 32 world units per
  // tick regardless of range, so reaching `dist` takes dist/32 ticks.
  //
  // This used to be `sqrt(dist * 2.6 + 1.5)`, which is not that curve and is not even the same
  // dimension — it agrees with dist/32 only at dist 2662 (10.4 tiles), past our own 7-tile reach.
  // Everywhere a shot is actually taken it OVER-leads: 21 ticks too many at 2 tiles, 20 at 4, 15
  // at 6. Measured across 477 shots at a strafing tank, mean excess lead was +19 ticks, and a
  // tank moving ~8 units/tick turns that into ~150 world units of aim-off — wider than the 127
  // unit shell collision radius, so the shell sails past IN FRONT of the target. Hit rate against
  // a moving tank was 67.3% (31.9% flew wide to end-of-range) versus 98.7% against a stationary
  // one: the aim itself was fine all along, the lead was wrong.
  const leadTicks = Math.max(1, Math.round(dist / 32));

  if (tgtSpeed <= 0 || leadTicks <= 0) {
    return { x: tgtX, y: tgtY };
  }

  // Project target position forward by leadTicks
  // Speed factor: 1 BWorld per tick on road (approximate)
  const movePerTick = tgtSpeed;
  const proj = locationFromDir(tgtVelDir, leadTicks * movePerTick, tgtX, tgtY);

  return { x: proj.x & 0xFFFF, y: proj.y & 0xFFFF };
}

// ─────────────────────────────────────────────────────────────────────────────
// OnTarget (0x015940)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OnTarget — Check whether current tank facing will hit the target.
 *
 * Projects the shot trajectory and measures miss distance.
 * Returns true if within 128 BWorld of target (≈0.5 tile tolerance).
 *
 * @param useRangeFlag  0 = project at target distance; 1 = project at full range
 */
export function onTarget(
  state: BrainState,
  targetX: number,
  targetY: number,
  useRangeFlag: number,
): boolean {
  const tank = state.tank;
  const dist = computeDistanceBetween(tank.x, tank.y, targetX, targetY);

  if (dist > 2048) return false;   // hard max range (8 tiles)

  const shotRange = (tank.shellCount & 0xFF) << 7;   // byte[52] × 128

  // Project shot along current facing
  let projDist: number;
  if (useRangeFlag) {
    projDist = shotRange;
  } else {
    projDist = dist;
  }

  const { x: shotX, y: shotY } = locationFromDir(
    tank.facingDir, projDist, tank.x, tank.y,
  );

  // Miss distance
  const miss = computeDistanceBetween(targetX, targetY, shotX, shotY);
  if (miss >= 128) return false;   // 128 BWorld tolerance (~0.5 tile)

  if (useRangeFlag) return true;

  // Verified from assembly 0x0159ea: when dist < 128 (too close), returns false.
  // When dist >= 128: return true only if shot range reaches target.
  if (dist < 128) return false;
  return shotRange >= (dist - 128);
}

// ─────────────────────────────────────────────────────────────────────────────
// CheckBarriers (0x00a9ae)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CheckBarriers — Count obstacle tiles between two BWorld positions.
 *
 * Uses DDA (Digital Differential Analysis) tile traversal: samples one point
 * per tile-width of the path, ensuring no tile is skipped even on long diagonals.
 * Steps = max(|tileDeltaX|, |tileDeltaY|), minimum 2 to catch intermediate tiles.
 *
 * The original 324-byte function stores results in an 8-entry directional flags
 * array and handles vertical/horizontal/diagonal cases separately.
 * See checkbarriers_decode.md.
 *
 * @returns number of barrier tiles in path (0 = clear)
 */
export function checkBarriers(
  a4: A4State,
  fromX: number, fromY: number,
  toX: number, toY: number,
): number {
  let barriers = 0;

  const dx = signedWord(toX - fromX);
  const dy = signedWord(toY - fromY);

  // DDA: at least 1 sample per tile traversed; minimum 2 to catch intermediate tiles
  const tileDeltaX = Math.abs(dx) >> 8;
  const tileDeltaY = Math.abs(dy) >> 8;
  const steps = Math.max(2, Math.max(tileDeltaX, tileDeltaY));

  for (let i = 1; i < steps; i++) {
    const x = (fromX + Math.round(dx * i / steps)) & 0xFFFF;
    const y = (fromY + Math.round(dy * i / steps)) & 0xFFFF;
    const tileX = (x >> 8) & 0xFF;
    const tileY = (y >> 8) & 0xFF;
    const cell  = a4.worldMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)];
    const terrain = cell & 0x0F;

    // Barrier terrain for shots — MUST match the engine (shell.ts collide()):
    // a shell is stopped by wall(0='|'), shot-wall(8='}'), forest(5='#'),
    // boat(9='b'), and any live pillbox tile(12). Shots do NOT pass through walls
    // (walls must be destroyed first). Earlier "wall-penetration" model was wrong:
    // it made the brain fire through walls the engine blocks → wasted shots / misses.
    if (terrain === 0 || terrain === 5 || terrain === 8 || terrain === 9 || terrain === 12) {
      barriers++;
    }
  }

  // Store in A4 cache (A4[13510] = CheckBarriers result cache)
  a4.newGetPillCheckBarriersCache = barriers & 0xFFFF;

  return barriers;
}

// ─────────────────────────────────────────────────────────────────────────────
// FindSafestPointFrom (used by FixPill + NewGetPill when target is dangerous)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FindSafestPointFrom — Find the safest approach tile to reach a pill/target.
 *
 * Scans concentric rings at 2–4 tiles from the target. Scores each candidate by:
 *   - Terrain traversal cost (impassable tiles rejected)
 *   - Danger level (tiles in danger skipped if danger > 1)
 *   - Blocked map
 *   - Distance from current tank position (prefer close tiles)
 *   - Barriers between candidate and target (prefer clear line of fire)
 *
 * @param targetX  BWorld X of the danger target (pill or base)
 * @param targetY  BWorld Y of the danger target
 * @returns { x, y } tile coordinates of safest approach tile
 */
export function findSafestPointFrom(
  a4: A4State,
  state: BrainState,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  const pillTX = (targetX >> 8) & 0xFF;
  const pillTY = (targetY >> 8) & 0xFF;

  let bestCost = 0x7FFF;
  let bestX = pillTX;
  let bestY = pillTY;

  // Scan rings at 2, 3, 4 tiles from pill center
  for (let radius = 2; radius <= 4; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Only scan perimeter of this ring (not inner tiles)
        if (Math.abs(dx) < radius && Math.abs(dy) < radius) continue;

        const tx = (pillTX + dx) & 0xFF;
        const ty = (pillTY + dy) & 0xFF;
        const idx = ((ty & 0xFF) << 8) | (tx & 0xFF);
        const cell = a4.worldMap[idx];
        const terrain = cell & 0x0F;

        // Skip impassable terrain
        if (terrain === 0 || terrain === 5 || terrain === 8 || (cell & 0x80)) continue;
        const terrainCost = a4.examineTerrainCostTable[terrain] ?? 1000;
        if (terrainCost >= 1000) continue;

        // Skip high-danger tiles
        const danger = a4.dangerMap[idx];
        if (danger > 1) continue;

        // Skip hard-blocked tiles
        if (a4.blockedMap[idx]) continue;

        // Cost: terrain + distance from tank (in tiles) + barriers to target
        const candBWX = (tx << 8) + 128;
        const candBWY = (ty << 8) + 128;
        const distFromTank = computeDistanceBetween(state.tank.x, state.tank.y, candBWX, candBWY);
        const barriersToPill = checkBarriers(a4, candBWX, candBWY, targetX, targetY);

        const cost = terrainCost
          + danger * 100
          + (distFromTank >> 8)       // tile-scale distance from tank
          + barriersToPill * 60;      // prefer clear line of fire to target

        if (cost < bestCost) {
          bestCost = cost;
          bestX = tx;
          bestY = ty;
        }
      }
    }
    // If we found a good candidate at this radius, stop expanding
    if (bestCost < 0x7FFF && bestCost < 200) break;
  }

  return { x: bestX, y: bestY };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shoot (0x017876)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shoot — Main fire controller with rate limiting.
 *
 * 1. Hard distance gate (2048 BWorld = 8 tiles)
 * 2. Turn toward target
 * 3. Range-aware thrust logic
 * 4. Man-protection check (don't hit own deployed builder)
 * 5. OnTarget accuracy check
 * 6. Rate-limited fire: max 1 shot per 60 ticks (1.2 s)
 *
 * See combat_helpers_decode.md §Shoot.
 *
 * @param rateGate   0 = no rate limit; 1 = 60-tick cooldown
 * @param rangeFlag  0 = simple forward mode; 1 = range-aware mode
 */
export function shoot(
  a4: A4State,
  state: BrainState,
  targetX: number,
  targetY: number,
  rateGate: number,
  rangeFlag: number,
): void {
  const tank = state.tank;
  const dist = computeDistanceBetween(tank.x, tank.y, targetX, targetY);

  if (dist > 2048) return;   // hard max-range gate (8 tiles)

  const shotRange = (tank.shellCount & 0xFF) << 7;   // byte[52] × 128
  const overshoot = dist - shotRange;

  // Step 1: Turn toward target with tolerance=0 (verified from assembly 0x0178ca)
  // Shoot requires exact aim — keeps turning until angErr===0.
  const targetDir = directionTo(tank.x, tank.y, targetX, targetY);
  const aimSettled = turnTowardsDir(a4, tank.facingDir, targetDir, 0);

  // Step 2: Range-aware thrust/retreat logic (verified from 0x0178f0-0x017932)
  if (!rangeFlag) {
    // Simple mode: push forward if not at max range (shellCount < 14)
    if ((tank.shellCount & 0xFF) < 14) {
      a4.steeringWord |= 0x10;   // FORWARD
    }
  } else {
    if (overshoot > 64) {
      // Target beyond range: advance
      if (overshoot >= 256) {
        a4.steeringWord |= 0x10;  // hard advance
      } else {
        a4.firingWord   |= 0x10;  // gentle advance
      }
    } else if (overshoot < -64) {
      // Target within range (too close): retreat
      const retreat = -overshoot;
      if (retreat >= 256) {
        a4.steeringWord |= 0x20;  // hard retreat/brake
      } else {
        a4.firingWord   |= 0x20;  // gentle retreat
      }
    }
    // |overshoot| < 64: at ideal range — let OnTarget decide
  }

  // Step 3: Man-protection — don't fire if shot would land near own deployed builder.
  if (state.tank.manPtr !== null) {
    const projDist = rangeFlag ? shotRange : dist;
    const { x: shotX, y: shotY } = locationFromDir(
      tank.facingDir, projDist, tank.x, tank.y,  // fixed: was tank.localX/Y
    );
    const manX = state.tank.altX;
    const manY = state.tank.altY;
    if (computeDistanceBetween(manX, manY, shotX, shotY) < 256) {
      return;   // would hit own man — abort
    }
  }

  // Step 4: Aim accuracy check
  if (!onTarget(state, targetX, targetY, rangeFlag)) return;

  // ...and don't pull the trigger while the hull is still slewing. onTarget's tolerance is a
  // flat 128 world units, which at 7 tiles is about 4 direction units of facing error, and a
  // 4-unit error puts the shell ~117 units off the bearing - right at the 127-unit collision
  // radius. So onTarget green-lights a shot taken mid-swing that lands on the very edge of the
  // target or just past it. turnTowardsDir has already decided whether the hull is inside its
  // deadband (returns 1) or is still being commanded to turn (0); requiring the former costs at
  // most a tick of delay and spends the shell on a settled bearing instead.
  //
  // Measured over 8 seeds of full-brain play: shells released while the hull was turning landed
  // 51.6% of the time, against 79.9% for shells released settled. That gap is the whole of the
  // reported 'jerks left to right while firing, less than half the shells land' - and it is far
  // worse live than here, because in multiplayer the brain's turn commands round-trip to the
  // server (client.ts _runBrainTick sends START/STOP deltas; authority is false), so the hull
  // overshoots and hunts and a much larger share of shots get taken mid-swing.
  if (!aimSettled) return;

  // Step 5: Fire
  if (!rateGate) {
    // No rate limit: forward + fire motion
    a4.steeringWord |= 0x40;   // FORWARD_FIRE
    a4.shotFiredThisTick = 1;
  } else {
    // Rate-limited: max 1 shot per 60 ticks (1.2 seconds at 50 Hz).
    // Use the SIM tick counter, not wall-clock tickCount(): wall-clock made the
    // fire rate machine-speed-dependent (fewer shots under CPU load) and
    // non-deterministic. a4.tickCounter advances exactly once per sim tick.
    const now = a4.tickCounter;
    a4.shootTickSnapshot = now;
    if ((now - a4.lastShotTick) > 60) {
      a4.firingWord  |= 0x40;   // rate-limited fire
      a4.lastShotTick = now;
      a4.shotFiredThisTick = 1;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ShootPill (0x011e0a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ShootPill — Validate and fire at a pill target.
 *
 * Multi-gate validation (shootpill_decode.md):
 *   1. Armor gate (abort if armor < 14)
 *   2. TurnTowardsDir — return immediately if already aligned
 *   3. Direction delta ≤ 3 (tight alignment check)
 *   4. Trajectory simulation (simplified: direction alignment only)
 *
 * @param pill       Target pill
 * @param direction  Firing direction (0-255)
 * @param skipCheck  If nonzero, skip trajectory check (return 0)
 * @returns 1 if shot fired, 0 if failed validation
 */
export function shootPill(
  a4: A4State,
  state: BrainState,
  pill: PillState,
  direction: number,
  skipCheck: number,
  stationary = 0,
): number {
  const tank = state.tank;

  const dir = direction & 0xFF;

  // The gun is HULL-FIXED: the shell flies in tank.direction, so the hull must FACE the
  // pill to hit it. Turn with a TIGHT tolerance (1) — the default 5 let the hull STOP
  // turning while still 3-5 units off the true bearing, and at 7 tiles a 3-unit error is a
  // ~130-unit miss (just past the pill's 127 collision radius), so it fired and missed.
  // A tight tolerance keeps the hull fine-tuning until it's near-exactly on the bearing.
  const aimSettled = turnTowardsDir(a4, tank.facingDir, dir, 1);

  // STATIONARY mode fires via the firingWord (sets shooting, NOT accelerating) so the tank
  // can hold a dead stop while firing; the forward-fire path (steeringWord 0x40/0x10 →
  // accelerating) would fight setSpeed's brake (accelerating+braking = coast). Off-target
  // or blocked, we only creep forward in NON-stationary mode.

  // Ammo / firing-range gate (shellCount = firingRange×2; 14 = max range 7).
  if ((tank.shellCount & 0xFF) < 14) {
    if (!stationary) a4.steeringWord |= 0x10;
    return 0;
  }

  const pillX = ((pill.tileX & 0xFF) << 8) + 128;
  const pillY = ((pill.tileY & 0xFF) << 8) + 128;
  const dist  = computeDistanceBetween(tank.x, tank.y, pillX, pillY);

  // Falling short → the shell can't reach; close in.
  const shotRange = (tank.shellCount & 0xFF) << 7;
  if (dist > shotRange) {
    if (!stationary) a4.steeringWord |= 0x10;
    return 0;
  }

  // ACCURACY GATE: the shell lands ~`dist × sin(facingErr)` off the true bearing and hits
  // only if that offset is within the pill's ~127-unit collision radius. Convert that to a
  // facing tolerance in 0-255 dir units (using 115 for margin); it TIGHTENS with distance
  // (~6 units at 3 tiles, ~2 at 7). Fire only when the hull's ACTUAL facing is within it,
  // so the shell lands ON the pill instead of grazing past. (The old gate fired at a fixed
  // ≤3-unit error AND simulated the shot along the intended bearing, not the real facing —
  // so at range the real shell flew off-angle and missed.)
  const tolUnits  = Math.max(1, Math.floor(Math.asin(Math.min(1, 115 / Math.max(1, dist))) * 256 / (2 * Math.PI)));
  const facingErr = computeDirectionDelta(tank.facingDir, dir);
  if (facingErr > tolUnits) {
    if (!stationary && skipCheck === 0) a4.steeringWord |= 0x10;   // close in: wider cone up close
    return 0;
  }

  // On target → require a clear LINE OF SIGHT (engine stops shells at walls/forest/etc).
  if (skipCheck === 0 && checkBarriers(a4, tank.x, tank.y, pillX, pillY) !== 0) {
    if (!stationary) a4.steeringWord |= 0x10;   // blocked: advance to clear the shot
    return 0;
  }

  // SETTLED-HULL GATE. The cone above asks only where the hull points, never whether it is still
  // moving. tolUnits is ~2 units at 7 tiles while turnTowardsDir's deadband is ~0.66, so there is
  // a band where the cone passes and the hull is still being commanded to turn - and the shot
  // goes out mid-swing. Measured over 8 seeds: shells released while turning landed 51.6%,
  // against 79.9% released settled, and shootPill in stationary mode was the largest single
  // source of them. Waiting for the hull to settle costs at most a tick.
  //
  // skipCheck bypasses this, as it does the barrier test: that is the point-blank reclaim path,
  // where an adjacent pill must be shot even under an awkward aim and where refusing to fire
  // re-creates the freeze that gate exists to fix.
  if (!aimSettled && skipCheck === 0) {
    if (!stationary) a4.steeringWord |= 0x10;   // keep closing while the hull settles
    return 0;
  }

  if (stationary) a4.firingWord |= 0x40;   // fire in place (no accelerate)
  else            a4.steeringWord |= 0x40;  // forward-fire
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// ShootPillFromCover — edge-aim around cover (the validated cover method)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cover-method fire. When a barrier (built wall / forest / owned pill) sits on the
 * straight line to the pill CENTER, the engine blocks a centre-aimed shot — but a
 * shot aimed at the pill's near EDGE can graze PAST the cover and still land within
 * the 127-unit collision radius of the pill, while the pill (aiming at the tank's
 * centre) keeps putting its shells into the cover. This is the asymmetry that lets
 * the tank neutralise a pill while taking ~zero damage (validated in __sim__:
 * dealt 15 / taken 0 with a maintained wall).
 *
 * Self-correcting geometry: if centre LOS is clear, fire centre (no cover needed).
 * If centre is blocked, try a perpendicular edge offset to EACH side and fire at
 * the first side whose LOS is clear. Aim/fire are STATIONARY (firingWord SHOOT bit,
 * not FORWARD_FIRE) so the tank holds behind the cover instead of driving into the
 * open. Returns 1 if it fired, 0 otherwise.
 *
 * @param edgeOffset  perpendicular aim offset in BWorld units (< 127 collision
 *                    radius; ~112 leaves margin for direction quantisation).
 * @param fireTolerance  alignment tolerance for the fire gate (0 = exact; the edge
 *                    aim needs tight alignment or the shell misses the pill).
 */
export function shootPillFromCover(
  a4: A4State,
  state: BrainState,
  pill: PillState,
  edgeOffset = 112,
  hitRadius = 3,   // angular fire tolerance in direction units (0-255)
): number {
  const tank = state.tank;
  if (!pill.attackable) return 0;

  const pillX = ((pill.tileX & 0xFF) << 8) + 128;
  const pillY = ((pill.tileY & 0xFF) << 8) + 128;

  // Aim point to STEER toward: pill centre if LOS is clear, else the pill edge on
  // whichever perpendicular side has a clear line (graze past the cover).
  //
  // CRITICAL geometry (why we scan the offset instead of using a fixed 112): a shell
  // only hits the pill when it enters the pill's cell within 127 of its centre
  // (shell.ts collide). Aiming at a large fixed edge offset (112) puts the shell's
  // closest approach to the centre at ~111 — right at the ragged edge of the 127
  // radius — so the ±fireTolerance angular slop biases most grazes OUTSIDE 127 and
  // they sail past (measured: tank fires steadily behind cover yet armour barely
  // moves). Instead scan the offset from small→large and take the SMALLEST offset
  // whose LOS clears the cover: that keeps the shell as close to centre as possible
  // (deep inside 127 = reliable hit) while still grazing past the single cover tile.
  let aimX = pillX, aimY = pillY;
  if (checkBarriers(a4, tank.x, tank.y, pillX, pillY) > 0) {
    const dx = signedWord(pillX - tank.x);
    const dy = signedWord(pillY - tank.y);
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;        // unit tank→pill (screen space)
    let chosen: { x: number; y: number } | null = null;
    for (const off of [64, 80, 96, 112, edgeOffset]) {   // ascending: smallest clearing offset wins
      const cands = [
        { x: (pillX + Math.round(-uy * off)) & 0xFFFF, y: (pillY + Math.round(ux * off)) & 0xFFFF },
        { x: (pillX + Math.round(uy * off)) & 0xFFFF, y: (pillY + Math.round(-ux * off)) & 0xFFFF },
      ];
      for (const c of cands) {
        if (checkBarriers(a4, tank.x, tank.y, c.x, c.y) === 0) { chosen = c; break; }
      }
      if (chosen) break;
    }
    if (!chosen) return 0;   // no clear edge — hold fire (caller may reposition)
    aimX = chosen.x; aimY = chosen.y;
  }

  // Steer the hull toward the aim point (keeps rotating; tolerance 0 = aim true).
  const fireDir = directionTo(tank.x, tank.y, aimX, aimY);
  turnTowardsDir(a4, tank.facingDir, fireDir, 0);

  // FIRE GATE — predict the hit directly instead of using an angular tolerance.
  // At ~6-7 tile range even a ±3 direction-unit tolerance spans >130 units laterally
  // at the pill (far more than its 127 collision radius), so an "aligned" graze sails
  // wide and the pill barely takes damage. Instead fire only when the shell along the
  // CURRENT facing will actually connect: (1) it clears the cover, and (2) its closest
  // approach to the pill CENTRE is inside the collision radius (with margin). The shell
  // hits a pill when it enters the pill's cell within 127 of centre (shell.ts collide).
  if ((tank.shellCount & 0xFF) < 14) return 0;
  const HIT_MARGIN = 110;   // < 127 collision radius, leaving slack for the discrete 32u shell step
  const projDist = computeDistanceBetween(tank.x, tank.y, pillX, pillY);
  const shot = locationFromDir(tank.facingDir & 0xFF, projDist, tank.x, tank.y);
  if (checkBarriers(a4, tank.x, tank.y, shot.x & 0xFFFF, shot.y & 0xFFFF) > 0) return 0;  // blocked by cover
  // Closest approach of the facing ray to the pill centre. The shell velocity unit is
  // (cos,sin) of ((256-dir)/256·2π), matching shell.ts move().
  const rdx = signedWord(pillX - tank.x), rdy = signedWord(pillY - tank.y);
  const frad = ((256 - (tank.facingDir & 0xFF)) * 2 * Math.PI) / 256;
  const fux = Math.cos(frad), fuy = Math.sin(frad);
  const proj = rdx * fux + rdy * fuy;
  if (proj <= 0) return 0;                                          // pill is behind our facing
  const closest = Math.sqrt(Math.max(0, rdx * rdx + rdy * rdy - proj * proj));
  if (closest > HIT_MARGIN) return 0;                              // would sail past the 127 radius
  void hitRadius;
  a4.firingWord |= 0x10;   // stationary fire (no forced forward motion)
  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// ChooseAttackPosition (0x010e7e)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ChooseAttackPosition — Find the best tile to attack a pill from.
 *
 * Searches all 40 directional sectors around the pill in a symmetric spiral
 * starting from the natural approach direction (tank→pill bearing).
 * Calls CalculateAPCostAndTest for each candidate.
 *
 * Simplified port: evaluates candidates as (dist to pill, terrain cost, danger).
 * Full 1150-byte version uses 40 SANE FP probes + CalculateAPCostAndTest.
 *
 * Side effect: sets a4.newGetPillAPChosen = 1, stores AP in a4.newGetPillAPX/Y.
 *
 * See chooseattackposition_real_decode.md.
 */
export function chooseAttackPosition(
  a4: A4State,
  state: BrainState,
  pill: PillState,
): void {
  // Init constants (A4[7612]=17, A4[7620]=5)
  a4.chooseAPInitConst17 = 17;
  a4.chooseAPInitConst5  = 5;
  a4.chooseAPBestCost    = 0xFFFFFFFF >>> 0;  // 0xFFFFFFFF

  // Clear candidate slots
  a4.chooseAPPrimary   = 0;
  a4.chooseAPFallback  = 0;
  a4.chooseAPEmergency = 0;

  const pillTileX = pill.tileX & 0xFF;
  const pillTileY = pill.tileY & 0xFF;

  // Scan area start (pill_tile - 20)
  a4.chooseAPScanStartX   = (pillTileX - 20) & 0xFF;
  a4.chooseAPScanStartY   = (pillTileY - 20) & 0xFF;
  a4.chooseAPScanBWorldX  = ((pillTileX - 20) << 8) & 0xFFFF;
  a4.chooseAPScanBWorldY  = ((pillTileY - 20) << 8) & 0xFFFF;
  a4.chooseAPFirstCall    = 1;

  // Compute approach direction (tank→pill bearing)
  const approachDir = directionTo(state.tank.x, state.tank.y, pill.x, pill.y);
  a4.chooseAPApproachDir = approachDir & 0xFF;

  // Starting sector: sector = floor(sqrt(direction × 3.2))
  const startSector = Math.min(39, Math.floor(Math.sqrt(approachDir * 3.2)));

  // Spiral search: direct + ±1..±12 + ±13..±19 + opposite (+20)
  const searchOrder: number[] = [startSector];
  for (let i = 1; i <= 19; i++) {
    searchOrder.push((startSector + i) % 40);
    searchOrder.push((startSector - i + 40) % 40);
  }
  searchOrder.push((startSector + 20) % 40);

  let bestCost = 0xFFFF;
  let bestTileX = pillTileX;
  let bestTileY = pillTileY;
  let found = false;

  // Try each sector at 3 candidate radii: 2, 3, 4 tiles from pill.
  // Prefer closer positions (less travel) that still have line-of-sight to pill.
  const APPROACH_RADII = [2 * 256, 3 * 256, 4 * 256] as const;

  for (const sector of searchOrder) {
    // Convert sector (0-39) to approach angle (each sector = 9°)
    const sectorAngle = Math.round(sector * 256 / 40) & 0xFF;

    for (const approachDist of APPROACH_RADII) {
      const { x: candX, y: candY } = locationFromDir(
        sectorAngle, approachDist, pill.x, pill.y,
      );
      const candTileX = (candX >> 8) & 0xFF;
      const candTileY = (candY >> 8) & 0xFF;
      const candIdx   = ((candTileY & 0xFF) << 8) | (candTileX & 0xFF);

      // Evaluate candidate: terrain + danger + distance from tank
      const rawCell  = a4.worldMap[candIdx];
      const terrain  = rawCell & 0x0F;

      // Skip impassable terrain
      if (terrain === 0 || (rawCell & 0x80)) continue;   // wall or water

      const terrainCost = a4.examineTerrainCostTable[terrain] ?? 1000;
      if (terrainCost >= 1000) continue;

      const danger = a4.dangerMap[candIdx];
      const distToTank = computeDistanceBetween(
        state.tank.x, state.tank.y, candX, candY,
      );

      // Check LOS to pill from this candidate position (prefer clear firing line)
      const barriersToPill = checkBarriers(a4, candX, candY, pill.x, pill.y);
      // Also check approach barriers (tank → candidate)
      const barriersToApproach = checkBarriers(a4, state.tank.x, state.tank.y, candX, candY);

      // Stall-bias penalty: heavily penalise sectors near the last failed AP to
      // force the search to explore a different angular approach after a stall.
      let stalledPenalty = 0;
      if (a4.chooseAPLastSector >= 0) {
        const rawDist = Math.abs(sector - a4.chooseAPLastSector);
        const sectorDist = Math.min(rawDist, 40 - rawDist);  // wrap-around distance
        if (sectorDist <= 5) {
          // ≤5 sectors away from failed AP → steep penalty (fades at edge)
          stalledPenalty = (6 - sectorDist) * 60;
        }
      }

      // Cost: terrain + danger + distance from tank + barriers to pill (weighted heavily)
      // Closer radii (2 tiles) slightly preferred over 3/4 via distToTank scaling.
      const cost = terrainCost
        + danger * 50
        + (distToTank >> 8)
        + barriersToPill * 120     // strongly prefer clear LOS to pill
        + barriersToApproach * 60  // prefer easy route to AP
        + stalledPenalty;          // bias away from previously stalled sector

      if (cost < bestCost) {
        bestCost  = cost;
        bestTileX = candTileX;
        bestTileY = candTileY;
        found = true;

        // Set primary candidate (A4[13465])
        a4.chooseAPPrimary  = 1;
        a4.chooseAPPrimaryX = candTileX & 0xFF;
        a4.chooseAPPrimaryY = candTileY & 0xFF;
        a4.chooseAPBestX    = candTileX & 0xFF;
        a4.chooseAPBestY    = candTileY & 0xFF;
        a4.chooseAPBestCost = cost;

        // Excellent candidate found: clear LOS, no danger, close to tank
        if (barriersToPill === 0 && barriersToApproach === 0 && danger === 0 && cost < 80) {
          break;
        }
      }
    }

    // Stop outer search if excellent candidate found
    if (found && a4.chooseAPBestCost < 80) break;
  }

  // Store result
  if (found) {
    a4.newGetPillAPX     = (bestTileX << 8) + 128;
    a4.newGetPillAPY     = (bestTileY << 8) + 128;
    a4.newGetPillAPChosen = 1;
    a4.newGetPillApproachModeA = 1;  // A4[13480] = approach in progress
  } else {
    // Fallback: no scored firing slot found. Do NOT target the pill CENTRE — a live pill
    // is impassable (world_map getTankSpeed 0), so navigating there stalls (A* can't enter;
    // the tank freezes adjacent). Instead pick the PASSABLE tile adjacent to the pill that
    // is nearest the tank, so the move target is always reachable and the tank advances to
    // a point-blank firing position rather than deadlocking on the unenterable centre.
    const pTileX = pill.tileX & 0xFF, pTileY = pill.tileY & 0xFF;
    let bx = pTileX, by = pTileY, bestD = Infinity, ok = false;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
      const nx = (pTileX + dx) & 0xFF, ny = (pTileY + dy) & 0xFF;
      const raw = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
      const terr = raw & 0x0F;
      if (terr === 0 || (raw & 0x80) || (a4.examineTerrainCostTable[terr] ?? 1000) >= 1000) continue; // wall/water/impassable
      const candX = (nx << 8) + 128, candY = (ny << 8) + 128;
      const d = computeDistanceBetween(state.tank.x, state.tank.y, candX, candY);
      if (d < bestD) { bestD = d; bx = nx; by = ny; ok = true; }
    }
    a4.newGetPillAPX      = ok ? (bx << 8) + 128 : pill.x;
    a4.newGetPillAPY      = ok ? (by << 8) + 128 : pill.y;
    a4.newGetPillAPChosen = 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AdjustTankAtAP (0x0117de)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AdjustTankAtAP — Fine-tune tank position at attack position.
 *
 * Evaluates perpendicular approach paths (left and right of direct line),
 * picks the one with fewer barriers, turns toward it, and sets speed.
 *
 * Simplified port of the 702-byte function (adjusttankatap_decode.md).
 * Full version uses 4-iteration perpendicular barrier scan.
 *
 * @param pill      Target pill record
 * @param skipFlag  If nonzero, return 0 immediately
 * @returns 1 if adjustment issued, 0 if skipped
 */
export function adjustTankAtAP(
  a4: A4State,
  state: BrainState,
  pill: PillState,
  skipFlag: number,
): number {
  if (skipFlag !== 0) return 0;

  const tank = state.tank;

  // Compute direction from tank to pill
  const dirToPill = directionTo(tank.x, tank.y, pill.x, pill.y);

  // Perpendicular directions: left = dir+64, right = dir-64
  const perpLeft  = (dirToPill + 64) & 0xFF;
  const perpRight = (dirToPill - 64 + 256) & 0xFF;

  // Project perpendicular candidates (90 BWorld = ~0.35 tile)
  const perpDist = 90;
  const { x: leftX, y: leftY }   = locationFromDir(perpLeft,  perpDist, tank.x, tank.y);
  const { x: rightX, y: rightY } = locationFromDir(perpRight, perpDist, tank.x, tank.y);

  const barriersLeft  = checkBarriers(a4, tank.x, tank.y, leftX, leftY);
  const barriersRight = checkBarriers(a4, tank.x, tank.y, rightX, rightY);

  // Choose clearer perpendicular path
  let selectedDir: number;
  if (barriersLeft < barriersRight) {
    selectedDir = perpLeft;
  } else {
    selectedDir = perpRight;
  }

  // Turn toward selected direction
  turnTowardsDir(a4, tank.facingDir, selectedDir);

  // Speed based on angular alignment to pill
  const delta = computeDirectionDelta(tank.facingDir, dirToPill);
  if (delta < 32) {
    // Well aligned: full speed toward pill
    a4.steeringWord |= 0x10;   // FORWARD
  } else if (delta < 70) {
    // Moderate: medium approach
    a4.steeringWord |= 0x10;
  }
  // Poor alignment: just turn, no thrust

  return 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// DoCommonStuff (0x008212)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DoCommonStuff — Per-tick opportunistic AI actions.
 *
 * Executes defensive/tactical actions every tick regardless of current goal:
 *   1. Mine-at-feet when armor critically low
 *   2. Opportunistic shoot at closest enemy tank in range
 *   3. Pill-drop check (delegates to CheckDropPills — stub)
 *   4. (removed — KillMan handled entirely by goal system)
 *   5. Drop mines near enemy bases
 *   6. DoBuilding (stub)
 *   7. Auto-aim at attackable pill ahead in current travel direction
 *
 * See docommonstuff_decode.md.
 *
 * @param currentGoal  Currently active goal index (0-11)
 */
export function doCommonStuff(
  a4: A4State,
  state: BrainState,
  currentGoal: number,
): void {
  const tank = state.tank;

  // ── On a boat: get ashore FIRST, don't fight from the water ───────────
  // While afloat the tank's priority is reaching land. Opportunistic combat here
  // (auto-fire, shoot-enemy-tank, shoot-base/pill-in-path, mine drops) issues
  // firing/advance/retreat bits and — worse — the GetBase/GetPill attack phases
  // dead-stop to fire, which both attacks from the boat AND drops the speed the
  // engine needs (>=16) to climb onto the shore, stranding the tank against the
  // bank. Suppress all of it on a boat; navigation owns the hull until it lands.
  if (tank.onBoat) return;

  // ── Cover-fire: hand the hull to shootPillFromCover exclusively ───────
  // When parked on the cover firing slot, goalNewGetPill drives shootPillFromCover, which
  // rotates the hull to the pill's near EDGE (grazing past the wall) and fires ONLY when the
  // shell will actually connect. doCommonStuff's Phase-1 auto-fire below shoots EVERY loaded
  // tick along the current (still-rotating) facing — into the wall or wide — wasting the shot
  // window and slowing the kill ~10× (the graze needs a settled, edge-true aim). Phase-2's
  // opportunistic aim also fights the edge aim toward the pill CENTRE (which the wall blocks).
  // So while the cover-fire hold is active, suppress opportunistic combat entirely — exactly
  // like the on-boat case — and let the gated graze own the hull. Also holds it dead-still (no
  // forward bits to cancel the slot brake), so it stays on the exact cell.
  if (a4.coverFireHold) return;

  // ── GetBase close-engage: let the base capture/shoot own the hull ─────
  // Same as the cover-fire case: while GetBase is engaging its target base at close range, an
  // opportunistic aim at a nearby enemy tank/man would spin the hull off the STATIONARY base every
  // tick, so shots miss (the base regenerates) and the tank never settles onto the capturable cell.
  // Suppress opportunistic combat so goalGetBase's own aim/steer settles and the capture lands.
  if (a4.getBaseEngageHold) return;

  // ── Phase 1: Auto-fire at short range ────────────────────────────────
  // Verified from assembly 0x008222: when shellCount < 14 AND not shotAtMan → fire.
  if ((tank.shellCount & 0xFF) < 14) {
    if (!a4.shotAtMan) {
      a4.firingWord |= 0x10;   // FIRE
    }
  }

  // ── Phase 2: Shoot at closest enemy tank ──────────────────────────────
  const enemy = a4.closestEnemyTank;
  if (enemy !== null && (tank.armor & 0xFF) > 0) {
    const enemyDist = enemy.distanceMetric;
    if (enemyDist < 1792) {    // within ~7 tiles
      const eIdx = Math.min(15, enemy.index);
      const prevTick = a4.enemyPrevTick[eIdx];
      const prevX    = a4.enemyPrevX[eIdx];
      const prevY    = a4.enemyPrevY[eIdx];

      let tgtSpeed = 0;
      if (prevTick > 0 && a4.tickCounter - prevTick <= 2) {
        const dvx = enemy.x - prevX;
        const dvy = enemy.y - prevY;
        tgtSpeed = Math.min(25, Math.round(Math.sqrt(dvx * dvx + dvy * dvy)));
      }

      a4.enemyPrevX[eIdx]    = enemy.x;
      a4.enemyPrevY[eIdx]    = enemy.y;
      a4.enemyPrevTick[eIdx] = a4.tickCounter;

      const aim = linearAim(state, tank.x, tank.y, enemy.x, enemy.y, enemy.direction, tgtSpeed);
      if (onTarget(state, aim.x, aim.y, 0)) {
        const barriers = checkBarriers(a4, tank.x, tank.y, aim.x, aim.y);
        if (barriers === 0) {
          a4.steeringWord |= 0x40;   // SHOOT
        }
      }
    }
  }

  // ── Phase 3: Pill drop check ──────────────────────────────────────────
  if (tank.pillsCarried > 0 && tank.resourceCount >= 4 && a4.setGlobalsGate) {
    // checkDropPills(a4, state);  // TODO Step 12
  }

  // ── Phase 5: Drop mines near enemy bases ──────────────────────────────
  if (tank.mineCount > 0 && a4.dropMinesActive && a4.mineDeployEnable) {
    if (currentGoal !== 8 && currentGoal !== 5) {  // not KillTank or GetPill
      const enemyBase = a4.closestEnemyBase;
      const allyBase  = a4.closestAllyBase;
      if (enemyBase !== null && allyBase !== null) {
        if (enemyBase.distToTank < allyBase.distToTank) {
          _dropMines(a4, 10);
        }
      }
    }
  }

  // ── Phase 6: DoBuilding ────────────────────────────────────────────────
  _doBuilding(a4, state, currentGoal);

  // ── Phase 6b: Shoot at armoured enemy bases in navigation path ────────
  // Verified from binary FollowRoute (0x022856, section 0x022d52-0x022e2e):
  // FollowRoute fires at the next route waypoint when it is an obstacle.
  // BASE tiles (type 11) reach the catch-all shoot at 0x022e14 because they
  // are not river (1) or deep sea (10).
  // Preconditions: alive AND barriers ≤ 1 AND not already shooting this tick.
  if ((tank.armor & 0xFF) > 0 && !(a4.steeringWord & 0x40)) {
    for (const base of a4.bases) {
      if (base.isAlly) continue;
      // Only shoot at bases that are actually blocked in worldMap (armour > 9
      // and active owner) — same condition used in aindy_interface.ts overlay.
      const bIdx = ((base.tileY & 0xFF) << 8) | (base.tileX & 0xFF);
      if (!(a4.worldMap[bIdx] & 0x40)) continue;
      const dist = base.distToTank;
      if (dist > 1792) continue;
      // Binary: CheckBarriers ≤ 1 before shooting.
      const barriers = checkBarriers(a4, tank.x, tank.y, base.x, base.y);
      if (barriers > 1) continue;
      shoot(a4, state, base.x, base.y, 0, 0);
      break;  // one base per tick
    }
  }

  // ── Phase 7: Auto-aim at attackable pill ahead ────────────────────────
  // Verified from assembly 0x00841a-0x008720:
  // Looks ahead (shellCount*128) BWorld in current facing direction for a defended
  // pill.  Only runs when no other controls are already set and the tank is alive.
  if ((a4.steeringWord | a4.firingWord) === 0 && (tank.armor & 0xFF) > 0) {
    const lookAheadDist = (tank.shellCount & 0xFF) * 128;
    const { x: aheadX, y: aheadY } = locationFromDir(
      tank.facingDir, lookAheadDist, tank.x, tank.y,
    );
    const aheadTileX = (aheadX >> 8) & 0xFF;
    const aheadTileY = (aheadY >> 8) & 0xFF;

    const pill = a4.getPillAtTile(aheadTileX, aheadTileY);
    // Binary condition: pill.byte[20] & 0x01 (attackable) AND pill.byte[19] > 0 (armour > 0).
    // NO defender count check — fires at undefended pills too.  This is the main
    // way the brain reduces pill armour while navigating past pills in solo play.
    if (pill !== null && pill.attackable && pill.armour > 0) {
      const dirToPill = directionTo(tank.x, tank.y, pill.x, pill.y);
      shootPill(a4, state, pill, dirToPill & 0xFF, 0);
    }
  }
}
