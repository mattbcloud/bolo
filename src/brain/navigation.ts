/**
 * Navigation Controller — aIndy3.1 TypeScript Port
 *
 * Functions ported in this file:
 *   SetSpeed            (0x017810) — speed control with ±3 hysteresis
 *   SetMaxSpeed         (0x0210dc) — cap the max speed
 *   SetGlobals          (0x020f2e) — pre-navigation state setup
 *   FindCheapestSquare  (0x022EC8) — 3×3 grid local waypoint selection
 *   GoToPreviousDestination (0x020efc) — resume navigation to saved coords
 *   NavigateToCoords    (0x020888) — main navigation controller
 *
 * Navigation architecture:
 *   NavigateToCoords → SetGlobals → ComputeDistanceBetween
 *     → (long range)  WorldRouteFind → getNextStepTile → steer toward it
 *     → (short range) direct steer via TurnTowardsXY + SetSpeed
 *
 * References:
 *   setspeed_decode.md, setglobals_decode.md, findcheapestsquare_decode.md,
 *   navigatetocoords_decode.md, gotopreviousdestination_decode.md
 */

import { A4State } from './a4_state.js';
import type { BrainState } from './aindy_interface.js';
import { signedWord } from './aindy_interface.js';
import {
  directionTo, computeDistanceBetween, turnTowardsXY, turnTowardsDir,
  computeDirectionDelta, locationFromDir,
} from './pathfinding.js';
import { worldRouteFind, getNextStepTile } from './routing.js';

// ─────────────────────────────────────────────────────────────────────────────
// SetSpeed (0x017810)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SetSpeed — Set tank movement speed with ±3 hysteresis to prevent jitter.
 *
 * Control bit assignments (setspeed_decode.md, verified assembly):
 *   A4[11678] |= 0x01 → Accelerate (desired > current + 3)
 *   A4[11678] |= 0x02 → Hard brake (desired < current - 3)
 *   A4[11682] |= 0x01 → Gentle acceleration (desired in [current+1, current+3])
 *   A4[11682] |= 0x02 → Gentle brake (desired in [current-3, current])
 *
 * @param desired  Target speed (0 = stop, higher = faster)
 * @param current  Current tank speed (from TankRecord+41)
 */
export function setSpeed(a4: A4State, desired: number, current: number): void {
  if (desired === current) return;

  if (desired > current + 3) {
    // Aggressive acceleration
    a4.steeringWord |= 0x01;
  } else if (desired <= current) {
    if (desired > current - 3) {
      // Gentle brake
      a4.firingWord |= 0x02;
    } else {
      // Hard brake / reverse
      a4.steeringWord |= 0x02;
    }
  } else {
    // Gentle acceleration (desired within [current+1, current+3])
    a4.firingWord |= 0x01;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SetMaxSpeed (0x0210dc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SetMaxSpeed — Set the maximum speed cap (A4[7502]).
 * Called with lower values to slow the tank near targets.
 * Only effective if value is below current max.
 */
export function setMaxSpeed(a4: A4State, maxSpd: number): void {
  if (maxSpd < a4.maxSpeed) {
    a4.maxSpeed = maxSpd & 0xFF;
  }
}

/**
 * ResetMaxSpeed — Reset max speed to full (0x40 = 64).
 * Called at the start of long-distance navigation.
 */
export function resetMaxSpeed(a4: A4State): void {
  a4.maxSpeed = 0x40;
}

// ─────────────────────────────────────────────────────────────────────────────
// SetGlobals (0x020f2e)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SetGlobals — Pre-navigation state configuration.
 * Called once per NavigateToCoords call to update:
 *   - Ammo threshold (A4[7532]) = max(resources - 10, 0)
 *   - Danger evaluation flag (A4[7499])
 *   - Resource constraint flag (A4[7500])
 *   - Predicted next tile (A4[13028])
 *
 * See setglobals_decode.md (Session 37).
 */
export function setGlobals(a4: A4State, state?: BrainState): void {
  // Phase 1: ammo threshold = max(resources - 10, 0)
  const resource = (state?.tank?.resourceCount ?? 0) & 0xFF;
  a4.ammoThreshold = Math.max(0, resource - 10) & 0xFF;

  // Phase 2: danger evaluation flag based on Borg settings
  if (a4.setGlobalsBorgNavCommit) {
    a4.dangerEvalEnable = 1;
  } else if (a4.setGlobalsBorgPillDrop) {
    // Use stored tank position vs alternate position
    const altTX = state ? ((state.tank.altX >> 8) & 0xFF) : 0;
    const altTY = state ? ((state.tank.altY >> 8) & 0xFF) : 0;
    const dTX = Math.abs(altTX - a4.tankTileX);
    const dTY = Math.abs(altTY - a4.tankTileY);
    a4.dangerEvalEnable = (dTX > 4 || dTY > 4) ? 1 : 0;
  } else {
    a4.dangerEvalEnable = 0;
  }

  // Phase 3: predict next tile
  a4.predictedNextTile = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);

  // Phase 4: resource constraint flag
  a4.resourceConstraint = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// FindCheapestSquare (0x022EC8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FindCheapestSquare — Evaluate the 3×3 grid around the tank.
 *
 * Scans (tankX±1, tankY±1), skipping the tank's own tile.
 * Evaluates each cell using:
 *   - Route cost from A4[8128] (= worldRouteCostTable) at that tile
 *   - Terrain type (world map)
 *   - Danger level (if enabled)
 *   - Tank state (ammo, man deployed)
 *
 * Returns the tile with the lowest cost (primary) and the fallback.
 *
 * See findcheapestsquare_decode.md (Session 37).
 */
export function findCheapestSquare(
  a4: A4State,
): { primaryX: number; primaryY: number; secondaryX: number; secondaryY: number } {
  const tankX = a4.tankTileX & 0xFF;
  const tankY = a4.tankTileY & 0xFF;

  let bestCost  = 0x7D00;
  let fallCost  = 0x7D00;
  let primaryX  = tankX;
  let primaryY  = tankY;
  let secondaryX = tankX;
  let secondaryY = tankY;

  for (let x = tankX - 1; x <= tankX + 1; x++) {
    if (x < 0 || x > 255) continue;
    for (let y = tankY - 1; y <= tankY + 1; y++) {
      if (y < 0 || y > 255) continue;
      if (x === tankX && y === tankY) continue;  // skip own tile

      const tile = ((y & 0xFF) << 8) | (x & 0xFF);

      // Base cost from world route cost table (A4[8128])
      const routeCost = a4.worldRouteCostTable[tile] & 0x7FFF;
      if (routeCost >= 0x7D00) continue;   // unvisited / impassable

      // Terrain check
      const rawCell = a4.worldMap[tile];
      const terrain = rawCell & 0x0F;

      // Reject true movement blockers: walls, forests, shot-walls.
      // Tanks can navigate water (they float), so water is NOT rejected here.
      if (terrain === 0 || terrain === 5 || terrain === 8) continue;

      // Compute cost score
      let cost = routeCost;

      // Danger adjustment
      if (a4.dangerEvalEnable) {
        const danger = a4.dangerMap[tile];
        if (danger >= 2) cost += 500;      // high danger: penalize heavily
        else if (danger > 0) cost += 100;
      }

      // Update best/fallback
      if (cost < bestCost) {
        fallCost   = bestCost;
        secondaryX = primaryX;
        secondaryY = primaryY;
        bestCost  = cost;
        primaryX  = x;
        primaryY  = y;
      } else if (cost < fallCost) {
        fallCost   = cost;
        secondaryX = x;
        secondaryY = y;
      }
    }
  }

  // Store in A4 state (A4[7538] / A4[7542])
  a4.bestWaypointCost     = bestCost;
  a4.fallbackWaypointCost = fallCost;

  return { primaryX, primaryY, secondaryX, secondaryY };
}

// ─────────────────────────────────────────────────────────────────────────────
// GoToPreviousDestination (0x020efc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GoToPreviousDestination — Resume navigation to saved coordinates.
 *
 * Reads A4[8228] (prev dest X) and A4[8230] (prev dest Y) then
 * calls NavigateToCoords with mode=1.
 *
 * Called from GetMan to resume movement after man pickup.
 * See gotopreviousdestination_decode.md.
 */
export function goToPreviousDestination(a4: A4State): void {
  const prevX = a4.placePillBaseBWorldX;
  const prevY = a4.placePillBaseBWorldY;
  navigateToCoords(a4, prevX, prevY, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// NavigateToCoords (0x020888) — Main navigation controller
// ─────────────────────────────────────────────────────────────────────────────

const CLOSE_RANGE   = 256;   // < 1 tile  → fine control, no routing
const MEDIUM_RANGE  = 1000;  // < 4 tiles → A* at medium speed
const LONG_RANGE    = 3584;  // > 14 tiles → steer directly, NO A* (too costly)
const SEARCH_RADIUS = 20;    // A* window: ±20 tiles around destination (was 14; increased
                              // to allow routing around forest barriers and complex terrain)

/**
 * NavigateToCoords — Primary navigation controller (0x020888).
 *
 * Performance design:
 *   dist < 256 BWorld  (< 1 tile):   fine steer, no routing
 *   dist > 3584 BWorld (> 14 tiles): steer directly toward destination,
 *                                    NO A* — avoids 100×100 tile searches
 *   256 ≤ dist ≤ 3584  (1-14 tiles): A* on fixed ±14-tile window around
 *                                    destination (always 28×28 = 784 tiles max)
 *                                    CACHED: only re-runs when tank tile or
 *                                    destination tile changes (not every tick)
 */
export function navigateToCoords(
  a4: A4State,
  targetX: number,
  targetY: number,
  mode: number,
): void {
  setGlobals(a4);

  const fromX      = a4.tankX;
  const fromY      = a4.tankY;
  const currentDir = a4.tankDirection;
  const currentSpd = a4.tankSpeed;

  const dist = computeDistanceBetween(fromX, fromY, targetX, targetY);

  // ── Very close: fine-turn + brake/creep, no routing ───────────────────────
  if (dist < CLOSE_RANGE) {
    turnTowardsXY(a4, fromX, fromY, targetX, targetY, currentDir);
    setSpeed(a4, dist < 64 ? 0 : 8, currentSpd);
    return;
  }

  // ── Water mode: direct steering for long range, A* for short range ────────
  // When far from the target (>LONG_RANGE) in open water, direct steering is
  // simple and reliable — no walls out in the ocean to worry about.
  // When close (≤LONG_RANGE), fall through to the hop+A* system which avoids
  // walls and complex coastal terrain (direct steering would drive into walls).
  const tankMapIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
  if ((a4.worldMap[tankMapIdx] & 0x80) && dist > LONG_RANGE) {
    const tDir = directionTo(fromX, fromY, targetX, targetY);
    const angErr = computeDirectionDelta(currentDir, tDir);
    turnTowardsDir(a4, currentDir, tDir);
    if (angErr <= 64) {
      setSpeed(a4, 24, currentSpd);
      a4.steeringWord |= 0x10;
    }
    return;
  }
  // In water AND close (≤LONG_RANGE): fall through to hop+A* for wall avoidance

  // Working target — may be replaced with an intermediate hop for long range.
  let navX = targetX;
  let navY = targetY;

  // ── Long range: replace target with a 12-tile intermediate hop ────────────
  // A* (medium range) handles the hop with full obstacle avoidance.
  // When badly misaligned (>90°) we turn first without accelerating so we
  // don't drift further from the target while the tank rotates.
  // No BRK: braking in Orona prevents rotation; inertia dissipates naturally.
  // No probe loop: per-tick probe offsets caused alternating CW/CCW that
  // cancelled each other out and prevented net rotation progress.
  if (dist > LONG_RANGE) {
    const targetDir  = directionTo(fromX, fromY, navX, navY);
    const angularErr = computeDirectionDelta(currentDir, targetDir);

    if (angularErr > 64) {
      // Turn only — no FWD, no BRK
      turnTowardsDir(a4, currentDir, targetDir);
      return;
    }

    // Replace target with a 12-tile intermediate hop; fall through to A*.
    // 12 tiles = 3072 BWorld < LONG_RANGE (3584) so A* runs correctly below.
    const hop = locationFromDir(targetDir, 12 * 256, fromX, fromY);
    navX = hop.x;
    navY = hop.y;
    // (falls through to medium-range A* with the hop as destination)
  }

  // ── Medium range: A* with fixed ±14-tile window around DESTINATION ─────────
  // Uses navX/navY which is either the original target (if medium range) or
  // the 12-tile intermediate hop computed above (if long range).
  // Bounds are ALWAYS ±SEARCH_RADIUS around dest, never larger.
  // This caps the search at 28×28 = 784 tiles regardless of distance.
  const destTileX = (navX >> 8) & 0xFF;
  const destTileY = (navY >> 8) & 0xFF;

  a4.worldRouteMinX = Math.max(0, destTileX - SEARCH_RADIUS);
  a4.worldRouteMaxX = Math.min(255, destTileX + SEARCH_RADIUS);
  a4.worldRouteMinY = Math.max(0, destTileY - SEARCH_RADIUS);
  a4.worldRouteMaxY = Math.min(255, destTileY + SEARCH_RADIUS);

  // Route cache: only re-run A* when tank tile or destination tile changes.
  const tankTileChanged = (a4.tankTileX !== a4.navCacheTankTileX ||
                           a4.tankTileY !== a4.navCacheTankTileY);
  const destTileChanged = (destTileX !== a4.navCacheDestTileX ||
                           destTileY !== a4.navCacheDestTileY);

  // Stall recovery: if the tank hasn't changed tile in >250 ticks while navigating,
  // force a fresh A* route.  This unsticks the tank from walls and dead corners.
  if (a4.tankTileX === a4.navStallTileX && a4.tankTileY === a4.navStallTileY) {
    if (a4.tickCounter - a4.navStallSinceTick > 250) {
      a4.navCacheValid = 0;  // force fresh route
      a4.navStallSinceTick = a4.tickCounter;
    }
  } else {
    a4.navStallTileX    = a4.tankTileX;
    a4.navStallTileY    = a4.tankTileY;
    a4.navStallSinceTick = a4.tickCounter;
  }

  if (!a4.navCacheValid || tankTileChanged || destTileChanged) {
    a4.worldCostsInitDone = 0;
    worldRouteFind(a4, a4.routingHeap, destTileX, destTileY);
    a4.navCacheTankTileX = a4.tankTileX;
    a4.navCacheTankTileY = a4.tankTileY;
    a4.navCacheDestTileX = destTileX;
    a4.navCacheDestTileY = destTileY;
    a4.navCacheValid = 1;
  }

  // Unreachable check: if A* can't reach the tank's tile the destination is
  // blocked (e.g. solid wall between tank and dest).  Signal failure so the
  // goal selector can pick a different target next tick.
  const tankIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
  if (a4.worldRouteCostTable[tankIdx] >= 0x7D00) {
    // No path found — mark unreachable so the goal gives up this target
    a4.navCacheValid = 0;   // force retry next tick
    a4.noLocalRouteFlag = 1;  // signal: destination unreachable this tick
    return;
  }
  a4.noLocalRouteFlag = 0;

  // Extract next waypoint from cached A* route back-pointers
  const destTile  = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);
  const nextTile  = getNextStepTile(a4, destTile);
  const nextTileX = nextTile & 0xFF;
  const nextTileY = (nextTile >> 8) & 0xFF;

  const nextBWorldX = (nextTileX << 8) + 128;
  const nextBWorldY = (nextTileY << 8) + 128;
  turnTowardsXY(a4, fromX, fromY, nextBWorldX, nextBWorldY, currentDir);

  // Wall-ahead check: don't apply FWD if the tile 1 step ahead in the current
  // direction is a hard wall.  Prevents the tank from pressing endlessly against
  // walls when it overshoots a waypoint or the A* route clips a corner.
  const aheadPt  = locationFromDir(currentDir, 200, fromX, fromY);  // ~0.8 tile
  const aheadTX  = (aheadPt.x >> 8) & 0xFF;
  const aheadTY  = (aheadPt.y >> 8) & 0xFF;
  const aheadCell = a4.worldMap[(aheadTY << 8) | aheadTX];
  const aheadTer  = aheadCell & 0x0F;
  const wallAhead = (aheadTer === 0 || aheadTer === 8);   // wall or shot-wall

  if (wallAhead) {
    // Wall directly ahead: turn only, no FWD — let the A* waypoint steer us clear
    return;
  }

  // Drive forward when reasonably facing the next waypoint.
  // Threshold 32 (~45°): tight enough to avoid wall impacts, loose enough for flow.
  const nextDir     = directionTo(fromX, fromY, nextBWorldX, nextBWorldY);
  const nextAngErr  = computeDirectionDelta(currentDir, nextDir);
  if (nextAngErr <= 32) {
    setSpeed(a4, dist > MEDIUM_RANGE ? 16 : 8, currentSpd);
    a4.steeringWord |= 0x10;
  } else if (nextAngErr <= 64) {
    setSpeed(a4, 6, currentSpd);
    a4.steeringWord |= 0x10;
  }
  // angErr > 64: turn only (no FWD)
}
