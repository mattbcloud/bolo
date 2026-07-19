/**
 * A4State — aIndy3.1 Brain Global State
 *
 * This class mirrors the A4 global data block used by the original 68k brain.
 * In the Mac binary, all brain state was accessed as offsets from the A4 register.
 * Here it is a proper TypeScript class. Every field is annotated with its
 * original A4 byte offset for cross-reference with the decode documentation.
 *
 * Ownership:
 *   - One instance is created at BrainOpen and lives for the duration of play.
 *   - Each tick the OronaAdapter writes fresh BrainState into the relevant fields,
 *     then calls aIndy_Think which reads and mutates A4State.
 *
 * Field conventions:
 *   - Scalar state → `number` (integer unless noted)
 *   - Boolean flags → `number` (0/1 as in original; truthy tests preserved)
 *   - 68k pointers to objects → TypeScript object references (null = NULL ptr)
 *   - Large map arrays → Uint8Array / Int16Array allocated once in constructor
 *   - Static lookup tables → module-level constants (imported from aindy_interface.ts)
 */

import type {
  BaseState, PillState, EnemyTankState, ManState,
} from './aindy_interface.js';

// ─────────────────────────────────────────────────────────────────────────────
// GOAL ENTRY
// ─────────────────────────────────────────────────────────────────────────────

/** 4-byte goal priority entry: GoalEntry[12] array at A4[6682] */
export interface GoalEntry {
  goalIndex: number;  // byte +0: goal index 0..11
  cost: number;       // word +2: 0 = highest priority, 0xFFFF = inactive
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOT ENTRY
// ─────────────────────────────────────────────────────────────────────────────

/** 26-byte shot tracking entry, ProcessShots array (A4[11756], stride=26, 40 entries) */
export interface ShotEntry {
  active: number;     // in use flag
  x: number;         // BWorld X
  y: number;         // BWorld Y
  dx: number;        // X velocity per tick
  dy: number;        // Y velocity per tick
  direction: number; // shot direction 0-255
  tickBorn: number;  // tick when shot was fired
  sourceTeam: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTING HEAP
// ─────────────────────────────────────────────────────────────────────────────

/** Priority queue node storage for A* routing (HeapInsert/DeleteMin). */
export interface RoutingHeap {
  size: number;
  costs: Int32Array;    // priority (total cost)
  prevs: Uint16Array;   // packed previous tile (y<<8|x)
  currs: Uint16Array;   // packed current tile
}

// ─────────────────────────────────────────────────────────────────────────────
// A4 STATE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class A4State {

  // ── Large map arrays (65536 = 256×256 bytes each) ─────────────────────────
  // These are pointed to by A4 pointer fields; allocated once at BrainOpen.

  /** A4[11690] ptr → world map tile array (terrain type 0-12 per tile) */
  worldMap: Uint8Array = new Uint8Array(65536);

  /** A4[11694] ptr → danger map (pill/tank line-of-fire per tile) */
  dangerMap: Uint8Array = new Uint8Array(65536);

  /** A4[11698] ptr → occupancy count map (active objects per tile) */
  occupancyMap: Uint8Array = new Uint8Array(65536);

  /** A4[11702] ptr → blocked map (nonzero = routing blocked) */
  blockedMap: Uint8Array = new Uint8Array(65536);

  /** A4[11706] ptr → tile ally array (team ownership, 0xFF=neutral) */
  allyMap: Uint8Array = new Uint8Array(65536).fill(0xFF);

  /** A4[11710] ptr → sight/coverage array (nonzero = visible) */
  sightMap: Uint8Array = new Uint8Array(65536);

  /** A4[13048] ptr → 65536-byte zeroed visit/cost map (A* scratch space) */
  visitMap: Uint8Array = new Uint8Array(65536);

  /** A4[13682] ptr → owner/cell-type map (init=0x10 neutral each tile) */
  ownerMap: Uint8Array = new Uint8Array(65536).fill(0x10);

  // ── Object lists (updated each tick from BrainState) ──────────────────────

  /** A4[11736] ptr → base list (BaseRecord[], stride=184) */
  bases: BaseState[] = [];

  /** A4[11740] ptr → pill list (PillRecord[], stride=112) */
  pills: PillState[] = [];

  /** A4[11752] ptr → ally men array (ManRecord[], stride=80) */
  men: EnemyTankState[] = [];   // ally tank list (reused for tank tracking)

  /** Men-target array (A4[11748], stride=10) — man assignment records */
  menTargets: Array<{ index: number; wx: number; wy: number; b7: number; b8: number }> = [];

  /** Controlled tank's man (builder) — A4[11650] myTank → TankRecord+104 */
  myMan: ManState | null = null;

  // ── Game counters ──────────────────────────────────────────────────────────

  /** A4[12800] byte — base count (filled in by BrainOpen counting player_list) */
  baseCount = 0;

  /** A4[12801] byte — pill count */
  pillCount = 0;

  /** A4[12956] long — team bitmask (1 << (team + 16)) for allied team membership */
  teamBitmask = 0;

  /** A4[13752] long — team bitmask copy (second copy for BrainClose change detection) */
  teamBitmaskCopy = 0;

  /** A4[11726] long — current brain tick counter */
  tickCounter = 0;

  /** A4[13722] long — wall-clock TickCount snapshot (updated end of each tick) */
  wallClockTick = 0;

  /** A4[13600] byte — saved ammo level from last tick (ammo-change detection) */
  savedAmmo = 0;

  /** A4[13025] byte — total visible men count (loop limit in ClosestAllyTank etc.) */
  visibleMenCount = 0;

  /** A4[11730] long — man arrival deadline (SetManTime writes; checked in goal handlers) */
  manArrivalDeadline = 0;

  /** A4[11734] byte — movement mode byte */
  movementMode = 0;

  /** A4[11735] byte — "shot at man" flag */
  shotAtMan = 0;

  // ── Tile position cache ────────────────────────────────────────────────────

  /** A4[11686] byte — myTank X tile */
  tankTileX = 0;

  /** A4[11687] byte — myTank Y tile */
  tankTileY = 0;

  /** A4[11688] word — myTank packed position (X<<8|Y) */
  tankPackedPos = 0;

  /** myTank BWorld X position (synced from TankState each tick) */
  tankX = 0;

  /** myTank BWorld Y position (synced from TankState each tick) */
  tankY = 0;

  /** myTank facing direction 0-255 (synced from TankState each tick) */
  tankDirection = 0;

  /** myTank current speed (synced from TankState each tick) */
  tankSpeed = 0;

  // ── NavigateToCoords route cache ──────────────────────────────────────────
  // Re-run A* only when tank moves >10 tiles, dest changes, or >1000 ticks.
  // Matches original: 0x020b96 checks 1000-tick timeout + 10-tile movement.

  /** Tank tile X at last A* run */
  navCacheTankTileX = -1;
  /** Tank tile Y at last A* run */
  navCacheTankTileY = -1;
  /** Destination tile X at last A* run */
  navCacheDestTileX = -1;
  /** Destination tile Y at last A* run */
  navCacheDestTileY = -1;
  /** Tick counter at last A* run */
  navCacheTickStamp = 0;
  /** 1 = cached route is valid; 0 = must recompute */
  navCacheValid = 0;
  /** Whether the tank was on a boat at the last A* run.
   *  Boat transitions change water tile costs (19 ↔ 1000), invalidating A*. */
  navCachePrevOnBoat = false;

  /** Whether the tank is currently on a boat (synced from BrainState each tick) */
  tankOnBoat = false;

  // ── Full-map A* path state ────────────────────────────────────────────────

  /** Current computed path (packed tile indices y<<8|x, start to dest) */
  navPath: Uint16Array | null = null;

  /** Current index into navPath (next waypoint to steer toward) */
  navPathIndex = 0;

  /** A* working memory: g-cost per tile (0xFFFF = unvisited) */
  navGCost: Uint16Array = new Uint16Array(65536);

  /** A* working memory: parent backpointer per tile (packed tile index) */
  navParent: Uint16Array = new Uint16Array(65536);

  /** A* working memory: binary min-heap (packed f<<16|tileIdx) */
  navHeap: Uint32Array = new Uint32Array(65536);

  // ── Boat detection ────────────────────────────────────────────────────────

  /** True when a water route is significantly shorter than the dry route */
  boatNeeded = false;

  /** Raw GOAL destination tile last passed to navigateToCoords (before any boat redirect). When it
   *  changes, a boatNeeded latch from the PREVIOUS destination is stale (its boat build tile targets
   *  the old water route) and must be cleared — else a tank that latched a boat near water for one
   *  goal keeps redirecting to that old boat tile after switching goals, idling at the water's edge
   *  (live: GetBase / Refuel stuck idle near water). -1 = unset. */
  navReqDestTileX = -1;
  navReqDestTileY = -1;

  /** Tile X where the boat should be built (first river tile on the wet path) */
  boatBuildTileX = 0;

  /** Tile Y where the boat should be built */
  boatBuildTileY = 0;

  /** Tick when boat acquisition (GetBoat sub-goal) was latched; 0 = not acquiring.
   *  Used to time out acquisition and fall back to the dry route if the tank
   *  can never board (e.g. unreachable boat point, no trees to build). */
  boatAcquireSinceTick = 0;

  /** Tick until which boat acquisition is suppressed after a timeout. Prevents
   *  re-latching boatNeeded every recompute (which made the tank repeatedly wade
   *  to an unreachable boat point, draining shells). Mirrors getManFailedUntilTick. */
  boatFailedUntilTick = 0;

  /** Board/disembark thrash detector. On patchy 1-tile water the tank can board, instantly
   *  hit land, disembark, and re-acquire every few ticks — never crossing — while each brief
   *  boarding resets boatAcquireSinceTick so the acquisition timeout never fires. We count
   *  onBoat state flips within a window; too many → the crossing isn't viable, trip the
   *  cooldown. boatFlipPrevState = last seen onBoat; -1 = uninitialised. */
  boatFlipPrevState = -1;
  boatFlipCount = 0;
  boatFlipWindowTick = 0;

  /** Tick of the last disembark (boat->land). For a short window after, suppress re-acquiring a
   *  boat so the tank COMMITS to land instead of immediately re-boarding the boat it just left
   *  (the board<->disembark thrash). 0 = none. */
  boatDisembarkTick = 0;

  /** Total cost of the current dry path (for comparison) */
  navDryPathCost = 0;

  /** Total cost of the wet path (rivers cheap) — 0 if not computed */
  navWetPathCost = 0;

  // ── Two-phase routing: tank LocalRouteFind state (binary 0x021e6c) ──────────

  /**
   * When true, FindCheapestSquare uses localRouteCostTable (fine local route)
   * instead of worldRouteCostTable.  Set by tankLocalRouteFind when it completes
   * successfully; cleared when destination changes or tank moves > 10 tiles from
   * the last local route point.
   */
  useLocalRouteForNav = false;

  /** Tick counter when tankLocalRouteFind last ran successfully. */
  localNavLastTick = -1200;   // force first run

  /** Tank tile X when tankLocalRouteFind last ran (±10 tile check). */
  localNavTankX = -1;

  /** Tank tile Y when tankLocalRouteFind last ran. */
  localNavTankY = -1;

  // ── Control words (brain output, written end of each tick) ────────────────

  /** A4[11678] long — tank steering/movement control word */
  steeringWord = 0;

  /** A4[11682] long — tank firing/mines control word */
  firingWord = 0;

  /** A4[12859] byte — DropMines activation flag */
  dropMinesActive = 0;

  /** A4[12862] word — SetGlobals computation gate (1 = enabled) */
  setGlobalsGate = 1;

  /**
   * Builder dispatch command set by doBuilding/goalFixPill this tick.
   * Cleared at the start of each tick by aIndy_Think, then returned in
   * BrainControls so _runBrainTick can call buildOrder().
   */
  pendingBuilderAction: { action: string; trees: number; tileX: number; tileY: number } | null = null;

  /**
   * Tracks whether the builder was deployed on the previous tick.
   * Used to detect the deployed→in-tank transition and clear newGetPillAttackMode.
   */
  prevBuilderWasDeployed = 0;

  /** A4[11669] byte — RefuelDoManStuff: mine-deploy enabled */
  refuelMineDeployEnabled = 0;

  /** A4[11670] byte — general mine-deploy enable */
  mineDeployEnable = 0;

  /** A4[11671] byte — RefuelDoManStuff: alternate man pickup */
  refuelAltManPickup = 0;


  // ── Goal system ────────────────────────────────────────────────────────────

  /** A4[6682] GoalEntry[12] — goal cost array (all 11+1 goals, 4 bytes each) */
  goals: GoalEntry[] = Array.from({ length: 12 }, (_, i) => ({
    goalIndex: i,
    cost: 0xFFFF,
  }));

  /** A4[7044] FP — current game score ratio (SANE float, updated by ComputeGameStatus) */
  gameScoreRatio = 0.0;

  // ── Target pointers ────────────────────────────────────────────────────────
  // In the original: A4 long fields holding pointers to struct records.
  // Here: object references (null = NULL).

  /** A4[12818] ptr — closest enemy tank */
  closestEnemyTank: EnemyTankState | null = null;

  /** A4[12802] ptr — DoCommonStuff: ClosestAllyBase result */
  closestAllyBase: BaseState | null = null;

  /** A4[12806] ptr — DoCommonStuff: ClosestEnemyBase result */
  closestEnemyBase: BaseState | null = null;

  /** A4[12822] ptr — BaseToBuild target */
  baseToBuildTarget: BaseState | null = null;

  /** A4[12826] ptr — BaseToGet target */
  baseToGetTarget: BaseState | null = null;

  /** A4[12830] ptr — KillBase target */
  killBaseTarget: BaseState | null = null;

  /** A4[12834] ptr — RefuelBase target */
  refuelBaseTarget: BaseState | null = null;

  /** A4[12842] ptr — ManToKill target */
  manToKillTarget: EnemyTankState | null = null;

  /** A4[12846] ptr — PillToFix target */
  pillToFixTarget: PillState | null = null;

  /** A4[12850] ptr — PillToGet target */
  pillToGetTarget: PillState | null = null;

  /** A4[12854] ptr — TankToKill target */
  tankToKillTarget: EnemyTankState | null = null;

  /** A4[12946] ptr — previous pill target (change-detection) */
  prevPillTarget: PillState | null = null;

  // ── Goal hysteresis / pill commitment (ChooseGoal binary logic) ───────────

  /**
   * The goal index that was active at the end of the last tick.
   * Corresponds to D3 (prev goal) in ChooseGoal (0x0073ee).
   * Used for:
   *   - pill commitment: "was prev goal GetPill?"
   *   - goal hysteresis: only switch to a cheaper goal (binary SANE comparison)
   */
  currentGoal: number = 12; // 12 = NO_GOAL

  /**
   * A4[12982] — index of the pill we committed to last tick while in GetPill.
   * When the new PillToGet selection differs but has equal cost, we revert to
   * this committed pill. -1 = no commitment.
   */
  prevCommittedPillIndex: number = -1;

  // ── Tick scheduler ─────────────────────────────────────────────────────────

  /** A4[13776] long — last doFrequentStuff tick (period: 5 ticks) */
  lastFrequentTick = 0;

  /** A4[13780] long — last doNormalStuff tick (period: 180 ticks = 3s) */
  lastNormalTick = 0;

  /** A4[13784] long — last doInfrequentStuff tick (period: 1200 ticks = 20s) */
  lastInfrequentTick = 0;

  // ── Distance-freshness ─────────────────────────────────────────────────────

  /** A4[12954] byte — distances-fresh flag (set by doFrequentStuff) */
  distancesFresh = 0;

  /** A4[13019] byte — CountUnspikedBases result */
  unspikedBaseCount = 0;

  // ── Centers of gravity ─────────────────────────────────────────────────────

  /** A4[13588] word — ally CenterOfGravity X (updated by doInfrequentStuff) */
  allyCogX = 0;

  /** A4[13590] word — ally CenterOfGravity Y */
  allyCogY = 0;

  /** A4[13592] word — Frontline CenterOfGravity X */
  frontlineCogX = 0;

  /** A4[13594] word — Frontline CenterOfGravity Y */
  frontlineCogY = 0;

  /** A4[13596] word — enemy CenterOfGravity X */
  enemyCogX = 0;

  /** A4[13598] word — enemy CenterOfGravity Y */
  enemyCogY = 0;

  // ── SetGlobals state ───────────────────────────────────────────────────────

  /** A4[7499] byte — FindCheapestSquare: danger evaluation enable flag */
  dangerEvalEnable = 0;

  /** A4[7500] byte — SetGlobals: resource constraint flag */
  resourceConstraint = 0;

  /** A4[7502] byte — max speed setting */
  maxSpeed = 0;

  /** A4[7532] byte — SetGlobals: ammo threshold */
  ammoThreshold = 0;

  /** A4[13028] word — SetGlobals: predicted next tile (from ComputeNextPoint) */
  predictedNextTile = 0;

  /** A4[13024] byte — myTank.byte[25] (team saved at BrainOpen) */
  myTeam = 0;

  /** myTank armor (TankRecord+44) — synced each tick for SetRouteCosts */
  myTankArmor = 40;

  /** myTank raw shell count (0-40) — synced each tick for SetRouteCosts (secondary route mode) */
  myTankShells = 40;

  /** myTank raw mine count (0-40) — synced each tick for SetRouteCosts (secondary route mode) */
  myTankMines = 40;

  /** A4[13717] byte — myTank.byte[21] (saved at BrainOpen) */
  tankByte21 = 0;

  // ── Timing params (init = 9/20/9/20/9/20) ─────────────────────────────────

  /** A4[13694] byte — timing param A0 (init=9) */
  timingA0 = 9;

  /** A4[13695] byte — timing param A1 (init=20) */
  timingA1 = 20;

  /** A4[13696] byte — timing param B0 (init=9) */
  timingB0 = 9;

  /** A4[13697] byte — timing param B1 (init=20) */
  timingB1 = 20;

  /** A4[13698] byte — timing param C0 (init=9) */
  timingC0 = 9;

  /** A4[13699] byte — timing param C1 (init=20) */
  timingC1 = 20;

  // ── Routing scratch ────────────────────────────────────────────────────────
  // Route "handles" in the original were heap-allocated arrays.
  // Here they are Uint16Array (world route) or Uint8Array (local route).
  // Null = not allocated / no valid route.

  /** A4[13394] long ptr — NewGetPill: route handle */
  newGetPillRouteHandle: Uint16Array | null = null;

  /** A4[13532] ptr — ManLocationFromTicks: route handle comparison */
  manLocRouteComparison: Uint16Array | null = null;

  /** A4[13562] ptr — ManLocationFromTicks: route handle cache */
  manLocRouteCacheHandle: Uint16Array | null = null;

  /** A4[13568] byte — ManLocationFromTicks: scratch flag / manstopped dest gate */
  manLocScratchFlag = 0;

  /** A4[13566] byte — manstopped: destination tile X (gate 1 of 4-corner test) */
  manDestTileX = 0;

  /** A4[13567] byte — manstopped: destination tile Y (gate 1 of 4-corner test) */
  manDestTileY = 0;

  // ── WorldRouteFind state ───────────────────────────────────────────────────

  /** A4[7520] byte — WorldRouteFind: resource_constraint copy */
  worldRouteResourceConstraint = 0;

  /** A4[7521] byte — WorldRouteFind: myTank.byte[47] copy */
  worldRouteTankByte47 = 0;

  /** A4[7526] long — WorldRouteFind: tick snapshot */
  worldRouteTickSnapshot = 0;

  /** A4[7530] byte — WorldRouteFind: danger flag copy */
  worldRouteDangerFlag = 0;

  /** A4[12876] byte — WorldRouteFind: min Y bound */
  worldRouteMinY = 0;

  /** A4[12877] byte — WorldRouteFind: max Y bound */
  worldRouteMaxY = 0;

  /** A4[12878] byte — WorldRouteFind: min X bound */
  worldRouteMinX = 0;

  /** A4[12879] byte — WorldRouteFind: max X bound */
  worldRouteMaxX = 0;

  /** A4[13016] byte — WorldRouteFind: InitWorldCosts-done gate */
  worldCostsInitDone = 0;

  /** A4[13042] byte — WorldVisit: timeout bail gate */
  worldVisitTimeoutGate = 0;

  /** A4[8244] long — WorldVisit: timeout event counter */
  worldVisitTimeoutCounter = 0;

  // ── LocalRouteFind state ───────────────────────────────────────────────────

  /** A4[7504] byte — LocalRouteFind: myTank.byte[77] copy */
  localRouteTankByte77 = 0;

  /** A4[7505] byte — LocalRouteFind: myTank.byte[76] copy */
  localRouteTankByte76 = 0;

  /** A4[7506] byte — LocalRouteFind: resource_constraint copy */
  localRouteResourceConstraint = 0;

  /** A4[7508] word — LocalRouteFind: tank tile X */
  localRouteTankTileX = 0;

  /** A4[7510] word — LocalRouteFind: tank tile Y */
  localRouteTankTileY = 0;

  /** A4[7512] long — LocalRouteFind: tick snapshot */
  localRouteTickSnapshot = 0;

  /** A4[7516] byte — LocalRouteFind: danger flag copy */
  localRouteDangerFlag = 0;

  // ── FollowRoute / FindCheapestSquare state ────────────────────────────────

  /** A4[7534] word — FindCheapestSquare: comparison threshold value */
  cheapestSquareThreshold = 0;

  /** A4[7536] word — FindCheapestSquare: route iteration state */
  cheapestSquareIterState = 0;

  /** A4[7538] long — FollowRoute/FindCheapestSquare: best waypoint cost */
  bestWaypointCost = 0;

  /** A4[7542] long — FollowRoute/FindCheapestSquare: fallback waypoint cost */
  fallbackWaypointCost = 0;

  /** A4[7548] byte — ExpandWorldLimits: 1 = bounds already expanded this route */
  worldExpandedFlag = 0;

  /** A4[8122] word — FollowRoute: FP result (estimated ticks to waypoint) */
  followRouteTicks = 0;

  /** A4[8124] word — FollowRoute: secondary route metric */
  followRouteSecondaryMetric = 0;

  /** A4[13026] word — next path tile for NavigateToAP */
  navigateToAPNextTile = 0;

  /** Navigation stall detection: last reference tile (updated only on 2+ tile movement) */
  navStallTileX = -1;
  navStallTileY = -1;
  /** Tick count when tank was last at navStallTileX/Y during active A* navigation */
  navStallSinceTick = 0;

  /** Packed tile index (y<<8|x) temporarily blocked after stall. 0xFFFF = none. */
  navStallBlockedTile = 0xFFFF;

  /** Progress timeout: BWorld distance to destination when progress was last measured */
  navProgressDist = 0xFFFF;
  /** Tick count when navProgressDist was last updated (2-tile improvement required) */
  navProgressTick = 0;


  /** A4[7546] byte — WorldVisit/LocalVisit: terrain modifier flag (1 = base entrance tile) */
  visitTerrainModifierFlag = 0;

  /** A4[7547] byte — LocalVisit: secondary path found flag */
  localVisitSecondaryPathFound = 0;

  /** A4[8126] word — LocalVisit: secondary route counter */
  localVisitSecondaryRouteCount = 0;

  /** A4[7610] word[256] — Examine: terrain traversal cost weight table
   *  Indexed by raw worldMap byte (0x00–0xFF: bits 0-3=terrain, bit 6=wall, bit 7=water).
   *  Filled by InitializeCosts; used every A* expansion step by Examine. */
  examineTerrainCostTable: Uint16Array = new Uint16Array(256);

  // ── NavigateToCoords / FollowRoute route tables ────────────────────────────
  // In original: A4 ptr → allocated heap block. Here: allocated on demand.

  // ── Route cost tables (allocated once at StartUpRoutes/BrainOpen) ──────────
  // Each is 65536 uint16 entries = 131072 bytes.
  // Pre-filled with sentinel 0x7D01 = "unreachable / not yet visited".

  /** A4[7558] ptr — local route cost table (LocalVisit A* frontier costs) */
  localRouteCostTable: Uint16Array = new Uint16Array(65536).fill(0x7D01);

  /** A4[7562] ptr — world route cost table (WorldVisit A* frontier costs) */
  worldRouteCostTable: Uint16Array = new Uint16Array(65536).fill(0x7D01);

  /** A4[7566] ptr — route iteration count table / FindCheapestSquare count */
  routeIterCountTable: Uint16Array = new Uint16Array(65536);

  /** A4[7570] ptr — route lookup table (direction back-pointers for route tracing) */
  routeLookupTable: Uint16Array = new Uint16Array(65536);

  /** A4[7574] ptr — route iteration count table 2 */
  routeIterCountTable2: Uint16Array = new Uint16Array(65536);

  /** A4[7501] byte — no-local-route-found error flag (set by InitLocalCosts) */
  noLocalRouteFlag = 0;

  /** A* priority queue — one instance, reset before each search (HeapEmpty/Insert/DeleteMin) */
  routingHeap: RoutingHeap = {
    size: 0,
    costs: new Int32Array(16384),
    prevs: new Uint16Array(16384),
    currs: new Uint16Array(16384),
  };

  // ── Routing cost parameters (written by InitializeCosts, A4[7582-7608]) ──
  /** 14 routing cost parameters (words at A4[7582], [7584], ..., [7608]) */
  routingCostParams: Uint16Array = new Uint16Array([
    300, 200, 64, 64, 64, 43, 64, 21, 200, 64, 64, 64, 16, 21,
  ]);

  // ── Examine terrain cost table (256 uint16, A4[7610]) ─────────────────────
  // Indexed by raw worldMap byte (bits 0-3 = terrain, bit 7 = water, bit 6 = wall).
  // Filled by InitializeCosts; used by Examine each A* expansion step.
  // (Re-declared above as examineTerrainCostTable — expand to 256 entries.)

  /** A4[7566] ptr — FindCheapestSquare: route iteration count table (alias) */
  cheapestSquareCountTable: Uint16Array | null = null;

  /** A4[7570] ptr — FollowRoute: route lookup table (indexed by packed coords) */
  followRouteTable: Uint16Array | null = null;

  /** A4[7574] ptr — FollowRoute: route iteration count table */
  followRouteCountTable: Uint16Array | null = null;

  /** A4[8128] ptr — FindCheapestSquare: cost/terrain lookup table */
  cheapestSquareCostTable: Uint16Array | null = null;

  // ── GoToPreciseStop state ──────────────────────────────────────────────────

  /** A4[8232] byte — GoToPreciseStop: precise-stop mode flag */
  precisestopMode = 0;

  // ── Shoot / combat state ───────────────────────────────────────────────────

  /** A4[11614] long — Shoot: current TickCount snapshot (rate limiter) */
  shootTickSnapshot = 0;

  /** A4[11618] long — Shoot: tick timestamp of last shot fired (60-tick = 1.2s gate) */
  lastShotTick = 0;

  /** A4[8256] long — Mac OS TickCount snapshot */
  macTickCountSnapshot = 0;

  /** A4[8260] byte — CheckPillDanger enable flag */
  checkPillDangerEnable = 0;

  /** A4[13602] byte — "shot fired this tick" flag */
  shotFiredThisTick = 0;

  // ── Shot tracking array (ProcessShots) ────────────────────────────────────

  /** A4[11756] ShotEntry[40] — per-shot tracking, stride=26 (40 entries max) */
  shots: ShotEntry[] = Array.from({ length: 40 }, () => ({
    active: 0, x: 0, y: 0, dx: 0, dy: 0, direction: 0, tickBorn: 0, sourceTeam: 0,
  }));

  // ── CheckShotIncoming state ────────────────────────────────────────────────

  /** A4[13728] byte — CheckShotIncoming: shot direction table reset flag */
  shotDirTableResetFlag = 0;

  /** A4[13758] word[8] — CheckShotIncoming: shot direction frequency (8 sectors) */
  shotDirFrequency: Uint16Array = new Uint16Array(8);

  /** A4[13774] word — CheckShotIncoming: close-shot counter (dist ≤ 1 tile) */
  closeShotCounter = 0;

  // ── CheckBarriers state ────────────────────────────────────────────────────

  /** A4[13256] byte[8] — CheckBarriers direction flags */
  checkBarriersFlags: Uint8Array = new Uint8Array(8);

  // ── Message system state ───────────────────────────────────────────────────

  /** A4[13016] byte — message suppress flag (overloaded with worldCostsInitDone) */
  messageSuppressFlag = 0;

  /** A4[9550] word — ReceiveAnyMessages: last recognized command ID */
  lastRecognizedCommandId = 0;

  /** A4[13003] long — capture counter */
  captureCounter = 0;

  // ── KillBase state ─────────────────────────────────────────────────────────

  /** A4[13704] ptr — KillBase: current target copy */
  killBaseCurrentTarget: BaseState | null = null;

  /** A4[13603] byte — kill-base in-progress flag */
  killBaseInProgress = 0;

  /** A4[13866] byte — KillBase: first-shot-fired flag */
  killBaseFirstShotFired = 0;

  /** A4[13868] word — KillBase: chosen attack position (packed tile X/Y) */
  killBaseAttackPos = 0;

  /** A4[13924] word — KillBase: armor at first shot */
  killBaseArmorAtFirstShot = 0;

  /** A4[13926] word — KillBase: armor for per-tick tracking */
  killBaseArmorTracking = 0;

  /** A4[13928] ptr — KillBase: previous target */
  killBasePrevTarget: BaseState | null = null;

  /** KillBase: previous target index (index-based change detection) */
  killBaseTargetIndex: number = -1;

  // ── KillTank state ─────────────────────────────────────────────────────────

  /** A4[13932] byte — KillTank: stutter-step timer active */
  killTankStutterActive = 0;

  /** A4[13934] long — KillTank: stutter-step start tick */
  killTankStutterStartTick = 0;

  // ── Enemy velocity tracking (for LinearAim lead calculation) ───────────────
  // Stores the previous BWorld position of each tracked enemy tank so that
  // DoCommonStuff can compute a velocity vector for LinearAim each tick.
  // Indexed by EnemyTankState.index (max 16 entries).

  /** Previous BWorld X positions per enemy tank index */
  enemyPrevX: Int32Array = new Int32Array(16);

  /** Previous BWorld Y positions per enemy tank index */
  enemyPrevY: Int32Array = new Int32Array(16);

  /** Tick when previous positions were recorded (for stale-data guard) */
  enemyPrevTick: Int32Array = new Int32Array(16);

  /** Dedicated previous-position cache for the KillTank target's LEAD aim. Kept separate from
   *  enemyPrev* (which doCommonStuff overwrites with the CURRENT position mid-tick, zeroing the
   *  delta) so goalKillTank can measure the target's velocity itself and aim where it WILL be. */
  killTankPrevX = 0;
  killTankPrevY = 0;
  killTankPrevTick = 0;
  killTankPrevIdx = -1;
  // noRoute-abandon (mirrors FixPill): if goalKillTank can't route to the target for a sustained
  // span, arm a cooldown so killTankGoalCost yields — otherwise a tank commits to KillTank (often
  // the cheapest goal) against an unreachable enemy (parked on a nav-blocked / stacked tile) and
  // freezes forever, never falling back to a routable goal (live 2v2: nerp idle on KillTank).
  killTankNoRouteSinceTick = 0;
  killTankFailedUntilTick = 0;

  // ── GetBase state ──────────────────────────────────────────────────────────

  /** A4[13870] ptr — GetBase: BaseToGet change-detection ptr */
  getBaseChangeDetectionPtr: BaseState | null = null;

  /** GetBase: change-detection index (index-based, replaces ptr equality) */
  getBaseChangeDetectionIndex: number = -1;

  /** A4[13923] byte — GetBase: team-mismatch flag */
  getBaseTeamMismatch = 0;

  /**
   * Committed base index for intentional base capture.
   * baseToGet() returns this base (by index) while GetBase is active,
   * preventing mid-navigation target switching as the tank moves.
   * -1 means no committed target.
   */
  getBaseCommittedIndex = -1;

  /**
   * Set to 1 after a tick where GetBase was the winning goal.
   * Used by baseToGet() to decide whether to honor the sticky committed target,
   * and by getBaseGoalCost() to apply a hysteresis discount.
   */
  getBaseWasLastGoal = 0;

  /**
   * Closest tile-distance ever achieved to the committed base target.
   * Reset to 0xFFFF when commitment changes. Used for patience timeout.
   */
  getBaseMinDistSeen = 0xFFFF;

  /**
   * Per-base "was blocked last tick" flags (1 bit per base, indexed by base.index).
   * Used to detect passability changes (armour crosses the 9-threshold, or owner
   * appears/disappears) so the A* can be invalidated before the tank enters a
   * newly-blocked tile or misses a newly-passable shortcut.
   */
  prevBaseBlockedBits: Uint8Array = new Uint8Array(32);

  /**
   * Tick when getBaseMinDistSeen last improved (got smaller).
   * If (tickCounter - getBaseLastImprovedTick) > PATIENCE_LIMIT ticks
   * and we're still far away, the commitment is abandoned.
   */
  getBaseLastImprovedTick = 0;

  /**
   * Index of the committed base from the PREVIOUS goalGetBase() call.
   * Used to detect target changes by index (object refs change every tick
   * since BaseState is rebuilt in buildBrainState each tick).
   */
  getBasePrevCommittedIndex = -1;

  /**
   * Per-base cooldown expiry ticks. When a patience timeout fires on base[i],
   * getBaseFailedUntilTick[i] is set to tickCounter + 5000. baseToGet() skips
   * bases where tickCounter < getBaseFailedUntilTick[base.index].
   * Array length 16 — more than enough for any Bolo map.
   */
  getBaseFailedUntilTick: Uint32Array = new Uint32Array(16);

  /**
   * Per-pill navigation failure timer. When the pill at index i is unreachable
   * (noLocalRouteFlag fires), getPillFailedUntilTick[i] is set to tickCounter + 2000.
   * pillToGet() skips pills where tickCounter < getPillFailedUntilTick[pill.index].
   * Size 64: Everard Island and other maps can have more than 16 pills.
   */
  getPillFailedUntilTick: Uint32Array = new Uint32Array(64);

  /** No-progress watchdog for GetPill: the closest we've gotten to the current pill target, and
   *  the tick we last made progress. If the tank goes a long time without getting closer (stuck at
   *  a degenerate AP, looping AP re-picks, unreachable target), goalNewGetPill abandons the pill
   *  (sets getPillFailedUntilTick) so the brain does something else instead of idling. */
  getPillBestDist = 0xFFFF;
  getPillProgressTick = 0;
  getPillLastArmour = 0xFF;   // lowest pill armour seen for the current target (armour drop = progress)

  // ── GetMan state ───────────────────────────────────────────────────────────

  /** A4[13046] byte — GetMan: man-dispatched flag */
  getManDispatched = 0;

  /** A4[13862] word — GetMan: man target BWorld X */
  getManTargetX = 0;

  /** A4[13864] word — GetMan: man target BWorld Y */
  getManTargetY = 0;

  /** A4[13878] long — GetMan: last-event tick timestamp */
  getManLastEventTick = 0;

  /** Tick when GetMan navigation first started failing (route MISS); 0 = not failing.
   *  Used to abandon an unreachable builder instead of sitting idle under fire. */
  getManFailSinceTick = 0;

  /** Tick until which GetMan is abandoned (cost forced 0xFFFF) — set after the
   *  builder proves unreachable, so the tank refuels/retreats instead of dying. */
  getManFailedUntilTick = 0;

  /** Tick at which the builder was deliberately deployed to build/maintain pill
   *  cover (cover method). While within COVER_BUILD_GRACE of this, GetMan is
   *  suppressed so fetching the man doesn't abandon the GetPill engagement that
   *  dispatched it. 0 = not in a cover-build window. */
  coverBuilderDispatchTick = 0;

  /** A4[13882] word — GetMan: armor threshold */
  getManArmorThreshold = 0;

  /** A4[12866] byte — GetManCost: priority override flag */
  getManCostPriorityOverride = 0;

  /** A4[12872] word — GetManCost: cost/count variable */
  getManCostCount = 0;

  /** A4[13043] byte — GetManCost: control flag */
  getManCostControlFlag = 0;

  /** A4[13045] byte — GetManCost: man-targeting-active flag */
  getManCostActive = 0;

  // ── FixPill state ──────────────────────────────────────────────────────────

  /** A4[13874] ptr — FixPill: previous pill target */
  fixPillPrevTarget: PillState | null = null;

  /** FixPill: previous target index (index-based change detection) */
  fixPillPrevTargetIndex: number = -1;

  /**
   * Packed tiles ((tileY<<8)|tileX) of pillboxes THIS tank placed. The brain only
   * sees pill ownership by TEAM (ownerByte = team), so it cannot otherwise tell a
   * pill it placed from a teammate's. Populated when PlacePill finishes a drop;
   * used to gate FixPill (repair-in-place) to self-placed pills only — non-self-placed
   * damaged ally pills are RECLAIMED (shot to 0 + collected) instead of welded in place.
   */
  selfPlacedPillTiles: Set<number> = new Set();

  /** Reclaim sub-mode: 1 once goalFixPill commits to picking up (not repairing) the target. */
  reclaimInProgress = 0;

  /** FixPill noRoute-abandon: first tick a persistent noRoute was seen (0 when routing OK).
   *  If FixPill can't route to its pill for a sustained span — e.g. reclaim adjacent to a pill
   *  whose LOS is blocked by a neighbouring base so it neither fires nor advances, oscillating
   *  forever (live green-tank freeze) — fixPillGoalCost yields until fixPillFailedUntilTick so
   *  another goal takes over. Mirrors getBaseFailedUntilTick / getManFailedUntilTick. */
  fixPillNoRouteSinceTick = 0;
  fixPillFailedUntilTick = 0;

  /** A4[13909] byte — FixPill: "send pill target broadcast" flag */
  fixPillSendBroadcast = 0;

  /** A4[13919] byte — FixPill: safe-point-found flag */
  fixPillSafePointFound = 0;

  /** A4[13920] byte — FixPill: safe approach X tile */
  fixPillSafeX = 0;

  /** A4[13921] byte — FixPill: safe approach Y tile */
  fixPillSafeY = 0;

  /** A4[13922] byte — FixPill: in-range / approach armed flag */
  fixPillInRange = 0;

  // ── Explore state ──────────────────────────────────────────────────────────

  /** A4[13941] byte — Explore: current target tile X */
  exploreTargetX = 0;

  /** A4[13942] byte — Explore: current target tile Y */
  exploreTargetY = 0;

  // ── TourBases state ────────────────────────────────────────────────────────

  /** A4[13948] byte[16] — TourBases: per-base candidate/visit flag (r2 verified offset) */
  tourBasesCandidateFlags: Uint8Array = new Uint8Array(16);

  /** A4[4540] byte[16] — TourBases: per-base arrival record */
  tourBasesArrivalRecord: Uint8Array = new Uint8Array(16);

  /** A4[16944] byte[16] — TourBases: per-base reset table */
  tourBasesResetTable: Uint8Array = new Uint8Array(16);

  // ── NewGetPill state ───────────────────────────────────────────────────────

  /** A4[6329] byte — NewGetPill: AdjustTankAtAP flag */
  newGetPillAdjustFlag = 0;

  /** A4[6346] byte — NewGetPill: last pill owner byte */
  newGetPillLastOwner = 0;

  /** A4[13392] byte — NewGetPill: attack-position-chosen flag */
  newGetPillAPChosen = 0;

  /** A4[13398] byte — barrier pills count */
  barrierPillCount = 0;

  /** A4[13464] byte — NewGetPill: pill owner changed flag */
  newGetPillOwnerChanged = 0;

  /** A4[13480] byte — NewGetPill: approach mode A */
  newGetPillApproachModeA = 0;

  /** A4[13481] byte — NewGetPill: approach mode B */
  newGetPillApproachModeB = 0;

  /** A4[13509] byte — NewGetPill: speed tier (0–4) */
  newGetPillSpeedTier = 0;

  /** A4[13510] word — NewGetPill: CheckBarriers result cache */
  newGetPillCheckBarriersCache = 0;

  /** A4[13511] byte — ShootPill direction arg */
  shootPillDirection = 0;

  /** A4[13512] word — NewGetPill: attack-pos X (BWorld) */
  newGetPillAPX = 0;

  /** A4[13514] word — NewGetPill: attack-pos Y (BWorld) */
  newGetPillAPY = 0;

  /** A4[13516] byte — NewGetPill: AP is tile-center flag */
  newGetPillAPTileCenter = 0;

  /** A4[13517] byte — NewGetPill: wait-place chosen flag */
  newGetPillWaitPlaceChosen = 0;

  /** A4[13518] byte — NewGetPill: wait X tile */
  newGetPillWaitX = 0;

  /** A4[13519] byte — NewGetPill: wait Y tile */
  newGetPillWaitY = 0;

  /** A4[13520] byte — NewGetPill: last AP tile X */
  newGetPillLastAPX = 0;

  /** A4[13521] byte — NewGetPill: last AP tile Y */
  newGetPillLastAPY = 0;

  /** A4[13524] long — NewGetPill: stall-detection tick timestamp */
  newGetPillStallTick = 0;

  /** Count of consecutive AP navigation failures for current pill (not in original) */
  newGetPillAPFailCount = 0;

  /** A4[13586] byte — attack mode / man-dispatched flag */
  newGetPillAttackMode = 0;

  /** A4[13587] byte — pill defender count */
  newGetPillDefenderCount = 0;

  /** A4[13601] byte — "pill approach in progress" flag */
  pillApproachInProgress = 0;

  /** A4[13708] ptr — NewGetPill: target copy */
  newGetPillTargetCopy: PillState | null = null;

  /** NewGetPill: target index (index-based change detection) */
  newGetPillTargetIndex: number = -1;

  /** A4[13712] ptr — NewGetPill: pill ptr copy */
  newGetPillPillCopy: PillState | null = null;

  /** A4[13716] byte — NewGetPill: same-as-previous-target flag */
  newGetPillSameTarget = 0;

  /** NewGetPill: previous pill index for same-target detection */
  prevPillTargetIndex: number = -1;

  /** A4[13490] ptr[] — barrier pills array base (up to 16 entries) */
  barrierPills: (PillState | null)[] = new Array(16).fill(null);

  // ── ChooseAttackPosition state ─────────────────────────────────────────────

  /** A4[13252] byte — ChooseAttackPosition: first-call gate flag */
  chooseAPFirstCall = 0;

  /** A4[13465] byte — ChooseAttackPosition: primary AP candidate */
  chooseAPPrimary = 0;

  /** A4[13466] byte — ChooseAttackPosition: fallback AP candidate */
  chooseAPFallback = 0;

  /** A4[13467] byte — ChooseAttackPosition: emergency AP candidate */
  chooseAPEmergency = 0;

  /** A4[13468] byte — ChooseAttackPosition: primary AP tile X */
  chooseAPPrimaryX = 0;

  /** A4[13469] byte — ChooseAttackPosition: fallback AP tile X */
  chooseAPFallbackX = 0;

  /** A4[13470] byte — ChooseAttackPosition: best-so-far AP tile X */
  chooseAPBestX = 0;

  /** A4[13471] byte — ChooseAttackPosition: emergency AP tile X */
  chooseAPEmergencyX = 0;

  /** A4[13472] byte — ChooseAttackPosition: primary AP tile Y */
  chooseAPPrimaryY = 0;

  /** A4[13473] byte — ChooseAttackPosition: fallback AP tile Y */
  chooseAPFallbackY = 0;

  /** A4[13474] byte — ChooseAttackPosition: best-so-far AP tile Y */
  chooseAPBestY = 0;

  /** A4[13475] byte — ChooseAttackPosition: emergency AP tile Y */
  chooseAPEmergencyY = 0;

  /** A4[13476] long — ChooseAttackPosition: best-so-far cost */
  chooseAPBestCost = 0;

  /** A4[13482] byte — ChooseAttackPosition: current approach direction */
  chooseAPApproachDir = 0;

  /** A4[13484] long — ChooseAttackPosition: primary AP best cost threshold */
  chooseAPPrimaryBestCost = 0;

  /** A4[13488] byte — ChooseAttackPosition: scan start tile X = pill_tile_X - 20 */
  chooseAPScanStartX = 0;

  /** A4[13489] byte — ChooseAttackPosition: scan start tile Y = pill_tile_Y - 20 */
  chooseAPScanStartY = 0;

  /**
   * Last-tried AP sector (0-39), used to bias sector search away from failed
   * positions after a stall. Set on stall; reset to -1 on target change.
   * -1 = no bias (first approach or fresh target).
   */
  chooseAPLastSector = -1;

  /** A4[13502] word — ChooseAttackPosition: scan start BWorld X */
  chooseAPScanBWorldX = 0;

  /** A4[13504] word — ChooseAttackPosition: scan start BWorld Y */
  chooseAPScanBWorldY = 0;

  /** A4[7612] word — ChooseAttackPosition: init constant = 17 */
  chooseAPInitConst17 = 17;

  /** A4[7620] word — ChooseAttackPosition: init constant = 5 */
  chooseAPInitConst5 = 5;

  // ── Refuel state ───────────────────────────────────────────────────────────

  /** A4[7460] byte — Refuel: saved base.byte[12] */
  refuelSavedBaseByte12 = 0;

  /** A4[7461] byte — RefuelDoManStuff: mine direction index */
  refuelMineDirectionIndex = 0;

  /** A4[7462] byte — Refuel: state machine variable */
  refuelState = 0;

  /** Consecutive ticks the refuel navigation has failed to route to the base (port addition). When
   *  it crosses a threshold the boat-acquisition latch is cleared + a fresh dry path is forced, so a
   *  low-armour tank can't sit spinning forever ~3tx from a reachable ally refuel base (live stall). */
  refuelNavStall = 0;

  /** Close-the-kill latch (port addition). Set while the tank is finishing a nearly
   *  dead pill (armour ≤ a few) from CONFIRMED cover: it holds still and edge-fires,
   *  and refuelGoalCost suppresses the emergency break-off so the tank lands the last
   *  hits instead of retreating and leaving the pill stuck at ~3 armour forever. Only
   *  set when checkBarriers confirms the pill→tank shot is blocked (so staying is safe). */
  coverFinishHold = 0;

  /** Cover-fire dead-stop latch (port addition). Set while the tank is parked ON its cover firing
   *  slot grazing the pill. doCommonStuff's opportunistic forward bits otherwise cancel the slot's
   *  brake (accelerating===braking → coast), so the tank creeps ~1px/tick off the exact firing
   *  cell and its narrow graze mostly MISSES (measured: kill slowed ~10× vs a dead-still tank).
   *  aindy_think strips the drive bits + forces the brake when this is set — same fix as the refuel
   *  and PlacePill holds — so the hull holds the cell dead-still and every graze lands. */
  coverFireHold = 0;

  /** GetBase close-engage hold (port addition). Set while GetBase is engaging its target base at
   *  close range — shooting it down, driving onto a capturable (armour≤9) base, or holding on the
   *  cell to capture. Without it, doCommonStuff's opportunistic aim at a NEARBY ENEMY (a moving tank
   *  or man in range) fights GetBase's aim/steer at the STATIONARY base: the hull spins toward the
   *  enemy every tick and never settles, so shots miss the base (it regenerates) and the tank never
   *  drives onto the cell (live freeze: tank spun CCW diagonally adjacent to a bArm=7 capturable base
   *  while it regenerated 7→50). Like coverFireHold/onBoat, it makes doCommonStuff early-return so the
   *  base engagement owns the hull. Cleared every tick in aindy_think; only goalGetBase re-sets it. */
  getBaseEngageHold = 0;

  /** Latched cover placement (port addition). The cover (wall or captured pillbox) must sit on the
   *  pill's neighbour toward the TANK (the approach side), so the tank fires from BEHIND it — NOT
   *  toward the independently-chosen AP, which can land on the far side of the pill and leave the
   *  cover uselessly opposite the tank. The tile is latched once per target pill (keyed by
   *  coverTilePill) so it stays fixed as the tank advances to fire — recomputing from the moving
   *  tank each tick would drift the tile off the placed cover and trigger an endless rebuild.
   *  coverTilePill = the packed tile of the pill this cover is for (-1 = unset). */
  coverTileX = -1;
  coverTileY = -1;
  coverTilePill = -1;

  /** Retreat-cool-return latch (port addition; Puppy Love's two-pass doctrine). While the tank
   *  fires from behind cover the pill's return fire degrades a WALL cover (~11 hits) and HEATS the
   *  pill (fires faster → burns the wall down faster). When the wall is fully lost the tank pulls
   *  OUT of range until this tick, letting the pill COOL (speed resets while idle) and the builder
   *  rebuild fresh cover, then re-engages. 0 = engaging. (In-place `repair` of a damaged `}` wall —
   *  0 trees, builder is never targeted — is preferred; this cool cycle is the fallback when the
   *  wall is gone entirely.) */
  coverCoolUntil = 0;

  /** Cover-method establish timer + abandon cooldown (port addition). The cover method holds the tank
   *  (setSpeed 0) out of range while the builder builds/repairs cover. If the builder can't finish
   *  (killed, unreachable tile, long trip) the tank would hold FOREVER (live freeze: GetPill
   *  hold-dispatch, builder out, cover never appears). coverEngageStartTick resets whenever cover IS
   *  present; if it stays absent past a timeout we abandon the cover method and charge WITHOUT cover
   *  (coverAbandonUntilTick cooldown). Not a pill blacklist — the pill is still attacked, just without
   *  cover. The doc's finding: builder-based cover is impractical in live multi-pill play. */
  coverEngageStartTick = 0;
  coverAbandonUntilTick = 0;

  /** Tank armour last seen inside the cover-fire loop. A genuine wall FAILURE is unambiguous — the
   *  tank TAKES A HIT (armour drops) while in the pill's range — whereas the brain's checkBarriers
   *  LOS test disagrees with the engine's shell-vs-wall test at grazing edge cases and false-flags
   *  exposure. An armour drop is the ground-truth signal to bail into a cool pass. -1 = unseen. */
  coverPrevArmour = -1;

  /** A4[13895] byte — NewRefuel: sub-state machine variable */
  newRefuelState = 0;

  /** A4[13910] long — Refuel: path-planning budget */
  refuelPathBudget = 0;

  /** A4[13914] word — NewRefuel: target BWorld X */
  newRefuelTargetX = 0;

  /** A4[13916] word — NewRefuel: target BWorld Y */
  newRefuelTargetY = 0;

  /** A4[13918] byte — NewRefuel: sub-dispatch result code */
  newRefuelSubResult = 0;

  /** A4[14012] byte — Refuel: current waypoint index */
  refuelWaypointIndex = 0;

  /** A4[14013] byte — Refuel: total waypoint count */
  refuelWaypointCount = 0;

  /** A4[14014] word — Refuel: current waypoint packed XY */
  refuelWaypointPackedXY = 0;

  /** A4[14016] byte — Refuel: safe waypoint X (coarse) */
  refuelSafeWaypointX = 0;

  /** A4[14017] byte — Refuel: FindSafestPointFrom result X */
  refuelSafePointResultX = 0;

  /** A4[14018] byte — Refuel: safe waypoint Y (coarse) */
  refuelSafeWaypointY = 0;

  /** A4[14019] byte — Refuel: FindSafestPointFrom result Y */
  refuelSafePointResultY = 0;

  /** A4[14020] byte — Refuel: all-blocked flag */
  refuelAllBlocked = 0;

  /** A4[14022] long — Refuel: waypoint buffer start pointer (index into route array) */
  refuelWaypointBufferStart = 0;

  /** A4[14026] long — Refuel: waypoint budget limit */
  refuelWaypointBudget = 0;

  /** A4[14036] byte — RefuelSitOnSafeBase: cleared when A4[13918] nonzero */
  refuelSitClearFlag = 0;

  /** A4[14038] word — RefuelComputeEndTicks: partial tick sum */
  refuelEndTicksPartial = 0;

  /** A4[14040] byte — RefuelComputeEndTicks: lower fill threshold */
  refuelFillLower = 0;

  /** A4[14041] byte — RefuelComputeEndTicks: upper fill threshold */
  refuelFillUpper = 0;

  // ── PlacePill state ────────────────────────────────────────────────────────

  /** PlacePill: 1 when holding a dead stop (farming a tree / planting the pill) — tells
   *  aindy_think to strip doCommonStuff's forward bits so the brake isn't cancelled
   *  (accelerating+braking = coast → the tank drifts instead of holding still). */
  placePillHold = 0;

  /** PlacePill: tick when the builder was first seen DEPLOYED (out of tank) while PlacePill
   *  needs it to plant/farm; 0 while the builder is in the tank. If it stays deployed past a
   *  timeout the builder is ORPHANED (e.g. an emergency Refuel dragged the tank tiles away
   *  mid-plant, stranding the builder) — placePillGoalCost then yields so GetMan can fetch it
   *  instead of freezing on a plant-hold forever (live bug: PlacePill(1) held on base, builderIn
   *  false, pend none, indefinitely). Resets the instant the builder is back in the tank. */
  placePillBuilderOutSince = 0;

  /** PlacePill FARM-STALL watchdog. In the tree-gather phase the builder can loop harvesting a
   *  PHANTOM forest — a tile the client's cellAtTile still shows as forest but the server has as
   *  grass/road (a missed MAPCHANGE; see resume doc "client cellAtTile terrain DESYNC"). The
   *  harvest yields 0 trees so the tank farms forever. `placePillFarmStallSince` = tick the tank
   *  went stationary in the farm phase (0 while moving / after progress); `placePillFarmPrevTrees`
   *  = last observed tree count; if no tree gain for FARM_STALL_TICKS, placePillGoalCost sets
   *  `placePillFarmAbandonUntil` (a yield cooldown) so the tank does something else. */
  placePillFarmStallSince = 0;
  placePillFarmPrevTrees = 0;
  placePillFarmAbandonUntil = 0;

  /** A4[13884] byte — PlacePill: BaseToBuild tile X */
  placePillBaseTileX = 0;

  /** A4[13885] byte — PlacePill: BaseToBuild tile Y */
  placePillBaseTileY = 0;

  /** A4[13886] word — PlacePill: BaseToBuild BWorld X */
  placePillBaseBWorldX = 0;

  /** A4[13888] word — PlacePill: BaseToBuild BWorld Y */
  placePillBaseBWorldY = 0;

  /** A4[13890] byte — PlacePill: chosen placement tile X */
  placePillPlacementX = 0;

  /** A4[13891] byte — PlacePill: chosen placement tile Y */
  placePillPlacementY = 0;

  /** A4[13892] byte — PlacePillGotoBuildPoint: safe approach X tile */
  placePillSafeApproachX = 0;

  /** A4[13893] byte — PlacePillGotoBuildPoint: safe approach Y tile */
  placePillSafeApproachY = 0;

  /** A4[13894] byte — PlacePill: sub-state (0-3) */
  placePillSubState = 0;

  /** A4[14030] byte — PlacePill: "state changed this call" flag */
  placePillStateChanged = 0;

  /** A4[14031] byte — PlacePillGotoBuildPoint: safe-point cached flag */
  placePillSafePointCached = 0;

  /** A4[14032] byte — PlacePillGotoBuildPoint: arrived-at-safe-point flag */
  placePillArrivedAtSafePoint = 0;

  /** A4[14033] byte — PlacePillFinishUp: man-dispatched flag */
  placePillManDispatched = 0;

  /** A4[14034] byte — PlacePillFinishUp: ManTicksFromPath timing flag */
  placePillManTimingFlag = 0;

  /** A4[14035] byte — PlacePillFinishUp: "defenders-blocked halt" flag */
  placePillDefendersBlockedHalt = 0;

  // ── BaseToBuild state ──────────────────────────────────────────────────────

  /** A4[13674] byte — BaseToBuild: stale-target counter */
  baseToBuildStaleCounter = 0;

  /** A4[13676] long — BaseToBuild: stale-target history ptr (index) */
  baseToBuildStaleHistory: BaseState | null = null;

  /** A4[13018] byte — BuildBaseCost: mode flag (0=simple dist, nonzero=CoG-based) */
  buildBaseCostMode = 0;

  // ── CheckForAlliesRefueling state ──────────────────────────────────────────

  /** A4[6358] byte — CheckForAlliesRefueling: scan direction count */
  checkAlliesRefuelScanCount = 0;

  /** A4[13536] long — CheckForAlliesRefueling: "engage until" tick */
  checkAlliesRefuelEngageUntil = 0;

  /** A4[13604] long — CheckForAlliesRefueling: team alliance bitmask */
  checkAlliesRefuelTeamBitmask = 0;

  /** A4[13943] byte — CheckForAlliesRefueling: enemy-detected flag */
  checkAlliesRefuelEnemyDetected = 0;

  /** A4[13944] long — CheckForAlliesRefueling: tick when enemy detected */
  checkAlliesRefuelEnemyDetectedTick = 0;

  // ── Config/tuning tables ───────────────────────────────────────────────────

  /** A4[12880] word[14] — config/tuning table B (14 words) */
  configTableB: Int16Array = new Int16Array(14);

  /** A4[12908] word[14] — config/tuning table A (14 words) */
  configTableA: Int16Array = new Int16Array(14);

  /** A4[12938] byte — shield/armor bonus flag A */
  armorBonusFlagA = 0;

  /** A4[12939] byte — shield/armor bonus flag B */
  armorBonusFlagB = 0;

  /** A4[12940] byte — shield/armor bonus flag C */
  armorBonusFlagC = 0;

  // ── FindSafestPointInBoxFrom state ─────────────────────────────────────────

  /** A4[12976] byte — FindSafestPointInBoxFrom: strict-mode flag */
  findSafestStrictMode = 0;

  /** A4[12977] byte — Build: building permission flag */
  buildPermitted = 0;

  // ── ComputeBasePillDist state ──────────────────────────────────────────────

  /** A4[13680] byte — ComputeBasePillDist: per-tick "already computed" flag */
  basePillDistComputed = 0;

  // ── BrainOpen init flags ───────────────────────────────────────────────────

  /** A4[13006] byte — BrainOpen: cleared at init */
  brainOpenClearedFlag = 0;

  /** A4[13729] byte — BrainOpen: key-conflict flag (1 = using default keys) */
  keyConflictFlag = 0;

  // ── ManTicksFromPath passability (A4[6434]) ────────────────────────────────

  /** A4[6434] byte[16] — manstopped terrain passability (non-zero = passable) */
  terrainPassability: Uint8Array = new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x01, 0x01, 0x01, 0x00, 0x32, 0x20, 0x14, 0x10,
  ]);

  /** A4[6392] byte[16] — ManTicksFromPath: terrain movement scale table (ASR shift amounts) */
  terrainScaleShift: Uint8Array = new Uint8Array([
    4, 4, 2, 3, 4, 2, 2, 2, 2, 2, 2, 0, 2, 2, 4, 4,
  ]);

  // ── PPChoosePlacementLocation offset table ─────────────────────────────────

  /** A4[7412] word[12][2] — 12-entry placement offset table (X+Y per entry) */
  ppPlacementOffsets: Int16Array = new Int16Array(24);  // 12 × 2

  // ── FindTree scan table ────────────────────────────────────────────────────

  /** A4[10588] — FindTree: 5×5 grid scan coordinate offsets (25 × 2 shorts) */
  findTreeScanTable: Int8Array = new Int8Array(50);  // 25 entries × (dx, dy)

  /** A4[10688] byte[] — FindTree: terrain scan result buffer */
  findTreeResultBuffer: Uint8Array = new Uint8Array(64);

  /** A4[6296] int16[8][2] — FindTree: 8-direction X/Y tile offset table */
  findTreeDir8: Int8Array = new Int8Array(16);  // 8 entries × (dx, dy)

  // ── Per-pill bitmask table (A4[1346]) ─────────────────────────────────────

  /** A4[1346] long[16] — per-pill team bitmask table: 1 << (team + 16) */
  pillBitmaskTable: Uint32Array = new Uint32Array([
    0x00010000, 0x00020000, 0x00040000, 0x00080000,
    0x00100000, 0x00200000, 0x00400000, 0x00800000,
    0x01000000, 0x02000000, 0x04000000, 0x08000000,
    0x10000000, 0x20000000, 0x40000000, 0x80000000,
  ]);

  // ── CheckShotIncoming angular tolerance (A4[6448]) ────────────────────────

  /** A4[6448] byte[8] — CheckShotIncoming: angular tolerance table by distance tier */
  shotAngularTolerance: Uint8Array = new Uint8Array([20, 16, 8, 4, 4, 1, 0, 0]);

  // ── Message system ─────────────────────────────────────────────────────────

  /** A4[9334] buffer — ReceiveAnyMessages: token string workspace (216 bytes) */
  tokenStringBuffer: Uint8Array = new Uint8Array(216);

  /** Pending inbound message (replaces myTank[92] pointer — set by Orona adapter) */
  pendingMessage: { senderId: number; text: string } | null = null;

  /** Outbound message queue (messages to send to allied brains this tick) */
  outboundMessages: string[] = [];

  // ── Misc BrainOpen saved values ────────────────────────────────────────────

  /** Resource handle #1000 (Mac GetResource — not needed in TypeScript port) */
  resourceHandle1000: unknown = null;

  /** Resource handle #1001 (Mac GetResource — not needed in TypeScript port) */
  resourceHandle1001: unknown = null;

  // ─────────────────────────────────────────────────────────────────────────
  // CONSTRUCTOR
  // ─────────────────────────────────────────────────────────────────────────

  constructor() {
    // Initialize FindTree 5×5 scan table (BrainOpen step 28):
    //   for outer D4 in 0..4, inner D3 in 0..4:
    //     A4[10588 + D4*20 + D3*4] = (D4-2, D3-2)
    for (let d4 = 0; d4 < 5; d4++) {
      for (let d3 = 0; d3 < 5; d3++) {
        const base = (d4 * 5 + d3) * 2;
        this.findTreeScanTable[base]     = (d4 - 2) & 0xFF;  // dx (signed)
        this.findTreeScanTable[base + 1] = (d3 - 2) & 0xFF;  // dy (signed)
      }
    }

    // Initialize Examine terrain traversal cost table with default values.
    // These are overwritten by InitializeCosts at BrainOpen.
    // Defaults from routing_init_decode.md will be applied by BrainOpen.
    this.examineTerrainCostTable.fill(0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STRUCT ACCESSORS
  // In the original 68k code these were pointer arithmetic into heap blocks.
  // Here: bounds-checked array lookups.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * True if this pill is one THIS tank placed (and is still a friendly pill).
   * Tile-keyed against selfPlacedPillTiles; AND-ed with "currently an ally pill"
   * (!attackable) so a tile whose pill was captured by the enemy, or collected
   * away, does not falsely match. Repair-in-place (FixPill) is gated on this;
   * non-self-placed damaged ally pills are reclaimed instead.
   */
  isSelfPlacedPill(pill: PillState): boolean {
    if (pill.attackable) return false;   // enemy/neutral — never "ours to fix"
    return this.selfPlacedPillTiles.has(((pill.tileY & 0xFF) << 8) | (pill.tileX & 0xFF));
  }

  /**
   * GetPillFromXY: return pill at tile (x, y), or null.
   * Replaces direct pointer traversal of the pill list.
   */
  getPillAtTile(tileX: number, tileY: number): PillState | null {
    const tx = tileX & 0xFF;
    const ty = tileY & 0xFF;
    for (const p of this.pills) {
      if (p.active && p.tileX === tx && p.tileY === ty) return p;
    }
    return null;
  }

  /**
   * GetBaseFromXY: return base at tile (x, y), or null.
   */
  getBaseAtTile(tileX: number, tileY: number): BaseState | null {
    const tx = tileX & 0xFF;
    const ty = tileY & 0xFF;
    for (const b of this.bases) {
      if (b.tileX === tx && b.tileY === ty) return b;
    }
    return null;
  }

  /**
   * GetTankFromXY: return enemy/ally tank at tile (x, y), or null.
   */
  getTankAtTile(tileX: number, tileY: number): EnemyTankState | null {
    const tx = tileX & 0xFF;
    const ty = tileY & 0xFF;
    for (const t of this.men) {
      if (t.active && (t.x >> 8) === tx && (t.y >> 8) === ty) return t;
    }
    return null;
  }

  /**
   * RawGetMapCell: return terrain byte at tile (x, y).
   * Wraps to 256×256 with & 0xFF masking on both axes.
   */
  getMapCell(tileX: number, tileY: number): number {
    return this.worldMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)];
  }

  /**
   * Pill by index (0-based). Returns null if index out of range.
   */
  getPill(index: number): PillState | null {
    return index >= 0 && index < this.pills.length ? this.pills[index] : null;
  }

  /**
   * Base by index (0-based). Returns null if index out of range.
   */
  getBase(index: number): BaseState | null {
    return index >= 0 && index < this.bases.length ? this.bases[index] : null;
  }

  /**
   * Tank (ally/enemy) by index in the men array. Returns null if out of range.
   */
  getTank(index: number): EnemyTankState | null {
    return index >= 0 && index < this.men.length ? this.men[index] : null;
  }

  /**
   * The controlled tank's builderman. Returns null if no man active.
   * Corresponds to dereferencing TankRecord+104 (ManRecord ptr).
   */
  getMan(): ManState | null {
    return this.myMan;
  }

  /**
   * Set the world map byte at tile (x, y).
   */
  setMapCell(tileX: number, tileY: number, value: number): void {
    this.worldMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)] = value & 0xFF;
  }

  /**
   * Get the visit/cost map byte at tile (x, y).
   * Used by A* routefinders (WorldVisit, LocalVisit, Examine).
   */
  getVisitCell(tileX: number, tileY: number): number {
    return this.visitMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)];
  }

  /**
   * Set the visit/cost map byte at tile (x, y).
   */
  setVisitCell(tileX: number, tileY: number, value: number): void {
    this.visitMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)] = value & 0xFF;
  }

  /**
   * Get the owner map byte at tile (x, y). (0x10 = neutral/unvisited)
   */
  getOwnerCell(tileX: number, tileY: number): number {
    return this.ownerMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)];
  }

  /**
   * Set the owner map byte at tile (x, y).
   */
  setOwnerCell(tileX: number, tileY: number, value: number): void {
    this.ownerMap[((tileY & 0xFF) << 8) | (tileX & 0xFF)] = value & 0xFF;
  }
}
