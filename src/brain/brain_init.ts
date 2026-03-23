/**
 * BrainOpen / BrainClose — aIndy3.1 TypeScript Port
 *
 * BrainOpen (0x0052c2): one-time initialization called when the brain activates.
 * BrainClose (0x005c6c): cleanup called when the brain deactivates.
 * InitializeCosts (0x02123e): one-time A* terrain cost table setup.
 *
 * In the Mac binary, BrainOpen allocated heap blocks, set up keymap/resource
 * handles, initialized pill/base/man arrays from the TankRecord, and called
 * StartUpRoutes → InitializeCosts.
 *
 * In this port:
 *   - Memory allocation is replaced by typed arrays pre-allocated in A4State.
 *   - Mac OS calls (GetResource, HLock, TickCount, etc.) are replaced by
 *     TypeScript equivalents or no-ops.
 *   - BrainOpen returns `null` if the brain is not enabled (borgProximityGate == 0).
 */

import { A4State } from './a4_state.js';
import type { BrainState, TankState, PillState, BaseState, ManState } from './aindy_interface.js';
import { tickCount, PILL_BITMASK } from './aindy_interface.js';

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN OPEN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BrainOpen (0x0052c2) — Initialize brain state.
 *
 * Must be called once before the first tick. Corresponds to the startup
 * sequence documented in brainopen_decode.md.
 *
 * @param initialState BrainState snapshot at the moment the brain activates.
 * @returns Initialized A4State on success, null if brain is not enabled.
 */
export function brainOpen(initialState: BrainState): A4State | null {
  // ── Step 1: Check Borg proximity gate (TankRecord+171 → A4[12861]) ────────
  // If zero, brain is not enabled → abort.
  if (initialState.tank.borgProximityGate === 0) {
    return null;
  }

  const a4 = new A4State();

  // ── Step 1 (cont.): Store Borg settings ───────────────────────────────────
  a4.borgProximityGate = initialState.tank.borgProximityGate;   // A4[12861]
  a4.setGlobalsGate    = initialState.tank.borgNavCommit;        // A4[12862]

  // ── Steps 2–8: Keymap / resource / message queue init ─────────────────────
  // (Mac OS specific: GetResource, readKeyMaps, AllocateSmallBlocks, etc.)
  // No-ops in the TypeScript port — all memory is pre-allocated in A4State.

  // ── Step 15: InitialiseTrigTables ─────────────────────────────────────────
  // In original: copies pre-built slope tables into heap blocks and stores ptrs.
  // In port: LFD_X/Y_SLOPES, STUARTS_X/Y are module-level constants; nothing to do.

  // ── Step 16: StartUpPills → pill array init ────────────────────────────────
  // (Partial from BrainOpen step 20; full pill data comes from BrainState)

  // ── Step 17: Initialize owner map (65536 bytes → 0x10) ────────────────────
  a4.ownerMap.fill(0x10);   // neutral owner for every tile (BrainOpen step 17)

  // ── Step 18: Initialize visit map (65536 bytes → 0) ───────────────────────
  a4.visitMap.fill(0);

  // ── Step 19: TickCount → A4[11726] ────────────────────────────────────────
  a4.tickCounter = tickCount();
  a4.wallClockTick = a4.tickCounter;

  // ── Step 20: Initialize pill array ────────────────────────────────────────
  // Sync from BrainState (Orona provides live pill data).
  _syncPills(a4, initialState);

  // ── Step 22–24: InitializeMen + ally men array init ───────────────────────
  _syncMen(a4, initialState);

  // ── Step 26: Mass A4 initialization ───────────────────────────────────────
  // Team bitmask from pill bitmask table: PILL_BITMASK[myTank.byte[24]]
  const myTeam = initialState.tank.team & 0x0F;
  a4.teamBitmask     = PILL_BITMASK[myTeam];
  a4.teamBitmaskCopy = PILL_BITMASK[myTeam];

  // Timing params (init = 9/20/9/20/9/20)
  a4.timingA0 = 9; a4.timingA1 = 20;
  a4.timingB0 = 9; a4.timingB1 = 20;
  a4.timingC0 = 9; a4.timingC1 = 20;

  // Various flag clears
  a4.pillApproachInProgress  = 0;  // A4[13601]
  a4.getBaseChangeDetectionPtr = null;  // A4[13870]
  a4.fixPillPrevTarget       = null;   // A4[13874]

  // ── Step 27: myTank.byte[25] → A4[13024] ──────────────────────────────────
  a4.myTeam    = initialState.tank.team & 0xFF;
  a4.tankByte21 = 0;  // A4[13717] (tank.byte[21] — not exposed in BrainState)

  // ── Step 28: Init 5×5 FindTree scan table (done in constructor) ──────────
  // Already performed in A4State constructor.

  // ── Step 29: myTank.byte[169] → A4[12862] ─────────────────────────────────
  // borgNavCommit already set at step 1.

  // ── Step 31: Count bases from player_list ─────────────────────────────────
  a4.baseCount = initialState.baseCount;
  a4.pillCount = initialState.pillCount;

  // ── InitializeCosts (called by StartUpRoutes) ──────────────────────────────
  initializeCosts(a4);

  // ── Sync initial map state ─────────────────────────────────────────────────
  syncBrainState(a4, initialState);

  return a4;
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN CLOSE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BrainClose (0x005c6c) — Teardown.
 *
 * In the original, released resource handles and disposed all heap blocks.
 * In TypeScript, GC handles memory; this is a logical cleanup only.
 */
export function brainClose(_a4: A4State): void {
  // BrainClose step 1: check team bitmask change and send message if changed.
  // (Message system not yet ported — skip for now.)

  // Steps 2–9: ReleaseResource / HUnlockAll / CloseDownRoutes / DisposeAllBlocks
  // All no-ops in TypeScript port (GC handles memory).
}

// ─────────────────────────────────────────────────────────────────────────────
// INITIALIZE COSTS (0x02123e)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * InitializeCosts — one-time A* terrain traversal cost table setup.
 * Called from StartUpRoutes at brain startup.
 *
 * Fills examineTerrainCostTable[0..255] with per-terrain traversal weights.
 * The table is indexed by the raw worldMap byte:
 *   bits 0-3: terrain type (0-12)
 *   bit  6:   building/structure flag (0x40) — cost stays at 1000
 *   bit  7:   water flag (0x80)              — cost = 19
 *
 * See routing_init_decode.md for full documentation.
 */
export function initializeCosts(a4: A4State): void {
  const costs = a4.examineTerrainCostTable;

  // Default fill: 1000 (0x03E8) — effectively blocked / never route through
  costs.fill(1000);

  // Per-terrain-type specific costs (index = terrain type 0-15):
  costs[2]  = 16;   // swamp
  costs[3]  = 17;   // crater
  costs[4]  = 3;    // road (cheapest passable terrain)
  costs[5]  = 10;   // forest — tanks chop trees as they pass; only slightly harder than grass
  costs[6]  = 16;   // rubble
  costs[7]  = 4;    // grass
  costs[9]  = 4;    // river + boat
  costs[11] = 3;    // base tile
  costs[12] = 8;    // pill slot — passable
  costs[13] = 3;    // mystery type 13 (base entrance variant?)
  // Terrain 0 (wall), 1 (river), 8 (shot wall), 10 (deep sea) remain at 1000 (blocked).

  // Water-flagged terrain: raw byte 0x80..0x8C (bit 7 set, terrain 0..12) → 19
  for (let i = 0x80; i <= 0x8C; i++) {
    costs[i] = 19;
  }
  // Building-flagged terrain: raw byte 0x40..0x4C (bit 6 set) → stays at 1000.
  // (Already filled by the .fill(1000) above.)

  // Routing cost parameters at A4[7582-7608] (14 words adjacent to cost table):
  a4.routingCostParams.set([300, 200, 64, 64, 64, 43, 64, 21, 200, 64, 64, 64, 16, 21]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC BRAIN STATE INTO A4 (called every tick)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync the Orona-provided BrainState into the A4 global state.
 * Called at the start of each tick before aIndy_Think runs.
 *
 * Copies map arrays, object lists, tank position, and counters.
 * Preserves all brain-internal state (goals, targets, routing scratch, etc.).
 */
export function syncBrainState(a4: A4State, state: BrainState): void {
  // ── Copy map arrays ────────────────────────────────────────────────────────
  a4.worldMap.set(state.worldMap);
  a4.dangerMap.set(state.dangerMap);
  a4.blockedMap.set(state.blockedMap);
  a4.occupancyMap.set(state.occupancyMap);
  a4.allyMap.set(state.allyMap);
  a4.sightMap.set(state.sightMap);
  // Note: visitMap and ownerMap are brain-internal (NOT overwritten each tick).

  // ── Copy object lists ──────────────────────────────────────────────────────
  a4.pills = state.pills;
  a4.bases = state.bases;
  a4.pillCount = state.pillCount;
  a4.baseCount = state.baseCount;

  // ── Copy tank state ────────────────────────────────────────────────────────
  const t = state.tank;
  a4.tankTileX    = t.tileX;
  a4.tankTileY    = t.tileY;
  a4.tankPackedPos = (t.tileX << 8) | t.tileY;
  a4.tankX        = t.x & 0xFFFF;
  a4.tankY        = t.y & 0xFFFF;
  a4.tankDirection = t.direction & 0xFF;
  // tankSpeed stays at whatever the brain last set (no Orona speed in TankState)
  a4.myTeam       = t.team;

  // ── Copy man (builder) ─────────────────────────────────────────────────────
  a4.myMan = t.manPtr;

  // ── Update counters ────────────────────────────────────────────────────────
  a4.teamBitmask = state.teamBitmask;
  a4.tickCounter = state.tickCounter;
  // wallClockTick updated at end of each tick by aIndy_Think step 20.
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIVATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Sync pill states from BrainState (BrainOpen step 20) */
function _syncPills(a4: A4State, state: BrainState): void {
  a4.pills = state.pills;
  a4.pillCount = state.pillCount;
}

/** Sync men/tank states from BrainState (BrainOpen steps 22-24) */
function _syncMen(a4: A4State, state: BrainState): void {
  a4.men = state.tanks;
  a4.myMan = state.tank.manPtr;

  // Men-target array (stride=10, count=menInGame)
  const menCount = state.tank.menInGame;
  a4.menTargets = Array.from({ length: menCount }, (_, i) => ({
    index: i,
    wx: 0,
    wy: 0,
    b7: 0,
    b8: 0,
  }));
}
