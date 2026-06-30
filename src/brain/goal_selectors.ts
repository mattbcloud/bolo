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
    // Terrain that stops a shell — must match the engine (shell.ts collide()):
    // wall(0), shot-wall(8), forest(5), boat(9), live pillbox(12). Shots do NOT
    // pass through walls, so a wall in the line-of-fire is a real barrier.
    if (t === 0 || t === 5 || t === 8 || t === 9 || t === 12) count++;
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
 *
 * Intentional base-seeking improvements:
 *   - Sticky committed target: while GetBase was active last tick, returns
 *     the previously-committed base (by index) instead of re-ranking all
 *     bases. This prevents mid-navigation target switching as the tank moves
 *     and the distance rankings shuffle.
 *   - Fresh selection only when: (a) GetBase was NOT the last goal, (b) the
 *     committed base has been captured (isAlly), or (c) no committed target.
 */
export function baseToGet(a4: A4State, state: BrainState): BaseState | null {
  // ── Sticky committed target ───────────────────────────────────────────────
  // If GetBase was running last tick and we have a committed target, honour it.
  // BaseState objects are recreated each tick, so commit is stored by index.
  if (a4.getBaseWasLastGoal && a4.getBaseCommittedIndex >= 0) {
    const committed = a4.bases[a4.getBaseCommittedIndex] ?? null;
    if (committed !== null && !committed.isAlly) {
      // Still a valid capturable target — stay the course
      return committed;
    }
    // Base was captured or removed — clear commitment, fall through to fresh pick
    a4.getBaseCommittedIndex = -1;
  }

  // ── Fresh selection ───────────────────────────────────────────────────────
  let best: BaseState | null = null;
  let bestCost = 0xFFFF;

  for (const base of a4.bases) {
    if (base.isAlly) continue;                      // skip own bases
    if (a4.tickCounter < a4.getBaseFailedUntilTick[base.index]) continue;

    const cost = getBaseCostForBase(a4, state, base);
    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  // Commit to the newly chosen base
  a4.getBaseCommittedIndex = best !== null ? best.index : -1;
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
    if (pill.armour >= 15) continue;                 // already full armor

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
  // Verified from assembly 0x00c2a4: cost = distToTank_tiles + difficulty*16
  // (base.byte[10] = difficulty, ASL.W #4 = ×16; base.word[14]=distToTank>>8=tiles)
  const distTiles = base.distToTank >> 8;
  const difficultyPenalty = (base.difficulty & 0x03) * 16;
  return u16(distTiles + difficultyPenalty);
}

/**
 * GetPillCost (0x00d2dc) — cost for capturing an enemy/neutral pill.
 *
 * Distance scaling by defenderCount (binary 0x00d4b8–0x00d4e0):
 *   0–2 defenders:  dist >> 10  (very cheap — undefended pill is highest priority)
 *   3–7 defenders:  dist >> 8   (tile distance)
 *   8+  defenders:  dist >> 7   (expensive — heavily defended)
 *
 * Plus defenderCount×8 added to base cost (binary 0x00d4f2–0x00d500).
 *
 * captureDifficulty (binary 0x00d5f2–0x00d60e) is the count of neutral bases
 * near this pill, and discounts cost as 2^diff (higher centrality = preferred).
 */
export function getPillCostForPill(_a4: A4State, state: BrainState, pill: PillState): number {
  // Can't shoot an armed pill without ammo; only pursue armour=0 pills for auto-capture
  if (state.tank.ammo === 0 && pill.armour > 0) return 0xFFFF;

  const defCount = pill.defenderCount & 0xFF;
  const bwDist   = pill.distToTank;

  // Distance tier based on defender count
  let D3: number;
  if (defCount > 7) {
    D3 = bwDist >> 7;
  } else if (defCount > 2) {
    D3 = bwDist >> 8;
  } else {
    D3 = bwDist >> 10;
  }

  // Add per-defender cost (binary: defenderCount * 8)
  D3 += defCount * 8;

  // Final discount: shift right by captureDifficulty (base-centrality count, 0–7)
  const diff = pill.captureDifficulty & 0x07;
  if (diff === 1 || diff === 2) {
    D3 = D3 >> 1;
  } else if (diff > 2) {
    D3 = D3 >> diff;
  }

  return u16(Math.max(1, D3));
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
 * KillTankCost (0x00cb76) — verified from binary disassembly.
 *
 * Binary KillTankCost(tank, flag=1):
 *   dist ≤ 0x0500 (1280, ~5 tiles) AND has pill-guard: cost 0
 *   dist ≤ 0x0500 AND no pill-guard:                   cost 1
 *   dist >  0x0500 AND has pill-guard:                  cost 2
 *   dist >  0x0500 AND no pill-guard:                   cost 3
 *
 * MarkKillableTanks only marks tanks within 0x0A00 (2560, ~10 tiles) as
 * killable when ammo ≥ 4; within 0x0400 (1024, ~4 tiles) when ammo < 4.
 *
 * We don't track the pill-guard field; use the "no pill-guard" path (costs
 * 1 and 3 → mapped to 0 and 2 to keep the close-range override at 0).
 *
 *   dist ≤ 1280 (5 tiles):  cost 0  → beats every goal (including GetPill)
 *   dist ≤ 2560 (10 tiles): cost 2  → beats defended pills and distant pills
 */
export function killTankCostForTank(a4: A4State, _state: BrainState, tank: EnemyTankState): number {
  if (!tank.active || !tank.isEnemy || !tank.attackable) return 0xFFFF;

  const dist = tank.distanceMetric;

  if (dist <= 1280) return 0;   // ≤ 5 tiles: highest priority
  if (dist <= 2560) return 2;   // ≤ 10 tiles: beats most objectives

  return 0xFFFF;
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
  const armour = pill.armour;

  // If the tank is ON the pill tile (distTiles=0), the pill.armour>0 tile freezes
  // the tank (world_map.ts getTankSpeed returns 0).  Treat as 1-tile distance so
  // cost is never 0 (which would lock FixPill at highest priority while the tank
  // is physically unable to do anything).
  const effectiveTiles = Math.max(1, distTiles);

  if (armour <= 4) return u16(effectiveTiles);
  if (armour <= 9) return u16(effectiveTiles * 2);
  return u16(effectiveTiles * 4);
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
  if (a4.baseToBuildTarget === null) return 0xFFFF;

  // Once the tank holds a captured pillbox, PREFER using it as COVER to capture MORE pills
  // (per the tactics guide a captured pill is the best cover — it absorbs the target's fire AND
  // shoots back; _coverMethodAttack plants it next to the target) over deploying it to defend a
  // base. So while there is still an attackable pill to hunt, yield to GetPill; only fall back to
  // placing the pill at a base when no pill is left to hunt with it.
  if (a4.pillToGetTarget !== null && getPillCostForPill(a4, state, a4.pillToGetTarget) < 0xFFFF) {
    return 0xFFFE;   // lose to GetPill → keep hunting and use the captured pill as cover
  }

  // No pill to hunt → deploy the captured pill to DEFEND the nearest buildable base. Cost 1
  // beats GetBase/Explore yet yields to emergency Refuel / close base-capture / tank-kill (cost 0).
  return 1;
}

/**
 * Explore goal cost — verified from assembly 0x007406: initialized to 0xFFF5
 * (65525) and NEVER modified. It only wins when ALL other goals return 0xFFFF
 * (no targets available). Not 200 as previously thought.
 */
export function exploreGoalCost(a4: A4State, _state: BrainState): number {
  return 0xFFF5;  // 65525: true last-resort fallback
}

/**
 * FixPill goal cost — uses PillToFix target.
 */
export function fixPillGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.pillToFixTarget;
  if (target === null) return 0xFFFF;

  // Don't commit to a repair the tank CANNOT perform. Repairing costs trees
  // (treesForRepair: armour≥11→1, ≥7→2, ≥3→3, else 4) and the brain has no FixPill
  // tree-gathering path, so with too few trees goalFixPill just parks the tank idle
  // next to the pill FOREVER — and FixPill stays the cheapest goal so it never yields
  // to GetPill/GetBase. (Observed live: a full-armour "frozen" tank stuck on FixPill(1)
  // with 0 trees.) Require the trees up front; otherwise yield to an achievable goal.
  const treesNeeded = target.armour >= 11 ? 1 : target.armour >= 7 ? 2 : target.armour >= 3 ? 3 : 4;
  if (state.tank.resourceCount < treesNeeded) return 0xFFFF;

  return fixPillCostForPill(a4, state, target);
}

/**
 * GetBase goal cost — uses BaseToGet target.
 *
 * Intentional base-seeking improvements over raw distance cost:
 *
 *   1. Proximity lock-in (≤ 6 tiles): once close enough to a base, return
 *      cost=0 so GetBase beats every other goal and the tank finishes the
 *      approach. Guard: skipped when armor ≤ 10 (emergency refuel first).
 *
 *   2. Hysteresis discount (−30): when GetBase was the winning goal last tick,
 *      shave 30 from the cost. This means a competing goal must beat GetBase
 *      by >30 to steal focus mid-navigation, preventing thrashing when costs
 *      are nearly tied.
 */
export function getBaseGoalCost(a4: A4State, state: BrainState): number {
  const target = a4.baseToGetTarget;
  if (target === null) return 0xFFFF;

  // ── Out-of-ammo yield ──────────────────────────────────────────────────────
  // An armoured / owner-active base (worldMap blocked bit 0x40, same gate goalGetBase
  // uses) can only be captured by SHOOTING its armour down to 0 first. With zero shells
  // the tank can't damage it at all, so locking onto it (cost 0 below) deadlocks: it sits
  // on the base firing nothing forever instead of leaving to rearm. Yield here so Refuel
  // (made a cost-0 emergency when shells===0) wins and the tank goes to restock ammo,
  // then comes back and finishes the capture. A non-blocked base (armour ≤9 / unowned) is
  // claimed by driving on — no shells needed — so it keeps normal priority.
  const tileIdx = ((target.tileY & 0xFF) << 8) | (target.tileX & 0xFF);
  const needsShelling = (a4.worldMap[tileIdx] & 0x40) !== 0;
  if (needsShelling && (state.tank.shells & 0xFF) === 0) return 0xFFFF;

  // ── Proximity lock-in ─────────────────────────────────────────────────────
  // Within 6 tiles of target: finish what we started — highest priority.
  // Exception: critically low armor (≤ 10) lets emergency refuel override.
  const distTiles = target.distToTank >> 8;
  if (distTiles <= 6 && state.tank.armor > 10) {
    return 0;
  }

  // Verified binary behaviour: GetBase cost = distTiles + difficulty×16.
  // No hysteresis discount — the original binary never needed one because
  // GetBase competed against defended pills (cost ≥ 8) in multiplayer.
  // In solo play (undefended pills, cost 1–4), GetBase only wins via the
  // proximity lock-in (≤ 6 tiles → cost=0 above).  Bases farther away are
  // captured opportunistically when goalGetPill drives over them, not by
  // explicitly switching to GetBase.
  //
  // The old -30 discount made GetBase cost=1 for distant bases (27 tiles
  // → cost=max(1,27-30)=1) causing rapid GetBase↔GetPill oscillation and
  // constant A* restarts.
  return u16(getBaseCostForBase(a4, state, target));
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

  // Abandoned: the builder proved unreachable (route MISS) — stay off GetMan
  // during the cooldown so the tank refuels/retreats instead of dying on top of
  // an unreachable man. Checked before the override so it can't be starved.
  if (a4.tickCounter < a4.getManFailedUntilTick) return 0xFFFF;

  // Cover method: the builder was just deployed on purpose to build pill cover.
  // Don't let GetMan drag the tank off its GetPill engagement to fetch it — the
  // builder returns to the tank on its own after building. Times out (grace) so a
  // stranded/dead builder can still be retrieved afterwards.
  const COVER_BUILD_GRACE = 500;
  if (a4.coverBuilderDispatchTick > 0 &&
      a4.tickCounter - a4.coverBuilderDispatchTick < COVER_BUILD_GRACE) {
    return 0xFFFF;
  }

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
 * Refuel goal cost — re-verified from binary ChooseGoal (0x0073ee, 0x0079f8).
 *
 * Activation thresholds (binary 0x0079f8-0x007a06):
 *   myTank.byte[44] (armor)  < 30 (0x1E)   → consider refueling
 *   myTank.byte[46] (shells) < 7            → consider refueling
 *   Both must be false to skip refueling entirely.
 *
 *   NOTE: byte[46] is the RAW shell count (0–40), not the mapped 0–8 ammo.
 *   The old threshold `ammo < 7` (mapped) triggered at 87.5% capacity —
 *   far too aggressive.  The correct threshold is `shells < 7` (raw) = 17.5%.
 *
 * Cost formula (binary 0x007a6c-0x007a84):
 *   cost = armor + raw_shells×8 + 40
 *   Full tank (arm=40, shells=40): 40 + 320 + 40 = 400 — never reached (gate above)
 *   Critically low (arm=5, shells=3): 5 + 24 + 40 = 69 — high priority
 *
 * ChooseRefuelBaseCost (0x00c71e) also gates on shells < 8 for the base
 * being worthwhile — consistent with the same 7–8 shell threshold.
 */
export function refuelGoalCost(a4: A4State, state: BrainState): number {
  const tank = state.tank;

  // Refuel-to-FULL hold (port addition). The binary cost balloons the instant armour
  // clears 16 (cost = armor + shells*8 + 40 ≥ 56), so a nearby pill (GetPill cost ~1-9)
  // wins goal selection and yanks the tank OFF the base at ~16-30 armour — i.e. "the
  // tank doesn't stay long enough to refuel," and it re-engages pills well below full.
  // The doctrine is: always engage a hostile pill at FULL armour. Fix: while the tank
  // is PHYSICALLY ON a refuel base that still has armour to give, keep refuel strictly
  // winning (cost 0) until armour tops back to full — don't let a pill pull it off
  // mid-refuel. Gating on atBase+stock (not just armour<16) is critical: an unconditional
  // hold traps the tank idling against an UNREACHABLE base (route:miss) for ~1000 ticks;
  // when not on a base, normal cost logic (incl. the <16 emergency below) applies and the
  // tank stays free to pursue reachable objectives.
  // Hold to FULL (per user directive): once the tank is parked ON a refuel base, keep
  // refuel strictly winning (cost 0) until BOTH armour and ammo are topped all the way
  // up (armour 40 AND shells 40) — don't let a pill/other goal pull it off the base at
  // ~25-30. Only holds while ON the base and the base still has something the tank needs;
  // when not on a base, normal cost logic (incl. the <16 emergency below) applies, so a
  // far/unreachable base can't trap the tank idling. (Trade-off: full top-offs are long
  // sits on a slow-regen base — +5 armour/46 ticks — which reduces aggression/throughput;
  // this is the requested behaviour.)
  const rbase = a4.refuelBaseTarget;
  if (rbase !== null && (tank.armor < 40 || tank.shells < 40)) {
    const atBase = a4.tankTileX === rbase.tileX && a4.tankTileY === rbase.tileY;
    const ob = (rbase as any).oronaBase;
    const baseArmour = ob?.armour ?? (rbase as any).armor ?? 0;
    const baseShells = ob?.shells ?? 0;
    const baseCanHelp = (baseArmour > 0 && tank.armor < 40) || (baseShells > 0 && tank.shells < 40);
    if (atBase && baseCanHelp) return 0;   // stay and top up to FULL before leaving
  }

  // Emergency rearm: a tank with ZERO shells can't shoot down an armoured base or grind a
  // pill — every combat goal is stuck (it would otherwise idle on-target firing nothing,
  // e.g. parked on an armoured enemy base it can't damage). Treat empty shells like the
  // armour<16 emergency below and break off to rearm at cost 0 (strictly beats GetPill's
  // floor of 1 and any positive combat cost), provided a refuel base is reachable. Clears
  // the instant shells > 0, so the tank re-engages as soon as it has ammo.
  if ((tank.shells & 0xFF) === 0 && a4.refuelBaseTarget !== null) return 0;

  // Binary threshold (0x0079f8): armor >= 30 AND shells >= 7 → no refuel needed.
  // shells is the raw 0-40 count; 7 shells = ~17% of max capacity.
  if (tank.armor >= 30 && tank.shells >= 7) return 0xFFFF;

  // Need an ally base with stock to refuel at
  if (a4.refuelBaseTarget === null) return 0xFFFF;

  // Emergency disengage: at critically low armor, refueling outranks combat goals
  // (GetPill/KillTank/KillBase cost 1-9) so the tank breaks off and flees to a
  // base instead of fighting a defended target to the death. Observed: tank
  // ground armor 40→0 attacking defended pills because GetPill always won.
  // Must be cost 0, NOT 1: GetPill's cost floors at Math.max(1, …)=1, and the
  // ChooseGoal tie-break (strict `<` min scan + index order: GetPill=5 < Refuel=9,
  // plus equal-cost hysteresis) makes GetPill WIN a 1-vs-1 tie — so cost 1 never
  // actually disengaged and the tank pressed close-range pill charges to death
  // (death diagnostic: ~66% of deaths on GetPill). Cost 0 strictly beats GetPill.
  // Recovers to 0xFFFF once armor ≥30, i.e. hit-and-run.
  // Close-the-kill suppression: if the tank is finishing a nearly-dead pill from
  // CONFIRMED cover (coverFinishHold), don't break off to refuel above a hard safety
  // floor — covered means ~no incoming damage, and breaking off here is exactly what
  // leaves pills stuck at ~3 armour. Below the floor (armour<6) always retreat, in
  // case the cover read was stale/wrong.
  if (tank.armor < 16 && !(a4.coverFinishHold && tank.armor >= 6)) return 0;

  // Binary cost formula (0x007a6c): armor + raw_shells×8 + 40.
  // Lower = higher priority; critically depleted tank refuels before any other goal.
  return u16(tank.armor + tank.shells * 8 + 40);
}

/**
 * TourBases goal cost — idle-only fallback.
 *
 * From binary (0x007cf2): TourBases only gets cost 1 (highest priority) when
 * ALL of GetPill, FixPill, and PlacePill are unavailable (0xFFFF).
 * Otherwise returns 0xFFFF (inactive).
 *
 * This prevents TourBases from competing with active objectives.
 */
export function tourBasesGoalCost(a4: A4State, _state: BrainState): number {
  if (!a4.bases.some(b => b.isAlly)) return 0xFFFF;

  // Only activate when no GetPill, FixPill, or PlacePill objectives exist
  const getPillCost  = a4.goals[5]?.cost ?? 0xFFFF;   // Goal.GET_PILL = 5
  const fixPillCost  = a4.goals[2]?.cost ?? 0xFFFF;   // Goal.FIX_PILL = 2
  const placePillCost = a4.goals[0]?.cost ?? 0xFFFF;  // Goal.PLACE_PILL = 0
  if (getPillCost < 0xFFFF || fixPillCost < 0xFFFF || placePillCost < 0xFFFF) {
    return 0xFFFF;
  }

  // Yield to Refuel. TourBases is the lowest-priority "wander when idle" goal;
  // a tank that needs fuel/ammo (refuel active) must refuel, not tour. Without
  // this, a depleted tank with no reachable pills picked TourBases(1) over
  // Refuel, failed to navigate to an unreachable base, sat idle, and was shot
  // to death while refuel was available. (Refuel cost is computed before this.)
  const refuelCost = a4.goals[9]?.cost ?? 0xFFFF;  // Goal.REFUEL = 9
  if (refuelCost < 0xFFFF) return 0xFFFF;

  return 1;
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

    // MarkKillableTanks gate (binary 0x00ccb2): need raw shells >= 4 or armor > 10.
    // Binary: CMPI.B #$04, 46(A0) (raw shells), not mapped ammo.
    if (state.tank.shells < 4 && state.tank.armor <= 10) continue;

    // MarkKillableTanks distance gate (binary 0x00cc90/0x00cc7c):
    // 0x0A00 (2560, ~10 tiles) when shells >= 4; 0x0400 (1024, ~4 tiles) when low.
    const dist = man.distanceMetric;
    const rangeLimit = (state.tank.shells >= 4) ? 2560 : 1024;
    if (dist > rangeLimit) continue;

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
 *
 * Verified from binary ChooseRefuelBase (0x00c566) + ChooseRefuelBaseCost (0x00c71e).
 *
 * Binary base filters (0x00c594-0x00c5d4):
 *   - base.byte[22] & 0x01 must be set (ally base)
 *   - Not blocked (blockedMap[tile] == 0)
 *   - Tank armor >= 5 (unless base has force flag)
 *
 * ChooseRefuelBaseCost gates (0x00c7e0-0x00c7f2 non-urgent path):
 *   - base.armour > 34 (0x22) — base has ≥85% stock for non-urgent refuel
 *   - OR base.armour > 14 (0x0E) with lower urgency thresholds
 *   The base must have meaningful stock; cost scales with distance.
 */
/** Effective pillbox fire range, world_pillbox.ts: shell 1792 + collision 127 = 1919
 *  world units (center-to-center, ~7.5 tiles). */
const PILL_FIRE_RANGE = 1919;

/** True if this base sits within a HOSTILE live pillbox's firing range. A pill shoots
 *  the tank iff it is active, armour > 0, and attackable (enemy/neutral — an ally pill
 *  won't fire at us). Refueling on such a base means sitting still under its guns. */
function baseUnderHostilePill(a4: A4State, base: BaseState): boolean {
  for (const pill of a4.pills) {
    if (!pill.active) continue;
    if (pill.armour <= 0) continue;       // dead pill doesn't fire
    if (!pill.attackable) continue;       // ally pill won't shoot us
    if (bwDist(base.x, base.y, pill.x, pill.y) <= PILL_FIRE_RANGE) return true;
  }
  return false;
}

export function chooseRefuelBase(a4: A4State, state: BrainState): BaseState | null {
  let best: BaseState | null = null;
  let bestCost = 0xFFFF;
  // Last-resort target: the best stocked base even if pill-covered. Only used when NO
  // safe base exists, so a critically-low tank can still flee somewhere instead of
  // freezing at armour 0 with no target.
  let fallback: BaseState | null = null;
  let fallbackCost = 0xFFFF;

  for (const base of a4.bases) {
    if (!base.isAlly) continue;
    if (base.isEnemy) continue;

    // NO armour floor here. The binary gated this on armour ≥ 5 (0x00c5b0), but in this
    // port it DEADLOCKS: at armour < 5 every ally base is skipped → refuelBaseTarget=null
    // → refuelGoalCost returns 0xFFFF → Refuel can't be chosen → the tank can't recover
    // armour → it stays < 5 forever, frozen idle (observed live on SlugfestVII at armour 0
    // with allied bases right there). A critically-low tank must be allowed to flee to the
    // nearest safe ally base — that is exactly when refuel matters most. The cost below
    // already biases toward the closest, lowest-danger base.

    // Binary (0x00c71e): base must have meaningful stock.
    // ChooseRefuelBaseCost returns 0xFFFF when base.armour ≤ 14 (< 40% stock).
    // Use same threshold for our simplified version.
    if (base.armor < 15) continue;

    // Not blocked
    const idx = ((base.tileY & 0xFF) << 8) | (base.tileX & 0xFF);
    if (a4.blockedMap[idx]) continue;

    // Cost: distance + danger penalty (approximates ChooseRefuelBaseCost distance term)
    const distTiles = base.distToTank >> 8;
    const dangerPenalty = a4.dangerMap[idx] * 10;
    const cost = u16(distTiles + dangerPenalty);

    // Track the best stocked base unconditionally as the deadlock fallback.
    if (cost < fallbackCost) {
      fallbackCost = cost;
      fallback = base;
    }

    // RULE: never refuel at a base within a hostile pillbox's firing range — the tank
    // would sit still on the cell and get shredded. Exclude it from the primary pick;
    // it remains eligible only via `fallback` if no safe base exists.
    if (baseUnderHostilePill(a4, base)) continue;

    if (cost < bestCost) {
      bestCost = cost;
      best = base;
    }
  }

  return best ?? fallback;
}

/** True if `base` has a buildable neighbour tile for a carried pillbox (engine rejects
 *  pill/base/boat/deep-sea/forest/wall/shot-wall/water). Mirrors _findPillPlacementTile. */
function baseHasBuildableNeighbor(a4: A4State, base: BaseState): boolean {
  const bx = base.tileX & 0xFF, by = base.tileY & 0xFF;
  const dirs: [number, number][] = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dx, dy] of dirs) {
    const raw = a4.worldMap[((((by + dy) & 0xFF)) << 8) | ((bx + dx) & 0xFF)];
    if (raw & 0x80) continue;
    const t = raw & 0x0F;
    if (t === 0 || t === 5 || t === 8 || t === 9 || t === 10 || t === 11 || t === 12) continue;
    return true;
  }
  return false;
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

    // Must have a buildable neighbour to actually plant the pill — otherwise PlacePill
    // (now top priority while carrying) would lock the tank on an unplaceable base.
    if (!baseHasBuildableNeighbor(a4, base)) continue;

    // DISTANCE-DOMINANT: place the carried pill at the NEAREST suitable ally base. difficulty
    // (0-3, higher near the enemy frontline) is only a small tiebreaker that nudges toward a
    // safer base when distances are close — at the old weight of ×20 it overrode distance
    // entirely (a far safe base beat a near contested one by 40-60 "tiles"), so the tank hauled
    // the pill clear across the map to an edge base, and the target flipped mid-trip as the
    // relative costs shifted. Distance-dominant also self-stabilises: the base being approached
    // keeps getting cheaper, so it stays the pick.
    const distTiles = base.distToTank >> 8;
    const cost = u16(distTiles + base.difficulty * 2);

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
