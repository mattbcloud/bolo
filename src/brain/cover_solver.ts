/**
 * Cover-method firing solver — the geometry of shooting a pillbox from behind cover.
 *
 * WHY THIS EXISTS. The cover method (see `_coverMethodAttack`) parks a wall or a captured
 * pillbox next to the target pill so the pill's return fire — always aimed at the tank's
 * CENTRE — runs into the cover, while the tank grazes the pill's near edge past it. The window
 * that threads that needle is a couple of direction units wide against a hull that settles
 * within 1.33. Reasoning about it with a continuous ray (what `checkBarriers` approximates, one
 * sample per tile) is hopeless at that scale: it cannot see a one-tile brick, reports "clear",
 * and the brain fires its own cover down — 9 of 21 tracked shells died on our own wall.
 *
 * So this module does not approximate. It runs the ENGINE'S OWN shell resolution:
 *
 *   shell.ts move()    — radians = ((256 - direction)/256)·2π, then
 *                        x += round(cos·32), y += round(sin·32) — a CONSTANT INTEGER step,
 *                        so a shell flies a straight integer-lattice line, and directions
 *                        that round to the same step vector are the SAME trajectory.
 *   shell.ts collide() — checks the pill in the cell it landed in FIRST (armour > 0, within
 *                        127 of that cell's centre), and only then terrain — and a pill's
 *                        underlying terrain ('=', '~', '.') is never in the barrier list. So a
 *                        pillbox blocks a 127-radius DISC while a wall/forest/boat cell blocks
 *                        entirely: a captured pillbox used as cover is LEAKIER than a brick,
 *                        not merely more durable, and the target pill is likewise hittable
 *                        near dead centre from behind cover.
 *   ctor               — spawns at the owner's centre and moves ONCE before any collision
 *                        check, and never collides with its owner (`pill !== this.owner.$`).
 *
 * THE MECHANISM, which only this model can express: a shell's integer step vector is fixed at
 * launch, so which cells it crosses depends on where it was FIRED FROM within its tile. The
 * pill always fires from its own cell centre and has no such choice; the tank picks its phase.
 * Measured at (116,111)+(32,128) against pill (112,108) / cover (113,108): the tank's shot
 * threads (113,109) and hits, while the pill's reply along the same line clips the cover at
 * (113,108) and stops. That asymmetry IS the cover method, and it lives below tile resolution —
 * which is why the old `_coverFiringSlot`, searching tile CENTRES and validating with
 * `checkBarriers`, could not find it and fell back to firing into its own wall.
 *
 * Two entry points, deliberately split by cost:
 *   solveCoverSlot()  — searches sub-tile positions for the widest window. Expensive; the
 *                       caller caches it per (pill, cover) and navigates to the result.
 *   coverAimBand()    — the window at the tank's ACTUAL position, recomputed every tick.
 *                       This is what makes the approach robust: the tank never has to reach
 *                       an exact world point, it only has to stand somewhere the window is
 *                       open, and it always aims with the window it really has.
 *   coverShotHits()   — "would a shell fired along this facing, right now, hit?" The fire
 *                       gate. Exact, so no angular tolerance can lie about it.
 */

import type { A4State } from './a4_state.js';
import { Terrain } from './aindy_interface.js';
import type { PillState } from './aindy_interface.js';

const HIT_RADIUS = 127;      // shell.ts collide(): distance to the CELL centre
const TWO_PI = Math.PI * 2;

/** Terrain that stops a shell across its WHOLE cell — engine: cell.isType('|','}','#','b'). */
function cellStopsShell(terr: number): boolean {
  return terr === Terrain.WALL || terr === Terrain.SHOT_WALL ||
         terr === Terrain.FOREST || terr === Terrain.BOAT;
}

/** Direction (0-255 float, 0=E/64=N) from one world point to another — directionTo, unrounded. */
export function dirToFloat(x1: number, y1: number, x2: number, y2: number): number {
  return ((Math.atan2(-(y2 - y1), x2 - x1) * 256) / TWO_PI + 256) % 256;
}

/** The engine's per-tick shell displacement: a constant INTEGER step (shell.ts move()). */
function shellStep(dir: number): [number, number] {
  const rad = ((256 - dir) * TWO_PI) / 256;
  return [Math.round(Math.cos(rad) * 32), Math.round(Math.sin(rad) * 32)];
}

/**
 * Fly a shell from (sx,sy) along `dir` and report what it hits, exactly as the engine would.
 * `range` is the firing range in tiles (tank: shellCount >> 1); lifespan is range·8 - 2, and
 * the constructor's first move is NOT collision-checked.
 *
 * @returns 'hit' if it reaches the pill at (pillTx,pillTy), else 'blocked' or 'miss'.
 */
export function traceShell(
  a4: A4State, sx: number, sy: number, dir: number,
  pillTx: number, pillTy: number, range = 7,
): 'hit' | 'blocked' | 'miss' {
  const [stepX, stepY] = shellStep(dir);
  if (stepX === 0 && stepY === 0) return 'miss';
  const moves = range * 8;                       // ctor move + (lifespan+1) update moves
  let x = sx, y = sy;
  for (let i = 1; i <= moves; i++) {
    x += stepX; y += stepY;
    if (i === 1) continue;                       // the spawn move resolves no collision
    const tx = (x >> 8) & 0xFF, ty = (y >> 8) & 0xFF;
    const terr = a4.worldMap[(ty << 8) | tx] & 0x0F;
    if (terr === Terrain.PILL) {
      // Pills are tested BEFORE terrain and only inside their collision disc, so the corner
      // of a pill's cell is open air — the graze that makes pillbox cover work.
      const cx = (x & ~0xFF) + 128, cy = (y & ~0xFF) + 128;
      if (Math.hypot(x - cx, y - cy) <= HIT_RADIUS) {
        return (tx === pillTx && ty === pillTy) ? 'hit' : 'blocked';
      }
    } else if (cellStopsShell(terr)) {
      return 'blocked';
    }
  }
  return 'miss';
}

/**
 * Would the target pill's return fire REACH a tank standing at (tx,ty)?
 *
 * The pill aims at the tank's centre and leads by `(dist/32)·round(cos·ceil(speed))`, which is
 * zero for the stationary tank this is asked about (world_pillbox.ts) — so the shot is straight
 * down the centre line, which is precisely why cover on that line works.
 */
export function pillShotReaches(
  a4: A4State, pillTx: number, pillTy: number, tx: number, ty: number,
): boolean {
  const pcx = (pillTx << 8) + 128, pcy = (pillTy << 8) + 128;
  const [stepX, stepY] = shellStep(dirToFloat(pcx, pcy, tx, ty));
  if (stepX === 0 && stepY === 0) return false;
  let x = pcx, y = pcy;
  for (let i = 1; i <= 56; i++) {                // pillbox shells always use the default range 7
    x += stepX; y += stepY;
    if (i === 1) continue;
    if (Math.hypot(x - tx, y - ty) <= HIT_RADIUS) return true;   // it reaches us
    const cellX = (x >> 8) & 0xFF, cellY = (y >> 8) & 0xFF;
    const terr = a4.worldMap[(cellY << 8) | cellX] & 0x0F;
    if (terr === Terrain.PILL) {
      // `pill !== this.owner.$` (shell.ts collide): a pillbox never blocks its OWN shell, and
      // its first steps are still inside its own 127-unit disc. Testing this without excluding
      // the firing pill reports every position as shielded — cover geometry then looks free.
      if (cellX === pillTx && cellY === pillTy) continue;
      const cx = (x & ~0xFF) + 128, cy = (y & ~0xFF) + 128;
      if (Math.hypot(x - cx, y - cy) <= HIT_RADIUS) return false;   // absorbed by a pillbox
    } else if (cellStopsShell(terr)) {
      return false;                                                 // absorbed by the cover
    }
  }
  return false;
}

export interface AimBand {
  /** Centre of the widest hitting window, in direction units (0-255). */
  mid: number;
  /** Width of that window in direction units. Compare against the tank's aim precision. */
  width: number;
}

const SWEEP = 10;        // sweep ±10 direction units around the bearing to the pill
const COARSE = 0.4;      // coarse step: any window wide enough to hold contains ≥2 samples
const FINE = 0.05;       // edge refinement

/**
 * The widest window of fire directions from (sx,sy) that still lands on the pill.
 *
 * Returns null when no direction hits — which is a real answer, not a failure: standing
 * directly behind a one-tile cover, both pill edges fall inside the cover tile and there IS
 * no shot (safe but silent; the old code's failure mode, target stuck at armour 9-14).
 */
export function coverAimBand(
  a4: A4State, sx: number, sy: number, pillTx: number, pillTy: number, range = 7,
): AimBand | null {
  const centre = dirToFloat(sx, sy, (pillTx << 8) + 128, (pillTy << 8) + 128);
  const hits = (d: number) => traceShell(a4, sx, sy, (centre + d + 256) % 256, pillTx, pillTy, range) === 'hit';

  let best: AimBand | null = null;
  let runStart: number | null = null;
  for (let d = -SWEEP; d <= SWEEP + 1e-9; d += COARSE) {
    const ok = hits(d);
    if (ok && runStart === null) runStart = d;
    if ((!ok || d >= SWEEP) && runStart !== null) {
      // Refine both edges: walk outward from the last known-good coarse samples.
      const lastGood = ok ? d : d - COARSE;
      let lo = runStart, hi = lastGood;
      for (let e = runStart - COARSE + FINE; e < runStart - 1e-9; e += FINE) { if (hits(e)) { lo = e; break; } }
      for (let e = lastGood + COARSE - FINE; e > lastGood + 1e-9; e -= FINE) { if (hits(e)) { hi = e; break; } }
      const width = hi - lo;
      if (!best || width > best.width) best = { mid: (centre + (lo + hi) / 2 + 256) % 256, width };
      runStart = null;
    }
  }
  return best;
}

/** Exact fire gate: a shell leaving right now, along `facing`, connects. */
export function coverShotHits(
  a4: A4State, sx: number, sy: number, facing: number, pillTx: number, pillTy: number, range = 7,
): boolean {
  return traceShell(a4, sx, sy, facing, pillTx, pillTy, range) === 'hit';
}

export interface CoverSlot {
  /** World point to stand on. */
  x: number; y: number;
  /** Aim direction and window width there. */
  aimDir: number; band: number;
  /** Tiles out along the cover axis, and lateral offset — diagnostics only. */
  r: number; lat: number;
}

const SUB = 32;          // sub-tile sampling grid; the technique lives below tile resolution
const BAND_MARGIN = 2;   // a usable window is twice the hull's settling step, not merely wider

/** Per-tick turn step by terrain — TERRAIN_TYPE_ATTRIBUTES via turnTowardsDir's TURN_RATE. */
const TURN_RATE = [0, 0.25, 0.25, 0.25, 1, 0.5, 0.25, 1, 0, 1, 0.5];

/**
 * The narrowest window the tank can actually HOLD standing on this terrain.
 *
 * turnTowardsDir stops correcting inside a deadband of half a turn step, so a settled hull sits
 * anywhere in a window one full step wide (1.33 units on road). A firing window narrower than
 * that can't be held: the tank would sit "on target" by its own test and still miss, which is
 * the silent-but-safe failure this whole module exists to avoid.
 */
export function holdableBand(a4: A4State, tileX: number, tileY: number): number {
  const terr = a4.worldMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)] & 0x0F;
  return (TURN_RATE[terr] ?? 1) * 2.6555 / 2;
}

/**
 * Search sub-tile positions for the best place to shoot `pill` from behind the cover at
 * (covX,covY): shielded from the pill's return fire, with the widest hitting window.
 *
 * Ranked by STANDOFF, among slots whose window clears a comfortable margin over what the tank
 * can hold. Ranking by window width instead is tempting and measurably wrong: the window widens
 * as you close (r=4 measures 3-5 units against r=6's 1.4-2.9, because a nearer pill subtends a
 * wider angle), so width alone walks the tank to r=4 — where it captures more and dies far more
 * often, since the retreat when the brick fails is that much longer. Measured over 30 trials,
 * width-first scored 0.77 captures against 1.60 deaths; standoff-first keeps the captures at a
 * fraction of the cost. That is also what the doctrine has always said: 6-7 tiles out.
 *
 * So: take the farthest slot that can still be aimed with margin, not the widest window.
 * r=3 is excluded outright — one brick and 3.5 tiles is not a position to be talked into by a
 * wide window. r=7 is past our own reach once the lateral offset is added (7.6 tiles against a
 * 7-tile shell), so it rarely yields anything.
 */
export function solveCoverSlot(
  a4: A4State, pill: PillState, covX: number, covY: number,
  fromX: number, fromY: number, range = 7,
): CoverSlot | null {
  const pTx = pill.tileX & 0xFF, pTy = pill.tileY & 0xFF;
  const wrap = (d: number) => (((d + 128) & 0xFF) - 128);
  const dx = Math.sign(wrap(covX - pTx)), dy = Math.sign(wrap(covY - pTy));
  if (dx === 0 && dy === 0) return null;
  const px = -dy, py = dx;                       // the lateral axis

  let best: CoverSlot | null = null, bestScore = -Infinity;
  for (let r = 4; r <= 7; r++) {
    for (let lat = -3; lat <= 3; lat++) {
      if (lat === 0) continue;   // straight behind the cover both pill edges fall inside it: no shot
      const tileX = (pTx + dx * r + px * lat) & 0xFF;
      const tileY = (pTy + dy * r + py * lat) & 0xFF;
      const raw = a4.worldMap[(tileY << 8) | tileX];
      const terr = raw & 0x0F;
      // The tank has to be able to STAND here: not water, not a barrier, not another pill.
      if ((raw & 0x80) || terr === Terrain.RIVER || terr === Terrain.DEEP_SEA ||
          terr === Terrain.PILL || cellStopsShell(terr) ||
          (a4.examineTerrainCostTable[terr] ?? 1000) >= 1000) continue;
      // Demand real margin, not a bare pass: a window only just wider than the hull's settling
      // step is one the tank sits "on target" in and still misses.
      const minBand = holdableBand(a4, tileX, tileY) * BAND_MARGIN;
      for (let ox = SUB; ox < 256; ox += SUB) {
        for (let oy = SUB; oy < 256; oy += SUB) {
          const sx = (tileX << 8) + ox, sy = (tileY << 8) + oy;
          if (pillShotReaches(a4, pTx, pTy, sx, sy)) continue;      // exposed → not cover
          const band = coverAimBand(a4, sx, sy, pTx, pTy, range);
          if (!band || band.width < minBand) continue;
          const travel = Math.hypot(sx - fromX, sy - fromY) / 256;
          const score = r * 1000 + band.width - travel * 0.01;
          if (score > bestScore) { bestScore = score; best = { x: sx, y: sy, aimDir: band.mid, band: band.width, r, lat }; }
        }
      }
    }
  }
  return best;
}
