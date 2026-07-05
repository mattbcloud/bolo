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
  getPillCostForPill,
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

  // Clear per-tick output words
  a4.steeringWord        = 0;
  a4.firingWord          = 0;
  a4.shotFiredThisTick   = 0;
  a4.pendingBuilderAction = null;   // cleared each tick; set by goalFixPill / doBuilding
  // coverFireHold is an intra-tick signal: the GetPill cover-fire branch sets it (later this tick)
  // to suppress doCommonStuff so the graze owns the hull. It MUST be cleared here every tick — it
  // was only reset inside goalNewGetPill, so when the goal switched away (GetBase / KillTank) while
  // it was set, it stayed stuck 1 and doCommonStuff early-returned forever, freezing the tank (no
  // base shelling / no enemy fire — both goals rely on doCommonStuff to shoot). Only GetPill re-sets it.
  a4.coverFireHold = 0;
  // coverFinishHold (suppresses the emergency-refuel break-off while finishing a pill from cover) is
  // read cross-tick by refuelGoalCost in ChooseGoal below, so it can't be blanket-cleared here — but
  // it must not leak to other goals (a stuck 1 would keep a wounded GetBase/KillTank tank from
  // refuelling). a4.currentGoal still holds LAST tick's goal here, so clear it unless we were just on
  // GetPill (which re-evaluates it every tick).
  if (a4.currentGoal !== Goal.GET_PILL) a4.coverFinishHold = 0;

  // Clear the builder-dispatched gate (newGetPillAttackMode) when the builder
  // TRANSITIONS from deployed → in-tank (i.e., it just returned).
  // We detect the transition using a previous-tick snapshot rather than
  // clearing it every tick the builder is in-tank (which would allow
  // doBuilding to spam dispatch every tick while the builder is idle).
  if (!state.tank.builderInTank) {
    // Builder is currently deployed — record that.
    a4.prevBuilderWasDeployed = 1;
  } else if (a4.prevBuilderWasDeployed) {
    // Builder just returned to tank this tick — clear the dispatch flag.
    a4.prevBuilderWasDeployed = 0;
    a4.newGetPillAttackMode   = 0;
  }

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

  // ── Step 12b: Save goal state for next tick ───────────────────────────────
  // currentGoal is the D3 input to ChooseGoal next tick (pill commitment +
  // goal hysteresis both read it). getBaseWasLastGoal is kept for the older
  // baseToGet sticky-target and hysteresis-discount logic.
  a4.currentGoal       = currentGoal;
  a4.getBaseWasLastGoal = (currentGoal === Goal.GET_BASE) ? 1 : 0;

  // Snapshot the GOAL's turn intent (nav toward its waypoint, or its own aim) before the
  // opportunistic combat pass. turnTowardsDir routes far turns to the steering word and fine
  // (<=9deg) aim-turns to the firing word; if doCommonStuff then aims at a DIFFERENT target it can
  // set the OPPOSITE turn bit, leaving both CCW(0x04) and CW(0x08) set across the two words. The
  // engine cancels a both-directions turn (turnSpeedup 0) and the tank FREEZES mid-route (live:
  // GetPill/Refuel stuck spinning turn bits at spd=0). We reconcile below by reverting to this.
  const goalSteerTurn = a4.steeringWord & 0x0C;
  const goalFireTurn  = a4.firingWord & 0x0C;

  // ── Step 13: DoCommonStuff (0x008212) ─────────────────────────────────────
  doCommonStuff(a4, state);

  // ── Step 13b: Refuel hold override ────────────────────────────────────────
  // When parked ON a base to refuel, doCommonStuff's opportunistic forward/forward-fire
  // bits (shooting nearby enemies) get OR'd in AFTER the sit-brake. The engine treats
  // accelerating===braking as ZERO acceleration, so those bits cancel the brake and the
  // tank creeps/twitches off the base cell — which resets the engine's ~46-tick refuel
  // timer (it fuels far slower and never looks settled). Force a dead stop here: clear the
  // translation/accel bits (hard-accel 0x01, forward 0x10, forward-fire 0x40; gentle-accel
  // firing 0x01) and set the hard brake. Turning (aim) and stationary fire bits are kept,
  // so the tank can still rotate and shoot from the spot — it just won't drive off.
  const rbt = a4.refuelBaseTarget;
  if (currentGoal === Goal.REFUEL && a4.refuelState === 4 && rbt !== null &&
      a4.tankTileX === rbt.tileX && a4.tankTileY === rbt.tileY) {
    a4.steeringWord &= ~0x51;   // ~(ACCEL_HARD 0x01 | FORWARD 0x10 | FORWARD_FIRE 0x40)
    a4.firingWord   &= ~0x01;   // ~ACCEL_GENTLE
    a4.steeringWord |= 0x02;    // BRAKE_HARD
  }

  // ── PlacePill hold override ───────────────────────────────────────────────
  // Same fix for PlacePill: while holding still to farm a tree or plant the carried pill,
  // doCommonStuff's opportunistic forward bits cancel the brake (accelerating+braking =
  // coast) so the tank drifts off its spot instead of holding. Strip the drive/accel bits
  // and force the brake; turning + stationary fire are kept.
  if (currentGoal === Goal.PLACE_PILL && a4.placePillHold) {
    a4.steeringWord &= ~0x51;
    a4.firingWord   &= ~0x01;
    a4.steeringWord |= 0x02;
  }

  // ── Step 14: SetSpeed (0x017810) ──────────────────────────────────────────
  // setSpeed stub (full impl Step 8)

  // ── Step 15: dequeueMessage (0x020798) ────────────────────────────────────
  dequeueMessage(a4);

  // ── Step 17: Write tank controls from myTank offsets 96/100 ──────────────
  // steeringWord / firingWord already in A4State; returned below.

  // ── Step 18: Save ammo ────────────────────────────────────────────────────
  a4.savedAmmo = state.tank.ammo;

  // ── Step 19: RemoveTanks (0x021668) ──────────────────────────────────────
  removeTanks(a4, state);

  // ── Step 20: TickCount → A4[13722] ───────────────────────────────────────
  a4.wallClockTick = tickCount();

  // ── Turn-bit conflict reconciliation ─────────────────────────────────────
  // If both CCW (0x04) and CW (0x08) are now set (across steering+firing), applyControls would
  // set turningClockwise AND turningCounterClockwise → tank.ts cancels the turn (turnSpeedup=0)
  // and the tank plows straight / freezes off its planned route. This happens when the goal's
  // turn and doCommonStuff's opportunistic aim disagree. Resolve it in favour of the GOAL: revert
  // the turn bits to the pre-doCommonStuff snapshot (nav toward the objective / the goal's own
  // aim), keeping doCommonStuff's non-turn additions (FIRE 0x10 / SHOOT 0x40). The opportunistic
  // fine-aim resumes next tick once the hull has swung toward the goal's target.
  {
    const ccw = !!(a4.steeringWord & 0x04) || !!(a4.firingWord & 0x04);
    const cw  = !!(a4.steeringWord & 0x08) || !!(a4.firingWord & 0x08);
    if (ccw && cw) {
      a4.steeringWord = (a4.steeringWord & ~0x0C) | goalSteerTurn;
      a4.firingWord   = (a4.firingWord   & ~0x0C) | goalFireTurn;
      if ((globalThis as any).__BRAIN_DBG__ !== false) {
        const dbg = ((globalThis as any).__bdbg__ ??= { last: -999 });
        if (a4.tickCounter - dbg.last > 180) {
          const GOALS = ['PlacePill', 'Explore', 'FixPill', 'GetBase', 'GetMan', 'GetPill',
                         'KillBase', 'KillMan', 'KillTank', 'Refuel', 'TourBases'];
          // eslint-disable-next-line no-console
          console.log(`[TURN-RESOLVED] t=${a4.tickCounter} goal=${GOALS[a4.currentGoal] ?? a4.currentGoal} ` +
            `tank(${a4.tankTileX},${a4.tankTileY}) reverted combat aim-turn to goal steering ` +
            `-> steer=0x${a4.steeringWord.toString(16)} fire=0x${a4.firingWord.toString(16)}`);
          dbg.last = a4.tickCounter;
        }
      }
    }
  }
  // ── [/turn reconciliation] ───────────────────────────────────────────────

  return {
    steeringWord:  a4.steeringWord,
    firingWord:    a4.firingWord,
    builderAction: a4.pendingBuilderAction ?? undefined,
  };
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

  // ── Pill commitment ───────────────────────────────────────────────────────
  //
  // The binary (ChooseGoal 0x0074fa) uses A4[12982] as "prev committed pill"
  // but it is ONLY ever CLEARED — never written with a pill pointer — so the
  // binary's commitment never fires in practice.  Stability in the original
  // comes from navigation being direct enough that the cheapest pill stays
  // cheapest as the tank approaches.
  //
  // Our A* routes around obstacles, so the committed pill drifts farther before
  // it gets closer; its cost rises, another pill looks cheaper, and the target
  // switches.  We compensate with an explicit lock:
  //
  // Tier 1 — AP lock (unconditional): once an AP is chosen for the committed
  // pill (newGetPillAPChosen=1), freeze the target regardless of other pills'
  // costs and regardless of what the previous goal was.  The lock breaks only
  // when the pill is gone / captured / blacklisted, or when goalGetPill resets
  // newGetPillAPChosen after 3 AP failures.
  //
  // Tier 2 — Cost gate: before an AP is chosen, prefer the committed pill unless
  // the new candidate is strictly cheaper, or the committed pill is gone.
  const newPill = a4.pillToGetTarget;

  if (a4.prevCommittedPillIndex >= 0) {
    const prevPill = a4.pills.find(p => p.index === a4.prevCommittedPillIndex);
    const prevPillValid = prevPill && prevPill.active && prevPill.attackable;

    if (prevPillValid) {
      if (a4.newGetPillAPChosen) {
        // Tier 1: AP chosen — lock onto the committed pill (survives brief GetBase/Refuel
        // interruptions without resetting the AP). EXCEPTION: break the lock to recover a FREE
        // (0-armour) pill that's now cheaper to grab — it's a no-cost, time-sensitive capture
        // (an enemy could take it first). Don't break off if we're about to finish the committed
        // pill ourselves (armour <= 3) — that one's about to become a free grab too.
        const freeGrab = newPill !== null && newPill.armour === 0 &&
          newPill.index !== a4.prevCommittedPillIndex && (prevPill!.armour & 0xFF) > 3 &&
          getPillCostForPill(a4, state, newPill) < getPillCostForPill(a4, state, prevPill!);
        if (!freeGrab) a4.pillToGetTarget = prevPill;
      } else if (newPill !== null && newPill.index !== a4.prevCommittedPillIndex) {
        // Tier 2: no AP yet — cost-based preference
        if (prevPill!.armour <= 3) {
          a4.pillToGetTarget = prevPill;    // almost dead: finish it
        } else {
          const newCost  = getPillCostForPill(a4, state, newPill);
          const prevCost = getPillCostForPill(a4, state, prevPill!);
          if (newCost >= prevCost) {
            a4.pillToGetTarget = prevPill;  // not strictly cheaper: stay
          }
        }
      }
    }
  }
  // Save pill commitment for the next tick.
  // Use whatever pillToGetTarget is NOW (after commitment): this may differ from
  // what goalGetPill will set (it might null it on AP failure), so we also clear
  // prevCommittedPillIndex when pillToGetTarget is null after goalGetPill via the
  // fact that goalGetPill sets pillToGetTarget=null which persists to the next tick's
  // chooseGoal where pillToGet() returns a new target and prevCommitted is -1.
  a4.prevCommittedPillIndex = a4.pillToGetTarget?.index ?? -1;

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
  // Find the minimum-cost goal across all entries
  let newBestIndex: number = Goal.NO_GOAL;
  let newBestCost = 0xFFFF;
  for (const entry of a4.goals) {
    if (entry.cost < newBestCost) {
      newBestIndex = entry.goalIndex;
      newBestCost  = entry.cost;
    }
  }

  // Goal hysteresis (binary SANE FP comparison at 0x007d6c-0x007dec):
  // Only switch to a new goal if it has STRICTLY lower cost than the current goal.
  // If the new "best" costs MORE than the current goal, keep the current goal —
  // this prevents thrashing when the current goal's cost fluctuates by ±1.
  // Equal cost → keep current goal (binary: equal cost means new goal must not win).
  if (a4.currentGoal !== 12 /* NO_GOAL */ && newBestIndex !== a4.currentGoal) {
    const curEntry = a4.goals.find(g => g.goalIndex === a4.currentGoal);
    const curCost  = curEntry?.cost ?? 0xFFFF;
    if (newBestCost >= curCost) {
      return a4.currentGoal; // stay on current goal
    }
  }

  return newBestIndex;
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
// TICK-LOOP WRAPPERS
// ─────────────────────────────────────────────────────────────────────────────

function receiveAnyMessages(a4: A4State, state: BrainState): void { _receiveAnyMessages(a4, state); }
function doCommonStuff(a4: A4State, state: BrainState): void {
  const currentGoal = a4.goals.reduce((best, g) =>
    g.cost < best.cost ? g : best, { goalIndex: 12, cost: 0xFFFF }
  ).goalIndex;
  _doCommonStuff(a4, state, currentGoal);
}
function dequeueMessage(a4: A4State): void { _dequeueMessage(a4); }

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3: AdvantageCheckObjects / AddTanks / RemoveTanks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AdvantageCheckObjects — refresh per-pill and per-base ownership flags.
 *
 * In multi-brain play this would also set alreadyTargeted/processingBlocked
 * based on ally brain messages. In solo play, just keep attackable consistent
 * with current team ownership (buildBrainState already does this fresh each
 * tick, so this is a safety pass that handles mid-tick changes).
 */
function advantageCheckObjects(a4: A4State): void {
  const myTeam = a4.myTeam;
  for (const pill of a4.pills) {
    if (!pill.active) continue;
    // attackable = not owned by our team (includes neutral pills with ownerByte 0xFF)
    pill.attackable = pill.ownerByte !== myTeam;
  }
  // Base flags (isAlly/isEnemy) are already fresh from buildBrainState each tick.
}

/**
 * AddTanks — Mark enemy builder positions as impassable in the worldMap.
 *
 * VERIFIED from binary (0x021608): for each man (enemy builder) in the game,
 * the original brain ORs 0x40 onto the worldMap byte at that tile.
 * The 0x40 flag marks it as building-flagged terrain (cost 1000 = impassable),
 * preventing the brain from routing through tiles occupied by enemy builders.
 */
function addTanks(a4: A4State, _state: BrainState): void {
  for (const man of a4.men) {
    if (!man.active || !man.isEnemy) continue;
    const tx = (man.x >> 8) & 0xFF;
    const ty = (man.y >> 8) & 0xFF;
    const idx = ((ty & 0xFF) << 8) | (tx & 0xFF);
    a4.worldMap[idx] |= 0x40;
  }
}

/** RemoveTanks — remove tanks that have left visibility. */
function removeTanks(_a4: A4State, _state: BrainState): void {
  // Same as addTanks — Orona provides a fresh men array each tick.
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 5: ProcessShots
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ProcessShots — iterate active shells, update shot-direction frequency table.
 *
 * Full implementation requires shell position data from Orona (not yet wired
 * through buildBrainState). Until then we reset the frequency table each tick
 * so CheckShotIncoming doesn't act on stale data.
 */
function processShots(a4: A4State): void {
  // Reset per-direction shot counters (8 octants).
  // When shot data is available this becomes a full ProcessShots + CheckShotIncoming loop.
  a4.shotDirFrequency.fill(0);
  a4.closeShotCounter = 0;
  a4.shotDirTableResetFlag = 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// doFrequentStuff helpers (ComputeBaseDist / ComputePillDist / ComputeTankDist)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ComputeBaseDist (0x0146F2) — update distToTank for every base.
 * buildBrainState already does this fresh each tick; this pass runs every 5
 * ticks in the original to keep the A4 copy in sync.
 */
function computeBaseDist(a4: A4State): void {
  const tx = a4.tankX, ty = a4.tankY;
  for (const base of a4.bases) {
    const dx = base.x - tx, dy = base.y - ty;
    base.distToTank = Math.round(Math.sqrt(dx * dx + dy * dy));
  }
}

/**
 * ComputePillDist (0x014A76) — update distToTank for every active pill.
 */
function computePillDist(a4: A4State): void {
  const tx = a4.tankX, ty = a4.tankY;
  for (const pill of a4.pills) {
    if (!pill.active) continue;
    const dx = pill.x - tx, dy = pill.y - ty;
    pill.distToTank = Math.round(Math.sqrt(dx * dx + dy * dy));
  }
}

/**
 * ComputeTankDist (0x014B4C) — update distanceMetric for every visible tank.
 */
function computeTankDist(a4: A4State): void {
  const tx = a4.tankX, ty = a4.tankY;
  for (const man of a4.men) {
    if (!man.active) continue;
    const dx = man.x - tx, dy = man.y - ty;
    man.distanceMetric = Math.round(Math.sqrt(dx * dx + dy * dy));
  }
}

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

// ─────────────────────────────────────────────────────────────────────────────
// doNormalStuff helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ComputeBasePillDist (0x0147DA) — refresh per-base pill proximity masks.
 *
 * Scans all active pills within 7 tiles of each base and rebuilds the
 * enemyPillMask / allyPillMask / neutralPillMask bitmasks and minDistToEnemyPill.
 * buildBrainState does an equivalent pass each tick; this 3-second refresh
 * ensures the A4 copy stays consistent after mid-tick pill state changes.
 */
function computeBasePillDist(a4: A4State): void {
  const PILL_RANGE = 7 * 256;
  const myTeam = a4.myTeam;
  for (const base of a4.bases) {
    let neutralMask = 0, allyMask = 0, enemyMask = 0, minEnemyDist = 0xFFFF;
    for (const pill of a4.pills) {
      if (!pill.active) continue;
      const pdx = Math.abs(pill.x - base.x);
      const pdy = Math.abs(pill.y - base.y);
      if (pdx >= PILL_RANGE || pdy >= PILL_RANGE) continue;
      const bit = 1 << (pill.index & 0x1F);
      if (pill.ownerByte === myTeam) {
        allyMask |= bit;
      } else if (pill.ownerByte === 0xFF || pill.ownerByte == null) {
        neutralMask |= bit;
      } else {
        enemyMask |= bit;
        const dist = Math.round(Math.sqrt(pdx * pdx + pdy * pdy));
        if (dist < minEnemyDist) minEnemyDist = dist;
      }
    }
    base.neutralPillMask    = neutralMask;
    base.allyPillMask       = allyMask;
    base.enemyPillMask      = enemyMask;
    base.minDistToEnemyPill = minEnemyDist;
  }
}

/**
 * CountUnspikedBases (0x0143E0) — count neutral/ally bases that have no
 * defensive (ally) pills nearby.  These are the most exposed bases.
 */
function countUnspikedBases(a4: A4State): number {
  let count = 0;
  for (const base of a4.bases) {
    if (base.isEnemy) continue;        // enemy bases don't count
    if (base.allyPillMask !== 0) continue;  // has defensive pills → "spiked"
    count++;
  }
  return count;
}

/**
 * CountBaseTypes (0x013E42) — categorize bases by ownership.
 *
 * In the original this refreshed base.byte[22] flags.  Our isAlly/isEnemy
 * fields are set fresh each tick by buildBrainState, so this is a no-op.
 */
function countBaseTypes(_a4: A4State): void { }

// ─────────────────────────────────────────────────────────────────────────────
// doInfrequentStuff helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Vec2 { x: number; y: number; }

function centerOfGravity(a4: A4State): Vec2 {
  let sumX = 0, sumY = 0, count = 0;
  for (const pill of a4.pills) {
    if (pill.active) { sumX += pill.x; sumY += pill.y; count++; }
  }
  for (const base of a4.bases) {
    sumX += base.x; sumY += base.y; count++;
  }
  if (count > 0) return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
  return { x: 32896, y: 32896 };  // fallback: map centre
}

function enemyCenterOfGravity(a4: A4State): Vec2 {
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
  const ally  = centerOfGravity(a4);
  const enemy = enemyCenterOfGravity(a4);
  if (enemy.x === 0 && enemy.y === 0) return ally;
  return {
    x: Math.round((ally.x + enemy.x) / 2),
    y: Math.round((ally.y + enemy.y) / 2),
  };
}

/**
 * ComputeBaseGravity — update per-base distances to the ally and frontline
 * centres of gravity.  These feed into base difficulty and refuel cost.
 */
function computeBaseGravity(a4: A4State, ax: number, ay: number, fx: number, fy: number): void {
  for (const base of a4.bases) {
    const adx = base.x - ax, ady = base.y - ay;
    base.distToAllyCoG  = Math.round(Math.sqrt(adx * adx + ady * ady));
    const fdx = base.x - fx, fdy = base.y - fy;
    base.distToFrontline = Math.round(Math.sqrt(fdx * fdx + fdy * fdy));
    // Recompute difficulty tier from updated CoG distances.
    // Tier 0-3: bases closest to enemy frontline are hardest.
    const ecx = a4.enemyCogX, ecy = a4.enemyCogY;
    if (ecx !== 0 || ecy !== 0) {
      const edx = base.x - ecx, edy = base.y - ecy;
      const distToEnemy = Math.round(Math.sqrt(edx * edx + edy * edy));
      base.difficulty = Math.max(0, 3 - Math.min(3, Math.floor(distToEnemy / 3840)));
    }
  }
}

/**
 * ComputePillGravity — update per-pill distances to the ally CoG.
 * Currently no pill field stores this; keeping as a no-op until needed.
 */
function computePillGravity(_a4: A4State, _ax: number, _ay: number): void { }

/**
 * ComputeGameStatus — compute the current game score ratio into a4.gameScoreRatio.
 * Used for strategic decision weighting (not yet consumed by any goal selector).
 */
function computeGameStatus(a4: A4State): void {
  const total = a4.bases.length;
  if (total === 0) { a4.gameScoreRatio = 0.5; return; }
  const allyCount = a4.bases.filter(b => b.isAlly).length;
  a4.gameScoreRatio = allyCount / total;
}

/**
 * UpdateBaseStocks (0x0180F8) — refresh whether each base has resupply stock.
 * In our model base.armor > 0 means the base has supplies.  buildBrainState
 * already sets this from Orona's b.armour each tick, so this is a safety pass.
 */
function updateBaseStocks(a4: A4State): void {
  for (const base of a4.bases) {
    // base.armor is set from Orona armour field each tick by buildBrainState.
    // defended flag: base has shells if it's ally-owned with stock.
    base.defended = base.isAlly && base.armor > 0;
  }
}

/**
 * ComputeBaseETankDist — update each base's distance to the closest enemy tank.
 * Used to prioritise defending bases that are actively threatened.
 */
function computeBaseETankDist(a4: A4State): void {
  for (const base of a4.bases) {
    let minDist = 0xFFFF;
    for (const tank of a4.men) {
      if (!tank.active || !tank.isEnemy) continue;
      const dx = tank.x - base.x, dy = tank.y - base.y;
      const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
      if (dist < minDist) minDist = dist;
    }
    // distToAllyCoG is the only available numeric slot we re-purpose for enemy
    // tank proximity in KillBase logic; use a separate dedicated scratch field.
    // For now store in minDistToEnemyPill as a secondary metric if no enemy pills.
    if (minDist < base.minDistToEnemyPill) base.minDistToEnemyPill = minDist;
  }
}
