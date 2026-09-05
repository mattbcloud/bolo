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
 *   - BrainOpen initialises all A4 state and returns the A4State object.
 */

import { A4State } from './a4_state.js';
import type { BrainState, TankState, PillState, BaseState, ManState } from './aindy_interface.js';
import { tickCount, PILL_BITMASK, resetStaticTerrainCache } from './aindy_interface.js';
import { updateAimTracker } from './pathfinding.js';

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
  // Reset static terrain cache for the new game/map
  resetStaticTerrainCache();

  const a4 = new A4State();

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

  // ── Force doInfrequentStuff on tick 1 ────────────────────────────────────
  // doInfrequentStuff computes CoG (allyCogX/Y etc.) used by Explore and cost
  // functions. Setting lastInfrequentTick far in the past ensures it runs on
  // the very first tick rather than waiting 20 seconds (1200 ticks).
  a4.lastInfrequentTick = -1201;

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

  // Per-terrain-type specific costs — VERIFIED from InitializeCosts (0x02123e):
  // costs[2] = 0x0010 = 16 (swamp)
  // costs[3] = 0x0011 = 17 (crater)
  // costs[4] = 0x0003 = 3  (road — cheapest)
  // costs[5] = 1000 (forest — IMPASSABLE, binary: NOT set, stays at default 1000)
  // costs[6] = 0x0010 = 16 (rubble)
  // costs[7] = 0x0004 = 4  (grass)
  // costs[9] = 0x0004 = 4  (river+boat)
  // costs[11]= 0x0003 = 3  (base entrance)
  // costs[12]= 1000 (pill slot — special-cased in Examine, default 1000)
  // costs[13]= 0x0003 = 3  (type-13 base entrance variant)
  costs[2]  = 16;    // swamp
  costs[3]  = 17;    // crater
  costs[4]  = 3;     // road
  // Forest (5): PASSABLE. The Orona engine (world_map.ts) gives forest
  // tankSpeed=6 — tanks drive through it (slower than grass=12, faster than
  // swamp=3). The old "forest is a hard wall" comment was wrong for this engine
  // and made the brain freeze whenever a target pill sat in forest (no attack
  // position could be found). Cost follows the engine's speed→cost relation
  // (≈48/speed): road 16→3, grass 12→4, swamp 3→16, so forest 6→8.
  costs[5]  = 8;     // forest
  costs[6]  = 16;    // rubble
  costs[7]  = 4;     // grass
  costs[9]  = 4;     // river + boat
  costs[11] = 3;     // base tile
  // costs[12] = 1000 (pill slot — impassable; binary Examine special-cases pills:
  //   armed pill → 1000, dead/empty → 0.  We always treat pills as barriers
  //   and navigate around them; the close-range code drives onto armour=0 pills.)
  // Already 1000 from fill(1000) above.
  costs[13] = 3;     // type 13

  // Water-flagged terrain: 0x80 | terrainType (indices 128-140).
  // VERIFIED from binary loop at 0x021298: all filled with 0x0013 = 19.
  // Cost 19 means water (with boat) is slightly more expensive than road (3)
  // but perfectly navigable. The original brain treats water as a normal route
  // when boats are available — this is the primary means of crossing Bolo maps.
  for (let i = 0x80; i <= 0x8C; i++) {
    costs[i] = 19;
  }
  // Building-flagged terrain: 0x40 | terrainType (indices 64-76).
  // VERIFIED from binary loop at 0x0212b4: all filled with 0x03E8 = 1000.
  // Already 1000 from the .fill(1000) above, but explicit for clarity.
  for (let i = 0x40; i <= 0x4C; i++) {
    costs[i] = 1000;
  }

  // Routing cost parameters at A4[7582-7608] (14 words adjacent to cost table):
  a4.routingCostParams.set([300, 200, 64, 64, 64, 43, 64, 21, 200, 64, 64, 64, 16, 21]);
}

// ─────────────────────────────────────────────────────────────────────────────
// SET ROUTE COSTS (0x021332) — Dynamic cost table update based on game state
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SetRouteCosts — Update examineTerrainCostTable entries based on tank state.
 * Called before WorldRouteFind to set terrain traversal costs.
 *
 * Verified from binary (0x021332):
 *
 *   costs[0]  wall:      26 when armor ≥ 5 (bulldozable), else 1000
 *   costs[8]  shot-wall: 24 when armor > 0, else 1000
 *   costs[1]  river:     3 in normal mode (= road cost!) — rivers are freely
 *                        routed through in the original.  34 in secondary-route
 *                        mode (low resources).
 *   costs[10] deep-sea:  3 in normal mode with boat (0x80 flag makes it 19 via
 *                        water-tile table anyway); 1000 on land (instant death).
 *
 * The comment "Orona has no boats" was wrong — the tank spawns on a boat and
 * the original brain routed through rivers at cost 3 on Everard Island.
 * Keeping river=1000 blocked ALL cross-river navigation.
 */
export function setRouteCosts(a4: A4State): void {
  const costs = a4.examineTerrainCostTable;

  // Wall (0): binary uses 26 when armor >= 5 because FollowRoute fires at
  // walls to bulldoze them. With enough health the tank can shoot through.
  // 5 shots to destroy one wall section. Cost 200 makes A* only choose this
  // when it saves a significant detour (~50 road tiles).
  // Bulldozing a wall means SHOOTING it (5 shots) — a tank with 0 shells can't, so a wall on the
  // route is impassable to it (else A* routes through it and the follower stops to "bulldoze" a wall
  // it can never break → stop-and-fire-nothing FOREVER: the live 0-ammo Refuel/GetPill freeze).
  costs[0] = (a4.myTankArmor >= 5 && a4.myTankShells > 0) ? 200 : 1000;

  // Shot-wall (8): damaged building, cheaper to push through — but still needs a shell to break.
  costs[8]  = (a4.myTankArmor > 0 && a4.myTankShells > 0) ? 24 : 1000;

  // River (1): cost depends on boat + resource level.
  //   - On a boat: cheap (3) — rivers are the highway.
  //   - Off boat, resources OK: 100 — A* prefers roads but will ford 1-2 tiles
  //     to avoid a huge detour.
  //   - Off boat, LOW shells/mines: 300 (secondary route mode). The engine
  //     (tank.ts:553) drains 1 shell + 1 mine every 15 ticks while wading
  //     shallow water at low speed; a depleted tank (typically en route to
  //     refuel) can't afford that, so it routes around water entirely.
  //     This is the engine-appropriate analogue of the binary's river=34
  //     secondary-route mode (the binary's normal river cost was 3, not 100,
  //     so the literal value doesn't transfer — the resource-gating does).
  if (a4.tankOnBoat) {
    costs[1] = 3;
  } else {
    const lowResources = a4.myTankShells < 7 || a4.myTankMines < 7;
    costs[1] = lowResources ? 300 : 100;
  }

  // Deep sea (10): impassable without a boat (instant death).
  // With a boat, water tiles already have the 0x80 flag → costs[0x8A]=19
  // overrides this entry anyway, so keeping 1000 here is safe.
  costs[10] = 1000;
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

  // ── Refresh the enemy tank/men roster EVERY TICK ───────────────────────────
  // This was the long-standing "spin on a ghost" bug: a4.men was set ONCE in brainOpen
  // (_syncMen) and never refreshed here, so the target selectors (manToKill/selectTankToKill)
  // and computeTankDist scanned enemies FROZEN at their initial positions. As the tank drove
  // toward a frozen spot the recomputed distance fell to ~0 → KillMan/KillTank cost 0 → it
  // locked on and orbited an empty tile where an enemy USED to be (and never dropped enemies
  // that died/left). addTanks also stamped 0x40 (blocked) into worldMap at those frozen tiles
  // → corrupt terrain. removeTanks() is a no-op precisely because it ASSUMES "Orona provides a
  // fresh men array each tick" — this assignment is what finally makes that assumption true.
  a4.men = state.tanks;
  a4.myMan = state.tank.manPtr;

  // ── Copy tank state ────────────────────────────────────────────────────────
  const t = state.tank;
  a4.tankTileX    = t.tileX;
  a4.tankTileY    = t.tileY;
  a4.tankPackedPos = ((t.tileY & 0xFF) << 8) | (t.tileX & 0xFF);  // (y<<8)|x matches tile format
  a4.tankX        = t.x & 0xFFFF;
  a4.tankY        = t.y & 0xFFFF;
  a4.tankDirection = t.direction & 0xFF;
  a4.tankSpeed    = t.speed & 0xFF;
  a4.tankOnBoat   = !!(t.onBoat);
  a4.myTeam       = t.team;

  // ── Copy man (builder) ─────────────────────────────────────────────────────
  a4.myMan = t.manPtr;
  a4.myTankArmor = t.armor & 0xFF;
  a4.myTankShells = t.shells & 0xFF;
  a4.myTankMines  = t.mineCount & 0xFF;

  // ── Update counters ────────────────────────────────────────────────────────
  a4.teamBitmask = state.teamBitmask;
  a4.tickCounter = state.tickCounter;
  // wallClockTick updated at end of each tick by aIndy_Think step 20.

  // ── Detect base passability changes → invalidate A* cache ────────────────
  // worldMap is now updated: if any base tile changed between blocked (0x40|BASE)
  // and passable (BASE), the A* backpointer cache is stale.  Reset
  // worldCostsInitDone so WorldRouteFind starts fresh with the new terrain.
  // This prevents the tank from routing through a newly-blocked base tile
  // (would freeze it) or routing around a newly-passable one (missing capture).
  for (const base of state.bases) {
    const bIdx = base.index < 32 ? base.index : 0;
    const tIdx = ((base.tileY & 0xFF) << 8) | (base.tileX & 0xFF);
    const isBlocked = (a4.worldMap[tIdx] & 0x40) !== 0 ? 1 : 0;
    if (a4.prevBaseBlockedBits[bIdx] !== isBlocked) {
      a4.prevBaseBlockedBits[bIdx] = isBlocked;
      a4.worldCostsInitDone = 0;   // restart A* with updated terrain
    }
  }

  // ── Aim loop ───────────────────────────────────────────────────────────────
  // Last, so it sees this tick's tickCounter (set above) alongside LAST tick's control words —
  // aIndy_Think clears those immediately after this function returns, and timing a command
  // needs both halves. Full-precision facing, not the truncated a4.tankDirection: a whole
  // direction unit of rounding is 44 world units of miss at 7 tiles, and the rotation this
  // measures is often smaller than that.
  updateAimTracker(a4, t.facingDir);
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
