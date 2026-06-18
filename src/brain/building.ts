/**
 * Building & Resource Management — aIndy3.1 TypeScript Port
 *
 * Ported functions:
 *   dropMines           (0x014BFA) — periodic mine deployment
 *   borgFixPillCost     (0x00C490) — cost function for BorgFixPill
 *   borgFixPill         (0x00C4F8) — select pill for Borg auto-repair
 *   findTree            (0x017D86) — find nearest tree tile for harvest
 *   build               (0x02311C) — 4-mode builderman dispatcher
 *   newRefuel           (0x004c3e) — NewRefuel sub-state dispatcher
 *   refuelGoTowardBase  (0x004cf4) — Phase 0: navigate to refuel base
 *   refuelSitOnSafeBase (0x004d64) — Phase 1: hold at base, opportunistic fire
 *   refuelDoManStuff    (0x004e70) — Phase 1b: builderman tasks during refuel
 *   placePillSurveyTerrain   (0x00478e) — PlacePill Phase 0
 *   placePillChoosePlacement (0x004802) — PlacePill Phase 1
 *   placePillGotoBuildPoint  (0x004868) — PlacePill Phase 2
 *   placePillFinishUp        (0x004a9c) — PlacePill Phase 3/4
 *   doBuilding          (0x008732) — DoBuilding per-tick building gate
 *
 * References:
 *   build_decode.md, refuel_placepill_substates_decode.md,
 *   borgfixpill_decode.md, dropmines_decode.md
 */

import { A4State } from './a4_state.js';
import type { BrainState, PillState } from './aindy_interface.js';
import { computeDistanceBetween, manCheckPathIterative, setManTime } from './pathfinding.js';
import { navigateToCoords, setSpeed } from './navigation.js';

/** Lightweight barrier check (avoids circular dep with combat.ts) */
function hasLineOfSight(a4: A4State, x1: number, y1: number, x2: number, y2: number): boolean {
  const steps = 6;
  const dx = x2 - x1, dy = y2 - y1;
  for (let i = 1; i < steps; i++) {
    const x = (x1 + Math.round(dx * i / steps)) & 0xFFFF;
    const y = (y1 + Math.round(dy * i / steps)) & 0xFFFF;
    const cell = a4.worldMap[(((y >> 8) & 0xFF) << 8) | ((x >> 8) & 0xFF)];
    const t = cell & 0x0F;
    if (t === 0 || t === 5 || t === 8 || (cell & 0x80)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// DropMines (0x014BFA)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DropMines — Deploy mines on a tick-modulo schedule.
 *
 * Only fires when myTank.byte[45] (mine-deploy enable) is set.
 * Sets bit 31 (0x80000000) of steeringWord to trigger mine drop.
 *
 * @param period  Deployment interval in ticks
 */
export function dropMines(a4: A4State, period: number): void {
  // Mine-deploy enable gate (TankRecord+45)
  if (!a4.mineDeployEnable) return;

  // Tick-modulo trigger
  if (period <= 0) return;
  if ((a4.tickCounter % period) !== 0) return;

  // Set mine-drop trigger bit (bit 31 / 0x80000000 of steering word)
  a4.steeringWord = (a4.steeringWord | 0x80000000) >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// BorgFixPillCost (0x00C490)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BorgFixPillCost — Cost function for BorgFixPill candidate pills.
 *
 * Formula: cost = (defenderCount × 4) + (distToTank >> 8)
 * Eligibility gates: attackable, max difficulty (19), zero defenders, dist > 512.
 */
export function borgFixPillCost(pill: PillState): number {
  if (!pill)                          return 0xFFFF;
  if (pill.attackable)                return 0xFFFF;   // enemy pill
  if (pill.armour >= 15)               return 0xFFFF;   // too hard
  if (pill.defenderCount === 0)       return 0xFFFF;   // no defenders
  if (pill.distToTank > 512)          return 0xFFFF;   // too far

  return ((pill.defenderCount << 2) + (pill.distToTank >> 8)) & 0xFFFF;
}

// ─────────────────────────────────────────────────────────────────────────────
// BorgFixPill (0x00C4F8)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BorgFixPill — Select the best pill for Borg auto-repair.
 *
 * Iterates pill list, filters for inactive ally pills with defenders,
 * returns cheapest candidate.
 *
 * Pill filter:
 *   pill.byte[1] == 0  → inactive/dropped (needs repair)
 *   pill.byte[20] bit0 == 0 → not attackable (ally/neutral)
 *   pill.byte[17] > 0  → has defenders
 */
export function borgFixPill(a4: A4State): PillState | null {
  let best: PillState | null = null;
  let bestCost = 0xFFFF;

  for (const pill of a4.pills) {
    // byte[1] = active flag; select only inactive (dropped) pills
    if (pill.active)             continue;   // active pill — skip
    if (pill.attackable)         continue;   // enemy pill — skip
    if (pill.defenderCount === 0) continue;  // no defenders — skip

    const cost = borgFixPillCost(pill);
    if (cost < bestCost) {
      bestCost = cost;
      best = pill;
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// FindTree (0x017D86)
// ─────────────────────────────────────────────────────────────────────────────

/** 8-direction tile offsets for FindTree (A4[6296]) */
const FIND_TREE_DIR8: readonly [number, number][] = [
  [-1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, -1], [1, 1], [1, 0],
];

/**
 * FindTree (0x017D86) — Find the best adjacent tree tile for harvesting.
 *
 * Two modes:
 *   Strict (A4[12976] ≠ 0): quick 8-dir scan → first tree found
 *   Non-strict: 5×5 density scan → direction with most adjacent trees
 *
 * Returns { x, y } tile if found, null if none.
 */
export function findTree(a4: A4State): { x: number; y: number } | null {
  const tx = a4.tankTileX & 0xFF;
  const ty = a4.tankTileY & 0xFF;

  // At tree location already
  if (a4.movementMode === 5) {
    return { x: tx, y: ty };
  }

  // Strict mode: quick 8-dir scan
  if (a4.findSafestStrictMode) {
    for (const [dx, dy] of FIND_TREE_DIR8) {
      const nx = (tx + dx) & 0xFF;
      const ny = (ty + dy) & 0xFF;
      const cell = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
      if (cell & 0x80) continue;     // water — skip
      if ((cell & 0x0F) === 5) {     // terrain 5 = forest/tree
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  // Non-strict mode: density scoring over 5×5 area
  let bestCount = 0;
  let bestX = tx;
  let bestY = ty;
  let found = false;

  for (const [dx, dy] of FIND_TREE_DIR8) {
    let treeCount = 0;

    for (const [sx, sy] of FIND_TREE_DIR8) {
      const nx = (tx + dx + sx) & 0xFF;
      const ny = (ty + dy + sy) & 0xFF;
      const cell = a4.worldMap[((ny & 0xFF) << 8) | (nx & 0xFF)];
      if ((cell & 0x0F) === 5) treeCount++;
    }

    if (treeCount > bestCount) {
      bestCount = treeCount;
      bestX = (tx + dx) & 0xFF;
      bestY = (ty + dy) & 0xFF;
      found = true;
    }
  }

  return found ? { x: bestX, y: bestY } : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Build (0x02311C)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build — Primary builderman dispatch controller.
 * 4 building modes in priority order (build_decode.md).
 *
 * Called by DoBuilding every tick when conditions permit.
 * Dispatches builderman with appropriate action code:
 *   1 = Navigate/harvest
 *   2 = Place pill
 *   3 = Build at structure tile
 *   4 = Drop pill
 *   5 = Lay mine
 *
 * @param priority  Resource priority threshold (from DoBuilding: pillCount × 4)
 * @returns true if a builder action was queued
 */
export function build(a4: A4State, state: BrainState, priority: number): boolean {
  const tank = state.tank;

  // Gate: enemy proximity (closest enemy < 8 tiles with clear LOS)
  const enemy = a4.closestEnemyTank;
  if (enemy !== null && enemy.distanceMetric < 2048) {
    if (hasLineOfSight(a4, tank.x, tank.y, enemy.x, enemy.y)) return false;
  }

  // ── Mode 4: Tree harvest (binary Build mode 4) ───────────────────────────
  // Verified from binary 0x02311C: harvest when resourceCount < 40 AND
  // resourceEnabled == false (byte[42] == 0).
  if (!tank.resourceEnabled && tank.resourceCount < 40) {
    const tree = findTree(a4);
    if (!tree) return false;

    a4.pendingBuilderAction = { action: 'forest', trees: 0, tileX: tree.x, tileY: tree.y };
    a4.newGetPillAttackMode = 1;
    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for builder dispatch
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Number of trees needed to repair a pill at the given armour level.
 * Matches Orona's checkBuildOrder() 'pillbox' case thresholds.
 */
export function treesForRepair(armour: number): number {
  if (armour >= 11) return 1;
  if (armour >= 7)  return 2;
  if (armour >= 3)  return 3;
  return 4;
}

// ─────────────────────────────────────────────────────────────────────────────
// DoBuilding (0x008732)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DoBuilding — Per-tick building gate.
 *
 * Verified from binary DoBuilding (0x008732):
 *   Entry gates: !newGetPillAttackMode AND !defenderCount AND setGlobalsGate.
 *   Priority 1 (BorgFixPill path): repair nearby damaged ally pill when safe.
 *   Priority 2 (Build path): harvest trees or perform other building.
 *
 * Both paths now write to a4.pendingBuilderAction so _runBrainTick can call
 * buildOrder().  Only fires when builder is in the tank (builderInTank=true).
 */
export function doBuilding(a4: A4State, state: BrainState, currentGoal: number): void {
  if (a4.newGetPillAttackMode) return;        // builder already dispatched this session
  if (a4.newGetPillDefenderCount) return;     // defenders nearby — don't build
  if (!a4.setGlobalsGate) return;             // nav-commit gate

  const tank = state.tank;

  // Builder must be in the tank to dispatch
  if (!tank.builderInTank) return;

  // Never deploy the builder while on a boat — strands it in water
  if (tank.onBoat) return;

  // ── Priority 1: Repair nearby ally pill (BorgFixPill) ────────────────────
  // Binary gates (0x008800-0x00880e): alive, no enemy tank close, not dangerous.
  if (tank.armor > 0 && !a4.closestEnemyTank) {
    const bIdx = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);
    const danger  = a4.dangerMap[bIdx];
    const occupied = a4.occupancyMap[bIdx];
    if (danger === 0 && occupied === 0) {
      const pill = borgFixPill(a4);
      if (pill !== null) {
        const trees = treesForRepair(pill.armour);
        if (tank.resourceCount >= trees) {
          const dist = computeDistanceBetween(tank.x, tank.y, pill.x, pill.y);
          if (dist < 512) {  // binary threshold: pill.word[22] < 0x0200
            a4.pendingBuilderAction = {
              action: 'repair', trees,
              tileX: pill.tileX, tileY: pill.tileY,
            };
            a4.newGetPillAttackMode = 1;
            setManTime(a4, tank.x, tank.y, pill.x, pill.y);
            return;
          }
        }
      }
    }
  }

  // ── Priority 2: Build a boat when the routing system flags one is needed ──
  if (a4.boatNeeded && tank.armor > 20) {
    const boatTileX = a4.boatBuildTileX;
    const boatTileY = a4.boatBuildTileY;
    const boatBWorld = computeDistanceBetween(
      tank.x, tank.y,
      (boatTileX << 8) + 128, (boatTileY << 8) + 128,
    );

    if (boatBWorld < 768) {
      // Close enough to the water edge — dispatch builder
      if (tank.resourceCount >= 5) {
        a4.pendingBuilderAction = {
          action: 'boat', trees: 5,
          tileX: boatTileX, tileY: boatTileY,
        };
        a4.newGetPillAttackMode = 1;
        setManTime(a4, tank.x, tank.y,
          (boatTileX << 8) + 128, (boatTileY << 8) + 128);
        return;
      }
      // Not enough trees — fall through to tree harvest
    }
    // Not close enough — navigation will bring us closer
  }

  // ── Priority 3: Tree harvest or other building ────────────────────────────
  const priority = (a4.pillCount & 0xFF) << 2;
  build(a4, state, priority);
}

// ─────────────────────────────────────────────────────────────────────────────
// NewRefuel sub-states (refuel_placepill_substates_decode.md)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NewRefuel (0x004c3e) — Top-level Refuel sub-state dispatcher.
 *
 * States (A4[13895]):
 *   0 = GoTowardBase
 *   1 = SitOnSafeBase
 *   2 = BuildBarriersChoice (simplified)
 *
 * Writes result code to A4[13918].
 */
export function newRefuel(a4: A4State, state: BrainState): void {
  const base = a4.refuelBaseTarget;
  if (!base) return;

  // Update distance if not fresh
  if (!a4.distancesFresh) {
    base.distToTank = computeDistanceBetween(
      state.tank.x, state.tank.y, base.x, base.y,
    );
  }

  const prevState = a4.newRefuelState;

  switch (a4.newRefuelState) {
    case 0: refuelGoTowardBase(a4, state); break;
    case 1: refuelSitOnSafeBase(a4, state); break;
    case 2: {
      // Phase 2: build barriers (simplified — just stay on base)
      setSpeed(a4, 0, state.tank.facingDir);
      break;
    }
    default:
      a4.newRefuelState = 0;
      break;
  }

  // Encode result code: state changed = -2, same = -3
  a4.newRefuelSubResult = (a4.newRefuelState === prevState) ? 0xFF & (-3) : 0xFF & (-2);
}

/**
 * RefuelGoTowardBase (0x004cf4) — Phase 0: navigate to refuel base.
 * Transitions to Phase 1 when within 10 tiles.
 */
export function refuelGoTowardBase(a4: A4State, state: BrainState): void {
  const base = a4.refuelBaseTarget;
  if (!base) return;

  const dist = base.distToTank;

  if (dist <= 2560) {  // ≤ 10 tiles (2560 BWorld)
    // Close enough: advance to sit-on-base
    a4.newRefuelTargetX = base.x & 0xFFFF;
    a4.newRefuelTargetY = base.y & 0xFFFF;
    a4.newRefuelState = 1;
    base.newRefuelTrigger = false;
  } else {
    // Far: navigate directly toward base
    navigateToCoords(a4, base.x, base.y, 1);
  }
}

/**
 * RefuelSitOnSafeBase (0x004d64) — Phase 1: hold at base, refuel, opportunistic fire.
 */
export function refuelSitOnSafeBase(a4: A4State, state: BrainState): void {
  if (a4.newRefuelSubResult !== 0) a4.refuelSitClearFlag = 0;

  const targetX = a4.newRefuelTargetX;
  const targetY = a4.newRefuelTargetY;

  const tankTileX = a4.tankTileX;
  const tankTileY = a4.tankTileY;
  const tgtTileX  = (targetX >> 8) & 0xFF;
  const tgtTileY  = (targetY >> 8) & 0xFF;

  if (tankTileX !== tgtTileX || tankTileY !== tgtTileY) {
    // Not yet at target: navigate
    navigateToCoords(a4, targetX, targetY, 1);
    return;
  }

  // At target: hold position + opportunistic actions
  setSpeed(a4, 0, state.tank.facingDir);

  // Dispatch builderman during refuel
  const base = a4.refuelBaseTarget;
  if (base?.newRefuelTrigger && a4.setGlobalsGate && !a4.closestEnemyTank) {
    refuelDoManStuff(a4, state);
  }

  // Full resources: exit refuel
  if (state.tank.armor >= 40 && state.tank.ammo >= 8) {
    a4.newRefuelState = 0;
    a4.refuelState    = 0;
  }
}

/**
 * RefuelDoManStuff (0x004e70) — Builderman tasks during refueling.
 * Cycles: base-building → resource farming → mine placement.
 */
export function refuelDoManStuff(a4: A4State, state: BrainState): void {
  const man = a4.myMan;
  if (!man) return;

  const tank = state.tank;

  // Mode A: alternate man pickup (A4[11671])
  if (a4.refuelAltManPickup) {
    // BuildBase: find best adjacent tile for base construction
    // Simplified: send man 2 tiles in refuel mine direction
    const dirTable: readonly [number, number][] = [[0,-1],[1,0],[0,1],[-1,0]];
    const dir = ((a4.refuelMineDirectionIndex - 1) & 3);
    const [dx, dy] = dirTable[dir];
    const bx = (a4.tankTileX + dx * 2) & 0xFF;
    const by = (a4.tankTileY + dy * 2) & 0xFF;
    man.x = (bx << 8) + 128;
    man.y = (by << 8) + 128;
    man.actionCode = 2;   // PLACE_PILL
    setManTime(a4, tank.x, tank.y, man.x, man.y);
    a4.newGetPillAttackMode = 1;
    return;
  }

  // Mode B: resource farming (cycle directions 1-4)
  a4.refuelMineDirectionIndex++;
  if (a4.refuelMineDirectionIndex > 4) a4.refuelMineDirectionIndex = 1;
  const farmDir = ((a4.refuelMineDirectionIndex - 1) & 3);
  const farmDirs: readonly [number, number][] = [[0,-2],[2,0],[0,2],[-2,0]];
  const [fdx, fdy] = farmDirs[farmDir];
  const fx = (a4.tankTileX + fdx) & 0xFF;
  const fy = (a4.tankTileY + fdy) & 0xFF;

  const farmCell = a4.worldMap[((fy & 0xFF) << 8) | (fx & 0xFF)];
  if ((farmCell & 0x0F) === 5) {  // tree
    man.x = (fx << 8) + 128;
    man.y = (fy << 8) + 128;
    man.actionCode = 1;   // NAVIGATE
    setManTime(a4, tank.x, tank.y, man.x, man.y);
    a4.newGetPillAttackMode = 1;
    return;
  }

  // Mode C: mine placement (if mine-deploy enabled)
  if (a4.refuelMineDeployEnabled) {
    const mineDir = ((a4.refuelMineDirectionIndex - 1) & 3);
    const mineDirs: readonly [number, number][] = [[0,-3],[3,0],[0,3],[-3,0]];
    const [mdx, mdy] = mineDirs[mineDir];
    const mx = (a4.tankTileX + mdx) & 0xFF;
    const my = (a4.tankTileY + mdy) & 0xFF;

    const canReach = manCheckPathIterative(
      a4,
      man.x, man.y,
      (mx << 8) + 128, (my << 8) + 128,
      state.tank.x, state.tank.y,
    );

    if (!canReach) {
      // Path blocked: use MineWithMan relay (action 5)
      man.x = (mx << 8) + 128;
      man.y = (my << 8) + 128;
      man.actionCode = 5;   // LAY MINE
      setManTime(a4, tank.x, tank.y, man.x, man.y);
      a4.newGetPillAttackMode = 1;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PlacePill sub-states (refuel_placepill_substates_decode.md)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PlacePillSurveyTerrain (0x00478e) — PlacePill Phase 0.
 * Get resources if low; navigate toward build base.
 */
export function placePillSurveyTerrain(a4: A4State, state: BrainState): void {
  const tank = state.tank;
  const bwX = a4.placePillBaseBWorldX;
  const bwY = a4.placePillBaseBWorldY;

  if (tank.resourceCount < 4) {
    // Get tree for resources
    const tree = findTree(a4);
    if (tree && a4.myMan) {
      a4.myMan.x = (tree.x << 8) + 128;
      a4.myMan.y = (tree.y << 8) + 128;
      a4.myMan.actionCode = 1;
    }
    return;
  }

  const dist = computeDistanceBetween(tank.x, tank.y, bwX, bwY);
  if (dist <= 2560) {   // ≤ 10 tiles
    a4.placePillSubState = 1;
  } else {
    navigateToCoords(a4, bwX, bwY, 0);
  }
}

/**
 * PlacePillChoosePlacement (0x004802) — PlacePill Phase 1.
 * Choose optimal pill placement tile, transition to Phase 2.
 */
export function placePillChoosePlacement(a4: A4State, state: BrainState): void {
  const base = a4.baseToBuildTarget;
  if (!base) { a4.placePillSubState = 0; return; }

  // Simplified placement: choose adjacent tile with lowest cost
  const tx = base.tileX & 0xFF;
  const ty = base.tileY & 0xFF;

  let bestCost = 0xFFFF;
  let bestX = tx;
  let bestY = ty;

  const offsets: readonly [number, number][] = [
    [0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],
  ];

  for (const [dx, dy] of offsets) {
    const nx = (tx + dx) & 0xFF;
    const ny = (ty + dy) & 0xFF;
    const idx = ((ny & 0xFF) << 8) | (nx & 0xFF);
    const cell = a4.worldMap[idx];
    const terrain = cell & 0x0F;
    if (terrain === 0 || (cell & 0x80)) continue;  // wall or water

    const cost = (a4.examineTerrainCostTable[terrain] ?? 1000) + a4.dangerMap[idx] * 50;
    if (cost < bestCost) {
      bestCost = cost;
      bestX = nx;
      bestY = ny;
    }
  }

  if (bestCost < 1000) {
    a4.placePillPlacementX = bestX;
    a4.placePillPlacementY = bestY;
    a4.placePillSubState = 2;
  } else {
    // No valid spot: clear base buildable flag
    if (base) base.buildable = false;
  }
}

/**
 * PlacePillGotoBuildPoint (0x004868) — PlacePill Phase 2.
 * Navigate to safe staging point near placement tile, then transition to Phase 3.
 */
export function placePillGotoBuildPoint(a4: A4State, state: BrainState): void {
  a4.placePillStateChanged = 0;

  const tank = state.tank;
  const placeX = (a4.placePillPlacementX << 8) + 128;
  const placeY = (a4.placePillPlacementY << 8) + 128;

  if (!a4.placePillSafePointCached) {
    // Find safe approach: 1-2 tiles back from placement tile toward tank
    const approachX = (tank.x + placeX) >> 1;   // midpoint
    const approachY = (tank.y + placeY) >> 1;
    a4.placePillSafeApproachX = (approachX >> 8) & 0xFF;
    a4.placePillSafeApproachY = (approachY >> 8) & 0xFF;
    a4.placePillSafePointCached = 1;
    a4.placePillArrivedAtSafePoint = 0;
  }

  if (a4.placePillArrivedAtSafePoint) {
    // Already at staging point: check path to placement tile
    const dist = computeDistanceBetween(tank.x, tank.y, placeX, placeY);
    if (dist <= 800) {   // ≤ 3 tiles
      a4.placePillSubState = 3;  // → FinishUp
    } else {
      navigateToCoords(a4, placeX, placeY, 1);
    }
  } else {
    // Navigate to safe approach point
    const safeX = (a4.placePillSafeApproachX << 8) + 128;
    const safeY = (a4.placePillSafeApproachY << 8) + 128;
    navigateToCoords(a4, safeX, safeY, 1);

    // Check if arrived (within 3 BWorld = about 0.01 tiles)
    const dist = computeDistanceBetween(tank.x, tank.y, safeX, safeY);
    if (dist < 64) {
      a4.placePillArrivedAtSafePoint = 1;
      a4.placePillSubState = 3;
    }
  }
}

/**
 * PlacePillFinishUp (0x004a9c) — PlacePill Phase 3/4.
 * Dispatch builderman to place pill; wait for confirmation.
 */
export function placePillFinishUp(a4: A4State, state: BrainState): void {
  if (a4.placePillStateChanged) {
    a4.placePillManDispatched = 0;
    a4.placePillManTimingFlag = 0;
    a4.placePillDefendersBlockedHalt = 0;
  }

  const tank = state.tank;
  const placeX = (a4.placePillPlacementX << 8) + 128;
  const placeY = (a4.placePillPlacementY << 8) + 128;
  const safeX  = (a4.placePillSafeApproachX << 8) + 128;
  const safeY  = (a4.placePillSafeApproachY << 8) + 128;

  const distFromSafe = computeDistanceBetween(tank.x, tank.y, safeX, safeY);

  if (distFromSafe > 3 && a4.placePillDefendersBlockedHalt) {
    a4.placePillSubState = 2;   // too far, back to GotoBuildPoint
    return;
  }

  if (!a4.placePillManDispatched) {
    // Check Borg nav-commit + path timing
    if (a4.setGlobalsGate) {
      a4.placePillManTimingFlag = 1;
      const ticks = setManTime(a4, tank.x, tank.y, placeX, placeY);
      if (ticks === 0 || a4.getManCostPriorityOverride) {
        // Man unreachable — abort to phase 0
        a4.placePillSubState = 0;
        return;
      }
    }

    // Check for blocking defenders
    if (a4.newGetPillDefenderCount > 0) {
      a4.placePillDefendersBlockedHalt = 1;
      setSpeed(a4, 0, tank.facingDir);
      return;
    }

    // Dispatch man to drop pill
    const man = a4.myMan;
    if (man && tank.resourceCount >= 4) {
      man.x = placeX;
      man.y = placeY;
      man.actionCode = 4;   // DROP_PILL
      a4.newGetPillAttackMode = 1;
      setManTime(a4, tank.x, tank.y, placeX, placeY);
      setSpeed(a4, 0, tank.facingDir);
      a4.placePillManDispatched = 1;
    }
  }
  // Man dispatched: just hold position
  setSpeed(a4, 0, tank.facingDir);

  // Pill placed: loop back to choose next placement
  if (!tank.pillsCarried) {
    a4.placePillSubState = 2;
  }
}
