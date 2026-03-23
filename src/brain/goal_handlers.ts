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
import { directionTo } from './pathfinding.js';
import { navigateToCoords as _navigateToCoords, setSpeed as _setSpeed } from './navigation.js';
// _navigateToCoords now has signature (a4, targetX, targetY, mode) — no state needed
import {
  shoot as _shoot, aimAt as _aimAt, chooseAttackPosition as _chooseAP, shootPill as _shootPill,
  findSafestPointFrom as _findSafestPointFrom,
} from './combat.js';
import {
  newRefuel as _newRefuel, refuelGoTowardBase as _refuelGTB,
  placePillSurveyTerrain as _ppSurvey, placePillChoosePlacement as _ppChoose,
  placePillGotoBuildPoint as _ppGoto, placePillFinishUp as _ppFinish,
  dropMines as _dropMines,
} from './building.js';

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
  const target = a4.baseToBuildTarget;
  if (target === null) return;

  // Load BaseToBuild coordinates
  a4.placePillBaseTileX = target.tileX;
  a4.placePillBaseTileY = target.tileY;
  a4.placePillBaseBWorldX = target.x;
  a4.placePillBaseBWorldY = target.y;

  switch (a4.placePillSubState) {
    case 0: placePillSurveyTerrain(a4, state); break;
    case 1: placePillChoosePlacement(a4, state); break;
    case 2: placePillGotoBuildPoint(a4, state); break;
    case 3: placePillFinishUp(a4, state); break;
    default:
      a4.placePillSubState = 0;
      break;
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
 * Up to 40 attempts so land tiles are reliably found on ocean-heavy maps
 * where 70–80% of tiles are water (rejected).
 */
function _findNewExploreTarget(a4: A4State, state: BrainState): void {
  const startMs = Date.now();
  let bestCost = 0xFFFF;
  let bestX = 0, bestY = 0;

  for (let attempt = 0; attempt < 40; attempt++) {
    if (Date.now() - startMs > 200) break;

    // Biased random coordinate (0–255, avoid map edges)
    let rx = Math.abs(biasedRandom()) & 0xFF;
    let ry = Math.abs(biasedRandom()) & 0xFF;

    // Edge avoidance: 18–237
    if (rx < 18 || rx > 237 || ry < 18 || ry > 237) continue;

    // Water check
    const cell = a4.worldMap[((ry & 0xFF) << 8) | (rx & 0xFF)] & 0x0F;
    const penalty = EXPLORE_TERRAIN_PENALTY[cell] ?? 500;
    if (penalty >= 500) continue;

    // Cost: distance from ally CoG + terrain penalty
    const cogDX = Math.abs((rx << 8) - a4.allyCogX) >> 8;
    const cogDY = Math.abs((ry << 8) - a4.allyCogY) >> 8;
    const tankDX = Math.abs(rx - a4.tankTileX);
    const tankDY = Math.abs(ry - a4.tankTileY);
    const cost = tankDX + tankDY + cogDX + cogDY + penalty;

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
  60,   //  5 forest        → slightly less preferred than road (chopping takes time)
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
 * FixPill — Repair a damaged ally pill.
 *
 * State paths:
 *   A. Unsafe pill location: find safe approach → navigate
 *   B. In-range (armed): dispatch man for repair
 *   C. Safe + close: dispatch man
 *   D. Safe + far: navigate to pill
 *
 * See fixpill_decode.md for full 1312-byte algorithm.
 */
export function goalFixPill(a4: A4State, state: BrainState): void {
  const pill = a4.pillToFixTarget;
  if (pill === null) return;

  // Target change detection
  if (pill !== a4.fixPillPrevTarget) {
    a4.fixPillPrevTarget = pill;
    a4.fixPillInRange = 0;
    a4.fixPillSafePointFound = 0;
    a4.fixPillSendBroadcast = 1;
  }

  const pillTileX = pill.tileX;
  const pillTileY = pill.tileY;
  const tileIdx = ((pillTileY & 0xFF) << 8) | (pillTileX & 0xFF);

  // Safety check: is pill tile dangerous/blocked?
  const isDangerous = a4.dangerMap[tileIdx] !== 0;
  const isBlocked   = a4.blockedMap[tileIdx] !== 0;

  // Broadcast target to team (SendPillTargetMessage)
  if (a4.fixPillSendBroadcast) {
    a4.fixPillSendBroadcast = 0;
    // sendPillTargetMessage(a4, pill);  // TODO Step 11
  }

  if (isDangerous || isBlocked) {
    // ── Unsafe path: find safe approach point via FindSafestPointFrom ───
    if (!a4.fixPillSafePointFound) {
      const safe = _findSafestPointFrom(a4, state, pill.x, pill.y);
      a4.fixPillSafeX = safe.x;
      a4.fixPillSafeY = safe.y;
      a4.fixPillSafePointFound = 1;
    }
    navigateToCoords(a4,
      (a4.fixPillSafeX << 8) + 128,
      (a4.fixPillSafeY << 8) + 128, 0);
    return;
  }

  // ── Safe path ──────────────────────────────────────────────────────────
  const dist = pill.distToTank;

  if (dist < 512) {
    // Very close: dispatch man for repair
    setSpeed(a4, 0);
    if (a4.myMan !== null) {
      // SetManTime / dispatch man here
      a4.myMan.actionCode = 4;  // REPAIR
      a4.fixPillInRange = 1;
    }
  } else {
    // Far: navigate to pill
    navigateToCoords(a4, pill.x, pill.y, 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL 3 — GetBase (0x001716)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GetBase — Navigate to and capture an enemy base.
 *
 * Minimal handler: just navigate to the base.
 * Actual capture is triggered by DoCommonStuff when man is deployed.
 *
 * See getbase_decode.md.
 */
export function goalGetBase(a4: A4State, state: BrainState): void {
  const target = a4.baseToGetTarget;
  if (target === null) return;

  // Target change detection
  if (target !== a4.getBaseChangeDetectionPtr) {
    a4.getBaseChangeDetectionPtr = target;
    a4.killBaseCurrentTarget = target;  // KillBase target copy

    // Team bitmask validation (purpose: team coordination message flag)
    const pillBitmask = a4.pillBitmaskTable[state.tank.menInGame & 0x0F] >>> 0;
    if ((a4.teamBitmask ^ pillBitmask) !== 0) {
      a4.getBaseTeamMismatch = 1;
    }
  }

  // Navigate to base — Orona captures the base automatically when the tank
  // drives over it. No builder dispatch needed.
  navigateToCoords(a4, target.x, target.y, 0);

  // If navigation signals this destination is unreachable (solid wall between
  // tank and base, A* got ∞ for tank tile), clear the target so the selector
  // picks a different base next tick rather than getting stuck forever.
  if (a4.noLocalRouteFlag) {
    a4.baseToGetTarget = null;
    a4.noLocalRouteFlag = 0;
  }

  // Send team coordination message on mismatch
  if (a4.getBaseTeamMismatch && !a4.worldCostsInitDone) {
    a4.getBaseTeamMismatch = 0;
    // sendMessage(a4, target.index, ...);  // TODO Step 11
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

  // ── Dispatch state machine ────────────────────────────────────────────
  if (!a4.getManDispatched) {
    // Not yet dispatched: navigate to man position
    navigateToCoords(a4, man.x, man.y, 0);

    // Check dispatch conditions
    const altX = state.tank.altX;
    const altY = state.tank.altY;

    // If close enough: dispatch man
    const dx = Math.abs((a4.tankTileX << 8) - man.x);
    const dy = Math.abs((a4.tankTileY << 8) - man.y);

    if (dx < 512 && dy < 512) {
      a4.getManDispatched = 1;
      a4.getManTargetX = man.x & 0xFFFF;
      a4.getManTargetY = man.y & 0xFFFF;
      a4.getManLastEventTick = a4.tickCounter;
    }
  } else {
    // Already dispatched: navigate to saved target
    navigateToCoords(a4, a4.getManTargetX, a4.getManTargetY, 0);
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
export function goalNewGetPill(a4: A4State, state: BrainState): void {
  const pill = a4.pillToGetTarget;
  if (pill === null) return;

  // Phase 0: Target change detection
  if (pill !== a4.newGetPillTargetCopy) {
    a4.newGetPillAPChosen = 0;
    a4.newGetPillApproachModeA = 0;
    a4.newGetPillApproachModeB = 0;
    a4.newGetPillSpeedTier = 0;
    a4.newGetPillWaitPlaceChosen = 0;
    a4.newGetPillSameTarget = 0;
    a4.newGetPillTargetCopy = pill;
    a4.newGetPillPillCopy = pill;
    a4.chooseAPLastSector = -1;    // reset sector bias for fresh target
  }

  // Same-target detection
  if (pill === a4.prevPillTarget) {
    a4.newGetPillSameTarget = 1;
  } else {
    a4.prevPillTarget = pill;
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
  }

  // Phase 4: Navigate to AP (if not already there)
  const myTX = a4.tankTileX;
  const myTY = a4.tankTileY;
  const apTX = (a4.newGetPillAPX >> 8) & 0xFF;
  const apTY = (a4.newGetPillAPY >> 8) & 0xFF;

  if (myTX !== apTX || myTY !== apTY) {
    // Not at AP: navigate
    navigateToCoords(a4, a4.newGetPillAPX, a4.newGetPillAPY, 0);

    // Stall detection: if stuck >10s, replan AP biased away from failed sector
    if (a4.newGetPillStallTick === 0) {
      a4.newGetPillStallTick = a4.tickCounter;
    } else if (a4.tickCounter - a4.newGetPillStallTick > 600) {
      // Record the sector of the failed AP (pill→AP direction, mapped to 0-39)
      // so ChooseAttackPosition can penalise that sector and pick a different angle
      const dirPillToAP = directionTo(pill.x, pill.y, a4.newGetPillAPX, a4.newGetPillAPY);
      a4.chooseAPLastSector = Math.floor((dirPillToAP & 0xFF) * 40 / 256);
      a4.newGetPillAPChosen = 0;
      a4.newGetPillStallTick = 0;
    }
    return;
  }

  // At AP: clear stall timer
  a4.newGetPillStallTick = 0;

  // Phase 5: Attack — aim at pill and fire using ShootPill
  const dirToPill = directionTo(state.tank.x, state.tank.y, pill.x, pill.y);
  a4.shootPillDirection = dirToPill & 0xFF;
  _shootPill(a4, state, pill, dirToPill & 0xFF, 0);
  a4.pillApproachInProgress = 1;

  // Phase 6: When pill is fully depleted (armor=0, captureDifficulty=0) or
  // already neutral, dispatch the builder to capture it.
  // Orona uses team=255 (0xFF) for neutral pills; aIndy original used 16.
  const pillDepleted = pill.captureDifficulty === 0;   // armor shot to 0
  const pillNeutral  = (pill.ownerByte & 0xFF) === 0xFF || (pill.ownerByte & 0xFF) === 16;
  if ((pillDepleted || pillNeutral) && pill.distToTank < 1024 && a4.myMan !== null) {
    a4.myMan.actionCode = 2;   // PLACE_PILL (send builder to capture)
  }
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

  // Target changed
  if (target !== a4.killBasePrevTarget) {
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
      // Medium range: turn toward man and fire
      _aimAt(a4, state, man.x, man.y, 1);
      setSpeed(a4, 0);
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
 * Multi-phase with lead calculation, escape logic, stutter-step mode.
 *
 * See killtank_decode.md for full 348-instruction algorithm.
 */
export function goalKillTank(a4: A4State, state: BrainState): void {
  const target = a4.tankToKillTarget;
  if (target === null) return;

  const dist = target.distanceMetric;

  // Escape check: low ammo and vulnerable
  if (state.tank.ammo < 4 && state.tank.pillsCarried === 0) {
    const safeBase = a4.closestAllyBase;
    if (safeBase !== null && safeBase.distToTank <= 1280 && safeBase.defended) {
      navigateToCoords(a4, safeBase.x, safeBase.y, 1);
      return;
    }
  }

  // Set attack flag if within range
  if (dist < 3072) {
    a4.newGetPillAttackMode = 1;   // A4[13586]
  }

  // Distance-based dispatch
  if (dist > 1792) {
    // Far: navigate to lead position
    navigateToCoords(a4, target.x, target.y, 0);
  } else if (dist > 1024) {
    // Medium: stop and shoot (pass state so real Shoot() runs)
    setSpeed(a4, 0);
    shoot(a4, target.x, target.y, state);
  } else if (dist > 256) {
    // Close: stop and shoot
    setSpeed(a4, 0);
    shoot(a4, target.x, target.y, state);
  } else {
    // Very close: stop and shoot
    setSpeed(a4, 0);
    shoot(a4, target.x, target.y, state);
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
      // Idle → find refuel base
      a4.refuelState = 1;
      break;

    case 1:
      // Select base — use NewRefuel (simpler direct approach)
      goalNewRefuel(a4, state);
      break;

    case 2:
      // Navigate waypoints
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
  setSpeed(a4, 0);   // stop at base

  // Check if full
  if (state.tank.armor >= 40 && state.tank.ammo >= 8) {
    a4.refuelState = 0;
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
    // Cycle complete: reset candidate flags from reset table
    for (const base of a4.bases) {
      const idx = base.index & 0x0F;
      a4.tourBasesCandidateFlags[idx] = a4.tourBasesResetTable[idx];
    }
    return;
  }

  // Navigate to nearest unvisited base
  navigateToCoords(a4, best.x, best.y, 0);

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
