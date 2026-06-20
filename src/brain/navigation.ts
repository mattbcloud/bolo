/**
 * Navigation Controller — Full-Map A* Rewrite
 *
 * The original binary used a bounded A* (±20 tiles) with multi-tick expansion,
 * stall detection, progress timeouts, and two-phase local routing — all
 * designed for 68k Mac hardware with ~2KB of working memory.
 *
 * This rewrite exploits the AI brain's full map visibility: a single-shot A*
 * on the 256×256 grid runs in microseconds on modern hardware. The path is
 * stored as a tile array and followed waypoint by waypoint. Recomputation
 * happens on destination change or map state change (base capture, pill
 * destruction, boat transition).
 *
 * Preserved from original:
 *   - SetSpeed (0x017810) — speed control with ±3 hysteresis
 *   - GetTurnSpeed (0x02380e) — adaptive speed near water/turns
 *   - Fine-steering (dist < 256) — sub-tile precision controller
 *   - SetGlobals (0x020f2e) — pre-navigation state setup
 *   - SetMaxSpeed / ResetMaxSpeed
 */

import { A4State } from './a4_state.js';
import type { BrainState } from './aindy_interface.js';
import {
  directionTo, computeDistanceBetween, turnTowardsXY,
  computeDirectionDelta, locationFromDir,
} from './pathfinding.js';
import { setRouteCosts } from './brain_init.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CLOSE_RANGE = 256;  // 1 tile in BWorld units — fine-steering threshold

// ─────────────────────────────────────────────────────────────────────────────
// A* PATHFINDER — Full 256×256 map, single-shot
// ─────────────────────────────────────────────────────────────────────────────

const DIRS = [
  [-1, -1], [0, -1], [1, -1],
  [-1,  0],          [1,  0],
  [-1,  1], [0,  1], [1,  1],
];

/**
 * Compute A* path from startTile to destTile on the full map.
 * Returns array of packed tile indices (y<<8|x) from start to dest (inclusive),
 * or null if no path exists.
 */
function computePath(
  a4: A4State,
  startTileX: number,
  startTileY: number,
  destTileX: number,
  destTileY: number,
  waterMode = false,
): Uint16Array | null {
  const startIdx = ((startTileY & 0xFF) << 8) | (startTileX & 0xFF);
  const destIdx  = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);

  if (startIdx === destIdx) return new Uint16Array([startIdx]);

  const costs = a4.examineTerrainCostTable;
  const worldMap = a4.worldMap;
  const blockedTile = a4.navStallBlockedTile;

  // g-cost for each tile (0xFFFF = unvisited)
  const gCost = a4.navGCost;
  gCost.fill(0xFFFF);
  gCost[startIdx] = 0;

  // parent backpointer for path reconstruction
  const parent = a4.navParent;
  parent.fill(0xFFFF);

  // Binary min-heap: stores packed (f-cost << 16 | tileIdx)
  // f = g + h where h = Chebyshev distance (admissible for 8-dir movement)
  const heap = a4.navHeap;
  let heapSize = 0;

  const h0 = Math.max(Math.abs(startTileX - destTileX), Math.abs(startTileY - destTileY));
  heap[heapSize++] = (h0 << 16) | startIdx;

  while (heapSize > 0) {
    // Pop min
    const top = heap[0];
    heapSize--;
    if (heapSize > 0) {
      heap[0] = heap[heapSize];
      // Sift down
      let i = 0;
      while (true) {
        let smallest = i;
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        if (l < heapSize && heap[l] < heap[smallest]) smallest = l;
        if (r < heapSize && heap[r] < heap[smallest]) smallest = r;
        if (smallest === i) break;
        const tmp = heap[i]; heap[i] = heap[smallest]; heap[smallest] = tmp;
        i = smallest;
      }
    }

    const currentIdx = top & 0xFFFF;
    if (currentIdx === destIdx) break;

    const cx = currentIdx & 0xFF;
    const cy = (currentIdx >> 8) & 0xFF;
    const currentG = gCost[currentIdx];

    // Already found a better path to this node (stale heap entry)
    if (((top >>> 16) - Math.max(Math.abs(cx - destTileX), Math.abs(cy - destTileY))) > currentG) {
      continue;
    }

    for (let d = 0; d < 8; d++) {
      const dx = DIRS[d][0];
      const dy = DIRS[d][1];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx > 255 || ny < 0 || ny > 255) continue;

      const nIdx = ((ny & 0xFF) << 8) | (nx & 0xFF);
      if (nIdx === blockedTile) continue;  // stall-blocked tile
      const raw = worldMap[nIdx];
      const tileCost = costs[raw];
      if (tileCost >= 1000) continue;  // impassable

      // Prevent diagonal corner-cutting: Bolo physics block diagonal movement
      // when either adjacent orthogonal tile is a wall.
      if (dx !== 0 && dy !== 0) {
        const adjX = worldMap[((cy & 0xFF) << 8) | ((cx + dx) & 0xFF)];
        const adjY = worldMap[(((cy + dy) & 0xFF) << 8) | (cx & 0xFF)];
        if (costs[adjX] >= 1000 || costs[adjY] >= 1000) continue;
      }

      // Wall proximity penalty: penalize tiles adjacent to impassable terrain.
      // Keeps routes clean — centered on roads, away from wall edges.
      // In water mode (navigating on a boat) we additionally treat dry land as
      // an obstacle, so the route stays in the middle of the channel rather
      // than hugging the bank — clipping a land corner on a boat causes the
      // tank to grind to a halt and spin.
      let wallPenalty = 0;
      for (let wd = 0; wd < 8; wd++) {
        const wx = nx + DIRS[wd][0];
        const wy = ny + DIRS[wd][1];
        if (wx < 0 || wx > 255 || wy < 0 || wy > 255) continue;
        const wRaw = worldMap[((wy & 0xFF) << 8) | (wx & 0xFF)];
        let isObstacle = costs[wRaw] >= 1000;
        if (waterMode && !isObstacle) {
          // Dry land = anything that isn't river/boat/deep/water-flagged
          const wTerrain = wRaw & 0x0F;
          const isWater =
            (wRaw & 0x80) !== 0 || wTerrain === 1 || wTerrain === 9 || wTerrain === 10;
          if (!isWater) isObstacle = true;
        }
        if (isObstacle) wallPenalty += 30;
      }

      const newG = currentG + tileCost + wallPenalty;
      if (newG >= gCost[nIdx]) continue;

      gCost[nIdx] = newG;
      parent[nIdx] = currentIdx;

      const h = Math.max(Math.abs(nx - destTileX), Math.abs(ny - destTileY));
      const f = newG + h;

      // Insert into heap
      let pos = heapSize++;
      heap[pos] = (f << 16) | nIdx;
      while (pos > 0) {
        const up = (pos - 1) >> 1;
        if (heap[up] <= heap[pos]) break;
        const tmp = heap[pos]; heap[pos] = heap[up]; heap[up] = tmp;
        pos = up;
      }
    }
  }

  // Reconstruct path from dest back to start
  if (parent[destIdx] === 0xFFFF && startIdx !== destIdx) return null;

  let pathLen = 0;
  let cur = destIdx;
  while (cur !== startIdx && cur !== 0xFFFF) {
    pathLen++;
    cur = parent[cur];
  }
  if (cur === 0xFFFF) return null;
  pathLen++; // include start

  const path = new Uint16Array(pathLen);
  cur = destIdx;
  for (let i = pathLen - 1; i >= 0; i--) {
    path[i] = cur;
    cur = parent[cur];
  }

  return path;
}

/**
 * Find the best boat entry point: prefer existing boat tiles (type 9) near the
 * wet path, otherwise use the first river tile on the path (build a boat there).
 */
function findBoatBuildTile(a4: A4State, wetPath: Uint16Array): void {
  const worldMap = a4.worldMap;
  const tankTileX = a4.tankTileX & 0xFF;
  const tankTileY = a4.tankTileY & 0xFF;

  // First: scan the map for existing boat tiles (terrain 9) and pick the
  // closest one to the tank that's reachable by land.
  let bestBoatDist = 0xFFFF;
  let bestBoatX = -1;
  let bestBoatY = -1;

  // Search within ±30 tiles of the tank for existing boats
  const searchR = 30;
  for (let dy = -searchR; dy <= searchR; dy++) {
    const ty = tankTileY + dy;
    if (ty < 0 || ty > 255) continue;
    for (let dx = -searchR; dx <= searchR; dx++) {
      const tx = tankTileX + dx;
      if (tx < 0 || tx > 255) continue;
      const idx = ((ty & 0xFF) << 8) | (tx & 0xFF);
      if ((worldMap[idx] & 0x0F) === 9) {
        // Check that the boat tile is adjacent to passable land
        let hasLand = false;
        for (let nd = 0; nd < 4; nd++) {
          const ax = tx + [0, 0, -1, 1][nd];
          const ay = ty + [-1, 1, 0, 0][nd];
          if (ax < 0 || ax > 255 || ay < 0 || ay > 255) continue;
          const aIdx = ((ay & 0xFF) << 8) | (ax & 0xFF);
          const aCost = a4.examineTerrainCostTable[worldMap[aIdx]];
          if (aCost < 100) { hasLand = true; break; }
        }
        if (!hasLand) continue;

        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bestBoatDist) {
          bestBoatDist = d;
          bestBoatX = tx;
          bestBoatY = ty;
        }
      }
    }
  }

  if (bestBoatX >= 0) {
    a4.boatBuildTileX = bestBoatX;
    a4.boatBuildTileY = bestBoatY;
    return;
  }

  // No existing boat found — use the first river tile on the wet path
  for (let i = 0; i < wetPath.length; i++) {
    const tile = wetPath[i];
    const raw = worldMap[tile] & 0x0F;
    if (raw === 1) {
      a4.boatBuildTileX = tile & 0xFF;
      a4.boatBuildTileY = (tile >> 8) & 0xFF;
      return;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GetTurnSpeed (0x02380e)
// ─────────────────────────────────────────────────────────────────────────────

function nearDangerTerrain(a4: A4State): boolean {
  const tx = a4.tankTileX;
  const ty = a4.tankTileY;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const nx = (tx + dx) & 0xFF;
      const ny = (ty + dy) & 0xFF;
      const raw = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
      if (raw & 0x80) return true;
      if ((raw & 0x0F) === 10) return true;
    }
  }
  return false;
}

export function getTurnSpeed(a4: A4State, toTileX: number, toTileY: number): number {
  const toWorldX = (toTileX << 8) + 128;
  const toWorldY = (toTileY << 8) + 128;
  const dirToTile = directionTo(a4.tankX, a4.tankY, toWorldX, toWorldY);
  const angErr    = computeDirectionDelta(a4.tankDirection, dirToTile);

  const tankMapIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
  const tankOnWater = !!(a4.worldMap[tankMapIdx] & 0x80);
  if (tankOnWater) {
    // Disembark momentum: when the destination tile is land, the tank must
    // carry enough speed to climb off the boat onto the shore. At low speed it
    // stalls floating against the bank and never lands. Raise the floor to 24
    // (vs 12 for open-water travel) whenever the target tile is dry land.
    const toIdx = ((toTileY & 0xFF) << 8) | (toTileX & 0xFF);
    const toRaw = a4.worldMap[toIdx];
    const toIsLand =
      !(toRaw & 0x80) &&
      (toRaw & 0x0F) !== 1 &&
      (toRaw & 0x0F) !== 9 &&
      (toRaw & 0x0F) !== 10 &&
      a4.examineTerrainCostTable[toRaw] < 1000;
    const floor = toIsLand ? 24 : 12;
    return Math.max(floor, 64 - angErr);
  }

  if (angErr >= 64) return 0;

  if (angErr >= 5) {
    return Math.max(1, 64 - angErr);
  }

  const ahead1 = locationFromDir(a4.tankDirection, 256, a4.tankX, a4.tankY);
  const a1x = (ahead1.x >> 8) & 0xFF;
  const a1y = (ahead1.y >> 8) & 0xFF;
  const raw1 = a4.worldMap[((a1y & 0xFF) << 8) | (a1x & 0xFF)];

  if (raw1 & 0x80) return 10;
  if ((raw1 & 0x0F) === 10) return 20;

  const ahead2 = locationFromDir(a4.tankDirection, 512, a4.tankX, a4.tankY);
  const a2x = (ahead2.x >> 8) & 0xFF;
  const a2y = (ahead2.y >> 8) & 0xFF;
  const raw2 = a4.worldMap[((a2y & 0xFF) << 8) | (a2x & 0xFF)];

  if ((raw2 & 0x80) || (raw2 & 0x0F) === 10) return 30;

  return 64;
}

// ─────────────────────────────────────────────────────────────────────────────
// SetSpeed (0x017810)
// ─────────────────────────────────────────────────────────────────────────────

export function setSpeed(a4: A4State, desired: number, current: number): void {
  if (desired > current + 3) {
    a4.steeringWord |= 0x01;
  } else if (desired > current) {
    a4.firingWord   |= 0x01;
  } else if (desired < current - 3) {
    a4.steeringWord |= 0x02;
  } else if (desired < current) {
    a4.firingWord   |= 0x02;
  } else {
    if (desired > 0) a4.firingWord |= 0x01;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SetMaxSpeed / ResetMaxSpeed (0x0210dc)
// ─────────────────────────────────────────────────────────────────────────────

export function setMaxSpeed(a4: A4State, maxSpd: number): void {
  if (maxSpd < a4.maxSpeed) {
    a4.maxSpeed = maxSpd & 0xFF;
  }
}

export function resetMaxSpeed(a4: A4State): void {
  a4.maxSpeed = 0x40;
}

// ─────────────────────────────────────────────────────────────────────────────
// SetGlobals (0x020f2e)
// ─────────────────────────────────────────────────────────────────────────────

export function setGlobals(a4: A4State, state?: BrainState): void {
  const resource = (state?.tank?.resourceCount ?? 0) & 0xFF;
  a4.ammoThreshold = Math.max(0, resource - 10) & 0xFF;
  a4.dangerEvalEnable = 0;
  a4.predictedNextTile = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
  a4.resourceConstraint = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ExpandWorldLimits / FindCheapestSquare — kept as no-ops for import compat
// ─────────────────────────────────────────────────────────────────────────────

export function expandWorldLimits(a4: A4State, _destTileX: number, _destTileY: number): void {
  // No longer needed — full-map A* has no bounds
}

export function findCheapestSquare(
  a4: A4State,
): { primaryX: number; primaryY: number; secondaryX: number; secondaryY: number } {
  // No longer used — path following replaces local 3×3 scan
  const x = a4.tankTileX & 0xFF;
  const y = a4.tankTileY & 0xFF;
  return { primaryX: x, primaryY: y, secondaryX: x, secondaryY: y };
}

// ─────────────────────────────────────────────────────────────────────────────
// GoToPreviousDestination (0x020efc)
// ─────────────────────────────────────────────────────────────────────────────

export function goToPreviousDestination(a4: A4State): void {
  const prevX = a4.placePillBaseBWorldX;
  const prevY = a4.placePillBaseBWorldY;
  navigateToCoords(a4, prevX, prevY, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// NavigateToCoords — Full-map A* with waypoint following
// ─────────────────────────────────────────────────────────────────────────────

export function navigateToCoords(
  a4: A4State,
  targetX: number,
  targetY: number,
  _mode: number,
): void {
  setGlobals(a4);
  setRouteCosts(a4);
  resetMaxSpeed(a4);

  // Clear turn bits from DoCommonStuff combat auto-aim so navigation steering
  // is authoritative. Without this, combat and navigation set conflicting turn
  // directions (CW + CCW simultaneously), causing the tank to spin in place.
  a4.steeringWord &= ~0x0C;  // clear bits 0x04 (CCW) and 0x08 (CW)
  a4.firingWord   &= ~0x0C;

  const fromX      = a4.tankX;
  const fromY      = a4.tankY;
  const currentDir = a4.tankDirection;
  const currentSpd = a4.tankSpeed;

  // ── GetBoat sub-goal ──────────────────────────────────────────────────────
  // When a water route is significantly shorter and we're not on a boat yet,
  // acquire a boat: redirect navigation toward the boat pickup/build point.
  // Once the tank drives onto the boat tile, tankOnBoat flips → path recomputes
  // with water=cheap and the tank continues to the real destination via waterway.
  //
  // While acquiring, boatNeeded is LATCHED: we must NOT re-run wet/dry boat
  // detection against the boat point itself (the boat point is dry-reachable, so
  // detection would clear boatNeeded → flip-flop every recompute, thrashing the
  // nav cache and stranding the tank short of the water). The `acquiringBoat`
  // flag below suppresses that re-detection in the recompute block.
  if (a4.tankOnBoat) {
    // We boarded — acquisition complete; drop the latch and any cooldown.
    a4.boatNeeded = false;
    a4.boatAcquireSinceTick = 0;
    a4.boatFailedUntilTick = 0;
  }

  // Suppress acquisition during the post-timeout cooldown so boatNeeded can't
  // re-latch every recompute (which made the tank repeatedly wade to an
  // unreachable boat point, draining all its shells). During the cooldown the
  // tank commits to the dry route (or the goal handler moves on).
  const boatCooldownActive = a4.tickCounter < a4.boatFailedUntilTick;
  let acquiringBoat = a4.boatNeeded && !a4.tankOnBoat && a4.boatBuildTileX >= 0 && !boatCooldownActive;
  if (boatCooldownActive) a4.boatNeeded = false;

  if (acquiringBoat) {
    // Start (or continue) the acquisition timer.
    if (a4.boatAcquireSinceTick === 0) a4.boatAcquireSinceTick = a4.tickCounter;

    // Time out: if we've been trying to board for too long (unreachable boat
    // point, no trees to build, repeated stalls), give up and let the normal
    // dry-route detection run instead. ~1500 ticks ≈ 30s.
    if ((a4.tickCounter - a4.boatAcquireSinceTick) > 1500) {
      a4.boatNeeded = false;
      a4.boatAcquireSinceTick = 0;
      a4.boatFailedUntilTick = a4.tickCounter + 3000;  // ~60s cooldown before retrying
      acquiringBoat = false;
      a4.worldCostsInitDone = 0;  // force a fresh path to the real destination
    } else {
      targetX = (a4.boatBuildTileX << 8) + 128;
      targetY = (a4.boatBuildTileY << 8) + 128;
    }
  } else {
    a4.boatAcquireSinceTick = 0;
  }

  const dist = computeDistanceBetween(fromX, fromY, targetX, targetY);

  // ── Fine-steering: within 1 tile, steer directly to target ────────────────
  if (dist < CLOSE_RANGE) {
    // ARRIVED — already standing in the destination tile. Arrival/capture is
    // tile-based (tank.cell === target.cell), so the tank does NOT need to reach
    // the exact tile centre. Chasing the centre is in fact the bug: once the tank
    // crosses the centre the bearing flips 180°, it turns back, overshoots the
    // other way, and oscillates across the tile boundary forever (the "drives in
    // circles / never lands to capture" failure). Standing anywhere in the tile is
    // success — stop and let arrival happen. (Boats keep momentum: a disembark
    // needs speed to climb onto the shore — fix 41.)
    if (!a4.tankOnBoat) {
      const destTileX = (targetX >> 8) & 0xFF;
      const destTileY = (targetY >> 8) & 0xFF;
      if (a4.tankTileX === destTileX && a4.tankTileY === destTileY) {
        setSpeed(a4, 0, currentSpd);
        return;
      }
    }

    turnTowardsXY(a4, fromX, fromY, targetX, targetY, currentDir);
    const dirToTgt = directionTo(fromX, fromY, targetX, targetY);
    const angErrToTgt = computeDirectionDelta(currentDir, dirToTgt);
    const aligned = (angErrToTgt <= 1);

    if (a4.tankOnBoat) {
      // On a boat: keep momentum to climb onto the shore when disembarking
      // (fix 41). Precision landing isn't needed/possible on water.
      setSpeed(a4, aligned ? 24 : 12, currentSpd);
    } else if (aligned) {
      // CREEP on final approach. The old tiers (up to 24 at dist 128-256) were
      // far too fast: the tank would burst forward inside 1 tile, overshoot the
      // target cell, and orbit it forever — never landing ON the tile to e.g.
      // capture a base (which requires tank.cell === base.cell). Low speeds
      // give a turning radius tight enough to actually reach the centre.
      if      (dist < 32)  setSpeed(a4, 2,  currentSpd);
      else if (dist < 64)  setSpeed(a4, 4,  currentSpd);
      else if (dist < 128) setSpeed(a4, 6,  currentSpd);
      else                 setSpeed(a4, 10, currentSpd);
    } else {
      // Misaligned this close → slower still, so the tank can pivot onto the tile.
      if      (dist < 64)  setSpeed(a4, 2, currentSpd);
      else if (dist < 128) setSpeed(a4, 4, currentSpd);
      else                 setSpeed(a4, 6, currentSpd);
    }
    return;
  }

  // ── Path computation / caching ────────────────────────────────────────────
  const destTileX = (targetX >> 8) & 0xFF;
  const destTileY = (targetY >> 8) & 0xFF;
  const tankTileX = a4.tankTileX & 0xFF;
  const tankTileY = a4.tankTileY & 0xFF;

  const destChanged = (destTileX !== a4.navCacheDestTileX ||
                       destTileY !== a4.navCacheDestTileY);

  // Boat transition invalidates path (water costs change dramatically)
  const onBoat = a4.tankOnBoat;
  if (onBoat !== a4.navCachePrevOnBoat) {
    a4.navCachePrevOnBoat = onBoat;
    a4.worldCostsInitDone = 0;
  }

  // Recompute path when: destination changed, map changed, or no valid path
  const needsRecompute = destChanged || !a4.worldCostsInitDone || !a4.navPath;

  if (needsRecompute) {
    // Boat detection: when not on a boat (and not already acquiring one), first
    // compute a wet path (rivers cheap) to see if water routing would be
    // significantly shorter. Suppressed while acquiringBoat so the latch holds.
    let wetPath: Uint16Array | null = null;
    if (!onBoat && !acquiringBoat) {
      const savedRiverCost = a4.examineTerrainCostTable[1];
      a4.examineTerrainCostTable[1] = 3;
      wetPath = computePath(a4, tankTileX, tankTileY, destTileX, destTileY);
      a4.examineTerrainCostTable[1] = savedRiverCost;

      if (wetPath) {
        const destIdx = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);
        a4.navWetPathCost = a4.navGCost[destIdx];
      } else {
        a4.navWetPathCost = 0;
      }
    }

    // Compute the actual path (rivers expensive when not on boat).
    // When on a boat, enable water mode so the route avoids hugging the shore.
    const path = computePath(a4, tankTileX, tankTileY, destTileX, destTileY, onBoat);

    if (!path) {
      if (!onBoat && !acquiringBoat && wetPath) {
        a4.boatNeeded = true;
        findBoatBuildTile(a4, wetPath);
      }
      a4.noLocalRouteFlag = 1;
      a4.navPath = null;
      a4.navPathIndex = 0;
      a4.navCacheValid = 0;
      return;
    }

    // Compare dry vs wet path costs to decide if a boat is worthwhile.
    // While acquiringBoat, leave boatNeeded latched (skip both branches).
    if (!onBoat && !acquiringBoat && wetPath && a4.navWetPathCost > 0) {
      const destIdx = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);
      a4.navDryPathCost = a4.navGCost[destIdx];
      if (a4.navWetPathCost < a4.navDryPathCost * 0.8) {
        a4.boatNeeded = true;
        findBoatBuildTile(a4, wetPath);
      } else {
        a4.boatNeeded = false;
      }
    } else if (!acquiringBoat) {
      a4.boatNeeded = false;
    }

    a4.navPath = path;
    a4.navPathIndex = 0;
    a4.navCacheDestTileX = destTileX;
    a4.navCacheDestTileY = destTileY;
    a4.worldCostsInitDone = 1;
    a4.navCacheValid = 1;

    // ── [PHASE-0 DEBUG] planned-path inspection ──────────────────────────────
    // Fires only on a fresh path compute. Toggle off live: window.__BRAIN_DBG__ = false
    if ((globalThis as any).__BRAIN_DBG__ !== false) {
      const GOALS = ['PlacePill', 'Explore', 'FixPill', 'GetBase', 'GetMan', 'GetPill',
                     'KillBase', 'KillMan', 'KillTank', 'Refuel', 'TourBases'];
      const moves = path.length - 1;
      const cheb  = Math.max(Math.abs(destTileX - tankTileX), Math.abs(destTileY - tankTileY));
      // Count heading changes along the route — a straight line has 0-1, a route
      // bending around terrain has several.
      let bends = 0, pdx = 0, pdy = 0;
      for (let i = 1; i < path.length; i++) {
        const ax = path[i] & 0xFF,     ay = (path[i] >> 8) & 0xFF;
        const bx = path[i - 1] & 0xFF, by = (path[i - 1] >> 8) & 0xFF;
        const sdx = Math.sign(ax - bx), sdy = Math.sign(ay - by);
        if (i > 1 && (sdx !== pdx || sdy !== pdy)) bends++;
        pdx = sdx; pdy = sdy;
      }
      const ratio = moves / Math.max(1, cheb);
      const verdict = (bends <= 1 && ratio <= 1.05)
        ? 'STRAIGHT (no detour — terrain ignored or path clear)'
        : (bends >= 2 || ratio > 1.15)
          ? 'DETOUR (routing around terrain)'
          : 'slight bend';
      const wps = Array.from(path.slice(0, 8))
        .map((t) => `(${t & 0xFF},${(t >> 8) & 0xFF})`).join(' ');
      console.log(
        `[PATH] t=${a4.tickCounter} goal=${GOALS[a4.currentGoal] ?? a4.currentGoal} ` +
        `from(${tankTileX},${tankTileY})->dst(${destTileX},${destTileY}) ` +
        `moves=${moves} cheb=${cheb} ratio=${ratio.toFixed(2)} bends=${bends} :: ${verdict}\n` +
        `        wps: ${wps}${path.length > 8 ? ' ...' : ''}`,
      );
    }
    // ── [/PHASE-0 DEBUG] ─────────────────────────────────────────────────────
  }

  // Clear route-failure flag (we have a valid path)
  a4.noLocalRouteFlag = 0;

  // ── Stall detection ──────────────────────────────────────────────────────
  // If the tank hasn't moved tiles in 150 ticks (land) or 750 ticks (water),
  // block the next waypoint tile and force a path recompute around it.
  {
    const stallLimit = a4.tankOnBoat ? 750 : 150;
    if (tankTileX === a4.navStallTileX && tankTileY === a4.navStallTileY) {
      if ((a4.tickCounter - a4.navStallSinceTick) > stallLimit) {
        // Block the waypoint tile the tank is trying (and failing) to reach
        const path = a4.navPath;
        if (path && a4.navPathIndex < path.length) {
          a4.navStallBlockedTile = path[a4.navPathIndex];
        }
        a4.worldCostsInitDone = 0;
        a4.noLocalRouteFlag = 1;
        a4.navStallSinceTick = a4.tickCounter;
      }
    } else {
      a4.navStallTileX = tankTileX;
      a4.navStallTileY = tankTileY;
      a4.navStallSinceTick = a4.tickCounter;
      a4.navStallBlockedTile = 0xFFFF;  // clear block when tank moves
    }
  }

  // ── Waypoint following: PURE-PURSUIT CARROT ───────────────────────────────
  // Replaces the old exact-tile / waypoint-count follower, which orbited
  // mid-path: it advanced idx only when path[idx] === the tank's EXACT tile, so a
  // turning arc that skirted a waypoint without landing on it froze idx and the
  // tank flip-flopped between two adjacent tiles forever (heading locked, no turn
  // command, idx frozen — the mid-path orbit). This follower is robust BY
  // CONSTRUCTION: (1) advance idx by PROJECTION (closest waypoint, forward-only)
  // so a skirted waypoint can never freeze it, and (2) steer toward a CARROT at a
  // fixed look-ahead DISTANCE along the path — decoupling steering from waypoint
  // spacing, the standard cure for orbiting. The landing/approach blocks (the
  // banked win, dist < CLOSE_RANGE above; final-approach slowdown below) are
  // untouched.
  const path = a4.navPath!;
  let idx = a4.navPathIndex;

  // (1) Project the tank onto the path: the waypoint closest to the tank, scanned
  // FORWARD only from the current idx within a small window. Forward-only stops it
  // snapping back to an earlier loop of a winding route; the window bounds cost and
  // stops a far-future tile (where the route doubles back) from stealing the
  // projection. Monotonic by construction, so idx never freezes on a skirt.
  const PROJ_WINDOW = 8;            // waypoints to scan ahead for the closest
  {
    let bestIdx = idx;
    let bestDist = Infinity;
    const hi = Math.min(path.length - 1, idx + PROJ_WINDOW);
    for (let i = idx; i <= hi; i++) {
      const px = ((path[i] & 0xFF) << 8) + 128;
      const py = (((path[i] >> 8) & 0xFF) << 8) + 128;
      const d = computeDistanceBetween(fromX, fromY, px, py);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    idx = bestIdx;
  }
  a4.navPathIndex = idx;

  // The immediate target waypoint (tile just ahead of the projection) drives the
  // impassable / wall-shoot / speed checks — they care about the very next tile,
  // not the smoothed carrot.
  const tgtIdx = Math.min(idx + 1, path.length - 1);
  const wpTile = path[tgtIdx];
  const wpRaw = a4.worldMap[wpTile];
  const wpTerrain = wpRaw & 0x0F;
  const wpCost = a4.examineTerrainCostTable[wpRaw];

  if (wpCost >= 1000) {
    // Truly impassable — force recompute next tick
    a4.worldCostsInitDone = 0;
    turnTowardsXY(a4, fromX, fromY, targetX, targetY, currentDir);
    setSpeed(a4, 16, currentSpd);
    return;
  }

  // Wall or shot-wall ahead on the path: stop and shoot to bulldoze through.
  // Walls take 5 shots, shot-walls take 1. Only shoot if we have ammo.
  if ((wpTerrain === 0 || wpTerrain === 8) && wpCost < 1000) {
    const wpBWorldX = ((wpTile & 0xFF) << 8) + 128;
    const wpBWorldY = (((wpTile >> 8) & 0xFF) << 8) + 128;
    const wallDist = computeDistanceBetween(fromX, fromY, wpBWorldX, wpBWorldY);
    if (wallDist < 1792) {
      // In range — aim and fire
      turnTowardsXY(a4, fromX, fromY, wpBWorldX, wpBWorldY, currentDir);
      setSpeed(a4, 0, currentSpd);
      a4.firingWord |= 0x10;  // fire
      return;
    }
  }

  // (2) Carrot: walk forward along the path from the projected waypoint,
  // accumulating segment lengths until LOOKAHEAD BWorld units are covered,
  // interpolating within the final segment. The carrot rides at a fixed distance
  // regardless of waypoint spacing, so the heading command stays smooth and never
  // flips 180° at a tile centre. Near the route's end the carrot collapses onto
  // the final waypoint (the destination tile), where the fine-steering/landing
  // block (dist < CLOSE_RANGE, above) and the final-approach slowdown (below) take
  // over.
  // ~1.5 tiles of BWorld (tunable, capture-gated). Sweepable from the headless
  // harness via PP_LOOKAHEAD; `typeof process` is undefined in the browser build,
  // so live play always uses the 384 default.
  const LOOKAHEAD = (typeof process !== 'undefined' && process.env.PP_LOOKAHEAD)
    ? Number(process.env.PP_LOOKAHEAD) : 384;
  let carrotX = ((path[idx] & 0xFF) << 8) + 128;
  let carrotY = (((path[idx] >> 8) & 0xFF) << 8) + 128;
  {
    let remaining = LOOKAHEAD;
    let px = carrotX, py = carrotY;
    for (let i = idx; i < path.length - 1; i++) {
      const nx = ((path[i + 1] & 0xFF) << 8) + 128;
      const ny = (((path[i + 1] >> 8) & 0xFF) << 8) + 128;
      const segLen = computeDistanceBetween(px, py, nx, ny);
      if (segLen >= remaining) {
        const t = segLen > 0 ? remaining / segLen : 0;
        carrotX = px + Math.round((nx - px) * t);
        carrotY = py + Math.round((ny - py) * t);
        break;
      }
      remaining -= segLen;
      px = nx; py = ny;
      carrotX = nx; carrotY = ny;     // ran past the end → last waypoint
    }
  }

  turnTowardsXY(a4, fromX, fromY, carrotX, carrotY, currentDir);

  // Speed control uses the immediate next waypoint (not the carrot) so
  // getTurnSpeed can detect water/terrain transitions close ahead.
  const wpX = (wpTile & 0xFF);
  const wpY = ((wpTile >> 8) & 0xFF);
  const speed = getTurnSpeed(a4, wpX, wpY);
  setMaxSpeed(a4, speed);

  // Final-approach slowdown: when nearing the actual destination, cap speed so
  // the turning radius is tight enough to land ON the target tile instead of
  // orbiting it. High terrain speed (grass 12 / road 16) otherwise gives a
  // turning circle wider than the target — the tank circles ~2 tiles out and
  // never reaches the fine-steering zone (e.g. can't drive onto a base to
  // capture it). Skipped on a boat, where the disembark momentum floor (#41)
  // needs the speed to climb onto the shore.
  if (!a4.tankOnBoat) {
    if (dist < 640)      setMaxSpeed(a4, 4);
    else if (dist < 896) setMaxSpeed(a4, 8);
  }

  setSpeed(a4, a4.maxSpeed, currentSpd);
}
