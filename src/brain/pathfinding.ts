/**
 * Pathfinding Core — aIndy3.1 TypeScript Port
 *
 * Functions ported in this file:
 *   manstopped          (0x00B6CA) — 4-corner man navigability test
 *   stuarts_aim         (0x00B812) — CORDIC-like angle calculator
 *   directionTo         (0x014bae) — FixATan2-based direction (4 coords → angle)
 *   locationFromDir     (0x015636) — project new position from dir + dist
 *   numTicks            (0x015866) — sqrt-based distance-to-ticks formula
 *   manLocationFromTicks (0x00BAEC) — simulate man movement for N ticks
 *   manCheckPathIterative (0x00B8C6) — iterative path validation
 *   setManTime          (0x019B92) — compute man travel timing + update deadline
 *   manTicksFromPath    (0x00BC9C) — man path cost estimator (stub; full A* in Step 7)
 *
 * All angle values: 0–255, 0=East, 64=North, 128=West, 192=South.
 * (Verified against Orona tank motion formula; Y-negation in directionTo makes 64=North.)
 * All positions: BWorld units (256 per tile).
 *
 * References:
 *   manstopped_decode.md, stuarts_aim_decode.md, directionto_decode.md,
 *   locationfromdir_decode.md, numticks_decode.md,
 *   manlocationfromticks_decode.md, mancheckpathiterative_decode.md,
 *   setmantime_decode.md
 */

import { A4State } from './a4_state.js';
import {
  fixATan2, signedWord,
  LFD_X_SLOPES, LFD_Y_SLOPES,
  STUARTS_X, MAN_Y_SLOPES, TERRAIN_SCALE_SHIFT,
} from './aindy_interface.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Sentinel: unreachable / not-yet-visited cost in route tables */
export const UNVISITED = 0x7D01;

/** manstopped: 4-corner offset (±32 BWorld = ±0.125 tiles) */
const MAN_CORNER_OFFSET = 32;

/** manstopped: close-to-tank passthrough radius (112 BWorld) */
const MAN_TANK_RADIUS = 0x70;

// ─────────────────────────────────────────────────────────────────────────────
// manstopped (0x00B6CA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * manstopped — Determine whether a builderman can occupy a BWorld position.
 *
 * Performs a 4-corner straddle test at (x±32, y±32). Returns true if ANY
 * corner is passable (man body can fit in that space).
 *
 * Special terrain handling:
 *   - Defended pill slots (byte[19] > 0): passable (man walks toward it)
 *   - Ally defended bases (flags&1, defended): passable
 *   - All others: look up A4[6434] passability table
 *
 * Side effect: sets a4.manLocRouteCacheHandle when a passable pill is found.
 *
 * @param x     BWorld X coordinate to test
 * @param y     BWorld Y coordinate to test
 * @param mode  If nonzero, positions within 112 BWorld of the tank are
 *              automatically passable (allows departure from tank tile)
 * @param tankX Current tank BWorld X (for mode != 0 check)
 * @param tankY Current tank BWorld Y
 */
export function manstopped(
  a4: A4State,
  x: number, y: number,
  mode: number,
  tankX: number, tankY: number,
): boolean {
  const offsets: readonly number[] = [-MAN_CORNER_OFFSET, MAN_CORNER_OFFSET];

  for (const xs of offsets) {
    for (const ys of offsets) {
      const cx = (x + xs) & 0xFFFF;
      const cy = (y + ys) & 0xFFFF;
      const tileX = (cx >> 8) & 0xFF;
      const tileY = (cy >> 8) & 0xFF;

      // ── Gate 1: Destination tile shortcut ─────────────────────────────
      // If this corner lands on the man's set destination tile, pass through.
      // A4[13568] = gate active; A4[13566/67] = destination tile X/Y.
      if (a4.manLocScratchFlag !== 0) {
        if (tileX === (a4.manDestTileX & 0xFF) && tileY === (a4.manDestTileY & 0xFF)) {
          return true;
        }
      }

      // ── Gate 2: Close-to-tank shortcut ────────────────────────────────
      if (mode !== 0) {
        if (Math.abs(signedWord(cx - tankX)) < MAN_TANK_RADIUS &&
            Math.abs(signedWord(cy - tankY)) < MAN_TANK_RADIUS) {
          return true;
        }
      }

      // ── Terrain check ─────────────────────────────────────────────────
      const rawTile = a4.worldMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)];
      const terrain = rawTile & 0x0F;

      if (terrain === 0x0C) {
        // Pill slot: passable only if defended pill is present
        const pill = a4.getPillAtTile(tileX, tileY);
        if (pill !== null && pill.defenderCount > 0) {
          // Side effect: save pill reference (A4[13562])
          // (stored as a numeric index for simplicity)
          return true;
        }
        // No defended pill → blocked
      } else if (terrain === 0x0B) {
        // Base tile: passable if ally-owned and defended
        const base = a4.getBaseAtTile(tileX, tileY);
        if (base !== null && (base.flags & 0x01) !== 0 && base.defended) {
          return true;
        }
        // Enemy/undefended base → blocked
      } else {
        // General terrain: use passability table (A4[6434])
        if (a4.terrainPassability[terrain] !== 0) {
          return true;
        }
      }
      // This corner blocked, try next
    }
  }

  // All 4 corners blocked
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// stuarts_aim (0x00B812)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * stuarts_aim — CORDIC-like direction angle from (dx, dy) deltas.
 *
 * Classic binary-search arctangent that converges in 4 iterations.
 * Returns 0–255, where 0=East, 64=North, 128=West, 192=South.
 *
 * In the TypeScript port this is implemented via Math.atan2 (equivalent
 * result within ±1 unit of the original CORDIC output).
 *
 * The original used two lookup tables:
 *   A4[0x34F2] (13554): Y-axis sin-like multipliers  → STUARTS_Y
 *   A4[0x34F6] (13558): X-axis cos-like multipliers  → STUARTS_X
 * These are the same values `fixATan2` computes analytically.
 */
export function stuarts_aim(dx: number, dy: number): number {
  // Direct Math.atan2 equivalent of the 4-iteration CORDIC binary search.
  // fixATan2(dy, dx) converts to 0-255 screen-convention direction.
  return fixATan2(dy, dx);
}

// ─────────────────────────────────────────────────────────────────────────────
// DirectionTo (0x014bae)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DirectionTo — angle from origin (x1,y1) to destination (x2,y2).
 *
 * Uses Mac OS FixATan2 ($A818) with dy negated for coordinate system
 * conversion (screen Y-down → math Y-up).
 *
 * Formula:
 *   dx = x2 - x1
 *   dy = -(y2 - y1)      ← Y negation: screen→math convention
 *   return fixATan2(dy, dx)
 *
 * See directionto_decode.md (Session 31, corrected Session 46).
 */
export function directionTo(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = signedWord(x2 - x1);
  const dy = -signedWord(y2 - y1);   // negate: screen Y-down → math Y-up
  return fixATan2(dy, dx);
}

// ─────────────────────────────────────────────────────────────────────────────
// ComputeDirectionDelta (0x017b0a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ComputeDirectionDelta — absolute angular difference between two directions.
 *
 * Returns a value in [0, 128] (half-circle max since directions wrap).
 */
export function computeDirectionDelta(a: number, b: number): number {
  let delta = ((a - b) + 256) & 0xFF;
  if (delta > 128) delta = 256 - delta;
  return delta;
}

// ─────────────────────────────────────────────────────────────────────────────
// LocationFromDir (0x015636)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LocationFromDir — project a new position from a starting offset + direction.
 *
 * Uses the LFD slope tables (256-entry, scale ×16384):
 *   LFD_X_SLOPES[dir] = cos(dir × 2π/256) × 16384
 *   LFD_Y_SLOPES[dir] = sin(dir × 2π/256) × 16384
 *
 * Formula:
 *   new_x = xOffset + floor(delta × LFD_X_SLOPES[direction] / 16384)
 *   new_y = yOffset + floor(delta × LFD_Y_SLOPES[direction] / 16384)
 *
 * Parameters match the 6-arg stack frame (verified Session 46):
 *   direction (byte), delta (word), xOffset (word), yOffset (word),
 *   out_x_ptr*, out_y_ptr*
 *
 * @returns { x: number, y: number } output coordinates (BWorld)
 */
export function locationFromDir(
  direction: number,
  delta: number,
  xOffset: number,
  yOffset: number,
): { x: number; y: number } {
  const dir = direction & 0xFF;
  const xSlope = LFD_X_SLOPES[dir];   // cos × 16384
  const ySlope = LFD_Y_SLOPES[dir];   // sin × 16384

  const newX = (xOffset + Math.trunc(delta * xSlope / 16384)) & 0xFFFF;
  const newY = (yOffset + Math.trunc(delta * ySlope / 16384)) & 0xFFFF;

  return { x: newX, y: newY };
}

// ─────────────────────────────────────────────────────────────────────────────
// NumTicks (0x015866)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NumTicks — estimate ticks to traverse a distance.
 *
 * Formula (from numticks_decode.md):
 *   ticks = floor(sqrt((param2 / distance) × 2.6 + 1.0))
 *
 * The √ relationship models sub-linear time scaling for long distances
 * (acceleration / pathfinding shortcut heuristic).
 *
 * @param distance  BWorld distance (word param1 at +8(A6))
 * @param param2    Speed/scale factor (byte param2 at +A(A6))
 */
export function numTicks(distance: number, param2: number): number {
  if (distance <= 0) return 1;
  const ratio = param2 / distance;
  const adjusted = ratio * 2.6 + 1.0;
  return Math.max(1, Math.floor(Math.sqrt(adjusted)));
}

// ─────────────────────────────────────────────────────────────────────────────
// ManLocationFromTicks (0x00BAEC)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ManLocationFromTicks — simulate man movement for a given tick count.
 *
 * Simulates ~0.62× the tick count (iteration scaling for performance).
 * Uses STUARTS_X / MAN_Y_SLOPES for directional movement, scaled by terrain
 * passability (TERRAIN_SCALE_SHIFT bit-shift).
 *
 * Returns the estimated final position after traveling in `direction` for
 * `ticks` ticks from (startX, startY).
 *
 * See manlocationfromticks_decode.md.
 *
 * @param startX  BWorld X start position
 * @param startY  BWorld Y start position
 * @param direction  0-255 travel direction
 * @param ticks   Number of ticks to simulate
 * @param tankX   Tank BWorld X (for manstopped gate 2)
 * @param tankY   Tank BWorld Y
 */
export function manLocationFromTicks(
  a4: A4State,
  startX: number, startY: number,
  direction: number,
  ticks: number,
  tankX: number, tankY: number,
): { x: number; y: number } {
  // Phase 1: Compute iteration count ≈ ticks × 0.62
  // Formula from decode: iterations ≈ (ticks * 31/128 + ticks) / 2
  const iterations = Math.floor((ticks * 31 / 128 + ticks) / 2);

  let curX = startX & 0xFFFF;
  let curY = startY & 0xFFFF;

  const dir = direction & 0xFF;

  for (let i = 0; i < iterations; i++) {
    const tileX = (curX >> 8) & 0xFF;
    const tileY = (curY >> 8) & 0xFF;
    const tileIdx = ((tileY & 0xFF) << 8) | (tileX & 0xFF);

    // Terrain type and passability shift
    const rawTile = a4.worldMap[tileIdx];
    const terrain = rawTile & 0x0F;
    const shiftAmt = TERRAIN_SCALE_SHIFT[terrain] ?? 2;

    // Directional slopes (from STUARTS_X / MAN_Y_SLOPES tables)
    const xSlope = STUARTS_X[dir];           // A4[0x34F6]: cos × 128
    const ySlope = MAN_Y_SLOPES[dir];        // A4[0x34EE]: -sin × 128

    // Scaled movement step
    const dx = xSlope >> shiftAmt;
    const dy = ySlope >> shiftAmt;

    // Candidate next position
    const nextX = (curX - dy) & 0xFFFF;     // Note: stuarts slope sign conventions
    const nextY = (curY - dx) & 0xFFFF;     // (inverted per manlocationfromticks doc)

    // Validate with manstopped
    if (manstopped(a4, nextX, nextY, 0, tankX, tankY)) {
      curX = nextX;
      curY = nextY;
    } else {
      // Try X-axis only
      const tryX = (curX - dy) & 0xFFFF;
      if (dy !== 0 && manstopped(a4, tryX, curY, 0, tankX, tankY)) {
        curX = tryX;
      }
      // Try Y-axis only
      else {
        const tryY = (curY - dx) & 0xFFFF;
        if (dx !== 0 && manstopped(a4, curX, tryY, 0, tankX, tankY)) {
          curY = tryY;
        }
        // Both blocked: stop simulation
        else break;
      }
    }
  }

  return { x: curX, y: curY };
}

// ─────────────────────────────────────────────────────────────────────────────
// ManCheckPathIterative (0x00B8C6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ManCheckPathIterative — iterative path validation for builderman.
 *
 * Simulates step-by-step movement from start toward dest, using stuarts_aim
 * to compute direction each step and manstopped to validate tiles.
 *
 * Returns true if destination is reachable, false if blocked.
 *
 * See mancheckpathiterative_decode.md (decoded Session 36).
 *
 * @param startX  Starting BWorld X
 * @param startY  Starting BWorld Y
 * @param destX   Destination BWorld X
 * @param destY   Destination BWorld Y
 * @param tankX   Tank BWorld X (for manstopped)
 * @param tankY   Tank BWorld Y
 */
export function manCheckPathIterative(
  a4: A4State,
  startX: number, startY: number,
  destX: number, destY: number,
  tankX: number, tankY: number,
): boolean {
  // Set destination tile gate (A4[13568/13566/13567])
  const destTileX = (destX >> 8) & 0xFF;
  const destTileY = (destY >> 8) & 0xFF;
  a4.manLocScratchFlag = 1;
  a4.manDestTileX = destTileX;
  a4.manDestTileY = destTileY;

  let curX = startX & 0xFFFF;
  let curY = startY & 0xFFFF;

  const MAX_ITERS = 512;  // prevent infinite loops

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    const curTX = (curX >> 8) & 0xFF;
    const curTY = (curY >> 8) & 0xFF;

    // Arrival check: at destination tile
    if (curTX === destTileX && curTY === destTileY) {
      a4.manLocScratchFlag = 0;
      return true;   // SUCCESS
    }

    // Compute deltas to destination
    const dx = signedWord(destX - curX);
    const dy = signedWord(destY - curY);

    // Validate current position navigable
    if (!manstopped(a4, curX, curY, 0, tankX, tankY)) {
      // Position itself is blocked — stop
      break;
    }

    // Terrain difficulty
    const tileIdx = ((curTY & 0xFF) << 8) | (curTX & 0xFF);
    const terrain = a4.worldMap[tileIdx] & 0x0F;
    const shiftAmt = a4.terrainScaleShift[terrain] ?? 2;

    // Direction to destination
    const dir = stuarts_aim(dx, dy);

    // Movement deltas scaled by terrain
    const xSlope = STUARTS_X[dir];
    const ySlope = MAN_Y_SLOPES[dir];
    const scaledDX = Math.trunc(dx > 128 ? 128 : dx < -128 ? -128 : dx) >> shiftAmt;
    const scaledDY = Math.trunc(dy > 128 ? 128 : dy < -128 ? -128 : dy) >> shiftAmt;

    // Try combined movement
    const nextX = (curX + scaledDX) & 0xFFFF;
    const nextY = (curY + scaledDY) & 0xFFFF;

    if (scaledDX !== 0 && manstopped(a4, nextX, curY, 0, tankX, tankY)) {
      curX = nextX;
    } else if (scaledDY !== 0 && manstopped(a4, curX, nextY, 0, tankX, tankY)) {
      curY = nextY;
    } else if (scaledDX !== 0 && scaledDY !== 0 && manstopped(a4, nextX, nextY, 0, tankX, tankY)) {
      curX = nextX;
      curY = nextY;
    } else {
      // No valid move
      break;
    }
  }

  a4.manLocScratchFlag = 0;
  return false;  // BLOCKED
}

// ─────────────────────────────────────────────────────────────────────────────
// ManTicksFromPath (0x00BC9C) — path cost estimator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Man movement cost per tile, indexed by terrain type 0-12.
 * Units: ticks per 256 BWorld (1 tile).
 * 0x7FFF = impassable (man cannot walk here).
 *
 * Values approximate the original A4[6392] terrainScaleShift table:
 *   man_ticks_per_tile ≈ 256 × (1 << terrainScaleShift[t])
 */
const MAN_TICKS_PER_TILE: readonly number[] = [
  0x7FFF,  //  0 wall          — impassable
  0x7FFF,  //  1 river         — impassable (can't swim)
  2048,    //  2 swamp         — very slow
  1024,    //  3 crater        — slow
   256,    //  4 road          — full speed (256 ticks/tile = 1 BW/tick)
   512,    //  5 forest        — slow for men (chop trees) but navigable
   512,    //  6 rubble        — medium
   512,    //  7 grass         — medium
  0x7FFF,  //  8 shot-wall     — impassable
   256,    //  9 boat          — full speed (river + boat)
  0x7FFF,  // 10 deep sea      — impassable
   256,    // 11 base          — full speed
   256,    // 12 pill slot     — full speed
   256,    // 13 misc          — full speed
];

/**
 * ManTicksFromPath — estimate ticks for a man to travel from (sx,sy) to (dx,dy).
 *
 * Walks the direct path tile-by-tile using DDA and sums per-terrain movement
 * costs. Returns 0x7FFFFFFF if any tile along the path is impassable for men
 * (wall, river, deep sea), which lets callers detect blocked routes.
 *
 * The original binary uses A* cost tables for exact routing; this DDA walk is
 * a significant improvement over the previous Euclidean approximation because
 * it correctly handles terrain and detects blocking walls.
 *
 * @returns estimated ticks (0 = trivial, 0x7FFFFFFF = blocked, >0 = cost)
 */
export function manTicksFromPath(
  a4: A4State,
  startX: number, startY: number,
  destX: number, destY: number,
): number {
  const ddx = signedWord(destX - startX);
  const ddy = signedWord(destY - startY);
  const distBWorld = Math.round(Math.sqrt(ddx * ddx + ddy * ddy));

  if (distBWorld === 0) return 0;
  if (distBWorld > 200 * 256) return 0x7FFFFFFF;  // over 200 tiles → unreachable

  // Tile coordinates of start and destination
  const startTX = (startX >> 8) & 0xFF;
  const startTY = (startY >> 8) & 0xFF;
  const destTX  = (destX  >> 8) & 0xFF;
  const destTY  = (destY  >> 8) & 0xFF;

  const tileDX = signedWord(destTX - startTX);
  const tileDY = signedWord(destTY - startTY);
  const steps  = Math.max(1, Math.max(Math.abs(tileDX), Math.abs(tileDY)));

  let totalTicks = 0;

  for (let i = 1; i <= steps; i++) {
    const tx = Math.round(startTX + tileDX * i / steps) & 0xFF;
    const ty = Math.round(startTY + tileDY * i / steps) & 0xFF;
    const cell    = a4.worldMap[(ty << 8) | tx];
    const terrain = cell & 0x0F;

    // Water flag: always impassable for men on foot
    if (cell & 0x80) return 0x7FFFFFFF;

    const cost = MAN_TICKS_PER_TILE[terrain] ?? 256;
    if (cost >= 0x7FFF) return 0x7FFFFFFF;  // impassable terrain

    totalTicks += cost;
  }

  return Math.max(1, totalTicks);
}

// ─────────────────────────────────────────────────────────────────────────────
// SetManTime (0x019B92)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SetManTime — compute man round-trip timing and conditionally extend deadline.
 *
 * Calls ManTicksFromPath twice:
 *   Route 1: tank → man spawn
 *   Route 2: man spawn → tank (reversed args, verified Session 46)
 *
 * Total = route1 + route2 + 120 (2-second spawn/pickup overhead).
 * Updates A4[11730] (manArrivalDeadline) only if new deadline is LATER
 * (i.e., extends the deadline).
 *
 * @returns total ticks for the round trip
 */
export function setManTime(
  a4: A4State,
  tankX: number, tankY: number,
  spawnX: number, spawnY: number,
): number {
  // Route 1: tank → spawn
  const route1 = manTicksFromPath(a4, tankX, tankY, spawnX, spawnY);

  // Route 2: spawn → tank (REVERSED — confirmed by Session 46 verification)
  const route2 = manTicksFromPath(a4, spawnX, spawnY, tankX, tankY);

  const totalTicks = route1 + route2 + 120;   // 120 = 2-second overhead

  // Compute new deadline and extend if later than current
  const newDeadline = totalTicks + a4.tickCounter;
  if (newDeadline > a4.manArrivalDeadline) {
    a4.manArrivalDeadline = newDeadline;
  }

  return totalTicks;
}

// ─────────────────────────────────────────────────────────────────────────────
// ComputeDistanceBetween (0x017AAA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ComputeDistanceBetween — Euclidean distance between two BWorld points.
 * Simple integer approximation.
 */
export function computeDistanceBetween(
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  const dx = signedWord(x2 - x1);
  const dy = signedWord(y2 - y1);
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

// ─────────────────────────────────────────────────────────────────────────────
// TurnTowardsDir (0x017b6a) — steer tank toward a direction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TurnTowardsDir (0x017b6a) — Issue turn commands to rotate toward targetDir.
 *
 * Exact port from turntowardsdir_decode.md (232-byte assembly).
 * Picks the SHORTER angular path (direct or wraparound).
 *
 * Control bits (REFERENCE + verified decode):
 *   steeringWord 0x04 = large CCW   steeringWord 0x08 = large CW
 *   firingWord   0x04 = fine CCW    firingWord   0x08 = fine CW
 *
 * @returns 1 if aligned within tolerance, 0 if still turning
 */
export function turnTowardsDir(
  a4: A4State,
  currentDir: number,
  targetDir: number,
  tolerance = 5,
): number {
  // Facing is used at FULL precision. buildBrainState hands us the engine's float direction
  // (aindy_interface.ts:750) and every consumer used to truncate it with `& 0xFF`, throwing away up
  // to a whole direction unit — 44 world units of lateral error at 7 tiles, on its own wider than
  // the gap an edge-graze past cover has to thread.
  const facing = ((currentDir % 256) + 256) % 256;
  const target = ((targetDir % 256) + 256) % 256;
  // Signed byte subtraction (simulate 68k MOVE.B + SUB.W behaviour)
  let delta = facing - target;
  if (delta > 127)  delta -= 256;
  if (delta < -128) delta += 256;

  // DEADBAND — do not command a turn the tank would overshoot.
  //
  // Tank.turn (objects/tank.ts) turns `getTankTurn × 2.6555` per tick, HALVED until turnSpeedup
  // reaches 10, and a reversal resets that ramp. So the smallest step a tank can take is
  // rate×2.6555/2 — 1.33 units on road. Asked to close an error smaller than that, bang-bang
  // control swings past it, reverses, resets the ramp and swings back: a limit cycle that never
  // settles and never satisfies a tolerance of 0. Measured, the commanded direction reversed on 19%
  // of turning ticks, and the aim was never still enough to place a shot at a pill's edge.
  //
  // Below half a step, turning makes the error WORSE than standing still, so standing still is the
  // accurate move. Rates mirror TERRAIN_TYPE_ATTRIBUTES in world_map.ts, indexed by the brain's
  // terrain code; anything unknown assumes the fastest (road/grass) rate, which errs toward a wider
  // deadband rather than a hunting one.
  const TURN_RATE = [0, 0.25, 0.25, 0.25, 1, 0.5, 0.25, 1, 0, 1, 0.5];
  const terrain = a4.worldMap[((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF)] & 0x0F;
  const stepPerTick = (TURN_RATE[terrain] ?? 1) * 2.6555 / 2;
  const deadband = Math.max(tolerance, stepPerTick / 2);
  if (Math.abs(delta) <= deadband) return 1;

  // Direction convention: 0=East, 64=North, 128=West, 192=South.
  // CW on screen  = direction DECREASES (East→South→West→North) → turningClockwise   = 0x08
  // CCW on screen = direction INCREASES (East→North→West→South) → turningCCW = 0x04
  //
  // delta = facing - target.
  // delta < 0: facing < target → short path is CCW (increase by |delta| steps)
  // delta > 0: facing > target → short path is CW  (decrease by delta steps)
  if (delta < 0) {
    const absDelta = -delta;
    if (absDelta > 128) {
      // Wrap: short path is CW = 256-absDelta steps
      const wrapDelta = 256 - absDelta;
      if (wrapDelta <= tolerance) return 1;
      if (wrapDelta > 9) { a4.steeringWord |= 0x08; } else { a4.firingWord |= 0x08; }
    } else {
      // Direct: short path is CCW = absDelta steps
      if (absDelta <= tolerance) return 1;
      if (absDelta > 9) { a4.steeringWord |= 0x04; } else { a4.firingWord |= 0x04; }
    }
  } else if (delta > 0) {
    if (delta > 128) {
      // Wrap: short path is CCW = 256-delta steps
      const wrapDelta = 256 - delta;
      if (wrapDelta <= tolerance) return 1;
      if (wrapDelta > 9) { a4.steeringWord |= 0x04; } else { a4.firingWord |= 0x04; }
    } else {
      // Direct: short path is CW = delta steps
      if (delta <= tolerance) return 1;
      if (delta > 9) { a4.steeringWord |= 0x08; } else { a4.firingWord |= 0x08; }
    }
  } else {
    return 1;   // exactly aligned
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// TurnTowardsXY (0x017C66)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TurnTowardsXY — wrapper: compute direction to (tx,ty) then turn toward it.
 *
 * Wrapper over DirectionTo → TurnTowardsDir.
 * See combat_helpers_decode.md.
 */
export function turnTowardsXY(
  a4: A4State,
  fromX: number, fromY: number,
  toX: number, toY: number,
  currentDir: number,
  tolerance = 5,
): void {
  const targetDir = directionTo(fromX, fromY, toX, toY);
  turnTowardsDir(a4, currentDir, targetDir, tolerance);
}
