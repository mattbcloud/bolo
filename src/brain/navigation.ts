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
  let   destIdx  = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);

  if (startIdx === destIdx) return new Uint16Array([startIdx]);

  const costs = a4.examineTerrainCostTable;
  const worldMap = a4.worldMap;
  const blockedTile = a4.navStallBlockedTile;

  // If the destination tile is itself IMPASSABLE (a live pillbox=12 or armoured
  // enemy base=11, cost ≥1000), A* can never relax it → null → a permanent noRoute
  // freeze (~1250 ticks idle, the dominant capture-killer). The brain legitimately
  // routes navigateToCoords() AT such targets (to attack/capture them), so retarget
  // the path to the cheapest PASSABLE tile ADJACENT to the dest, on the tank's side
  // (min Chebyshev to start). The tank stops adjacent and the attack/landing/capture
  // logic takes the final tile; it does NOT grind point-blank into the live target.
  // ⚠️ DEFAULT OFF (env NOROUTE_FIX=1 to enable). Routing to the adjacent passable tile
  // eliminates the ~1250-tick noRoute freezes and cuts deaths (~2.77→2.45), BUT it
  // rewires EVERY approach to a pill/base (not just stuck cases) and REGRESSES captures
  // ~40% (A/B ~20 runs: refuel-only 0.23 vs +noRoute 0.14). Captures are the priority,
  // so it's off. Revisit with a more surgical trigger (only fire on a genuine stall).
  const NOROUTE_FIX = typeof process !== 'undefined' && !!process.env.NOROUTE_FIX;
  if (NOROUTE_FIX && costs[worldMap[destIdx]] >= 1000) {
    let bestN = -1, bestH = 0x7FFF;
    for (let d = 0; d < 8; d++) {
      const ax = destTileX + DIRS[d][0], ay = destTileY + DIRS[d][1];
      if (ax < 0 || ax > 255 || ay < 0 || ay > 255) continue;
      const aIdx = ((ay & 0xFF) << 8) | (ax & 0xFF);
      if (costs[worldMap[aIdx]] >= 1000) continue;
      const h = Math.max(Math.abs(ax - startTileX), Math.abs(ay - startTileY));
      if (h < bestH) { bestH = h; bestN = aIdx; }
    }
    if (bestN < 0) return null;          // target fully walled in — genuinely unreachable
    destIdx = bestN;
    if (startIdx === destIdx) return new Uint16Array([startIdx]);
  }
  const destReTileX = destIdx & 0xFF;
  const destReTileY = (destIdx >> 8) & 0xFF;

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

  const h0 = Math.max(Math.abs(startTileX - destReTileX), Math.abs(startTileY - destReTileY));
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
    if (((top >>> 16) - Math.max(Math.abs(cx - destReTileX), Math.abs(cy - destReTileY))) > currentG) {
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

      const h = Math.max(Math.abs(nx - destReTileX), Math.abs(ny - destReTileY));
      const f = newG + h;

      // Insert into heap. Guard against overflow: this A* uses lazy deletion
      // (re-pushes improved nodes), so pushes can exceed the tile count; an
      // out-of-bounds typed-array write is silently dropped and would corrupt
      // the heap. Dropping a push is safe (lazy entries are redundant).
      if (heapSize >= heap.length) continue;
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

/** A tile a boat can travel on: river (terrain 1), boat (9), deep sea (10), or any
 *  water-flagged tile (0x80). Anything else is dry land the boat must steer clear of. */
function isWaterTile(raw: number): boolean {
  const terr = raw & 0x0F;
  return (raw & 0x80) !== 0 || terr === 1 || terr === 9 || terr === 10;
}

/** True if the straight line from (x0,y0) to (x1,y1) — BWorld units — stays entirely over
 *  water. Sampled ~every quarter-tile. Used to keep a boat's steering carrot inside the
 *  channel: steer only toward points we can "see" down the river without crossing a bank. */
function lineStaysOnWater(a4: A4State, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0, dy = y1 - y0;
  const steps = Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / 64));
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const tx = (((x0 + dx * t) | 0) >> 8) & 0xFF;
    const ty = (((y0 + dy * t) | 0) >> 8) & 0xFF;
    if (!isWaterTile(a4.worldMap[((ty & 0xFF) << 8) | (tx & 0xFF)])) return false;
  }
  return true;
}

export function getTurnSpeed(a4: A4State, toTileX: number, toTileY: number): number {
  const toWorldX = (toTileX << 8) + 128;
  const toWorldY = (toTileY << 8) + 128;
  const dirToTile = directionTo(a4.tankX, a4.tankY, toWorldX, toWorldY);
  const angErr    = computeDirectionDelta(a4.tankDirection, dirToTile);

  const tankMapIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
  const tankOnWater = !!(a4.worldMap[tankMapIdx] & 0x80);
  if (tankOnWater) {
    const toIdx = ((toTileY & 0xFF) << 8) | (toTileX & 0xFF);
    const toRaw = a4.worldMap[toIdx];
    const toIsLand =
      !(toRaw & 0x80) &&
      (toRaw & 0x0F) !== 1 &&
      (toRaw & 0x0F) !== 9 &&
      (toRaw & 0x0F) !== 10 &&
      a4.examineTerrainCostTable[toRaw] < 1000;
    // Pivot BEFORE committing forward. A boat that drives forward while still turning onto the
    // channel axis drifts sideways into the bank — then it can't ride the river and thrashes at
    // the shore (the y146 crossing repro). So ease forward speed HARD while the heading is
    // off-axis, letting the hull rotate nearly in place; once roughly aligned, run full speed.
    // When the next tile is land AND we're aligned, carry the >=16 momentum the engine needs to
    // climb the shore (disembark). This is turn-discipline, not a blanket cap — straight reaches
    // still run full speed. angErr is 0..128 (a full turn is 256).
    // For a DISEMBARK (next tile is land) hold the >=16 climb floor through a MODERATE turn: a boat
    // caps at 16 on water and the engine needs >=16 to climb ashore, so easing to 8 mid-turn (as
    // pure channel-following would) strands the tank at the shore unable to climb (live GetBase
    // "no speed to disembark" across open water, approached at an angle). A SHARP turn still pivots
    // (you'd otherwise climb the wrong tile / a bank), and water→water keeps the tight discipline.
    if (angErr >= 32) return toIsLand ? 8 : 3;   // sharp turn: pivot (land keeps a little momentum)
    if (angErr >= 16) return toIsLand ? 16 : 8;  // moderate: land holds the climb floor; water eases
    return toIsLand ? 24 : 16;                    // aligned: full channel speed / climb-ashore momentum
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

  // ── Boat state-flip tracking (thrash guard + disembark commit) ─────────────
  // On patchy water the tank can board, instantly hit land, disembark, and re-acquire forever —
  // never crossing — while each brief boarding resets the acquisition timer so its 1500-tick
  // timeout never fires. Track onBoat flips: (a) on a DISEMBARK, open a short "commit to land"
  // window so the tank won't immediately re-board the boat it just stepped off; (b) too many
  // flips in a window means the crossing isn't viable, so trip the boat cooldown (commit to the
  // dry route / let the goal move on). Done BEFORE the acquisition decision so the new
  // disembark/cooldown state takes effect this tick.
  const obNum = a4.tankOnBoat ? 1 : 0;
  if (a4.boatFlipPrevState !== -1 && obNum !== a4.boatFlipPrevState) {
    if (obNum === 0) a4.boatDisembarkTick = a4.tickCounter;   // just disembarked → start commit window
    if (a4.tickCounter - a4.boatFlipWindowTick > 200) { a4.boatFlipCount = 0; a4.boatFlipWindowTick = a4.tickCounter; }
    if (++a4.boatFlipCount >= 6) {
      a4.boatFailedUntilTick = a4.tickCounter + 3000;   // ~60s: commit to dry route / let goal move on
      a4.boatNeeded = false;
      a4.boatAcquireSinceTick = 0;
      a4.boatFlipCount = 0;
      a4.worldCostsInitDone = 0;                        // force a fresh (dry) path
    }
  }
  a4.boatFlipPrevState = obNum;

  // Suppress acquisition during the post-timeout cooldown OR the brief post-disembark commit
  // window, so boatNeeded can't re-latch and re-board the just-left boat (the thrash). During
  // either, the tank commits to the dry route (or the goal handler moves on).
  const boatCooldownActive = a4.tickCounter < a4.boatFailedUntilTick;
  const boatCommitActive   = a4.boatDisembarkTick > 0 && (a4.tickCounter - a4.boatDisembarkTick) < 90;
  const boatSuppressed = boatCooldownActive || boatCommitActive;
  let acquiringBoat = a4.boatNeeded && !a4.tankOnBoat && a4.boatBuildTileX >= 0 && !boatSuppressed;
  if (boatSuppressed) a4.boatNeeded = false;

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
      // On a boat: keep FULL momentum to climb onto the shore. Disembarking requires
      // engine speed >= 16 at the instant the tank crosses from water onto land
      // (tank.ts moveStep: on a boat the tank only advances onto a non-water cell when
      // speed >= 16; below that it stalls floating against the bank and never lands).
      // So when the destination tile is LAND, command full speed REGARDLESS of
      // alignment — the old `aligned ? 24 : 12` dropped to 12 while turning and stalled
      // the disembark. Precision landing isn't possible on water, so no reason to creep.
      const dTX = (targetX >> 8) & 0xFF, dTY = (targetY >> 8) & 0xFF;
      const dRaw = a4.worldMap[((dTY & 0xFF) << 8) | (dTX & 0xFF)];
      const destIsLand = !(dRaw & 0x80) && (dRaw & 0x0F) !== 1 && (dRaw & 0x0F) !== 9 &&
                         (dRaw & 0x0F) !== 10 && a4.examineTerrainCostTable[dRaw] < 1000;
      setSpeed(a4, (destIsLand || aligned) ? 24 : 12, currentSpd);
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
    if (!onBoat && !acquiringBoat && !boatSuppressed) {
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
      if (!onBoat && !acquiringBoat && !boatSuppressed && wetPath) {
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

  // ── Channel-following carrot (boats) ──────────────────────────────────────
  // A fixed-distance carrot cuts corners: on a river bend it sits across the inside bank, so
  // the boat steers straight at land — clipping the shore, stalling, or disembarking into the
  // water. Instead steer like a river pilot: aim at the FURTHEST waypoint down the channel
  // whose straight line from the tank stays entirely over water. On a straight reach that
  // reaches far ahead (smooth, full speed); into a bend it collapses onto the bend apex, so
  // the bow turns to follow the channel and never points at the bank. The first waypoint whose
  // line crosses land marks the bend — stop there (points beyond it are also around the bend).
  // Boat-only: land navigation keeps the tuned fixed-distance carrot.
  if (a4.tankOnBoat) {
    const MAX_LOOK = 1536;  // ~6 tiles — how far down a straight channel we'll sight
    for (let i = idx + 1; i < path.length; i++) {
      const wx = ((path[i] & 0xFF) << 8) + 128;
      const wy = (((path[i] >> 8) & 0xFF) << 8) + 128;
      if (computeDistanceBetween(fromX, fromY, wx, wy) > MAX_LOOK) break;
      if (!lineStaysOnWater(a4, fromX, fromY, wx, wy)) break;  // hit the bend — steer to here
      carrotX = wx; carrotY = wy;
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
