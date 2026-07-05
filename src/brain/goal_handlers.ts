/**
 * Goal Handlers — aIndy3.1 TypeScript Port
 *
 * All 11 goal handler implementations:
 *   0  PlacePill   (0x0046ba)
 *   1  Explore     (0x002d50)
 *   2  FixPill     (0x00118e)
 *   3  GetBase     (0x001716)
 *   4  GetMan      (0x0017b6)
 *   5  NewGetPill  (0x00ea52)
 *   6  KillBase    (0x001f58)
 *   7  KillMan     (0x00232a)
 *   8  KillTank    (0x002764)
 *   9  Refuel      (0x0031c6)
 *  10  TourBases   (0x0030a4)
 *
 * Navigation and combat helpers (NavigateToCoords, Shoot, AimAt, etc.) are
 * declared as stubs here; they will be filled in during Steps 6–9 of the port.
 *
 * References: All decode_docs/*.md files; aIndy_REFERENCE.md §"Goal System"
 */

import { A4State } from './a4_state.js';
import type { BrainState, PillState, BaseState, EnemyTankState } from './aindy_interface.js';
import { macRandom, tickCount, byte } from './aindy_interface.js';
import { directionTo, computeDistanceBetween, locationFromDir, turnTowardsDir } from './pathfinding.js';
import { navigateToCoords as _navigateToCoords, setSpeed as _setSpeed } from './navigation.js';
// _navigateToCoords now has signature (a4, targetX, targetY, mode) — no state needed
import {
  shoot as _shoot, aimAt as _aimAt, chooseAttackPosition as _chooseAP, shootPill as _shootPill,
  findSafestPointFrom as _findSafestPointFrom, shootPillFromCover as _shootPillFromCover,
  checkBarriers as _checkBarriers, linearAim as _linearAim,
} from './combat.js';
import {
  newRefuel as _newRefuel, refuelGoTowardBase as _refuelGTB,
  placePillSurveyTerrain as _ppSurvey, placePillChoosePlacement as _ppChoose,
  placePillGotoBuildPoint as _ppGoto, placePillFinishUp as _ppFinish,
  dropMines as _dropMines, treesForRepair,
} from './building.js';

/** Find the best adjacent forest tile for tree harvesting (mirrors FindTree strict mode). */
function _findAdjacentForest(a4: A4State): { tileX: number; tileY: number } | null {
  const cx = a4.tankTileX & 0xFF;
  const cy = a4.tankTileY & 0xFF;
  const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dx, dy] of dirs) {
    const tx = (cx + dx) & 0xFF;
    const ty = (cy + dy) & 0xFF;
    const terrain = a4.worldMap[((ty & 0xFF) << 8) | (tx & 0xFF)] & 0x0F;
    if (terrain === 5) return { tileX: tx, tileY: ty };  // terrain 5 = forest
  }
  return null;
}

/** Nearest forest tile (terrain 5) to the tank within a tile radius, by Chebyshev
 *  distance. Used by the tree-gathering phase to go stock cover materials. */
function _findNearestForestTile(a4: A4State, maxR = 24): { tileX: number; tileY: number } | null {
  const cx = a4.tankTileX & 0xFF;
  const cy = a4.tankTileY & 0xFF;
  for (let r = 1; r <= maxR; r++) {
    let best: { tileX: number; tileY: number } | null = null;
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;   // perimeter of ring r
        const tx = (cx + dx) & 0xFF, ty = (cy + dy) & 0xFF;
        if ((a4.worldMap[((ty & 0xFF) << 8) | (tx & 0xFF)] & 0x0F) === 5) { best = { tileX: tx, tileY: ty }; break; }
      }
      if (best) break;
    }
    if (best) return best;
  }
  return null;
}

/** A buildable tile adjacent to `base` for planting a carried pillbox. The engine
 *  (builder.ts pillbox action) refuses pill/base/boat/deep-sea/forest/wall/shot-wall/
 *  water tiles, so only return tiles clear of those (grass/road/swamp/crater/rubble). */
function _findPillPlacementTile(a4: A4State, base: BaseState): { tileX: number; tileY: number } | null {
  const bx = base.tileX & 0xFF, by = base.tileY & 0xFF;
  const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dx, dy] of dirs) {
    const nx = (bx + dx) & 0xFF, ny = (by + dy) & 0xFF;
    const raw = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
    if (raw & 0x80) continue;                                  // water-flagged
    const t = raw & 0x0F;
    if (t === 0 || t === 5 || t === 8 || t === 9 || t === 10 || t === 11 || t === 12) continue;
    return { tileX: nx, tileY: ny };                            // wall/forest/shot-wall/boat/sea/base/pill excluded
  }
  return null;
}

// 8-neighbour tile offsets indexed by direction/32 (0=E,2=N,4=W,6=S; screen Y-down).
const DIR8_OFFSETS: readonly [number, number][] = [
  [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1],
];
function _dir8(direction: number): readonly [number, number] {
  return DIR8_OFFSETS[Math.round((direction & 0xFF) / 32) & 7];
}

const PLACE_PILL_TREES = 1;       // builder 'pillbox' cost: plant a carried pill (engine consumes this many trees)
const COVER_WALL_TREES = 2;       // builder 'building' cost for one wall tile
const COVER_FINISH_ARMOUR = 8;    // finish a pill from cover once its armour drops to this
const COVER_TREE_TARGET = 6;      // stock this many trees before engaging (≈3 walls for rebuilds)

/**
 * Cover method (validated in __sim__: maintained wall + edge-aim → kill pill taking
 * ~0 damage). Build a wall between the tank and the target pill, on the TANK's
 * neighbour tile toward the pill — i.e. right in front of the tank. This blocks the
 * pill→tank shell (which must cross that tile) while being a SHORT (~1-tile) builder
 * trip the builder can actually complete — building at the PILL's neighbour instead is
 * an ~8-tile trip from firing range that the builder never finishes (it parachutes the
 * whole game). shootPillFromCover then grazes shells past the wall's edge. NOTE: the
 * brain only perceives this wall because mapChanged now invalidates the cached static
 * terrain (without that fix the built wall is invisible in worldMap and never used).
 */
function _maintainCover(a4: A4State, state: BrainState, pill: PillState): void {
  const tank = state.tank;
  // Gate purely on builder availability: if it is out of the tank, it is already
  // deploying/building — wait. (Do NOT gate on newGetPillAttackMode: that flag can
  // get stuck at 1 when a prior dispatch never deployed, permanently blocking cover.)
  if (!tank.builderInTank || tank.onBoat) return;

  // Cover tile = the TANK's neighbour toward the pill (right in front of the tank).
  const bearing = directionTo(tank.x, tank.y, pill.x, pill.y) & 0xFF; // tank→pill
  const [dx, dy] = _dir8(bearing);
  const cnx = (a4.tankTileX + dx) & 0xFF, cny = (a4.tankTileY + dy) & 0xFF;
  const cRaw = a4.worldMap[((cny & 0xFF) << 8) | (cnx & 0xFF)];
  const cTerrain = cRaw & 0x0F;

  // Already shell-blocking (wall/forest/shot-wall/live pill) → cover present.
  if (cTerrain === 0 || cTerrain === 5 || cTerrain === 8 || cTerrain === 12) return;

  if (tank.resourceCount >= COVER_WALL_TREES) {
    // Only build on buildable land (not water/base); else skip rather than deadlock
    // the dispatch gate on an order the builder can't fulfil.
    const buildable = !(cRaw & 0x80) && cTerrain !== 11; // not water, not base
    if (!buildable) return;
    a4.pendingBuilderAction = { action: 'building', trees: COVER_WALL_TREES, tileX: cnx, tileY: cny };
    a4.newGetPillAttackMode = 1;
    a4.coverBuilderDispatchTick = a4.tickCounter;   // suppress GetMan during cover build
  } else {
    const tree = _findAdjacentForest(a4);
    if (tree) {
      a4.pendingBuilderAction = { action: 'forest', trees: 0, tileX: tree.tileX, tileY: tree.tileY };
      a4.newGetPillAttackMode = 1;
      a4.coverBuilderDispatchTick = a4.tickCounter;
    }
  }
}

/**
 * Find the firing slot BEHIND the cover to attack `pill` from.
 *
 * Geometry (why the tank must sit offset, not directly behind): a cover pillbox is a single tile.
 * Directly behind it on the pill→cover line, the cover blocks the pill's centre-aimed return fire
 * (good) — but it ALSO blocks the tank's own edge shots (both symmetric pill edges fall inside the
 * cover tile), so the tank is safe yet can't fire (measured: target stuck at armour 9-14). Shift the
 * tank ~1 tile laterally and one pill edge opens up (the graze line clears the cover's corner) while
 * the pill's shot, still aimed at the tank's CENTRE, keeps crossing the cover tile → blocked. So the
 * winning slot satisfies BOTH: cover blocks slot→pill-centre, AND some pill edge is grazeable from
 * the slot. We verify both against real barriers (not tile heuristics) so quantization can't fool it.
 *
 * Returns the slot's world centre, or null if none exists (caller falls back to plain fire).
 */
function _coverFiringSlot(
  a4: A4State, state: BrainState, pill: PillState, covX: number, covY: number,
): { x: number; y: number } | null {
  const pillCx = ((pill.tileX & 0xFF) << 8) + 128, pillCy = ((pill.tileY & 0xFF) << 8) + 128;
  // Direction pill→cover as a tile step (wrap-safe; cover is a pill neighbour so |diff| is 1).
  const wrap = (d: number) => (((d + 128) & 0xFF) - 128);
  const dx = Math.sign(wrap(covX - (pill.tileX & 0xFF)));
  const dy = Math.sign(wrap(covY - (pill.tileY & 0xFF)));
  if (dx === 0 && dy === 0) return null;
  const perps = [[-dy, dx], [dy, -dx]] as const;      // the two lateral offset axes
  let best: { x: number; y: number } | null = null, bestScore = Infinity;
  for (const r of [2, 3, 4]) {                        // tiles out along the cover axis
    for (const [ox, oy] of perps) {
      for (const lat of [1, 2]) {                     // lateral offset in tiles
        const fx = (pill.tileX + dx * r + ox * lat) & 0xFF;
        const fy = (pill.tileY + dy * r + oy * lat) & 0xFF;
        const raw = a4.worldMap[((fy & 0xFF) << 8) | (fx & 0xFF)];
        const terr = raw & 0x0F;
        if (terr === 0 || (raw & 0x80) || (a4.examineTerrainCostTable[terr] ?? 1000) >= 1000) continue; // impassable
        const fcx = (fx << 8) + 128, fcy = (fy << 8) + 128;
        // (a) cover must block the pill's centre-aimed return fire from this slot.
        if (_checkBarriers(a4, fcx, fcy, pillCx, pillCy) === 0) continue;         // exposed → skip
        // (b) at least one pill edge must be grazeable (matches shootPillFromCover's ±112 edges).
        const dSlotToPill = directionTo(fcx, fcy, pillCx, pillCy) & 0xFF;
        const e1 = locationFromDir((dSlotToPill + 64) & 0xFF, 112, pillCx, pillCy);
        const e2 = locationFromDir((dSlotToPill + 192) & 0xFF, 112, pillCx, pillCy);
        const grazeable = _checkBarriers(a4, fcx, fcy, e1.x & 0xFFFF, e1.y & 0xFFFF) === 0
                       || _checkBarriers(a4, fcx, fcy, e2.x & 0xFFFF, e2.y & 0xFFFF) === 0;
        if (!grazeable) continue;
        const danger = a4.dangerMap[((fy & 0xFF) << 8) | (fx & 0xFF)] ?? 0;
        const travel = computeDistanceBetween(state.tank.x, state.tank.y, fcx, fcy) >> 8;
        const score = danger * 100 + travel + r;      // prefer safe, close, snug to the cover
        if (score < bestScore) { bestScore = score; best = { x: fcx, y: fcy }; }
      }
    }
  }
  return best;
}

/**
 * Cover-method attack — the real Bolo tactic (Puppy Love's Tactics & Strategy Guide):
 *
 *   1. PLACE the cover NEXT TO THE PILL, on the tank-facing side — and build it from OUTSIDE
 *      the pill's range. A pillbox only fires at a TANK within range (1919; world_pillbox.ts)
 *      and never targets the walking builder, so with our tank out of range the pill is dormant
 *      and the builder makes its trip to the pill unharmed. (Prefer planting a CAPTURED pillbox
 *      over a brick — it absorbs more and shoots back.)
 *   2. ATTACK from inside range: graze the pill's edge past the cover (shootPillFromCover). The
 *      pill aims its return fire at the tank's CENTRE, so its shells hit the cover, not us.
 *   3. RETREAT as the cover collapses: a wall shot out mid-fight drops us back to step 1 (rebuild
 *      from safety), so the builder is never deployed while the tank is inside the pill's range.
 *
 * Crucially the cover sits at the PILL's neighbour (fixed by the pill), NOT the tank's neighbour —
 * so it stays on the pill→tank line as the tank advances to fire. (The old _maintainCover built at
 * the tank's neighbour from firing range, which both mis-placed the wall and got the builder killed.)
 *
 * Returns true if it issued controls this tick (the caller should then return).
 */
function _coverMethodAttack(a4: A4State, state: BrainState, pill: PillState, pillDistPh: number): boolean {
  const tank = state.tank;
  if (pill.armour <= 0 || tank.onBoat) { a4.coverTilePill = -1; return false; }  // dead → capture; afloat → not now

  const PILL_RANGE  = 1919;    // world_pillbox.ts effective fire range
  const SAFE_BUILD  = 2080;    // only deploy the builder beyond this (range + coast margin)
  const ENGAGE_MAX  = 2304;    // ~9 tiles: only START a cover build once we've closed to here. Beyond
                               // it, APPROACH first (builder aboard) — else we'd dispatch the builder
                               // on a huge cross-map trek to a far pill and sit idle for it (live bug).
  const RETREAT_TO  = 2200;    // retreat to here to (re)build cover: outside range, still in the build
                               // band (<=ENGAGE_MAX) so we rebuild next tick instead of re-approaching.
  const FIRE_DIST   = 1740;    // advance to here to fire (inside our 1792 shell range)

  // Cover tile = the PILL's neighbour toward the TANK (the approach side), so the cover sits
  // BETWEEN the tank and the pill and the tank fires from BEHIND it. The old code aimed the cover
  // toward the AP (a firing slot the spiral search chooses independently) — which can land on the
  // FAR side of the pill, so the wall/pillbox got built OPPOSITE the tank and did nothing (observed
  // live). We latch the tile ONCE per target pill (keyed by coverTilePill): recomputing pill→tank
  // every tick would drift the tile off the placed cover as the tank advances to fire, "losing" it
  // and triggering an endless retreat/rebuild. The latch is captured when the tank is still out of
  // range holding for the builder, so pill→tank cleanly defines the approach side.
  const pillTilePacked = ((pill.tileY & 0xFF) << 8) | (pill.tileX & 0xFF);
  if (a4.coverTilePill !== pillTilePacked || a4.coverTileX < 0) {
    // Snap the cover axis to the nearest CARDINAL direction (N/E/S/W) toward the tank. A cover on a
    // DIAGONAL axis has no firing tile that is both behind the single cover tile AND has a grazing
    // edge (the two conditions are mutually exclusive at tile granularity), so the tank ends up
    // safe-but-silent. A cardinal axis always yields a valid offset slot (tank one tile back and one
    // tile to the side), which is exactly the pill-cover geometry. The tank repositions to that
    // cardinal side to fire from behind the cover.
    const pillToTank = directionTo(pill.x, pill.y, tank.x, tank.y) & 0xFF;
    const cardDir = (Math.round(pillToTank / 64) * 64) & 0xFF;   // nearest of E/N/W/S
    const [tdx, tdy] = _dir8(cardDir);
    a4.coverTileX = (pill.tileX + tdx) & 0xFF;
    a4.coverTileY = (pill.tileY + tdy) & 0xFF;
    a4.coverTilePill = pillTilePacked;
  }
  const covX = a4.coverTileX & 0xFF, covY = a4.coverTileY & 0xFF;
  const covRaw = a4.worldMap[((covY & 0xFF) << 8) | (covX & 0xFF)];
  const covTerr = covRaw & 0x0F;
  const coverPresent = covTerr === 0 || covTerr === 5 || covTerr === 8 || covTerr === 12; // wall/forest/shot-wall/pill

  // DO NOT hand off when the pill is nearly dead. The old code returned to the "normal approach"
  // at armour ≤4 — but that path is cover-BLIND: the cover sits on the pill→tank line by design,
  // so its LOS check is always blocked and it "advances to clear the line", pushing the tank OUT
  // from behind cover at exactly the moment the pill is hottest (armour 1-4 → fires every ~6
  // ticks). The tank got shot / driven off and left every target stuck at armour 1-4 (coverpill.
  // test: planted 5/5 but captured 0/5). The whole POINT of the cover is to survive this lethal
  // endgame, so we keep edge-firing from behind it all the way to armour 0. At 0 the pill becomes
  // passable and Phase 4a (which runs BEFORE this, ~line 1053) drives onto it to collect — A*
  // routes around the adjacent cover pillbox. Result: the cover finishes the kill it set up.

  const trees = tank.resourceCount & 0xFF;
  const carryingPill = (tank.pillsCarried & 0xFF) > 0;
  // PREFERRED cover = a CAPTURED pillbox planted next to the target (absorbs more AND shoots back
  // at the pill). The engine charges 1 tree to plant it (builder.performOrder), so we need a tree.
  const canPlantPill = carryingPill && trees >= PLACE_PILL_TREES;
  const canBuildWall = trees >= COVER_WALL_TREES;

  // Retreat to a standoff `toDist` from the pill, straight back along the tank→pill line.
  const retreat = (toDist: number) => {
    const inv = 1 / (pillDistPh || 1);
    const rx = (Math.round(pill.x + (tank.x - pill.x) * inv * toDist)) & 0xFFFF;
    const ry = (Math.round(pill.y + (tank.y - pill.y) * inv * toDist)) & 0xFFFF;
    navigateToCoords(a4, rx, ry, 0);
  };

  if (!coverPresent) {
    // The cover the fire relies on isn't up. Can we actually (re)build it next to this pill?
    const buildable = !(covRaw & 0x80) && covTerr !== 11;   // not water, not a base tile
    // Only commit to the cover method if we can place cover (plant the carried pill, build a wall,
    // or harvest a tree to do either). Otherwise DON'T retreat — that just oscillates approach⇄
    // retreat forever and never captures; engage without cover instead (fall through).
    const needTree = (carryingPill && trees < PLACE_PILL_TREES) || (!carryingPill && trees < COVER_WALL_TREES);
    const harvestTile = needTree ? _findAdjacentForest(a4) : null;
    const canCover = buildable && (canPlantPill || canBuildWall || harvestTile !== null);
    if (!canCover) return false;                            // no cover possible → engage without it

    // Don't sit and build cover on a tile ANOTHER threat can already hit. Setting up cover means
    // idling for the builder's long round-trip; if the standoff is exposed (another pill/tank in
    // range — the target pill is out of range here by construction), the tank just bleeds armour
    // and refuel-loops without ever engaging (live GetPill<->Refuel stall). Charge-and-capture
    // instead. Cover is reserved for genuinely safe/isolated pills, where dangerMap is clear.
    const tIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
    if (a4.dangerMap[tIdx] !== 0) return false;             // exposed standoff → engage without cover

    if (pillDistPh > ENGAGE_MAX) return false;              // too far to start a build → APPROACH first
                                                            // (builder stays aboard; the normal nav
                                                            // closes the distance, then we build here)

    if (pillDistPh <= SAFE_BUILD) {
      // Inside (or near) the pill's range — too dangerous to deploy the builder. Retreat out of
      // range first. This is also the "cover collapsed mid-fight → fall back and rebuild" path.
      retreat(RETREAT_TO);
      return true;
    }
    // Safely out of range: send the builder to place the cover NEXT TO THE PILL. Prefer planting
    // the captured pillbox; fall back to a brick; harvest a tree first if we're short.
    if (tank.builderInTank && !a4.pendingBuilderAction) {
      if (canPlantPill) {
        a4.pendingBuilderAction = { action: 'pillbox', trees: PLACE_PILL_TREES, tileX: covX, tileY: covY };
        a4.coverBuilderDispatchTick = a4.tickCounter;
      } else if (canBuildWall) {
        a4.pendingBuilderAction = { action: 'building', trees: COVER_WALL_TREES, tileX: covX, tileY: covY };
        a4.coverBuilderDispatchTick = a4.tickCounter;
      } else if (harvestTile) {
        // Short a tree — harvest the adjacent forest first (still safely out of range).
        a4.pendingBuilderAction = { action: 'forest', trees: 0, tileX: harvestTile.tileX, tileY: harvestTile.tileY };
        a4.coverBuilderDispatchTick = a4.tickCounter;
      }
    }
    setSpeed(a4, 0, tank.speed & 0xFF);   // hold out of range while the builder works
    return true;
  }

  // Cover is up next to the pill.
  if (!tank.builderInTank && pillDistPh > PILL_RANGE) {
    // Builder still finishing / walking home and we're safely out of range → wait for it to board.
    setSpeed(a4, 0, tank.speed & 0xFF);
    return true;
  }

  // Move to the OFFSET firing slot behind the cover (cover blocks the pill's return fire; the
  // lateral offset keeps one pill edge grazeable — see _coverFiringSlot). Sitting directly behind
  // the cover is safe but silent (both edges blocked → target barely damaged); firing from a random
  // stop point is exposed (target grinds the tank to 0). The computed slot is the sweet spot.
  const slot = _coverFiringSlot(a4, state, pill, covX, covY);
  if (slot) {
    const sTileX = (slot.x >> 8) & 0xFF, sTileY = (slot.y >> 8) & 0xFF;
    if (a4.tankTileX !== sTileX || a4.tankTileY !== sTileY) {
      navigateToCoords(a4, slot.x & 0xFFFF, slot.y & 0xFFFF, 0);   // drive onto the slot
      return true;
    }
    // On the slot, behind the cover → graze the pill's edge; its return fire hits the cover.
    a4.shootPillDirection = directionTo(tank.x, tank.y, pill.x, pill.y) & 0xFF;
    const fired = _shootPillFromCover(a4, state, pill);
    setSpeed(a4, 0, tank.speed & 0xFF);
    if (fired) a4.coverFinishHold = 1;   // covered + holding still → don't break off to refuel
    return true;
  }

  // No clean offset slot (e.g. a diagonal cover axis where no lateral tile both stays behind the
  // cover AND opens a grazing edge). Fall back to holding BEHIND the cover on the pill→cover line,
  // on the TANK's side — NOT the AP, which may be across the pill (that was the original
  // opposite-side bug). shootPillFromCover then fires whichever edge clears as the tank settles.
  const covCx = (covX << 8) + 128, covCy = (covY << 8) + 128;
  const behindDir = directionTo(pill.x, pill.y, covCx, covCy) & 0xFF;   // pill → cover (tank side)
  const behind = locationFromDir(behindDir, FIRE_DIST, pill.x, pill.y);
  const bTileX = (behind.x >> 8) & 0xFF, bTileY = (behind.y >> 8) & 0xFF;
  if (a4.tankTileX !== bTileX || a4.tankTileY !== bTileY) {
    navigateToCoords(a4, behind.x & 0xFFFF, behind.y & 0xFFFF, 0);
    return true;
  }
  a4.shootPillDirection = directionTo(tank.x, tank.y, pill.x, pill.y) & 0xFF;
  const fired = _shootPillFromCover(a4, state, pill);
  setSpeed(a4, 0, tank.speed & 0xFF);
  if (fired) a4.coverFinishHold = 1;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 0 — PlacePill (0x0046ba)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PlacePill — Navigate to base and build a pill.
 *
 * 4 sub-states (A4[13894]):
 *   0 = SurveyTerrain
 *   1 = ChoosePlacement
 *   2 = GotoBuildPoint
 *   3 = FinishUp
 *
 * See refuel_placepill_substates_decode.md for full algorithm.
 */
export function goalPlacePill(a4: A4State, state: BrainState): void {
  a4.placePillHold = 0;                     // default: not holding (navigating)
  const base = a4.baseToBuildTarget;
  if (base === null) return;
  const tank = state.tank;
  if (!tank.pillsCarried) return;          // nothing to place

  // On a boat: the builder can't harvest a tree or plant a pill on water, so the farm/plant
  // steps below would just hold (placePillHold) and freeze the tank on the boat forever (live
  // bug: boat=true spd=0 HBK indefinitely). Keep the SAME objective priority as on land, but
  // only navigate (suppress the holds/builder actions): if short on trees head for the nearest
  // forest — navigation routes across the water if the trees are on another landmass — so the
  // tank can boat over, disembark, harvest, then (re-acquiring a boat) cross back to the base;
  // otherwise head for the buildable tile next to the base. Once ashore (onBoat clears) the
  // normal farm→drive→plant flow takes over.
  if (tank.onBoat) {
    if (tank.resourceCount < PLACE_PILL_TREES) {
      const forest = _findNearestForestTile(a4);
      if (forest) { navigateToCoords(a4, (forest.tileX << 8) + 128, (forest.tileY << 8) + 128, 0); return; }
    }
    const landing = _findPillPlacementTile(a4, base);
    if (landing) navigateToCoords(a4, (landing.tileX << 8) + 128, (landing.tileY << 8) + 128, 0);
    else         navigateToCoords(a4, base.x, base.y, 0);
    return;
  }

  // Deploy a CAPTURED pillbox to DEFEND a friendly base: farm a tree if short, drive next
  // to the base, then dispatch the builder to plant the carried pill (armour 15, costs 1
  // tree). The old flow drove the builder via myMan.actionCode — a field the engine NEVER
  // reads (only pendingBuilderAction → performOrder does anything), so it never actually
  // placed; and it required 4 trees (the engine consumes the `trees` arg = 1).

  // 1. Need ≥1 tree (performOrder('pillbox') aborts if tank.trees < trees). Farm forest.
  if (tank.resourceCount < PLACE_PILL_TREES) {
    if (!tank.builderInTank || tank.onBoat) { setSpeed(a4, 0, tank.speed & 0xFF); a4.placePillHold = 1; return; }
    const adj = _findAdjacentForest(a4);
    if (adj) {
      setSpeed(a4, 0, tank.speed & 0xFF);   // hold so the builder's harvest trip completes
      a4.placePillHold = 1;
      a4.pendingBuilderAction = { action: 'forest', trees: 0, tileX: adj.tileX, tileY: adj.tileY };
      return;
    }
    const forest = _findNearestForestTile(a4);
    if (forest) { navigateToCoords(a4, (forest.tileX << 8) + 128, (forest.tileY << 8) + 128, 0); return; }
    setSpeed(a4, 0, tank.speed & 0xFF); a4.placePillHold = 1;
    return;   // no forest reachable — hold (forest regrows; selectBaseToBuild won't pick unplaceable bases)
  }

  // 2. A buildable tile next to the base (selectBaseToBuild already ensured one exists).
  const spot = _findPillPlacementTile(a4, base);
  if (!spot) { setSpeed(a4, 0, tank.speed & 0xFF); a4.placePillHold = 1; return; }

  // 3. Drive adjacent to the placement tile, then plant the carried pill.
  const dCheb = Math.max(Math.abs(a4.tankTileX - spot.tileX), Math.abs(a4.tankTileY - spot.tileY));
  if (dCheb > 1) {
    navigateToCoords(a4, (spot.tileX << 8) + 128, (spot.tileY << 8) + 128, 0);
    return;
  }
  setSpeed(a4, 0, tank.speed & 0xFF);       // hold adjacent; the builder walks the last tile to plant
  a4.placePillHold = 1;
  if (tank.builderInTank && !a4.pendingBuilderAction) {
    a4.pendingBuilderAction = { action: 'pillbox', trees: PLACE_PILL_TREES, tileX: spot.tileX, tileY: spot.tileY };
  }
}

function placePillSurveyTerrain(a4: A4State, state: BrainState): void {
  _ppSurvey(a4, state);
}
function placePillChoosePlacement(a4: A4State, state: BrainState): void {
  _ppChoose(a4, state);
}
function placePillGotoBuildPoint(a4: A4State, state: BrainState): void {
  _ppGoto(a4, state);
}
function placePillFinishUp(a4: A4State, state: BrainState): void {
  _ppFinish(a4, state);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 1 — Explore (0x002d50)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Explore — Random exploration when no better goals exist.
 *
 * Validates current target tile; generates a new one if invalid.
 * Picks best of up to 10 random candidates (within 1-second timeout).
 * Cost function prefers tiles far from tank but near ally CoG.
 *
 * See explore_decode.md for full algorithm.
 */
export function goalExplore(a4: A4State, state: BrainState): void {
  let tx = a4.exploreTargetX;
  let ty = a4.exploreTargetY;

  // Check if current target is valid or has been reached
  const tileType = a4.worldMap[((ty & 0xFF) << 8) | (tx & 0xFF)];
  const isDeepSea = (tileType & 0x10) !== 0;
  const arrived   = (a4.tankTileX === tx && a4.tankTileY === ty);

  if (isDeepSea || (tx === 0 && ty === 0) || arrived) {
    _findNewExploreTarget(a4, state);
    tx = a4.exploreTargetX;
    ty = a4.exploreTargetY;
  }

  // Navigate to target (BWorld center of tile)
  const worldX = (tx << 8) + 128;
  const worldY = (ty << 8) + 128;
  navigateToCoords(a4, worldX, worldY, 0);
}

/**
 * Find a new exploration target tile.
 *
 * Priority order:
 *   1. Nearest uncaptured (enemy/neutral) base  — Explore acts as a long-range
 *      fallback for GetBase when the base is too far for GetBase to beat Explore.
 *   2. Nearest attackable (enemy/neutral) pill  — secondary objective.
 *   3. Random land tile near the enemy CoG      — when all objectives are gone.
 *
 * Forest tiles (terrain 5) are rejected: tanks cannot stand on forest tiles
 * so the tank would navigate toward them but never "arrive", looping forever.
 */
function _findNewExploreTarget(a4: A4State, state: BrainState): void {
  // ── Priority 1: head toward nearest uncaptured base ───────────────────────
  let bestBaseDist = 0xFFFF;
  let bestBaseX = -1, bestBaseY = -1;
  for (const base of a4.bases) {
    if (base.isAlly) continue;
    const dist = base.distToTank >> 8;
    if (dist < bestBaseDist) {
      bestBaseDist = dist;
      bestBaseX = base.tileX & 0xFF;
      bestBaseY = base.tileY & 0xFF;
    }
  }
  if (bestBaseX >= 0) {
    a4.exploreTargetX = bestBaseX;
    a4.exploreTargetY = bestBaseY;
    return;
  }

  // ── Priority 2: head toward nearest attackable pill ───────────────────────
  let bestPillDist = 0xFFFF;
  let bestPillX = -1, bestPillY = -1;
  for (const pill of a4.pills) {
    if (!pill.active || !pill.attackable) continue;
    const dist = pill.distToTank >> 8;
    if (dist < bestPillDist) {
      bestPillDist = dist;
      bestPillX = pill.tileX & 0xFF;
      bestPillY = pill.tileY & 0xFF;
    }
  }
  if (bestPillX >= 0) {
    a4.exploreTargetX = bestPillX;
    a4.exploreTargetY = bestPillY;
    return;
  }

  // ── Priority 3: random land tile near enemy/frontline CoG ─────────────────
  // All objectives captured — just roam. Bias toward the enemy CoG (contested
  // area) rather than the ally CoG. Don't bias toward the tank's current tile
  // (removing tankDX/tankDY) so the tank actually moves to new areas.
  let bestCost = 0xFFFF;
  let bestX = 0, bestY = 0;

  // Fixed iteration cap (was also gated by a Date.now() 200ms budget — removed:
  // wall-clock gating makes brain behaviour machine-speed-dependent and
  // non-deterministic; the 40-attempt cap already bounds the work).
  for (let attempt = 0; attempt < 40; attempt++) {
    const rx = Math.abs(biasedRandom()) & 0xFF;
    const ry = Math.abs(biasedRandom()) & 0xFF;

    if (rx < 18 || rx > 237 || ry < 18 || ry > 237) continue;

    const cell = a4.worldMap[((ry & 0xFF) << 8) | (rx & 0xFF)] & 0x0F;
    const penalty = EXPLORE_TERRAIN_PENALTY[cell] ?? 500;
    if (penalty >= 500) continue;

    // Bias toward ENEMY CoG (binary uses enemy CoG, not frontline).
    // The brain should explore toward the enemy to find pills/bases.
    const targetCogX = a4.enemyCogX || a4.frontlineCogX;
    const targetCogY = a4.enemyCogY || a4.frontlineCogY;
    const cogDX = Math.abs((rx << 8) - targetCogX) >> 8;
    const cogDY = Math.abs((ry << 8) - targetCogY) >> 8;
    const cost  = cogDX + cogDY + penalty;

    if (cost < bestCost) {
      bestCost = cost;
      bestX = rx;
      bestY = ry;
    }
  }

  a4.exploreTargetX = bestX;
  a4.exploreTargetY = bestY;
}

/**
 * Terrain exploration penalties (index = terrain type 0–13).
 * Values >= 500 are REJECTED as explore targets (no point navigating there).
 * Water tiles (river, swamp, sea, boat) are rejected — tanks can float but
 * exploring open water serves no tactical purpose (no pills/bases there).
 */
const EXPLORE_TERRAIN_PENALTY: readonly number[] = [
  500,  //  0 wall          → reject
  500,  //  1 river         → reject (open water / shallow sea)
  500,  //  2 swamp         → reject (water)
  150,  //  3 crater        → accepted but slow
  50,   //  4 road          → preferred
  500,  //  5 forest        → REJECT: tanks can't stand on forest tiles; picking
        //                    a forest as a target causes permanent navigation loops
  150,  //  6 rubble        → ok
  75,   //  7 grass         → good
  500,  //  8 shot wall     → reject
  500,  //  9 boat (river)  → reject (still water)
  500,  // 10 deep sea      → reject
  25,   // 11 base          → excellent
  25,   // 12 pill slot     → excellent
  25,   // 13 type 13       → excellent
];

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 2 — FixPill (0x00118e)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reclaim a friendly pill the tank did NOT place: shoot it down to armour 0, then
 * drive onto its cell so the engine collects it (world_pillbox.update: armour 0 +
 * tank on cell → inTank). The carried pill is then re-deployed by PlacePill. A
 * friendly pill never fires back (engine: a team pillbox targets only enemies), so
 * the whole approach is damage-free. Never navigate ONTO a live pill (tankSpeed 0 →
 * noRoute, the same trap the GetPill attack phase hit) — approach one tile short and
 * fire from range until armour 0, then collect.
 */
function _reclaimPill(a4: A4State, state: BrainState, pill: PillState): void {
  a4.reclaimInProgress = 1;
  const TILE = 256;

  // armour 0 → collect by driving onto the cell.
  if (pill.armour === 0) {
    navigateToCoords(a4, pill.x, pill.y, 0);
    return;
  }

  const dist = pill.distToTank;
  const dir = directionTo(state.tank.x, state.tank.y, pill.x, pill.y) & 0xFF;

  // One tile short of the pill, toward the tank — a passable approach/fire slot
  // (never the live pill's own tile).
  const dx = state.tank.x - pill.x, dy = state.tank.y - pill.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const navX = Math.round(pill.x + (dx / d) * TILE) & 0xFFFF;
  const navY = Math.round(pill.y + (dy / d) * TILE) & 0xFFFF;

  // In range: shoot the pill down — damage-free (no return fire). Mirror the GetPill attack
  // phase: nav (advance to clear a blocked line) and combat (aim at the pill) must NEVER both
  // steer in the same tick, and a stopped tank must fire STATIONARY so the shot's "advance"
  // forward bit doesn't fight setSpeed's brake (FWD + brake = coast = frozen at spd=0 while
  // never firing → reclaim never completes, the live FixPill freeze). Split on line-of-sight.
  if (dist <= 0x07C0) {
    const pillCx = ((pill.tileX & 0xFF) << 8) + 128;
    const pillCy = ((pill.tileY & 0xFF) << 8) + 128;
    const hasLOS = _checkBarriers(a4, state.tank.x, state.tank.y, pillCx, pillCy) === 0;
    let spd: number;
    if      (dist > 0x073C) spd = 16;
    else if (dist > 0x06E2) spd = 8;
    else                    spd = 0;
    if (spd === 0 && !hasLOS) spd = 8;   // blocked at the standoff → advance to clear the line
    setSpeed(a4, spd, state.tank.speed & 0xFF);
    if (hasLOS) {
      a4.shootPillDirection = dir;
      _shootPill(a4, state, pill, dir, 0, spd === 0 ? 1 : 0);   // stationary fire when stopped
    } else if (spd > 0) {
      navigateToCoords(a4, navX, navY, 0);
    }
    return;
  }

  // Far: approach to one tile short of the pill.
  navigateToCoords(a4, navX, navY, 0);
}

/**
 * FixPill — Repair a damaged ally pill.
 *
 * Verified from binary FixPill (0x00118e, 1312 bytes):
 *
 *   Phase 1: Target change detection.
 *   Phase 2: Safety check (danger map + blocked map on pill tile).
 *     UNSAFE: Find safe approach via FindSafestPointFrom, navigate there.
 *     SAFE: Continue to phase 3.
 *   Phase 3: Distance dispatch:
 *     dist < 512 (2 tiles): dispatch builder for repair (man.byte[2]=4,
 *                           setGlobalsGate guard, ManCheckPathIterative check).
 *     dist < 2080 (8 tiles): navigate toward pill, set in-range flag.
 *     dist >= 2080: navigate toward pill.
 *
 *   Before dispatching, check:
 *     - setGlobalsGate (A4[0x3240]) must be set → our setGlobalsGate=1 always
 *     - builderInTank must be true (builder available)
 *     - tank has enough trees (treesForRepair(pill.armour))
 *     - if not enough trees: dispatch builder to harvest adjacent forest
 */
export function goalFixPill(a4: A4State, state: BrainState): void {
  const pill = a4.pillToFixTarget;
  if (pill === null) return;

  // ── RECLAIM branch ──────────────────────────────────────────────────────
  // A damaged ally pill we did NOT place: don't weld it in place — pick it up and
  // relocate/redeploy it. The brain only knows pill ownership by team, so "ours to
  // repair" = isSelfPlacedPill (tile recorded when WE dropped it). Everything else
  // that FixPill would target is reclaimed. Safe because a friendly pill never fires
  // at us (engine: a team pillbox shoots only enemies), so shooting it down to 0 and
  // driving onto its cell to collect costs no armour.
  // Env-gated for clean A/B on one binary (RECLAIM=1 on; default off reproduces the
  // exact baseline FixPill path for all ally pills). Flip to default-on once validated.
  const RECLAIM = typeof process === 'undefined' || process.env.RECLAIM !== '0';
  if (RECLAIM && !a4.isSelfPlacedPill(pill)) {
    _reclaimPill(a4, state, pill);
    return;
  }
  a4.reclaimInProgress = 0;

  // Target change detection
  if (pill.index !== a4.fixPillPrevTargetIndex) {
    a4.fixPillPrevTargetIndex = pill.index;
    a4.fixPillPrevTarget = pill;
    a4.fixPillInRange = 0;
    a4.fixPillSafePointFound = 0;
    a4.fixPillSendBroadcast = 1;
  }

  if (a4.fixPillSendBroadcast) {
    a4.fixPillSendBroadcast = 0;
  }

  const pillTileX = pill.tileX;
  const pillTileY = pill.tileY;
  const tileIdx = ((pillTileY & 0xFF) << 8) | (pillTileX & 0xFF);
  const isDangerous = a4.dangerMap[tileIdx] !== 0;
  const isBlocked   = a4.blockedMap[tileIdx] !== 0;

  // ── Unsafe path: navigate to safe approach point ──────────────────────
  if (isDangerous || isBlocked) {
    if (!a4.fixPillSafePointFound) {
      const safe = _findSafestPointFrom(a4, state, pill.x, pill.y);
      a4.fixPillSafeX = safe.x;
      a4.fixPillSafeY = safe.y;
      a4.fixPillSafePointFound = 1;
    }
    navigateToCoords(a4, (a4.fixPillSafeX << 8) + 128, (a4.fixPillSafeY << 8) + 128, 0);
    return;
  }

  const dist = pill.distToTank;
  const TILE = 256;   // 1 tile in BWorld

  // ── Frozen on pill tile: tank cannot move or turn ──────────────────────
  // world_map.ts getTankSpeed returns 0 when pill.armour > 0 — the game
  // engine completely freezes any tank sitting on an active pill tile.
  // Nothing the brain can do will move the tank; just output nothing and
  // wait for the pill to die or the tank to be killed.
  if (dist < TILE) {
    // Don't output any controls — avoids the ACC/spd=0 infinite loop.
    return;
  }

  // ── Close range (dist < 512): stop adjacent and dispatch builder ───────
  // The binary approach: tank stops on the tile NEXT TO the pill, then the
  // builder man walks the last tile to do the repair.  Never drive onto the
  // pill tile itself (it would freeze the tank).
  if (dist < 512) {
    setSpeed(a4, 0, state.tank.speed);  // stop here — adjacent to pill
    const defenderCount = a4.newGetPillDefenderCount;
    if (a4.setGlobalsGate && !defenderCount && !a4.pendingBuilderAction) {
      if (state.tank.builderInTank && !state.tank.onBoat) {
        const trees = treesForRepair(pill.armour);
        if (state.tank.resourceCount >= trees) {
          a4.pendingBuilderAction = {
            action: 'repair', trees,
            tileX: pillTileX, tileY: pillTileY,
          };
          a4.fixPillInRange = 1;
          a4.newGetPillAttackMode = 1;
        } else {
          // Not enough trees — harvest adjacent forest first
          const forest = _findAdjacentForest(a4);
          if (forest !== null) {
            a4.pendingBuilderAction = {
              action: 'forest', trees: 0,
              tileX: forest.tileX, tileY: forest.tileY,
            };
            a4.newGetPillAttackMode = 1;
          }
        }
      }
    }
    return;
  }

  // ── Medium range (dist < 2080): navigate + set in-range flag ──────────
  if (dist < 2080) {
    a4.fixPillInRange = 1;
  }

  // ── Navigate toward the pill — but stop ONE tile short ────────────────
  // Offset the destination by 1 tile toward the tank so the close-range
  // navigation (dist < 256) doesn't steer the tank directly onto the pill.
  const dx = state.tank.x - pill.x;
  const dy = state.tank.y - pill.y;
  const d  = Math.sqrt(dx * dx + dy * dy) || 1;
  const navX = Math.round(pill.x + (dx / d) * TILE) & 0xFFFF;
  const navY = Math.round(pill.y + (dy / d) * TILE) & 0xFFFF;
  navigateToCoords(a4, navX, navY, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 3 — GetBase (0x001716)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GetBase — Navigate to and capture an enemy base.
 *
 * Binary (0x001716) is pure navigation (GoTo + team messages).
 * Extension: world_map.ts freezes the tank (speed=0, turn=0) on a base tile
 * when owner is active and armour > 9.  We block such tiles in worldMap
 * (0x40|BASE, cost 1000) so A* routes around them; goalGetBase then shoots
 * from an adjacent tile to chip away armour.  Key design rules:
 *
 *   - When ARMOURED (armour > 9, tile is blocked in worldMap):
 *       • Far (> 1792 BWorld): navigate toward base.  A* stops at the adjacent
 *         tile because the base is impassable.
 *       • Close (≤ 1792): stop completely and shoot.  Do NOT call
 *         navigateToCoords here — it sets conflicting turn bits that fight the
 *         shoot() aim direction and prevent the gun from locking on.
 *
 *   - When CAPTURABLE (armour ≤ 9 or no active owner):
 *       • The base tile is now cost 3 (passable) in worldMap.  The A* change-
 *         detection in syncBrainState will have already set worldCostsInitDone=0
 *         when it detected the block→passable transition, so the next
 *         navigateToCoords will get a fresh route that goes through the tile.
 *       • Navigate normally; Orona's findSubject() captures on drive-over.
 *
 * See getbase_decode.md.
 */
export function goalGetBase(a4: A4State, state: BrainState): void {
  const target = a4.baseToGetTarget;
  if (target === null) return;

  // On a boat: don't stop on the water to shoot the base — get ashore first. Navigate to a
  // passable LAND tile adjacent to the base (a landing point), NOT the base centre: an
  // armoured / owner-active base centre is impassable (speed-0), and in water mode A* can't
  // route to it → noRoute → idle freeze at the water's edge. An adjacent land tile is
  // routable boat→shore and lets the tank disembark (full momentum); once ashore (onBoat
  // clears) the normal approach/shoot below runs. Pick the land neighbour nearest the tank
  // so it climbs out on the near bank.
  if (state.tank.onBoat) {
    const bx = target.tileX & 0xFF, by = target.tileY & 0xFF;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    let bestX = -1, bestY = -1, bestD = 1e9;
    for (const [dx, dy] of dirs) {
      const nx = (bx + dx) & 0xFF, ny = (by + dy) & 0xFF;
      const raw = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
      const terr = raw & 0x0F;
      const isLand = !(raw & 0x80) && terr !== 1 && terr !== 9 && terr !== 10 &&
                     a4.examineTerrainCostTable[raw] < 1000;
      if (!isLand) continue;
      const d = Math.abs(nx - (a4.tankTileX & 0xFF)) + Math.abs(ny - (a4.tankTileY & 0xFF));
      if (d < bestD) { bestD = d; bestX = nx; bestY = ny; }
    }
    if (bestX >= 0) navigateToCoords(a4, (bestX << 8) + 128, (bestY << 8) + 128, 0);
    else            navigateToCoords(a4, target.x, target.y, 0);  // no land neighbour — best effort
    return;
  }

  // Change detection: record current target for message coordination.
  if (target.index !== a4.getBaseChangeDetectionIndex) {
    a4.getBaseChangeDetectionIndex = target.index;
    a4.getBaseChangeDetectionPtr   = target;
    a4.killBaseCurrentTarget       = target;
  }

  // Check whether the worldMap actually has this base blocked right now.
  // This reflects both the armour threshold AND the owner-active check from
  // aindy_interface.ts (which mirrors world_map.ts line 83 exactly).
  const tileIdx = ((target.tileY & 0xFF) << 8) | (target.tileX & 0xFF);
  const tileIsBlocked = (a4.worldMap[tileIdx] & 0x40) !== 0;

  if (tileIsBlocked) {
    // Armoured / owner-active base — blocked tile, can't just drive over.
    const dist = target.distToTank;
    if (dist > 1792) {
      // Far: approach. A* routes to the closest passable tile (adjacent).
      navigateToCoords(a4, target.x, target.y, 0);
    } else {
      // Within shooting range: stop dead and aim-shoot.
      // Do NOT call navigateToCoords here — it fights shoot()'s turn bits.
      // Pass current speed: setSpeed(0) WITHOUT it defaults current to 0, so the
      // brake bit (desired < current-3) is never set and the tank coasts instead of
      // stopping (the same "won't stop" bug as the refuel-on-base fix).
      setSpeed(a4, 0, state.tank.speed & 0xFF);
      shoot(a4, target.x, target.y, state);
    }
    return;   // skip blacklisting while actively shooting
  }

  // Base is passable (armour ≤ 9 / unowned). If we're already ON the base tile, STOP
  // and HOLD so the engine's findSubject() (which runs each tick a tank shares the base
  // cell) claims it. Continuously re-navigating to the tile CENTRE makes the tank
  // oscillate across the tile boundary and never settle on the cell, so the capture
  // never fires — the base then looks like it "reverts to its old colour" because the
  // tank just slides off a tile it never actually captured. A dead stop = clean capture.
  if (a4.tankTileX === (target.tileX & 0xFF) && a4.tankTileY === (target.tileY & 0xFF)) {
    setSpeed(a4, 0, state.tank.speed & 0xFF);
    return;
  }

  // Otherwise approach and drive onto it.
  navigateToCoords(a4, target.x, target.y, 0);

  // On route failure: clear the flag and apply a cooldown so the brain
  // doesn't re-select this unreachable base every tick forever.
  if (a4.noLocalRouteFlag) {
    a4.noLocalRouteFlag = 0;
    a4.getBaseFailedUntilTick[target.index] = a4.tickCounter + 5000;
    a4.getBaseCommittedIndex = -1;
  }

  // Send team coordination message on mismatch
  if (a4.getBaseTeamMismatch && !a4.worldCostsInitDone) {
    a4.getBaseTeamMismatch = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 4 — GetMan (0x0017b6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GetMan — Retrieve ally builder (man) into tank.
 *
 * Safety-first: refuses to retrieve if armor too low.
 * Falls back to Refuel if man is in a defended base.
 *
 * See getman_decode.md for full algorithm (720 bytes, 13 function calls).
 */
export function goalGetMan(a4: A4State, state: BrainState): void {
  const man = a4.myMan;
  if (man === null) return;

  // ── Safety check ──────────────────────────────────────────────────────
  // Armor threshold check (60-second timeout gate)
  const tickDelta = a4.tickCounter - a4.getManLastEventTick;
  const armorThreshold = a4.getManArmorThreshold;
  const distCap = Math.min(man.distMetric >> 8, 40);

  if (tickDelta >= 3600) {
    // Safe enough: check if man is in a defended base
    const baseAtMan = a4.getBaseAtTile(man.x >> 8, man.y >> 8);
    if (baseAtMan !== null && baseAtMan.armor > 0) {
      // Man in defended base: refuel first
      goalRefuel(a4, state);
      return;
    }
  }

  // ── Navigate to the man's CURRENT position ────────────────────────────
  // The builder MOVES: a deployed builder walks, and a killed one parachutes to a
  // random spot and walks home. Navigating to a FROZEN saved target (the old
  // dispatched-branch behaviour) goes stale — the tank drives to where the man WAS,
  // arrives, and the landing fix stops it (spd 0, ctrl:idle) while the man is tiles
  // away and route:ok (so the unreachable-abandonment never fires). It sits idle
  // forever, ignoring nearby pills. Always chase the live position so it actually
  // reaches the man, retrieves it, and frees the tank to resume GetPill.
  navigateToCoords(a4, man.x, man.y, 0);

  if (!a4.getManDispatched) {
    const dx = Math.abs((a4.tankTileX << 8) - man.x);
    const dy = Math.abs((a4.tankTileY << 8) - man.y);
    if (dx < 512 && dy < 512) {
      a4.getManDispatched = 1;
      a4.getManTargetX = man.x & 0xFFFF;
      a4.getManTargetY = man.y & 0xFFFF;
      a4.getManLastEventTick = a4.tickCounter;
    }
  }

  // ── Unreachable-builder abandonment ───────────────────────────────────
  // GetMan is top priority (cost 1). If the builder can't be pathed to
  // (noLocalRouteFlag), the tank would otherwise sit idle on top of it and be
  // shot to death — observed: armor 40→0 over ~35s while route:MISS. After the
  // man proves unreachable for a sustained period, abandon it (cooldown forces
  // getManGoalCost to 0xFFFF) so the next goal — typically Refuel — takes over.
  // A fresh builder eventually parachutes back anyway. Mirrors getBaseFailedUntilTick.
  if (a4.noLocalRouteFlag) {
    if (a4.getManFailSinceTick === 0) a4.getManFailSinceTick = a4.tickCounter;
    else if (a4.tickCounter - a4.getManFailSinceTick > 150) {
      a4.getManFailedUntilTick = a4.tickCounter + 3000;  // ~60s cooldown
      a4.getManFailSinceTick = 0;
    }
  } else {
    a4.getManFailSinceTick = 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 5 — NewGetPill (0x00ea52) — LARGEST HANDLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NewGetPill — Capture an enemy/neutral pill.
 *
 * Phases:
 *   0. Init / target change detection
 *   1. Owner change detection
 *   2. Choose Attack Position (ChooseAttackPosition)
 *   3. Wait position (if defenders + allies nearby)
 *   4. Navigate to AP
 *   5. Attack pill (ShootPill)
 *   6. Dispatch man when captured/neutral
 *
 * See newgetpill_decode.md.
 */

/** Abandon a pill the tank can't route to: set a short RETRY cooldown (pillToGet skips it until
 *  then — this is a retry timer, NOT a permanent blacklist) and clear the target + commitment + AP
 *  state so ChooseGoal picks another objective next tick instead of idling on the unreachable pill. */
function _abandonUnreachablePill(a4: A4State, pill: PillState): void {
  a4.getPillFailedUntilTick[pill.index & 0x3F] = a4.tickCounter + 2000;   // ~33s, then retriable
  a4.pillToGetTarget       = null;
  a4.prevCommittedPillIndex = -1;
  a4.newGetPillTargetIndex  = -1;
  a4.newGetPillAPChosen     = 0;
  a4.newGetPillAPFailCount  = 0;
  a4.newGetPillStallTick    = 0;
}

export function goalNewGetPill(a4: A4State, state: BrainState): void {
  const pill = a4.pillToGetTarget;
  if (pill === null) return;

  // Cleared every tick; only the close-the-kill branch below re-sets it.
  a4.coverFinishHold = 0;

  // Phase 0: Target change detection (index-based — PillState objects are recreated each tick)
  if (pill.index !== a4.newGetPillTargetIndex) {
    a4.newGetPillAPChosen = 0;
    a4.newGetPillApproachModeA = 0;
    a4.newGetPillApproachModeB = 0;
    a4.newGetPillSpeedTier = 0;
    a4.newGetPillWaitPlaceChosen = 0;
    a4.newGetPillSameTarget = 0;
    a4.newGetPillTargetIndex = pill.index;
    a4.newGetPillTargetCopy = pill;
    a4.newGetPillPillCopy = pill;
    a4.chooseAPLastSector = -1;
    a4.newGetPillAPFailCount = 0;  // reset failure count for new target
    a4.getPillBestDist = 0xFFFF;   // reset the no-progress watchdog for the new target
    a4.getPillProgressTick = a4.tickCounter;
    a4.getPillLastArmour = pill.armour & 0xFF;
  }

  // No-progress watchdog: abandon a pill we're making NO headway on. "Progress" = getting closer
  // OR dropping its armour (actively damaging it). If neither happens for a long time the engagement
  // is stuck — unreachable at range (degenerate/looping AP, no route), or a walled-in pill with no
  // firing slot the tank drives at forever at spd=0 (live: 17k+ ticks frozen 3 tiles from a boxed-in
  // pill). Set the retry cooldown so the brain does something else and comes back later. Legit slow
  // grinds and the cover-build hold keep resetting the timer (armour drops / closes), so they're safe.
  {
    const distTiles = (pill.distToTank >> 8) & 0xFFFF;
    let progressed = false;
    if (distTiles < a4.getPillBestDist) { a4.getPillBestDist = distTiles; progressed = true; }
    if ((pill.armour & 0xFF) < a4.getPillLastArmour) { a4.getPillLastArmour = pill.armour & 0xFF; progressed = true; }
    if (progressed) a4.getPillProgressTick = a4.tickCounter;
    else if (a4.tickCounter - a4.getPillProgressTick > 1500) {   // ~25s of zero progress → stuck
      _abandonUnreachablePill(a4, pill);
      return;
    }
  }

  // Same-target detection (index-based)
  if (pill.index === a4.prevPillTargetIndex) {
    a4.newGetPillSameTarget = 1;
  } else {
    a4.prevPillTargetIndex = pill.index;
  }

  // Phase 1: Owner change detection
  const currentOwner = pill.ownerByte & 0xFF;
  if (currentOwner !== a4.newGetPillLastOwner) {
    a4.newGetPillOwnerChanged = 1;
    a4.newGetPillLastOwner = currentOwner;
    a4.newGetPillAPChosen = 0;
    a4.newGetPillRouteHandle = null;
  }

  // Phase 2: Choose Attack Position via ChooseAttackPosition (40-sector spiral search)
  if (!a4.newGetPillAPChosen) {
    _chooseAP(a4, state, pill);
    // _chooseAP sets a4.newGetPillAPX/Y and a4.newGetPillAPChosen = 1
    a4.newGetPillSpeedTier = pill.approachSpeedTier & 0xFF;

    // Validate the AP tile: reject river, impassable, and forest tiles.
    // If the AP is on bad terrain, nudge it to the nearest good neighbor.
    const apTileX = (a4.newGetPillAPX >> 8) & 0xFF;
    const apTileY = (a4.newGetPillAPY >> 8) & 0xFF;
    const apIdx = ((apTileY & 0xFF) << 8) | (apTileX & 0xFF);
    const apRaw = a4.worldMap[apIdx];
    const apTerrain = apRaw & 0x0F;
    const apCost = a4.examineTerrainCostTable[apRaw];
    if (apTerrain === 1 || apCost >= 100) {
      const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
      let found = false;
      for (const [dx, dy] of dirs) {
        const nx = (apTileX + dx) & 0xFF;
        const ny = (apTileY + dy) & 0xFF;
        const nIdx = ((ny & 0xFF) << 8) | (nx & 0xFF);
        const nCost = a4.examineTerrainCostTable[a4.worldMap[nIdx]];
        if (nCost < 100 && (a4.worldMap[nIdx] & 0x0F) !== 1) {
          a4.newGetPillAPX = (nx << 8) + 128;
          a4.newGetPillAPY = (ny << 8) + 128;
          found = true;
          break;
        }
      }
      if (!found) {
        // No good neighbor — skip this sector, try another
        const dirPillToAP = directionTo(pill.x, pill.y, a4.newGetPillAPX, a4.newGetPillAPY);
        a4.chooseAPLastSector = Math.floor((dirPillToAP & 0xFF) * 40 / 256);
        a4.newGetPillAPChosen = 0;
        return;
      }
    }
  }

  // On a boat: get ashore before engaging. Navigate to the AP (a passable land firing
  // slot, chosen above) — NOT the pill/base centre, which is impassable (speed-0) and
  // makes A* return noRoute → idle freeze. Routing to the AP carries the tank to shore at
  // full disembark momentum; combat (this fn's attack/stationary-fire phases below AND
  // doCommonStuff) is suppressed while afloat, so it won't fire from the boat. Once landed
  // (onBoat clears) the normal capture/attack phases run.
  if (state.tank.onBoat) {
    navigateToCoords(a4, a4.newGetPillAPX, a4.newGetPillAPY, 0);
    return;
  }

  // Phase 4a: If pill armour is 0, drive onto it.
  // Orona auto-captures: world_pillbox.update() picks up the pill when
  // tank.cell === pill.cell and armour===0. Navigate directly to the pill tile.
  if (pill.armour === 0) {
    navigateToCoords(a4, pill.x, pill.y, 0);
    return;
  }

  // Phase 4a': Opportunistic base capture.
  // If an uncaptured base is within 2 tiles, navigate onto it before continuing
  // to the pill AP.  GetBase (via getBaseGoalCost proximity lock-in) would normally
  // handle this, but GetPill(≥1) ties or beats GetBase(0) only when a base is within
  // 6 tiles AND a pill is also very close.  Checking here ensures bases on the
  // approach route are never accidentally bypassed.
  for (const base of a4.bases) {
    if (base.isAlly) continue;
    if ((base.distToTank >> 8) <= 4) {
      navigateToCoords(a4, base.x, base.y, 0);
      return;
    }
  }

  // Phase 4b / Phase 5 — unified distance-based approach + attack.
  //
  // Binary NewGetPill (0x00ea52) uses pill distance thresholds, not AP tile equality:
  //   dist > 0x0820 (8.1 tiles):  navigation phase — GoTo(AP)
  //   dist ≤ 0x07C0 (7.75 tiles): attack phase — navigate toward pill, shoot
  //
  // Our old "at exact AP tile" check was too strict: the tank had to land on
  // the precise tile before firing, causing it to miss and bounce around.
  // The binary starts shooting from up to 7.75 tiles away and drives toward
  // the pill, so it fires continuously during the final approach.
  const pillDistPh = computeDistanceBetween(state.tank.x, state.tank.y, pill.x, pill.y);

  // ── COVER METHOD (Puppy Love's tactic): place cover next to the pill from OUTSIDE its range,
  // then graze it from inside range while the cover eats the return fire; retreat as it collapses.
  // See _coverMethodAttack. COVER_SAFE=0 falls back to the old charge+tank-neighbour-wall path
  // (controlled A/B in coverplace.test.ts).
  const COVER_SAFE = typeof process === 'undefined' || process.env.COVER_SAFE !== '0';
  if (COVER_SAFE) {
    if (_coverMethodAttack(a4, state, pill, pillDistPh)) return;
    // _coverMethodAttack returned false → no cover possible here; engage without it (fall through),
    // and do NOT run the old tank-neighbour _maintainCover below.
  }

  if (pillDistPh > 0x07C0) {
    // ── TREE-GATHERING phase: stock cover materials BEFORE engaging ─────────
    // Walls (the cover that lets the tank finish a hot pill — see the close-the-kill
    // block below) cost trees; the tank starts with 0 and the builder can only harvest
    // forest the tank is parked NEXT TO. The engine harvest works (4 trees/trip) only
    // when the tank holds still — which it can't do mid-charge — so the tank never
    // accrued trees and cover was never built (capfloor.test.ts: walls=0/30). Fix: while
    // still at a SAFE distance (nav phase) and short on materials, divert to the nearest
    // forest, hold, and harvest to a tree target, THEN approach. Skips cleanly if no
    // forest is reachable (engage without cover) or if already carrying a pill (Method 2).
    // ⚠️ WIP, default OFF (COVER_GATHER env). Stock cover materials and ensure the
    // builder is FREE *before* entering attack range, so it can build a wall during the
    // finish. Sequencing matters: if gathering overlaps the approach the builder is out
    // on harvest trips (~80% of ticks) and _maintainCover's `!builderInTank` gate bails →
    // no wall (buildDispatch=0). So we HOLD in the nav phase until trees≥target AND the
    // builder is back in the tank, then release to engage. Skips if carrying a pill
    // (Method 2) or no forest is reachable (engage without cover).
    // TREE-GATHERING: stock cover materials before engaging. A wall (the cover that
    // lets the tank finish a hot pill) costs trees; the tank starts with 0 and the
    // builder only harvests forest the tank is parked next to, and only completes a trip
    // when the tank holds still. So at this safe distance, if short on trees, divert to
    // the nearest forest and harvest to a target, THEN approach. The wall itself is built
    // CLOSE (tank-neighbour) at firing range by _maintainCover in the attack phase. Skips
    // if carrying a pill (Method 2) or no forest reachable (engage without cover).
    const COVER_GATHER = typeof process !== 'undefined' && !!process.env.COVER_GATHER;
    const carryingPill = (state.tank.pillsCarried & 0xFF) > 0;
    if (COVER_GATHER && !carryingPill && pill.armour > COVER_FINISH_ARMOUR &&
        !state.tank.onBoat && state.tank.resourceCount < COVER_TREE_TARGET) {
      if (!state.tank.builderInTank) {
        // builder out harvesting/returning — hold still so the trip completes
        setSpeed(a4, 0, state.tank.speed & 0xFF);
        a4.coverBuilderDispatchTick = a4.tickCounter;
        return;
      }
      const adj = _findAdjacentForest(a4);
      if (adj) {
        setSpeed(a4, 0, state.tank.speed & 0xFF);
        a4.pendingBuilderAction = { action: 'forest', trees: 0, tileX: adj.tileX, tileY: adj.tileY };
        a4.coverBuilderDispatchTick = a4.tickCounter;
        return;
      }
      const forest = _findNearestForestTile(a4);
      if (forest) {
        navigateToCoords(a4, (forest.tileX << 8) + 128, (forest.tileY << 8) + 128, 0);
        return;
      }
      // no forest reachable → fall through and engage without cover.
    }

    // ── Navigation phase: approach the AP ──────────────────────────────────
    navigateToCoords(a4, a4.newGetPillAPX, a4.newGetPillAPY, 0);

    // Fire while approaching ONLY if the hull is ALREADY aimed at the pill (≤1 dir unit, so
    // _shootPill's turnTowardsDir issues no turn). Otherwise navigation SOLELY owns the hull:
    // letting the shot's aim hijack the turn steers the tank straight at the pill — through any
    // obstacle on the direct line (e.g. ANOTHER pill, impassable) — instead of taking the A*
    // detour, so it drives into the obstacle and freezes at spd=0 (live nav-phase GetPill stall).
    if (pillDistPh <= 2048) {
      const dirNav = directionTo(state.tank.x, state.tank.y, pill.x, pill.y) & 0xFF;
      const facing = state.tank.facingDir & 0xFF;
      const facingErr = Math.min((dirNav - facing + 256) & 0xFF, (facing - dirNav + 256) & 0xFF);
      if (facingErr <= 1) _shootPill(a4, state, pill, dirNav, 0);
    }

    // AP navigation failure: replan from a different sector — but not forever. If replanning keeps
    // failing, the pill is genuinely unreachable (across water/forest with no routable AP): ABANDON
    // it for a while so the brain does something else instead of idling on it indefinitely (live
    // bug: GetPill locked on a 19-tile pill, route:MISS, ctrl:idle for 1600+ ticks). The cooldown
    // lets pillToGet re-select it later — it's a retry timer, not a permanent blacklist.
    if (a4.noLocalRouteFlag) {
      a4.noLocalRouteFlag = 0;
      if (++a4.newGetPillAPFailCount >= 20) { _abandonUnreachablePill(a4, pill); return; }
      const dirPillToAP = directionTo(pill.x, pill.y, a4.newGetPillAPX, a4.newGetPillAPY);
      a4.chooseAPLastSector = Math.floor((dirPillToAP & 0xFF) * 40 / 256);
      a4.newGetPillAPChosen = 0;
      a4.newGetPillStallTick = 0;
      return;
    }

    // Stall detection: if stuck >10s navigating to AP, try a different sector; give up after a few.
    if (a4.newGetPillStallTick === 0) {
      a4.newGetPillStallTick = a4.tickCounter;
    } else if (a4.tickCounter - a4.newGetPillStallTick > 600) {
      if (++a4.newGetPillAPFailCount >= 3) { _abandonUnreachablePill(a4, pill); return; }
      const dirPillToAP = directionTo(pill.x, pill.y, a4.newGetPillAPX, a4.newGetPillAPY);
      a4.chooseAPLastSector = Math.floor((dirPillToAP & 0xFF) * 40 / 256);
      a4.newGetPillAPChosen = 0;
      a4.newGetPillStallTick = 0;
    }
    return;
  }

  // ── Attack phase (dist ≤ 0x07C0 ≈ 7.75 tiles from pill) ─────────────────
  // Binary: navigate toward pill directly (not AP), fire continuously.
  // Speed tiers (0x00f382–0x00f4dc):
  //   dist > 0x073C (7.2 tiles): speed 24
  //   dist > 0x0700 (7.0 tiles): speed 16
  //   dist > 0x06E2 (6.9 tiles): speed  8
  //   dist ≤ 0x06E2:             speed  0  — stop and concentrate fire
  a4.newGetPillStallTick = 0;
  a4.newGetPillAPFailCount = 0;   // reached attack range → this pill is reachable; reset the give-up counter

  // COVER LAYER (baseline A/B path only): build a wall on the tank-neighbour while charging.
  // With COVER_SAFE on, the proper cover method (_coverMethodAttack, built at the PILL-neighbour
  // from out of range) ran earlier and we only reach here when no cover was possible — so don't
  // dispatch the builder into the kill zone here.
  if (!COVER_SAFE) _maintainCover(a4, state, pill);

  // CLOSE-THE-KILL (capfloor.test.ts root cause): the tank grinds pills to ~3 armour
  // then can't land the final hits — by then the pill is fully heated (fires every 6
  // ticks) and the tank breaks off to refuel before closing, leaving it stuck at 3.
  // When the pill is nearly dead AND the pill→tank shot is CONFIRMED blocked by cover,
  // stop moving and edge-fire to finish it; coverFinishHold tells refuelGoalCost to
  // suppress the emergency break-off (covered = not taking damage, so staying is safe).
  const pillCenterX = ((pill.tileX & 0xFF) << 8) + 128;
  const pillCenterY = ((pill.tileY & 0xFF) << 8) + 128;
  // Default OFF (env CLOSEKILL=1): unvalidated and inert without built cover; gated to
  // keep the shipped path = refuel-30 only (the one capture-neutral, real-bug fix).
  const CLOSEKILL = typeof process !== 'undefined' && !!process.env.CLOSEKILL;
  if (CLOSEKILL && pill.armour > 0 && pill.armour <= COVER_FINISH_ARMOUR &&
      pillDistPh <= 1984 &&
      _checkBarriers(a4, state.tank.x, state.tank.y, pillCenterX, pillCenterY) > 0) {
    // Only HOLD if the edge-fire is actually viable (a clear grazing edge exists).
    // Forest-enclosed pills satisfy checkBarriers>0 but have NO clear edge → shootPill-
    // FromCover returns 0; holding there wastes thousands of ticks (capfloor: holdTicks
    // up to 4136 with zero progress). If no viable shot, fall through to reposition.
    a4.shootPillDirection = directionTo(state.tank.x, state.tank.y, pill.x, pill.y) & 0xFF;
    const fired = _shootPillFromCover(a4, state, pill);
    if (fired) {
      a4.coverFinishHold = 1;
      setSpeed(a4, 0, state.tank.speed & 0xFF);   // hold still → stable edge-aim geometry
      a4.pillApproachInProgress = 1;
      return;
    }
  }

  // ── PUSH-THROUGH THE KILL ───────────────────────────────────────────────
  // The tank reliably chips a pill 15→~3 while stationary-firing, then RETREATS at
  // low armour (emergency refuel <16) and leaves it at 3 — the dominant capture floor
  // (capfloor: nearKill 19/30 but captured 7/30). Since pill damage PERSISTS across
  // tank death, the highest-leverage move at the very end is the opposite of dodging:
  // when the pill is nearly dead and in range, PUSH THROUGH — suppress the retreat
  // (coverFinishHold, honoured by refuelGoalCost above the armour-6 safety floor) and
  // concentrate aggressive fire to land the last hits. Even a death leaves the pill at
  // ~0 to finish next life.
  // ⚠️ DEFAULT OFF (env PUSH=1 to enable): A/B (4×N=30 each) gave PUSH 0.168 cap / 2.69
  // deaths vs OFF 0.133 / 2.62 — a faint capture gain at a faint death cost, both deep
  // inside the heisenbug band (0.03–0.37 on identical code). capfloor shows +2 pills→0.
  // Not a CLEAR N=30 win, so off pending more validation; principled (don't abandon a
  // 90%-dead pill — damage persists across death) and the most capture-aligned lever found.
  const PUSH_ARMOUR = 3;
  const PUSH = typeof process !== 'undefined' && !!process.env.PUSH;
  if (PUSH && pill.armour > 0 && pill.armour <= PUSH_ARMOUR && pillDistPh <= 1984) {
    a4.coverFinishHold = 1;                       // suppress the emergency break-off
    setSpeed(a4, 0, state.tank.speed & 0xFF);     // stop and concentrate fire
    const d = directionTo(state.tank.x, state.tank.y, pill.x, pill.y) & 0xFF;
    a4.shootPillDirection = d;
    _shootPill(a4, state, pill, d, 0);
    a4.pillApproachInProgress = 1;
    return;
  }

  const dirToPill = directionTo(state.tank.x, state.tank.y, pill.x, pill.y);
  const pillCx = ((pill.tileX & 0xFF) << 8) + 128;
  const pillCy = ((pill.tileY & 0xFF) << 8) + 128;

  // ── CIRCLE-STRAFE PUMP ──────────────────────────────────────────────────
  // Stationary fire = death: the hot pill (fires every ~6 ticks) leads the tank by
  // ~63 ticks, so a still tank is shredded — which is why the close stalls at ~3
  // armour. The hull-fixed gun can't fire while moving laterally, so ALTERNATE a FIRE
  // window (face the pill, shoot) with a DODGE window (drive at ±40° to the pill line
  // to break the pill's lead). Maintain a ~6-tile firing radius.
  // ⚠️ DEFAULT OFF (env STRAFE=1 to enable): MEASURED to crater damage output — with the
  // hull-fixed gun, dodging time is not-firing time, so pills barely drop to armour 8–11
  // (vs 3 stationary) and captures→0. Dodging trades away the fire the close needs.
  const STRAFE = typeof process !== 'undefined' && !!process.env.STRAFE;
  if (STRAFE) {
    const cyc = a4.tickCounter % 80;
    const dodging = cyc >= 40;                 // ~40t fire, ~40t dodge
    const tooClose = pillDistPh < 0x0500;      // < 5 tiles
    const tooFar   = pillDistPh > 0x0740;      // > 7.25 tiles
    if (dodging && !tooFar) {
      // Weave at ±40° to the pill bearing; alternate side each cycle (dodge both ways).
      // Angle outward a bit when too close so the orbit radius holds.
      const ccw = (Math.floor(a4.tickCounter / 80) & 1) === 0;
      const off = (tooClose ? 56 : 40) * (ccw ? 1 : -1);
      const moveDir = (dirToPill + off + 256) & 0xFF;
      turnTowardsDir(a4, state.tank.facingDir, moveDir & 0xFF, 0);
      setSpeed(a4, 20, state.tank.speed & 0xFF);
    } else {
      // FIRE window: face the pill and shoot; creep in only if a little far.
      setSpeed(a4, tooFar ? 16 : (tooClose ? 0 : 6), state.tank.speed & 0xFF);
      a4.shootPillDirection = dirToPill & 0xFF;
      if (_checkBarriers(a4, state.tank.x, state.tank.y, pillCx, pillCy) > 0) {
        _shootPillFromCover(a4, state, pill);
      } else {
        _shootPill(a4, state, pill, dirToPill & 0xFF, 0);
      }
    }
    a4.pillApproachInProgress = 1;
    return;
  }

  // ── Stop-and-fire approach (NO_STRAFE) ──────────────────────────────────
  // Only HOLD (dead stop) when the shot is actually CLEAR. If the tank is at standoff
  // distance but a barrier (forest, etc.) blocks the line to the pill, it CANNOT fire
  // from here — holding just sits idle (ctrl:idle) while the pill grinds it down and it
  // refuel-loops (observed live). When the shot is blocked, keep advancing toward the
  // firing slot to clear the line of sight instead of stopping.
  const hasLOS = _checkBarriers(a4, state.tank.x, state.tank.y, pillCx, pillCy) === 0;

  let apSpeed: number;
  if      (pillDistPh > 0x073C) apSpeed = 24;
  else if (pillDistPh > 0x0700) apSpeed = 16;
  else if (pillDistPh > 0x06E2) apSpeed = 8;
  else                           apSpeed = 0;

  // Blocked shot at the standoff ring → advance to clear it rather than idling.
  if (apSpeed === 0 && !hasLOS) apSpeed = 8;

  setSpeed(a4, apSpeed, state.tank.speed & 0xFF);

  // Drive toward the firing slot when still moving (binary: GoTo within attack zone).
  // ⚠️ Steer to the AP, NOT the pill centre. A LIVE pill has engine tankSpeed 0
  // (world_map.ts getTankSpeed: pill.armour>0 → 0) — you genuinely cannot move onto
  // it, so its tile is cost 1000 and A* returns null → `route:MISS noRoute:1`. The
  // old `navigateToCoords(pill.x, pill.y)` stalled the tank at ~6 tiles, where it got
  // ground down → refuel → re-charge → repeat (the refuel⇄GetPill oscillation loop,
  // never capturing). The AP (a4.newGetPillAPX/Y) is the passable firing slot already
  // chosen + validated in Phase 2; routing there always succeeds. Firing below is
  // distance/barrier-gated and independent of the move target, so the tank keeps
  // firing the whole approach. Scoped to the pill target — NOT the global NOROUTE_FIX
  // (which rewired every approach and regressed captures ~40%). You never drive onto a
  // live pill; you shoot it from the adjacent slot until armour 0, then Phase 4a lands.
  // CRITICAL: nav (steer toward AP) and combat (aim at the pill) must NEVER both issue a turn
  // in the same tick — they target DIFFERENT bearings (the AP is a firing slot off to the side
  // of the pill), so both turn bits get set (CCW+CW) and the engine cancels the turn → the hull
  // can't align → the tank freezes at the standoff (live "ctrl:ACC|CCW|CW|FWD spd=0" deadlock).
  // Split strictly on line-of-sight:
  if (hasLOS) {
    // Clear shot → aim at the pill and fire; _shootPill turns the hull to the pill and creeps
    // forward (0x10) when not yet aligned/in range, then fires. Do NOT navigate (no AP steer)
    // so combat solely owns the hull. The pill is in range here, so we don't need the AP route.
    a4.shootPillDirection = dirToPill & 0xFF;
    // DEAD STOP at the standoff ring: once stopped (apSpeed 0) fire STATIONARY (firingWord, no
    // accelerate bit) so the shot doesn't fight setSpeed's brake (accel+brake = coast into the
    // pill). While still approaching (apSpeed > 0) forward-fire/creep is fine.
    const holdFire = apSpeed === 0 ? 1 : 0;
    _shootPill(a4, state, pill, dirToPill & 0xFF, 0, holdFire);
  } else if (apSpeed > 0) {
    // Blocked shot → reposition to the firing slot (AP) to clear the line; nav SOLELY owns the
    // hull (no combat aim this tick). Steer to the AP, NOT the pill centre: a live pill is
    // engine-impassable (getTankSpeed 0) so routing onto it returns null → stall.
    navigateToCoords(a4, a4.newGetPillAPX, a4.newGetPillAPY, 0);
    // If even the AP is unreachable this tick, re-pick a firing slot from a different sector.
    if (a4.noLocalRouteFlag) {
      a4.noLocalRouteFlag = 0;
      const dirPillToAP = directionTo(pill.x, pill.y, a4.newGetPillAPX, a4.newGetPillAPY);
      a4.chooseAPLastSector = Math.floor((dirPillToAP & 0xFF) * 40 / 256);
      a4.newGetPillAPChosen = 0;
    }
  }
  a4.pillApproachInProgress = 1;
}

// Alias for goal dispatch
export { goalNewGetPill as goalGetPill };

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 6 — KillBase (0x001f58)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KillBase — Attack and destroy an enemy base.
 *
 * 4 phases: Validate → Choose AP → Navigate → Shoot.
 * Includes armor-loss monitoring and pill damage-rate tracking.
 *
 * See killbase_decode.md.
 */
export function goalKillBase(a4: A4State, state: BrainState): void {
  const target = a4.killBaseTarget;

  // Phase 0: Validate
  if (target === null || !target.isEnemy) {
    a4.killBaseInProgress = 0;
    a4.killBaseFirstShotFired = 0;
    a4.killBaseAttackPos = 0;
    return;
  }

  // Target changed (index-based — BaseState objects are recreated each tick)
  if (target.index !== a4.killBaseTargetIndex) {
    a4.killBaseTargetIndex = target.index;
    a4.killBaseAttackPos = 0;
    a4.killBaseFirstShotFired = 0;
    a4.killBaseInProgress = 0;
    a4.killBasePrevTarget = target;
    a4.killBaseCurrentTarget = target;
  }

  const dist = target.distToTank;

  // Undefended path: base has no defenders or no stock
  if (!target.defended) {
    navigateToCoords(a4, target.x, target.y, 0);

    if (dist < 512) {
      // Close: deploy mines + attack
      if (state.tank.mineCount > 0) {
        a4.steeringWord |= 0x40;   // FORWARD_FIRE
        a4.killBaseInProgress = 1;
        a4.newGetPillAttackMode = 1;
      }
    }
    return;
  }

  // Phase 2: Choose AP via ChooseAttackPosition (40-sector spiral search)
  if (!a4.killBaseAttackPos) {
    if (dist >= 3584) {
      // Too far: navigate toward base
      navigateToCoords(a4, target.x, target.y, 0);
      return;
    }
    // Use ChooseAttackPosition with base treated as pill target
    // (same position fields; attackable flag unused inside chooseAttackPosition)
    _chooseAP(a4, state, target as unknown as PillState);
    const apTX = a4.chooseAPBestX & 0xFF;
    const apTY = a4.chooseAPBestY & 0xFF;
    a4.killBaseAttackPos = ((apTY & 0xFF) << 8) | (apTX & 0xFF);
  }

  // Phase 3/4: Navigate to AP then shoot
  const apTX = a4.killBaseAttackPos & 0xFF;
  const apTY = (a4.killBaseAttackPos >> 8) & 0xFF;
  const myTX = a4.tankTileX;
  const myTY = a4.tankTileY;

  if (myTX !== apTX || myTY !== apTY) {
    // Not at AP: navigate
    navigateToCoords(a4, (apTX << 8) + 128, (apTY << 8) + 128, 1);
    return;
  }

  // Phase 4: At AP — shoot at base (pass state so real Shoot() runs)
  if (dist >= 1792) {
    setSpeed(a4, 10);
  } else {
    setSpeed(a4, 0);
  }
  shoot(a4, target.x, target.y, state);
  a4.killBaseInProgress = 1;

  // First-shot initialization
  if (!a4.killBaseFirstShotFired) {
    a4.killBaseFirstShotFired = 1;
    a4.killBaseArmorAtFirstShot = state.tank.armor & 0xFF;
    a4.killBaseArmorTracking   = state.tank.armor & 0xFF;
  } else {
    // Armor-loss check: if >18 HP lost, mark base as undefended
    const delta = a4.killBaseArmorAtFirstShot - (state.tank.armor & 0xFF);
    if (delta > 18) {
      // target.defended = false;  // NOTE: BrainState is read-only; would need adapter update
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 7 — KillMan (0x00232a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KillMan — Hunt and destroy an enemy builder.
 *
 * Distance-based dispatch:
 *   Far (>1792): navigate toward man
 *   Medium: shoot if barriers clear
 *   Very close (<256): explore (switch away)
 *
 * See killman_decode.md.
 */
export function goalKillMan(a4: A4State, state: BrainState): void {
  const man = a4.manToKillTarget;
  if (man === null) return;

  if (man.active) {
    const dist = man.distanceMetric;

    if (dist >= 0x700) {        // > 1792: far
      navigateToCoords(a4, man.x, man.y, 0);
    } else if (dist < 0x100) {  // < 256: very close — explore
      goalExplore(a4, state);
      if (state.tank.shellCount > 2) {
        a4.steeringWord |= 0x20;   // brake / movement flag
      }
    } else {
      // Medium range: FACE the man first, THEN shoot — never turn and creep in the same tick.
      // shoot() sets a FORWARD creep bit whenever shellCount<14; combined with its turn-toward-
      // target that makes the tank drive in a CIRCLE around the man, never aligning to fire —
      // observed live as a permanent CCW spin at spd~0.8 (low ammo). (An earlier bug here used
      // _aimAt, which never fired at all and froze at ACC|BRK.) Split on alignment: if not yet
      // facing the man, turn in place with the drive braked (no circle); once facing, shoot()
      // fires (men die in one hit) or advances STRAIGHT to close if out of range.
      const dirToMan = directionTo(state.tank.x, state.tank.y, man.x, man.y) & 0xFF;
      const facing = state.tank.facingDir & 0xFF;
      const aErr = Math.min((dirToMan - facing + 256) & 0xFF, (facing - dirToMan + 256) & 0xFF);
      if (aErr > 2) {
        turnTowardsDir(a4, facing, dirToMan, 0);         // turn in place, no forward creep
        setSpeed(a4, 0, state.tank.speed & 0xFF);
      } else {
        shoot(a4, man.x, man.y, state);                  // aligned → fire / close straight
      }
      a4.shotAtMan = 1;             // A4[11735]
    }
  } else {
    // Man not visible (in base or carried)
    navigateToCoords(a4, man.x, man.y, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 8 — KillTank (0x002764)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * KillTank — Engage and destroy an enemy tank.
 *
 * Verified from binary KillTank (0x002764, 348 instructions):
 *
 *   Phase 1: compute enemy speed (Speed 0x017a02) and lead aim position
 *            (LinearAimBySpeed 0x0151e6). When dist > 512, aim leads the shot.
 *   Phase 2: escape to ally base when ammo < 4 (binary 0x002924-0x0029ac).
 *   Phase 3: dist-based dispatch (binary 0x002a8e onwards):
 *     > 1792: navigate toward lead position (close the distance)
 *     ≤ 1792 (medium+close): stop and shoot at lead position
 *     ≤ 256 (very close): always stop and shoot
 *
 * Simplifications vs. binary:
 *   - No LinearAimBySpeed (we use our existing linearAim + DoCommonStuff velocity)
 *   - No stutter-step mode (binary alternates move/stop for evasion)
 *   - No PillToPiss (shoot protecting pills first)
 */
export function goalKillTank(a4: A4State, state: BrainState): void {
  const target = a4.tankToKillTarget;
  if (target === null) return;

  const dist = target.distanceMetric;

  // Escape check (binary 0x002924): low ammo, no pills, safe base nearby.
  // Binary gates on: ammo < 4 AND target has no pill guard AND we have no pills.
  // Escape check: binary 0x002924 uses CMPI.B #$04, 46(A0) = raw shells < 4.
  if (state.tank.shells < 4 && state.tank.pillsCarried === 0) {
    const safeBase = a4.closestAllyBase;
    if (safeBase !== null && safeBase.distToTank <= 1280 && safeBase.defended) {
      navigateToCoords(a4, safeBase.x, safeBase.y, 1);
      return;
    }
  }

  // Set attack mode flag (binary 0x0029b0: if dist < 0x0C00 = 3072)
  if (dist < 3072) {
    a4.newGetPillAttackMode = 1;
  }

  // LEAD the target (binary KillTank Phase 1 = LinearAimBySpeed, dropped in the original port).
  // The old code aimed at the enemy's CURRENT position, so against a moving tank the shell flew
  // where it WAS — measured in killtank.test: ~57% of shots connect vs a juking enemy, 0/5 kills.
  // Estimate the target's velocity from our own per-target position cache (enemyPrev* can't be
  // used — doCommonStuff overwrites it with the current position earlier this tick, zeroing the
  // delta), then aim where it WILL be when the shell arrives (linearAim uses shell travel time).
  let aimX = target.x, aimY = target.y;
  {
    const dt = a4.tickCounter - a4.killTankPrevTick;
    if (a4.killTankPrevIdx === target.index && dt > 0 && dt <= 4) {
      const dvx = target.x - a4.killTankPrevX;
      const dvy = target.y - a4.killTankPrevY;
      const tgtSpeed = Math.min(25, Math.round(Math.hypot(dvx, dvy) / dt));
      if (tgtSpeed > 0) {
        const lead = _linearAim(state, state.tank.x, state.tank.y, target.x, target.y, target.direction & 0xFF, tgtSpeed);
        aimX = lead.x & 0xFFFF; aimY = lead.y & 0xFFFF;
      }
    }
    a4.killTankPrevX = target.x; a4.killTankPrevY = target.y;
    a4.killTankPrevTick = a4.tickCounter; a4.killTankPrevIdx = target.index;
  }

  // LINE-OF-SIGHT gate. shoot() fires the instant the hull is aligned + in nominal range — it does
  // NOT check whether terrain blocks the shot (doCommonStuff's opportunistic fire does; goalKillTank
  // didn't). So the AI sprayed shells into walls/forest at an enemy it couldn't actually hit — the
  // "shooting blindly during KillTank" the user saw (killtank_los.test: 58% of shots had no LOS).
  // Only fire when the line to the enemy is clear; when it's blocked, REPOSITION to open a shot
  // (mirrors GetPill's LOS-split) instead of wasting ammo on the obstacle.
  const hasLOS = _checkBarriers(a4, state.tank.x, state.tank.y, target.x, target.y) === 0;

  // Distance-based dispatch (binary 0x002a8e):
  if (dist > 1792) {
    // Far (> 7 tiles): close the gap — navigate toward enemy. Fire only if we happen to already
    // have a clear, aligned shot (turnTowardsDir in shoot() costs nothing when we don't).
    navigateToCoords(a4, target.x, target.y, 0);
    if (hasLOS) shoot(a4, aimX, aimY, state);
  } else if (hasLOS) {
    // Within 7 tiles WITH a clear line → stop and aim-shoot at the LEAD position.
    // Pass the current speed so setSpeed actually issues the brake bit — bare setSpeed(a4, 0)
    // compared against undefined (NaN) and set nothing, so the tank never truly dead-stopped.
    setSpeed(a4, 0, state.tank.speed & 0xFF);
    shoot(a4, aimX, aimY, state);
  } else {
    // In range but the shot is BLOCKED → don't fire into the obstacle; move to flank for a clear
    // line. navigateToCoords owns the hull (no combat aim this tick) so nav and combat don't fight.
    navigateToCoords(a4, target.x, target.y, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 9 — Refuel (0x0031c6)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refuel — Resupply armor and ammo at ally base.
 *
 * State machine (A4[7462]):
 *   0 = Idle → SelectBase
 *   1 = SelectBase → NavigateWaypoints
 *   2 = NavigateWaypoints → SitOnBase
 *   4 = SitOnBase (refueling)
 *   6 = Emergency (escape)
 *
 * See refuel_decode.md and refuel_placepill_substates_decode.md.
 */
export function goalRefuel(a4: A4State, state: BrainState): void {
  switch (a4.refuelState) {
    case 0:
    case 1:
      // Base is already selected by chooseRefuelBase() in chooseGoal each tick.
      // Skip the complex waypoint-planning sub-states and go straight to navigation.
      if (a4.refuelBaseTarget !== null) {
        a4.refuelState = 2;
      }
      break;

    case 2:
      // Navigate to base
      _refuelNavigateToBase(a4, state);
      break;

    case 4:
      // Sitting on base — wait until full
      _refuelSitOnBase(a4, state);
      break;

    default:
      a4.refuelState = 0;
      break;
  }
}

/** NewRefuel (0x004c3e) — delegates to real building.ts implementation */
function goalNewRefuel(a4: A4State, state: BrainState): void {
  _newRefuel(a4, state);
}

function _refuelNavigateToBase(a4: A4State, state: BrainState): void {
  const base = a4.refuelBaseTarget;
  if (base === null) { a4.refuelState = 0; return; }

  navigateToCoords(a4, base.x, base.y, 1);

  // Check if arrived
  if (a4.tankTileX === base.tileX && a4.tankTileY === base.tileY) {
    a4.refuelState = 4;
  }
}

function _refuelSitOnBase(a4: A4State, state: BrainState): void {
  const base = a4.refuelBaseTarget;
  if (base === null) { a4.refuelState = 0; return; }

  const tank = state.tank;

  // Done when fully fueled — OR when the base has nothing left to give that the tank
  // still needs (engine refuels from FINITE base stock: armour +5/46t, then shells/mines
  // +1/7t, each to 40). Checked first so a drained base releases the tank even if it
  // never perfectly settles. Without it a tank at a drained base would sit forever
  // (refuelGoalCost stays active while low, so goal selection won't pull it away).
  const ob = (base as any).oronaBase;
  const baseArmour = ob?.armour ?? base.armor ?? 0;
  const baseShells = ob?.shells ?? 0;
  const tankFull = tank.armor >= 40 && tank.shells >= 40;
  const baseCanHelp = (baseArmour > 0 && tank.armor < 40) || (baseShells > 0 && tank.shells < 40);
  // Stay until BOTH armour and ammo are FULL (user directive). If this base drains before
  // the tank is full, don't give up — renavigate (chooseRefuelBase picks another stocked
  // ally base, or returns null → refuel naturally yields and the tank resumes once the
  // base regenerates), so it keeps topping up instead of leaving half-full.
  if (tankFull) { a4.refuelState = 0; return; }
  if (!baseCanHelp) { a4.refuelState = 2; return; }

  const offTiles = Math.max(Math.abs(a4.tankTileX - base.tileX), Math.abs(a4.tankTileY - base.tileY));

  if (offTiles === 0) {
    // ON the exact base cell → brake to a DEAD stop and hold so the ~46-tick refuel timer
    // runs. Brake ONLY (no navigate): the engine's accelerate() treats accelerating===braking
    // as ZERO acceleration, so mixing a navigate (accel bit) with a brake bit FREEZES the
    // speed and the tank creeps off the cell (that was the slight drift-over). Also pass the
    // current speed — setSpeed(a4,0) with no `current` sets no brake bit at all (0 > NaN).
    setSpeed(a4, 0, tank.speed & 0xFF);
  } else if (offTiles <= 2) {
    // Just off the cell → let the FOLLOWER ease back on and land it: its final-approach
    // slowdown caps speed to 4 within ~2.5 tiles and its landing brake stops the tank on
    // the cell. No manual setSpeed (that conflicts with the follower's accel → frozen creep).
    navigateToCoords(a4, base.x, base.y, 1);
  } else {
    a4.refuelState = 2;   // wandered far → full renavigate
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 10 — TourBases (0x0030a4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TourBases — Patrol all ally bases systematically.
 *
 * Uses candidate_flags (A4[13948]) to track which bases remain to visit.
 * When all visited, resets from reset_table (A4[16944]).
 *
 * See tourbases_decode.md.
 */
export function goalTourBases(a4: A4State, state: BrainState): void {
  let best: BaseState | null = null;
  let bestDist = 0xFFFF;

  // Find nearest unvisited ally base
  for (const base of a4.bases) {
    if (!base.isAlly) continue;

    const idx = base.index & 0x0F;
    if (a4.tourBasesCandidateFlags[idx] === 0) continue;   // already visited

    const dist = base.distToTank;
    if (dist < bestDist) {
      bestDist = dist;
      best = base;
    }
  }

  if (best === null) {
    // Cycle complete (or first run): re-mark every ALLY base as a candidate so the patrol
    // repeats. The reset TABLE was never populated (all zero), so the old code reset every
    // flag to 0 → all bases stayed "visited" → TourBases idled forever (the live freeze:
    // it's the endgame fallback when every combat goal is ∞, so a broken tour = dead-stop).
    // candidateFlags also start all-zero, so on the very first call best is null and this
    // is what actually seeds the tour.
    for (const base of a4.bases) {
      const idx = base.index & 0x0F;
      a4.tourBasesCandidateFlags[idx] = base.isAlly ? 1 : 0;
    }
    return;
  }

  // Navigate to nearest unvisited base
  navigateToCoords(a4, best.x, best.y, 0);

  // Unreachable base → skip it (mark visited) so the tour moves on instead of idling
  // forever at route:MISS on one base.
  if (a4.noLocalRouteFlag) {
    a4.noLocalRouteFlag = 0;
    a4.tourBasesCandidateFlags[best.index & 0x0F] = 0;
    return;
  }

  // Check if arrived
  if (a4.tankTileX === best.tileX && a4.tankTileY === best.tileY) {
    const idx = best.index & 0x0F;
    a4.tourBasesArrivalRecord[idx]++;
    a4.tourBasesCandidateFlags[idx] = 0;   // mark visited
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 11 — Announce (print text: "PlacePill" goal announce)
// ─────────────────────────────────────────────────────────────────────────────

export function goalAnnounce(a4: A4State, _state: BrainState): void {
  // PrintText(A4+6916) — broadcast pill placement announcement
  // Message system not yet ported; no-op until Step 11
}

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION / COMBAT STUBS
// These will be replaced with real implementations in Steps 6–9.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NavigateToCoords — Navigate to BWorld position.
 * Always calls the real implementation; uses a4 for tank position/direction.
 */
export function navigateToCoords(a4: A4State, x: number, y: number, _fast: number, _state?: BrainState): void {
  _navigateToCoords(a4, x, y, _fast);
}

/**
 * SetSpeed — Set tank speed.
 * Delegates to real SetSpeed from navigation.ts (needs current speed).
 * When called from goal handlers without current speed, uses default.
 */
export function setSpeed(a4: A4State, speed: number, currentSpeed?: number): void {
  _setSpeed(a4, speed, currentSpeed ?? 0);
}

/**
 * Shoot — Fire at BWorld position.
 * Delegates to combat.ts real implementation.
 */
export function shoot(a4: A4State, x: number, y: number, state?: BrainState): void {
  if (state) {
    _shoot(a4, state, x, y, 0, 0);
  } else {
    a4.firingWord |= 0x10;   // fallback: direct fire bit
  }
}

/**
 * Mac Random() with bias (for Explore target generation).
 * Returns value in 0–255 with positive bias.
 */
function biasedRandom(): number {
  let r = (macRandom());
  if (r <= 0) r = -macRandom();
  return (r & 0xFF);
}
