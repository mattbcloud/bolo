/**
 * aIndy_Think (0x006730) — Main per-tick AI dispatcher
 *
 * The top-level function called by Orona's OronaAdapter each tick at 50 Hz.
 * Implements the original 20-step execution sequence exactly.
 *
 * Reference: aIndy_REFERENCE.md §"aIndy_Think Tick Loop"
 * Tick schedulers: tick_schedulers_decode.md
 */

import { A4State } from './a4_state.js';
import type { BrainState, BrainControls } from './aindy_interface.js';
import { tickCount, Goal } from './aindy_interface.js';
import { syncBrainState } from './brain_init.js';

// Goal selectors and cost wrappers
import {
  baseToKill, baseToGet, pillToGet, pillToFix, manToKill,
  selectTankToKill, chooseRefuelBase, selectBaseToBuild,
  placePillGoalCost, exploreGoalCost, fixPillGoalCost,
  getBaseGoalCost, getManGoalCost, getPillGoalCost,
  killBaseGoalCost, killManGoalCost, killTankGoalCost,
  refuelGoalCost, tourBasesGoalCost,
} from './goal_selectors.js';

// Goal handlers
import {
  goalPlacePill, goalExplore, goalFixPill, goalGetBase, goalGetMan,
  goalGetPill, goalKillBase, goalKillMan, goalKillTank,
  goalRefuel, goalTourBases, goalAnnounce,
} from './goal_handlers.js';

// Combat
import { doCommonStuff as _doCommonStuff } from './combat.js';

// Messages
import { receiveAnyMessages as _receiveAnyMessages, dequeueMessage as _dequeueMessage } from './messages.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOP-LEVEL THINK FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * aIndy_Think — main per-tick AI function.
 *
 * @param a4     Brain's persistent global state (created by brainOpen).
 * @param state  Fresh BrainState from OronaAdapter for this tick.
 * @returns      BrainControls: the steering/firing words to apply to the tank.
 */
export function aIndy_Think(a4: A4State, state: BrainState): BrainControls {

  // ── Step 1: Sync BrainState → A4 (replaces Initialize at 0x0073c6) ───────
  syncBrainState(a4, state);

  // Clear per-tick output control words
  a4.steeringWord = 0;
  a4.firingWord   = 0;
  a4.shotFiredThisTick = 0;

  // ── Step 2: CheckTheKeys (0x009a28) ───────────────────────────────────────
  // Processes keyboard input for manual override. Not applicable in Orona.

  // ── Step 3: AdvantageCheckObjects (0x01b3c6) ──────────────────────────────
  // Updates per-pill/base flags based on current state.
  advantageCheckObjects(a4);

  // ── Step 4: AddTanks (0x021608) ───────────────────────────────────────────
  addTanks(a4, state);

  // ── Step 5: ProcessShots (0x009B4E / CheckShotIncoming wrapper) ──────────
  processShots(a4);

  // ── Step 6: ReceiveAnyMessages ────────────────────────────────────────────
  receiveAnyMessages(a4, state);

  // ── Step 7: Tank-dead cooldown (300 ticks ≈ 5s) ───────────────────────────
  // (Death detection not yet wired — placeholder)

  // ── Step 8: doFrequentStuff — every 5 ticks OR ammo change ───────────────
  const currentAmmo = state.tank.ammo;
  const ammoChanged = currentAmmo !== a4.savedAmmo;
  if ((a4.tickCounter - a4.lastFrequentTick) > 5 || ammoChanged) {
    doFrequentStuff(a4);
    a4.lastFrequentTick = a4.tickCounter;
  }

  // ── Step 9: doNormalStuff — every 180 ticks OR ammo change ───────────────
  if ((a4.tickCounter - a4.lastNormalTick) > 180 || ammoChanged) {
    doNormalStuff(a4);
    a4.lastNormalTick = a4.tickCounter;
  }

  // ── Step 10: doInfrequentStuff — every 1200 ticks (20s) ──────────────────
  if ((a4.tickCounter - a4.lastInfrequentTick) > 1200) {
    doInfrequentStuff(a4);
    a4.lastInfrequentTick = a4.tickCounter;
  }

  // ── Step 11: ChooseGoal (0x0073ee) ────────────────────────────────────────
  const currentGoal = chooseGoal(a4, state);

  // ── Step 12: Goal dispatch (13-way) ───────────────────────────────────────
  dispatchGoal(a4, state, currentGoal);

  // ── Step 12b: Save GetBase goal state for next tick ───────────────────────
  // getBaseWasLastGoal is read by baseToGet() (sticky target) and
  // getBaseGoalCost() (hysteresis discount) on the NEXT tick.
  a4.getBaseWasLastGoal = (currentGoal === Goal.GET_BASE) ? 1 : 0;

  // ── Step 13: DoCommonStuff (0x008212) ─────────────────────────────────────
  doCommonStuff(a4, state);

  // ── Step 14: SetSpeed (0x017810) ──────────────────────────────────────────
  // setSpeed stub (full impl Step 8)

  // ── Step 15: dequeueMessage (0x020798) ────────────────────────────────────
  dequeueMessage(a4);

  // ── Step 16: Borg bits → A4[11678], A4[11682] ────────────────────────────
  if (a4.borgActive) {
    applyBorgBits(a4, state);
  }

  // ── Step 17: Write tank controls from myTank offsets 96/100 ──────────────
  // steeringWord / firingWord already in A4State; returned below.

  // ── Step 18: Save ammo ────────────────────────────────────────────────────
  a4.savedAmmo = state.tank.ammo;

  // ── Step 19: RemoveTanks (0x021668) ──────────────────────────────────────
  removeTanks(a4, state);

  // ── Step 20: TickCount → A4[13722] ───────────────────────────────────────
  a4.wallClockTick = tickCount();

  return { steeringWord: a4.steeringWord, firingWord: a4.firingWord };
}

// ─────────────────────────────────────────────────────────────────────────────
// TICK SCHEDULERS (tick_schedulers_decode.md)
// ─────────────────────────────────────────────────────────────────────────────

function doFrequentStuff(a4: A4State): void {
  a4.distancesFresh = 1;
  computeBaseDist(a4);
  computePillDist(a4);
  computeTankDist(a4);
  a4.closestEnemyTank = _closestEnemyTank(a4);
}

function doNormalStuff(a4: A4State): void {
  computeBasePillDist(a4);
  a4.unspikedBaseCount = countUnspikedBases(a4);
  countBaseTypes(a4);
}

function doInfrequentStuff(a4: A4State): void {
  const allyCog   = centerOfGravity(a4);
  const enemyCog  = enemyCenterOfGravity(a4);
  const frontCog  = frontLineCenterOfGravity(a4);

  a4.allyCogX      = allyCog.x;   a4.allyCogY      = allyCog.y;
  a4.enemyCogX     = enemyCog.x;  a4.enemyCogY     = enemyCog.y;
  a4.frontlineCogX = frontCog.x;  a4.frontlineCogY = frontCog.y;

  computeBaseGravity(a4, allyCog.x, allyCog.y, frontCog.x, frontCog.y);
  computePillGravity(a4, allyCog.x, allyCog.y);
  computeGameStatus(a4);
  updateBaseStocks(a4);
  computeBaseETankDist(a4);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL SELECTION
// ─────────────────────────────────────────────────────────────────────────────

function chooseGoal(a4: A4State, state: BrainState): number {
  // Update all target selectors
  a4.killBaseTarget    = baseToKill(a4, state);
  a4.baseToGetTarget   = baseToGet(a4, state);
  a4.pillToGetTarget   = pillToGet(a4, state);
  a4.pillToFixTarget   = pillToFix(a4, state);
  a4.manToKillTarget   = manToKill(a4, state);
  a4.tankToKillTarget  = selectTankToKill(a4, state);
  a4.refuelBaseTarget  = chooseRefuelBase(a4, state);
  a4.baseToBuildTarget = selectBaseToBuild(a4, state);

  // Update goal cost array
  const g = a4.goals;
  g[Goal.PLACE_PILL].cost = placePillGoalCost(a4, state);
  g[Goal.EXPLORE].cost    = exploreGoalCost(a4, state);
  g[Goal.FIX_PILL].cost   = fixPillGoalCost(a4, state);
  g[Goal.GET_BASE].cost   = getBaseGoalCost(a4, state);
  g[Goal.GET_MAN].cost    = getManGoalCost(a4, state);
  g[Goal.GET_PILL].cost   = getPillGoalCost(a4, state);
  g[Goal.KILL_BASE].cost  = killBaseGoalCost(a4, state);
  g[Goal.KILL_MAN].cost   = killManGoalCost(a4, state);
  g[Goal.KILL_TANK].cost  = killTankGoalCost(a4, state);
  g[Goal.REFUEL].cost     = refuelGoalCost(a4, state);
  g[Goal.TOUR_BASES].cost = tourBasesGoalCost(a4, state);

  return bestGoal(a4);
}

function bestGoal(a4: A4State): number {
  let bestIndex: number = Goal.NO_GOAL;
  let bestCost = 0xFFFF;
  for (const entry of a4.goals) {
    if (entry.cost < bestCost) {
      bestIndex = entry.goalIndex;
      bestCost  = entry.cost;
    }
  }
  return bestIndex;
}

function dispatchGoal(a4: A4State, state: BrainState, goalIndex: number): void {
  switch (goalIndex) {
    case Goal.PLACE_PILL:  goalPlacePill(a4, state);  break;
    case Goal.EXPLORE:     goalExplore(a4, state);     break;
    case Goal.FIX_PILL:    goalFixPill(a4, state);     break;
    case Goal.GET_BASE:    goalGetBase(a4, state);     break;
    case Goal.GET_MAN:     goalGetMan(a4, state);      break;
    case Goal.GET_PILL:    goalGetPill(a4, state);     break;
    case Goal.KILL_BASE:   goalKillBase(a4, state);    break;
    case Goal.KILL_MAN:    goalKillMan(a4, state);     break;
    case Goal.KILL_TANK:   goalKillTank(a4, state);    break;
    case Goal.REFUEL:      goalRefuel(a4, state);      break;
    case Goal.TOUR_BASES:  goalTourBases(a4, state);   break;
    case 11:               goalAnnounce(a4, state);    break;
    default:               /* NO_GOAL: idle */          break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STUBS — to be replaced in later steps
// ─────────────────────────────────────────────────────────────────────────────

function advantageCheckObjects(_a4: A4State): void { /* TODO Step 3 */ }
function addTanks(_a4: A4State, _state: BrainState): void { /* TODO Step 3 */ }
function processShots(_a4: A4State): void { /* TODO Step 10 */ }
function receiveAnyMessages(a4: A4State, state: BrainState): void { _receiveAnyMessages(a4, state); }
function doCommonStuff(a4: A4State, state: BrainState): void {
  const currentGoal = a4.goals.reduce((best, g) =>
    g.cost < best.cost ? g : best, { goalIndex: 12, cost: 0xFFFF }
  ).goalIndex;
  _doCommonStuff(a4, state, currentGoal);
}
function dequeueMessage(a4: A4State): void { _dequeueMessage(a4); }
function applyBorgBits(_a4: A4State, _state: BrainState): void { /* TODO Step 12 */ }
function removeTanks(_a4: A4State, _state: BrainState): void { /* TODO Step 3 */ }

// doFrequentStuff sub-calls
function computeBaseDist(_a4: A4State): void { /* TODO Step 5 */ }
function computePillDist(_a4: A4State): void { /* TODO Step 5 */ }
function computeTankDist(_a4: A4State): void { /* TODO Step 5 */ }

function _closestEnemyTank(a4: A4State): typeof a4.closestEnemyTank {
  let best: typeof a4.closestEnemyTank = null;
  let bestDist = Infinity;
  for (const t of a4.men) {
    if (t.isEnemy && t.active && t.distanceMetric < bestDist) {
      bestDist = t.distanceMetric;
      best = t;
    }
  }
  return best;
}

// doNormalStuff sub-calls
function computeBasePillDist(_a4: A4State): void { /* TODO Step 5 */ }
function countUnspikedBases(_a4: A4State): number { return 0; }
function countBaseTypes(_a4: A4State): void { /* TODO Step 5 */ }

// doInfrequentStuff sub-calls
interface Vec2 { x: number; y: number; }

function centerOfGravity(a4: A4State): Vec2 {
  // Centroid of all active pills + bases — the "centre of action" on the map.
  // Used by exploreGoal to steer random exploration toward playable areas
  // rather than open ocean. Returns BWorld coordinates.
  let sumX = 0, sumY = 0, count = 0;
  for (const pill of a4.pills) {
    if (pill.active) { sumX += pill.x; sumY += pill.y; count++; }
  }
  for (const base of a4.bases) {
    sumX += base.x; sumY += base.y; count++;
  }
  if (count > 0) {
    return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  }
  // Fallback: map centre (128,128 in tile coords = 32896 BWorld)
  return { x: 32896, y: 32896 };
}
function enemyCenterOfGravity(a4: A4State): Vec2 {
  // Centroid of enemy bases and enemy-owned pills
  let sumX = 0, sumY = 0, count = 0;
  for (const base of a4.bases) {
    if (base.isEnemy) { sumX += base.x; sumY += base.y; count++; }
  }
  for (const pill of a4.pills) {
    if (pill.active && pill.attackable) { sumX += pill.x; sumY += pill.y; count++; }
  }
  if (count > 0) return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  return { x: 0, y: 0 };
}
function frontLineCenterOfGravity(a4: A4State): Vec2 {
  // Midpoint between ally CoG and enemy CoG — the contested zone
  const ally  = centerOfGravity(a4);
  const enemy = enemyCenterOfGravity(a4);
  if (enemy.x === 0 && enemy.y === 0) return ally;
  return {
    x: Math.round((ally.x + enemy.x) / 2),
    y: Math.round((ally.y + enemy.y) / 2),
  };
}
function computeBaseGravity(_a4: A4State, _ax: number, _ay: number, _fx: number, _fy: number): void { }
function computePillGravity(_a4: A4State, _ax: number, _ay: number): void { }
function computeGameStatus(_a4: A4State): void { }
function updateBaseStocks(_a4: A4State): void { }
function computeBaseETankDist(_a4: A4State): void { }
