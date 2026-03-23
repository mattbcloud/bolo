/**
 * Goal Selectors and Cost Functions — aIndy3.1 TypeScript Port
 *
 * Contains:
 *   - 5 target selectors (BaseToKill, BaseToGet, PillToGet, PillToFix, ManToKill)
 *   - 6 goal cost functions (GetBaseCost, GetPillCost, KillBaseCost,
 *     KillTankCost, KillManCost, FixPillCost)
 *   - 11 ChooseGoal-level cost wrappers (one per goal index)
 *
 * All cost functions return 0xFFFF (65535) to indicate "goal not applicable".
 * Lower values = higher priority.
 *
 * References:
 *   aIndy_REFERENCE.md §"Goal System" §"Cost Functions" §"Target Selectors"
 *   tactical_helpers_decode.md (GetManCost, TankToKill, MarkKillableTanks)
 */

import { A4State } from './a4_state.js';
import type {
  BrainState, BaseState, PillState, EnemyTankState,
} from './aindy_interface.js';
import { byte } from './aindy_interface.js';

/**
 * Inline barrier count for cost functions — no side-effect cache write.
 * Uses DDA traversal (1 sample per tile), same algorithm as checkBarriers
 * in combat.ts but without writing a4.newGetPillCheckBarriersCache.
 */
function barrierCount(a4: A4State, fromX: number, fromY: number, toX: number, toY: number): number {
  const dx = toX - fromX;
  const dy = toY - fromY;
  // Signed wrap for 16-bit coordinates
  const sdx = dx > 32767 ? dx - 65536 : dx < -32768 ? dx + 65536 : dx;
  const sdy = dy > 32767 ? dy - 65536 : dy < -32768 ? dy + 65536 : dy;
  const steps = Math.max(2, Math.max(Math.abs(sdx) >> 8, Math.abs(sdy) >> 8));
  let count = 0;
  for (let i = 1; i < steps; i++) {
    const x = (fromX + Math.round(sdx * i / steps)) & 0xFFFF;
    const y = (fromY + Math.round(sdy * i / steps)) & 0xFFFF;
    const cell = a4.worldMap[(((y >> 8) & 0xFF) << 8) | ((x >> 8) & 0xFF)];
    const t = cell & 0x0F;
    // Count only terrain that physically blocks tank movement: wall, forest,
    // shot-wall. Water (0x80 flag) is intentionally excluded — tanks can
    // navigate open sea, river-with-boat, etc., just more slowly.
    if (t === 0 || t === 5 || t === 8) count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Manhattan distance in tile units */
function tileDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

/** Approximate BWorld distance (integer) */
function bwDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx, dy = ay - by;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/** Clamp to uint16 */
function u16(v: number): number { return Math.max(0, Math.min(0xFFFF, v)) | 0; }

// ─────────────────────────────────────────────────────────────────────────────
// TARGET SELECTORS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BaseToKill (0x00c2f8) — Select ally base to defend.
 *
 * Finds the best ally base that is under attack (has enemy pills nearby).
 * Returns null if no base needs defending.
 */
export function baseToKill(a4: A4State, state: BrainState): BaseState | null {
  let best: BaseState | null = null;
  let bestCost = 0xFFFF;

  for (const base of a4.bases) {
    if (!base.isAlly) continue;
    if (base.isEnemy) continue;                     // not an ally base

    const cost = killBaseCostForBase(a4, state, base);
    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  return best;
}

/**
 * BaseToGet (0x00c0c6) — Select enemy base to capture.
 *
 * Finds the nearest capturable enemy/neutral base.
 */
export function baseToGet(a4: A4State, state: BrainState): BaseState | null {
  let best: BaseState | null = null;
  let bestCost = 0xFFFF;

  for (const base of a4.bases) {
    if (base.isAlly) continue;                      // skip own bases

    const cost = getBaseCostForBase(a4, state, base);
    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  return best;
}

/**
 * PillToGet (0x00cec4) — Select enemy/neutral pill to capture.
 *
 * 5-phase selection: prefers reachable pills with fewest defenders.
 */
export function pillToGet(a4: A4State, state: BrainState): PillState | null {
  let best: PillState | null = null;
  let bestCost = 0xFFFF;

  for (const pill of a4.pills) {
    if (!pill.active) continue;
    if (!pill.attackable) continue;                 // not an attackable enemy pill
    if (pill.alreadyTargeted) continue;             // ally already handling it
    if (pill.processingBlocked) continue;

    const cost = getPillCostForPill(a4, state, pill);
    if (cost < bestCost) {
      bestCost = cost;
      best = pill;
    }
  }

  return best;
}

/**
 * PillToFix (0x00c908) — Select damaged ally pill to repair.
 *
 * Finds the nearest damaged ally pill that needs fixing.
 */
export function pillToFix(a4: A4State, state: BrainState): PillState | null {
  let best: PillState | null = null;
  let bestCost = 0xFFFF;

  for (const pill of a4.pills) {
    if (!pill.active) continue;
    if (pill.attackable) continue;                  // skip enemy pills
    if (pill.captureDifficulty >= 15) continue;     // already full armor

    const cost = fixPillCostForPill(a4, state, pill);
    if (cost < bestCost) {
      bestCost = cost;
      best = pill;
    }
  }

  return best;
}

/**
 * ManToKill (0x00D726) — Select enemy builder to hunt.
 *
 * Returns the highest-priority enemy man based on proximity and threat.
 */
export function manToKill(a4: A4State, state: BrainState): EnemyTankState | null {
  let best: EnemyTankState | null = null;
  let bestCost = 0xFFFF;

  for (const man of a4.men) {
    if (!man.active) continue;
    if (!man.isEnemy) continue;
    if (!man.attackable) continue;

    const cost = killManCostForTank(a4, state, man);
    if (cost < bestCost) {
      bestCost = cost;
      best = man;
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-ITEM COST FUNCTIONS (used by selectors AND goal cost wrappers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GetBaseCost (0x00c2a4) — cost for capturing a specific base.
 * Cost is distance-based. The original armorFactor (armor × 16) was inflating
 * cost to 1440+ for all fully-stocked bases, making GetBase never beat Explore.
 * Base armor in Orona = supply stock (0–90), not defensive strength.
 */
export function getBaseCostForBase(a4: A4State, _state: BrainState, base: BaseState): number {
  const distTiles = base.distToTank >> 8;
  const difficultyPenalty = (base.difficulty & 0x03) * 30;   // 0–3 tier × 30
  return u16(distTiles + difficultyPenalty);
}

/**
 * GetPillCost (0x00d2dc) — complex multi-tier cost for capturing a pill.
 *
 * Tiers by capture difficulty:
 *   0     → cost = dist (cheapest — undefended)
 *   1–3   → cost = dist × (difficulty + 1) + barrier penalty
 *   4–7   → cost = dist × 8 + defender penalty + barrier penalty
 *   8+    → cost = 0xFFFF (skip)
 *
 * Barrier penalty: each wall/water/forest tile in the approach path adds 80.
 * This causes the brain to prefer pills it can reach with a clear line of travel.
 */
export function getPillCostForPill(a4: A4State, state: BrainState, pill: PillState): number {
  const diff = pill.captureDifficulty & 0xFF;
  // Convert BWorld distance to tile units (>> 8), matching getBaseCostForBase
  // and fixPillCostForPill. Without this, BWorld-scale costs (5000+) always
  // lose to exploreGoalCost (200), so the brain never switches to GetPill.
  const dist = u16(pill.distToTank >> 8);

  if (diff >= 8) return 0xFFFF;

  // Barrier count between tank and pill (direct line, DDA).
  // Used as a small TIEBREAKER — prefer pills with clearer approach paths.
  // Penalty is intentionally tiny (5/barrier) so that walls never price out
  // a nearby pill; A* navigation handles routing around barriers anyway.
  const barriers = barrierCount(a4, state.tank.x, state.tank.y, pill.x, pill.y);
  const barrierPenalty = barriers * 5;

  if (diff === 0) {
    return u16(dist + barrierPenalty);
  } else if (diff <= 3) {
    return u16(dist * (diff + 1) + barrierPenalty);
  } else {
    // High difficulty: expensive
    const defenderPenalty = pill.defenderCount * 200;
    return u16(dist * 8 + defenderPenalty + barrierPenalty);
  }
}

/**
 * KillBaseCost (0x00ca7c) — cost for defending a base.
 *
 * Returns 0xFFFF if base doesn't need defending (no enemy pills).
 * Otherwise: distance + enemy pill count penalty (more pills = harder, higher cost).
 * Ally pills nearby reduce cost (they help defend).
 */
export function killBaseCostForBase(a4: A4State, _state: BrainState, base: BaseState): number {
  // Base must have enemy pills nearby to be worth defending
  if (base.enemyPillMask === 0) return 0xFFFF;

  const distTiles = base.distToTank >> 8;
  const enemyPillCount = countBits(base.enemyPillMask);
  const allyPillCount  = countBits(base.allyPillMask);

  // Each enemy pill adds 150 to cost (more heavily defended = harder to take back)
  const defensePenalty = enemyPillCount * 150;
  // Ally pills nearby reduce cost by 50 each (we have support)
  const allyBonus = Math.min(allyPillCount * 50, defensePenalty);

  return u16(distTiles + defensePenalty - allyBonus);
}

/**
 * KillTankCost (0x00cb76) — simple 0–3 priority for engaging enemy tanks.
 *
 * Returns:
 *   0   → high priority (close enemy)
 *   1   → medium (distant enemy)
 *   2   → low (shielded enemy)
 *   3   → skip (out of range)
 *   0xFFFF → no target
 */
export function killTankCostForTank(a4: A4State, _state: BrainState, tank: EnemyTankState): number {
  if (!tank.active || !tank.isEnemy) return 0xFFFF;

  const dist = tank.distanceMetric;

  // Within 4 tiles: high priority
  if (dist < 1024) return 0;

  // Within 14 tiles: medium
  if (dist < 3584) return 1;

  // Too far
  return 3;
}

/**
 * KillManCost (0x00e0f8) — cost for hunting enemy builder.
 * Formula: dist × (delta + 1), where delta = defender count area factor.
 */
export function killManCostForTank(a4: A4State, _state: BrainState, man: EnemyTankState): number {
  const dist = u16(man.distanceMetric >> 8);     // tile units
  const delta = 1;                               // simplified; original uses pill area delta
  return u16(dist * (delta + 1));
}

/**
 * FixPillCost (0x00c908) — 3 formulas by difficulty.
 *
 * Easy (diff 0–4):   dist_tiles
 * Medium (diff 5–9): dist_tiles × 2
 * Hard (diff 10+):   dist_tiles × 4
 */
export function fixPillCostForPill(a4: A4State, _state: BrainState, pill: PillState): number {
  const dist = pill.distToTank;
  const distTiles = dist >> 8;
  const diff = pill.captureDifficulty;

  if (diff <= 4) return u16(distTiles);
  if (diff <= 9) return u16(distTiles * 2);
  return u16(distTiles * 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// CHOOSE-GOAL COST WRAPPERS
// These are called by ChooseGoal each tick to fill the goal entry array.
// They use the selected targets (already set by the selectors above).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PlacePill goal cost — requires BaseToBuild target.
 * Cost: BuildBaseCost (based on difficulty tier / CoG distance).
 */
export function placePillGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.baseToBuildTarget;
  if (target === null) return 0xFFFF;

  // BuildBaseCost: 4 tiers by difficulty
  const diff = target.difficulty & 0xFF;
  const distTiles = target.distToTank >> 8;

  if (diff === 0) return u16(distTiles + 20);
  if (diff === 1) return u16(distTiles + 50);
  if (diff === 2) return u16(distTiles + 100);
  return u16(distTiles + 200);     // diff 3 = hardest
}

/**
 * Explore goal cost — always relatively high (fallback goal).
 * Returns a modest cost based on how little map we know.
 */
export function exploreGoalCost(a4: A4State, _state: BrainState): number {
  // Explore is the default fallback; give it a moderate cost
  // so any real goal with target takes priority.
  return 200;
}

/**
 * FixPill goal cost — uses PillToFix target.
 */
export function fixPillGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.pillToFixTarget;
  if (target === null) return 0xFFFF;
  return fixPillCostForPill(a4, state, target);
}

/**
 * GetBase goal cost — uses BaseToGet target.
 */
export function getBaseGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.baseToGetTarget;
  if (target === null) return 0xFFFF;
  return getBaseCostForBase(a4, state, target);
}

/**
 * GetMan goal cost — complex timing/path-based cost (GetManCost 0x00d626).
 *
 * Returns low cost when man is reachable and needed; 0xFFFF otherwise.
 * See tactical_helpers_decode.md §GetManCost for full algorithm.
 *
 * Simplified: returns 0xFFFF if no man, or a cost based on man distance.
 */
export function getManGoalCost(a4: A4State, state: BrainState): number {
  const man = state.tank.manPtr;
  if (man === null) return 0xFFFF;

  // Priority override flag
  if (a4.getManCostPriorityOverride) return 1;

  // Man already targeted and in range
  if (a4.getManCostActive) {
    const count = a4.getManCostCount;
    if (count < 10) return u16(count);
    return 10;
  }

  // Rough distance-based cost (path cost would come from ManTicksFromPath)
  const altDist = man.active
    ? u16(Math.round(Math.sqrt(
        Math.pow(man.x - state.tank.altX, 2) +
        Math.pow(man.y - state.tank.altY, 2)
      )))
    : 0xFFFF;

  if (altDist === 0) return 1;     // unreachable: mark urgent
  if (altDist > 5000) return 0xFFFF;

  return u16(altDist >> 8);        // tile-scale cost
}

/**
 * GetPill goal cost — uses PillToGet target.
 */
export function getPillGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.pillToGetTarget;
  if (target === null) return 0xFFFF;
  return getPillCostForPill(a4, state, target);
}

/**
 * KillBase goal cost — uses KillBase target.
 */
export function killBaseGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.killBaseTarget;
  if (target === null) return 0xFFFF;
  return killBaseCostForBase(a4, state, target);
}

/**
 * KillMan goal cost — uses ManToKill target.
 */
export function killManGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.manToKillTarget;
  if (target === null) return 0xFFFF;
  return killManCostForTank(a4, state, target);
}

/**
 * KillTank goal cost — uses TankToKill target (from MarkKillableTanks).
 */
export function killTankGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.tankToKillTarget;
  if (target === null) return 0xFFFF;
  return killTankCostForTank(a4, state, target);
}

/**
 * Refuel goal cost — based on current armor/ammo deficit.
 *
 * High priority when low on resources; inactive when full.
 */
export function refuelGoalCost(a4: A4State, state: BrainState): number {
  const tank = state.tank;

  // Full resources: don't refuel
  if (tank.armor >= 40 && tank.ammo >= 8) return 0xFFFF;

  const armorDeficit = 40 - tank.armor;
  const ammoDeficit  = 8  - tank.ammo;

  // Scale: larger deficit = lower cost = higher priority.
  // arm=20 → deficit=40 → base cost=160 → beats Explore(200) if base ≤ 40tx
  // arm=10 → deficit=60 → base cost=140 → beats Explore if base ≤ 60tx
  // arm=40 → deficit= 0 → base cost=200 → ties Explore (won't refuel when healthy)
  const totalDeficit = armorDeficit * 2 + ammoDeficit * 5;

  // Need a base to refuel at
  if (a4.refuelBaseTarget === null) return 0xFFFF;

  const distTiles = (a4.refuelBaseTarget.distToTank >> 8) & 0xFFFF;
  return u16(Math.max(0, 200 - totalDeficit) + distTiles);
}

/**
 * TourBases goal cost — low-priority fallback, active when no better goals.
 * Returns a moderate cost if we have ally bases to patrol.
 */
export function tourBasesGoalCost(a4: A4State, _state: BrainState): number {
  if (a4.bases.some(b => b.isAlly)) return 400;
  return 0xFFFF;
}

/**
 * TankToKill selector: scan men array and set a4.tankToKillTarget.
 * Simplified version of TankToKill (0x00cbc8) / MarkKillableTanks (0x00cc3e).
 */
export function selectTankToKill(a4: A4State, state: BrainState): EnemyTankState | null {
  let best: EnemyTankState | null = null;
  let bestCost = 0xFFFF;

  for (const man of a4.men) {
    if (!man.active || !man.isEnemy || !man.attackable) continue;

    // MarkKillableTanks gate: need ammo >= 4 or armor > 10
    if (state.tank.ammo < 4 && state.tank.armor <= 10) continue;

    // Distance gate: must be within ~14 tiles (3584 BWorld)
    const dist = man.distanceMetric;
    if (dist > 3584) continue;

    const cost = killTankCostForTank(a4, state, man);
    if (cost < bestCost) {
      bestCost = cost;
      best = man;
    }
  }

  return best;
}

/**
 * ChooseRefuelBase — select the best ally base to refuel at.
 * Simplified version of ChooseRefuelBase (0x00c566).
 */
export function chooseRefuelBase(a4: A4State, state: BrainState): BaseState | null {
  let best: BaseState | null = null;
  let bestCost = 0xFFFF;

  for (const base of a4.bases) {
    if (!base.isAlly) continue;
    if (base.isEnemy) continue;

    // Must have stock
    if (base.armor === 0) continue;

    // Not blocked
    const idx = ((base.tileY & 0xFF) << 8) | (base.tileX & 0xFF);
    if (a4.blockedMap[idx]) continue;

    // Cost: distance + danger penalty
    const distTiles = base.distToTank >> 8;
    const dangerPenalty = a4.dangerMap[idx] * 10;
    const cost = u16(distTiles + dangerPenalty);

    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  return best;
}

/**
 * BaseToBuild selector — find best base to build a pill at.
 * Simplified version of BaseToBuild (0x00bf60).
 */
export function selectBaseToBuild(a4: A4State, state: BrainState): BaseState | null {
  if (!state.tank.pillsCarried) return null;  // must be carrying a pill

  let best: BaseState | null = null;
  let bestCost = 0xFFFF;

  for (const base of a4.bases) {
    if (!base.isAlly) continue;

    // Check if base needs a defensive pill (no ally pills nearby)
    if (base.allyPillMask !== 0) continue;

    const distTiles = base.distToTank >> 8;
    const cost = u16(distTiles + base.difficulty * 20);

    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/** Count set bits in a 32-bit number */
function countBits(v: number): number {
  v = v >>> 0;
  v = v - ((v >> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >> 2) & 0x33333333);
  return ((v + (v >> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
}
