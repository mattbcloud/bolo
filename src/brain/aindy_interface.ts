/**
 * aIndy3.1 Brain ↔ Orona Interface
 *
 * Defines the data types and adapter layer between aIndy3.1's internal state
 * representation and Orona's live game objects.
 *
 * Architecture:
 *   aIndy brain (pure TypeScript logic) reads BrainState
 *   aIndy brain writes to BrainControls
 *   OronaAdapter translates BrainControls → Tank boolean flags each tick
 *   OronaAdapter rebuilds BrainState from Orona game objects each tick
 *
 * Coordinate system (both aIndy and Orona):
 *   - 256 world units per tile (BWorld = world units)
 *   - Map is 256×256 tiles = 65536×65536 world units
 *   - Tile index = worldCoord >> 8
 *   - Tile center = (tileIndex << 8) + 128
 *   - Direction: 0-255, 0 = East, 64 = North, 128 = West, 192 = South
 *     Verified against Orona tank.ts motion formula (dir=0→+x/East, dir=64→-y/North).
 *     Note: the Y-negation in directionTo() produces this convention (not 64=South).
 *     (standard math convention: cos/sin tables index directly by direction value)
 *
 * Control word bits (decoded from aIndy3.1 binary, Session 46):
 *   steeringWord (A4[11678]):
 *     bit 2 (0x04) = large CCW turn (TurnTowardsDir: large angular error)
 *     bit 3 (0x08) = large CW turn
 *     bit 4 (0x10) = accelerate forward (AimAt, Shoot)
 *     bit 5 (0x20) = brake (AimAt: too close to target)
 *     bit 6 (0x40) = forward + firing mode (Shoot)
 *     bit ??? = mine placement (DropMines — exact bit TBD from engine)
 *   firingWord (A4[11682]):
 *     bit 2 (0x04) = fine CCW turn (TurnTowardsDir: small angular error)
 *     bit 3 (0x08) = fine CW turn
 *     bit 4 (0x10) = fire (Shoot: direct fire)
 *     bit 5 (0x20) = fire (Shoot: short-range supplemental)
 *     bit 6 (0x40) = fire (Shoot: rate-limited, 1/sec)
 *
 * Terrain type mapping (aIndy numeric ID = Orona BMAP index = ASCII char):
 *   0 = '|' building/wall     1 = ' ' river         2 = '~' swamp
 *   3 = '%' crater            4 = '=' road           5 = '#' forest
 *   6 = ':' rubble            7 = '.' grass          8 = '}' shot building
 *   9 = 'b' river+boat       10 = '^' deep sea      11 = base (via base flag)
 *  12 = pill slot (via pill flag)
 *
 * Mac OS API replacements:
 *   FixATan2(dy, dx) → Math.atan2(dy, dx) × (128/π) → 0..255 range
 *   Random()         → Math.floor(Math.random() * 65536) - 32768
 *   SANE sqrt/mul    → Math.sqrt(), *, +
 *   TickCount        → performance.now() as integer ticks (50/sec)
 *   NewHandle        → new Uint8Array / new Int16Array / etc.
 *   DisposeHandle    → (GC handles it, no-op)
 */

// ─────────────────────────────────────────────────────────────────────────────
// TERRAIN TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** aIndy terrain type constants (BMAP numeric encoding, 0-12) */
export const enum Terrain {
  WALL        = 0,   // '|' building/wall
  RIVER       = 1,   // ' ' river (deep water)
  SWAMP       = 2,   // '~' swamp
  CRATER      = 3,   // '%' crater
  ROAD        = 4,   // '=' road
  FOREST      = 5,   // '#' forest/trees
  RUBBLE      = 6,   // ':' rubble
  GRASS       = 7,   // '.' grass
  SHOT_WALL   = 8,   // '}' damaged building
  BOAT        = 9,   // 'b' river+boat
  DEEP_SEA    = 10,  // '^' deep sea
  BASE        = 11,  // base tile (special handling)
  PILL        = 12,  // pill slot (special handling)
}

/** Map terrain type ASCII char to aIndy numeric ID */
export const TERRAIN_ASCII_TO_ID: Record<string, Terrain> = {
  '|': Terrain.WALL, ' ': Terrain.RIVER, '~': Terrain.SWAMP,
  '%': Terrain.CRATER, '=': Terrain.ROAD, '#': Terrain.FOREST,
  ':': Terrain.RUBBLE, '.': Terrain.GRASS, '}': Terrain.SHOT_WALL,
  'b': Terrain.BOAT, '^': Terrain.DEEP_SEA,
};

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL WORDS → Orona Tank Flags
// ─────────────────────────────────────────────────────────────────────────────

/** Builder action command emitted by the brain and handled by _runBrainTick. */
export interface BuilderActionCommand {
  /** Orona BuilderAction (engine: builder.ts). 'forest' harvest, 'repair' fix pill,
   *  'boat' build boat on water, 'building' build a wall (cover), 'pillbox' plant a
   *  carried pillbox (cover/support), 'road' build road, 'mine' lay a mine. */
  action: 'forest' | 'repair' | 'boat' | 'building' | 'pillbox' | 'road' | 'mine';
  /** Number of trees to consume (0 for forest/mine/pillbox; walls/road/repair cost trees). */
  trees: number;
  /** Target tile X coordinate (0-255). */
  tileX: number;
  /** Target tile Y coordinate (0-255). */
  tileY: number;
}

/** Output from the brain: raw 32-bit control words (written each tick) */
export interface BrainControls {
  /** A4[11678]: steering control bits (see module JSDoc for bit assignments) */
  steeringWord: number;
  /** A4[11682]: firing control bits */
  firingWord: number;
  /** Optional builder dispatch command for this tick (handled by _runBrainTick). */
  builderAction?: BuilderActionCommand;
}

/** Steering word bit flags — verified from 68k assembly (binary extraction 2026-05-23) */
export const STEER = {
  ACCEL_HARD     : 0x01,  // SetSpeed: hard accelerate (desired > current + 3)
  BRAKE_HARD     : 0x02,  // SetSpeed: hard brake (desired < current - 3)
  TURN_CCW_LARGE : 0x04,  // TurnTowardsDir: >9-unit angular error, CCW
  TURN_CW_LARGE  : 0x08,  // TurnTowardsDir: >9-unit angular error, CW
  FORWARD        : 0x10,  // Shoot/AimAt: approach target (move toward while shooting)
  BRAKE          : 0x20,  // Shoot/AimAt: retreat/brake (too close to target)
  FORWARD_FIRE   : 0x40,  // KillBase/Shoot: forward-fire mode
  LAY_MINE       : 0x80,  // DropMines: deploy mine
} as const;

/** Firing word bit flags — verified from 68k assembly */
export const FIRE = {
  ACCEL_GENTLE   : 0x01,  // SetSpeed: gentle accelerate (desired in (current, current+3])
  BRAKE_GENTLE   : 0x02,  // SetSpeed: gentle brake (desired in [current-3, current))
  TURN_CCW_FINE  : 0x04,  // TurnTowardsDir: ≤9-unit angular error, CCW
  TURN_CW_FINE   : 0x08,  // TurnTowardsDir: ≤9-unit angular error, CW
  SHOOT          : 0x10,  // Shoot: fire (short range)
  SHOOT_SHORT    : 0x20,  // Shoot: fire (supplemental)
  SHOOT_RATELIM  : 0x40,  // Shoot: fire (rate-limited)
} as const;

/**
 * Apply brain control words to an Orona Tank object.
 *
 * Bit assignments verified directly from 68k assembly extraction (2026-05-23):
 *   steeringWord 0x01 = hard accel (SetSpeed)
 *   steeringWord 0x02 = hard brake (SetSpeed)
 *   steeringWord 0x04/firingWord 0x04 = CCW turn (TurnTowardsDir large/fine)
 *   steeringWord 0x08/firingWord 0x08 = CW  turn (TurnTowardsDir large/fine)
 *   steeringWord 0x10 = forward/approach (Shoot, AimAt)
 *   steeringWord 0x20 = brake/retreat   (Shoot, AimAt)
 *   steeringWord 0x40 = forward-fire    (KillBase, Shoot rate-limited)
 *   steeringWord 0x80 = lay mine        (DropMines)
 *   firingWord   0x01 = gentle accel    (SetSpeed)
 *   firingWord   0x02 = gentle brake    (SetSpeed)
 *   firingWord   0x10/0x20/0x40 = fire  (Shoot variants)
 */
export function applyControls(tank: OronaTankLike, controls: BrainControls): void {
  const s = controls.steeringWord;
  const f = controls.firingWord;

  tank.turningCounterClockwise = !!(s & STEER.TURN_CCW_LARGE) || !!(f & FIRE.TURN_CCW_FINE);
  tank.turningClockwise        = !!(s & STEER.TURN_CW_LARGE)  || !!(f & FIRE.TURN_CW_FINE);
  // Accelerating: hard accel (SetSpeed 0x01), gentle accel (SetSpeed firingWord 0x01),
  //               forward approach (Shoot/AimAt 0x10), forward-fire (0x40)
  tank.accelerating = !!(s & STEER.ACCEL_HARD) || !!(f & FIRE.ACCEL_GENTLE)
                   || !!(s & STEER.FORWARD)     || !!(s & STEER.FORWARD_FIRE);
  // Braking: hard brake (SetSpeed 0x02), gentle brake (SetSpeed firingWord 0x02),
  //          retreat (Shoot/AimAt 0x20)
  tank.braking = !!(s & STEER.BRAKE_HARD) || !!(f & FIRE.BRAKE_GENTLE) || !!(s & STEER.BRAKE);
  // In Mac Bolo, steeringWord 0x40 (11678|=0x40) fires the gun AND moves forward
  // simultaneously — it is the primary "on-target fire" path in Shoot/ShootPill.
  // Our mapping correctly accelerates on FORWARD_FIRE but was missing the shoot.
  tank.shooting   = !!(f & FIRE.SHOOT) || !!(f & FIRE.SHOOT_SHORT) || !!(f & FIRE.SHOOT_RATELIM)
                 || !!(s & STEER.FORWARD_FIRE);
  tank.layingMine = !!(s & STEER.LAY_MINE);
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN STATE — what the aIndy brain reads each tick
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BrainState mirrors the A4 global block that the original Mac brain read from
 * the Bolo engine. Built by OronaAdapter.buildState() each tick.
 *
 * All coordinates in world units (BWorld). All directions 0-255.
 */
export interface BrainState {
  // ── Core tank record (myTank) ──────────────────────────────────────────────
  tank: TankState;

  // ── Map arrays (256×256 = 65536 bytes each, indexed y<<8|x) ───────────────
  /** Raw terrain types (0-12) for each tile. Pill/base tiles flagged by mask. */
  worldMap: Uint8Array;         // A4[11690] — 65536 bytes
  /** Danger level per tile (from pill line-of-fire and tank danger detection) */
  dangerMap: Uint8Array;        // A4[11694] — 65536 bytes
  /** Blocked flag per tile (nonzero = blocked for routing) */
  blockedMap: Uint8Array;       // A4[11706] — 65536 bytes
  /** Active object count per tile (1+ = occupied) */
  occupancyMap: Uint8Array;     // A4[11698] — 65536 bytes
  /** Team ownership per tile (team 0-5, 255=neutral/enemy) */
  allyMap: Uint8Array;          // A4[11714] — 65536 bytes
  /** Sight/coverage array (nonzero = tile visible to brain's team) */
  sightMap: Uint8Array;         // A4[11710] — 65536 bytes
  /** 65536-byte cost/visit scratch space (for A* pathfinding, zeroed each search) */
  visitMap: Uint8Array;         // A4[13048] — 65536 bytes
  /** Owner/cell-type classification map (for routing decisions) */
  ownerMap: Uint8Array;         // A4[13682] — 65536 bytes

  // ── Object lists ──────────────────────────────────────────────────────────
  bases: BaseState[];           // A4[11736] — base array, stride 184
  pills: PillState[];           // A4[11740] — pill array, stride 112
  /** All visible tanks (enemies + allies) */
  tanks: EnemyTankState[];      // A4[11752] — ally-tank array, stride 80

  // ── Game counters ──────────────────────────────────────────────────────────
  baseCount: number;            // A4[12800]
  pillCount: number;            // A4[12801]
  teamBitmask: number;          // A4[12956] — bit per allied team
  tickCounter: number;          // A4[11726] — brain tick number
  tickCount: number;            // A4[13722] — Mac TickCount equivalent (perf.now/20)
}

/** State of the controlled tank (myTank) */
export interface TankState {
  // Position & orientation
  x: number;                    // BWorld X (TankRecord+4)
  y: number;                    // BWorld Y (TankRecord+6)
  tileX: number;                // Tile X (A4[11686])
  tileY: number;                // Tile Y (A4[11687])
  direction: number;            // 0-255 (TankRecord+24)
  facingDir: number;            // 0-255 (TankRecord+40 — alternate facing)
  speed: number;                // current speed (TankRecord+41, via myTank.speed)
  localX: number;               // Local X (TankRecord+36)
  localY: number;               // Local Y (TankRecord+38)
  altX: number;                 // Alternate X (TankRecord+66, man position)
  altY: number;                 // Alternate Y (TankRecord+68)
  team: number;                 // Team 0-5 (TankRecord+25)

  // Resources
  armor: number;                // 0-40 (TankRecord+44)
  shells: number;               // 0-40 raw shell count (TankRecord+46) — used for binary-accurate refuel thresholds
  ammo: number;                 // 0-8 ammo count (shells/5, for backward compat)
  shellCount: number;           // Shot range/count multiplier (TankRecord+52)
  mineCount: number;            // Mine count (TankRecord+55)
  pillsCarried: number;         // Pills in hand (TankRecord+48)
  resourceCount: number;        // Fuel/ammo resource (TankRecord+47)
  resourceEnabled: boolean;     // Resource gate: false = tank can harvest trees (TankRecord+42)
  mineDeployEnabled: boolean;   // Mine deploy flag (TankRecord+45)
  builderInTank: boolean;       // true when builder is in the tank (available for dispatch)
  onBoat: boolean;              // Whether tank is currently on a boat (Orona-specific)

  // Man (builder)
  manBehaviorA: number;         // TankRecord+77 (LocalRouteFind param)
  manBehaviorB: number;         // TankRecord+76
  manPtr: ManState | null;      // TankRecord+104 → ManRecord

  // Counts
  menInGame: number;            // TankRecord+18 word
  pillsInGame: number;          // TankRecord+20 word
  basesInGame: number;          // TankRecord+22 word
  baseCountOwned: number;       // TankRecord+86 word

}

/** State of a base (BaseRecord, stride 184) */
export interface BaseState {
  index: number;                // Base index
  x: number;                   // BWorld X (+180)
  y: number;                   // BWorld Y (+182)
  tileX: number;               // (x >> 8) & 0xFF
  tileY: number;               // (y >> 8) & 0xFF
  armor: number;               // +10 word
  buildable: boolean;          // +11 byte
  flags: number;               // +22 byte (bit0=ally, bit1=enemy)
  isAlly: boolean;             // flags & 0x01
  isEnemy: boolean;            // flags & 0x02
  defended: boolean;           // +23 byte
  difficulty: number;          // +15 byte (cost tier 0-3)
  forceFlag: boolean;          // +41 byte
  newRefuelTrigger: boolean;   // +43 byte
  teamId: number;              // +44 long
  minDistToEnemyPill: number;  // +26 word
  distToTank: number;          // +28 word
  distToAllyCoG: number;       // +30 word
  distToFrontline: number;     // +32 word
  neutralPillMask: number;     // +34 word
  allyPillMask: number;        // +36 word
  enemyPillMask: number;       // +38 word
  nearbyBaseCount: number;     // +112 byte
  nearbyBasePtrs: BaseState[]; // +48 long[] (up to 16)
  nearbyPillCount: number;     // +178 byte
  nearbyPillPtrs: PillState[]; // +114 long[]

  // Orona source reference
  oronaBase?: any;
}

/** State of a pill (PillRecord, stride 112) */
export interface PillState {
  index: number;               // Pill index
  active: boolean;             // +1 byte (1=active/held, 0=dropped)
  x: number;                  // BWorld X (+6)
  y: number;                  // BWorld Y (+8)
  altX: number;               // BWorld X alternate (+26, for ChooseAttackPosition)
  altY: number;               // BWorld Y alternate (+28)
  backupX: number;            // Backup X (+54, before DeletePillCover)
  backupY: number;            // Backup Y (+56)
  tileX: number;              // (x >> 8) & 0xFF
  tileY: number;              // (y >> 8) & 0xFF
  ownerByte: number;          // +10 byte (owner team/pill index)
  ownerByte2: number;         // +11 byte
  surroundOwner: number;      // +110 byte (init=16)
  surroundOwner2: number;     // +111 byte (init=16)
  armour: number;             // Orona pill armour (0–15; 0 = auto-capturable)
  captureDifficulty: number;  // +12 byte: count of neutral bases near this pill (0–7)
  defenderCount: number;      // +19 byte
  attackable: boolean;        // +20 byte bit0 (enemy-attackable)
  capturable: boolean;        // +30 byte
  alreadyTargeted: boolean;   // +31 byte
  processingBlocked: boolean; // +32 byte
  distToTank: number;         // +22 word
  repairTargetX: number;      // +50 word
  repairTargetY: number;      // +52 word
  lastAttemptTick: number;    // +58 long
  shieldDelay: number;        // +62 byte (init=100)
  approachSpeed: number;      // +68 byte (init=1)
  approachSpeedMax: number;   // +69 byte (init=7)
  approachSpeedTier: number;  // +70 byte
  manTimeCacheValid: boolean; // +82 byte
  manTimeCached: number;      // +84 long
  lastShotTick: number;       // +98 long
  coverSaveX: number;         // +54 word (backup before DeletePillCover)
  coverSaveY: number;         // +56 word

  // Orona source reference
  oronaPill?: any;
}

/** State of a visible tank (ally or enemy, stride 80 for ally array) */
export interface EnemyTankState {
  index: number;
  x: number;                  // BWorld X
  y: number;                  // BWorld Y
  direction: number;          // 0-255
  team: number;               // 0-5
  isAlly: boolean;            // (team == myTank.team)
  isEnemy: boolean;           // !isAlly
  attackable: boolean;        // byte[75] bit0
  active: boolean;            // byte[1] = 1
  distanceMetric: number;     // long[2] (distance/timing metric)
  flags: number;              // byte[76] (visibility/team flag)
  teamFlag: number;           // byte[76]

  // Orona source reference
  oronaTank?: any;
}

/** State of the builderman (ManRecord, stride 98 main, 80 ally) */
export interface ManState {
  index: number;              // +0 byte
  active: boolean;            // +31 byte (1=on map, 0=in base)
  x: number;                 // BWorld X (+6)
  y: number;                 // BWorld Y (+8)
  distMetric: number;        // +2 long
  baseIndex: number;         // +86 byte (16 = not in base)
  terrainFlag: number;       // +74 byte (behavior/terrain mode)
  attackable: boolean;       // +75 byte bit0
  pathTiming: number;        // +88 long (0x7FFFFFFF = no valid path)
  interceptComputed: boolean;// +92 byte
  interceptX: number;        // +94 word
  interceptY: number;        // +96 word
  actionCode: number;        // man action (1=nav, 2=place-pill, 3=build, 4=drop-pill, 5=mine)

  // Orona source reference
  oronaBuilder?: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAC OS API REPLACEMENTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FixATan2 replacement ($A818).
 * Returns angle 0-255 for direction from (0,0) toward (dx, dy).
 * Scale: 2π radians = 256 units, 0 = East.
 */
export function fixATan2(dy: number, dx: number): number {
  // Math.atan2 returns -π..π; convert to 0..255 range
  const rad = Math.atan2(dy, dx);
  return ((rad * 128 / Math.PI) + 256) & 0xFF;
}

/**
 * Mac Random() replacement ($A861).
 * Returns a random integer in -32768..32767.
 */
export function macRandom(): number {
  return Math.floor(Math.random() * 65536) - 32768;
}

/**
 * TickCount replacement ($A975).
 * Returns current tick number at 50 ticks/second (same as Orona's tick rate).
 */
export function tickCount(): number {
  return Math.floor(performance.now() * 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP TABLES (from lookup_tables.py, Session 46)
// ─────────────────────────────────────────────────────────────────────────────

/** LocationFromDir X-slopes: cos(i × 2π/256) × 16384 as int32, 256 entries */
export const LFD_X_SLOPES = new Int32Array(256).map((_, i) =>
  Math.round(Math.cos(i * 2 * Math.PI / 256) * 16384)
);

/**
 * LocationFromDir Y-slopes: -sin(i × 2π/256) × 16384 as int32, 256 entries.
 *
 * NEGATED because Orona uses screen coordinates (Y increases southward),
 * and directionTo() negates dy (screen→math) before calling atan2.
 * To keep locationFromDir consistent with directionTo:
 *   direction 64  (North) → newY = y - delta  (Y decreases = moves UP/North) ✓
 *   direction 192 (South) → newY = y + delta  (Y increases = moves DOWN/South) ✓
 * Without negation the Y component was inverted, causing hops, APs, and shot
 * trajectories to land on the opposite side of targets from the intended direction.
 */
export const LFD_Y_SLOPES = new Int32Array(256).map((_, i) =>
  Math.round(-Math.sin(i * 2 * Math.PI / 256) * 16384)
);

/** stuarts_aim X-slopes: cos(i × 2π/256) × 128 as int16, 256 entries */
export const STUARTS_X = new Int16Array(256).map((_, i) =>
  Math.round(Math.cos(i * 2 * Math.PI / 256) * 128)
);

/** stuarts_aim Y-slopes: sin(i × 2π/256) × 128 as int16, 256 entries */
export const STUARTS_Y = new Int16Array(256).map((_, i) =>
  Math.round(Math.sin(i * 2 * Math.PI / 256) * 128)
);

/** ManLocationFromTicks Y-slopes: -sin × 128, negated stuarts_y, 256 entries */
export const MAN_Y_SLOPES = new Int16Array(256).map((_, i) => -STUARTS_Y[i]);

/** Terrain passability for manstopped: nonzero = man can walk, indexed by terrain type */
export const TERRAIN_PASSABILITY = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00,
  0x01, 0x01, 0x01, 0x00, 0x32, 0x20, 0x14, 0x10,
]);

/** Terrain movement scale shifts for ManTicksFromPath (ASR shift by terrain type) */
export const TERRAIN_SCALE_SHIFT = new Uint8Array([
  4, 4, 2, 3, 4, 2, 2, 2, 2, 2, 2, 0, 2, 2, 4, 4,
]);

/** CheckShotIncoming angular tolerance by distance tier 0-5 (entries 6-7 are invalid) */
export const SHOT_ANGULAR_TOLERANCE = new Uint8Array([20, 16, 8, 4, 4, 1, 0, 0]);

/** Per-pill team bitmask: pill_bitmask[team] = 1 << (team + 16) */
export const PILL_BITMASK = new Uint32Array([
  0x00010000, 0x00020000, 0x00040000, 0x00080000,
  0x00100000, 0x00200000, 0x00400000, 0x00800000,
  0x01000000, 0x02000000, 0x04000000, 0x08000000,
  0x10000000, 0x20000000, 0x40000000, 0x80000000,
]);

/** 8-direction tile offsets: dir8[i] = [dx, dy] for FindTree, BuildBase, etc. */
export const DIR8: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, -1], [0, 1], [0, -1], [-1, 1], [-1, -1], [1, 1], [1, 0],
] as const;

/** 16-direction extended tile offsets for PPLocationUseable wider scan */
export const DIR16: ReadonlyArray<readonly [number, number]> = [
  [-2, 2], [0, 0], [2, -2], [0, -1], [-2, 1], [-2, 2], [-1, 2], [1, 1],
  [2, -1], [2, -2], [1, -2], [-1, -2], [-2, 2], [-2, 2], [2, -2], [2, 0],
] as const;

/** Speed profile table: 16 floats indexed by movement_mode & 0xF (for ComputeManShootLocation) */
export const SPEED_PROFILE = new Float64Array([
  0.0, 1.0, 1.0, 4.0, 2.0, 1.0, 4.0, 0.0,
  0.0, 4.0, 4.0, 0.0, 0.0, 0.0, 0.0, 0.0,
]);

// ─────────────────────────────────────────────────────────────────────────────
// ORONA ADAPTER — builds BrainState from Orona objects
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal interface for the Orona Tank object fields the brain needs */
export interface OronaTankLike {
  x: number | null;
  y: number | null;
  direction: number;
  speed: number;
  armour: number;
  shells: number;
  mines: number;
  trees: number;
  firingRange: number;
  team: number | null;
  builder?: any;
  cell?: any;
  turningClockwise: boolean;
  turningCounterClockwise: boolean;
  accelerating: boolean;
  braking: boolean;
  shooting: boolean;
  layingMine: boolean;
  kills: number;
  deaths: number;
  onBoat?: boolean;             // Whether tank is currently on a boat
  /** Returns array of pillboxes currently being carried by the tank */
  getCarryingPillboxes?: () => any[];
}

/** Minimal interface for the Orona WorldMap (or equivalent) */
export interface OronaMapLike {
  pills: any[];
  bases: any[];
  cellAtTile(x: number, y: number): any;
}

// ── Static terrain cache ────────────────────────────────────────────────────
// The Bolo terrain (road, grass, forest, walls, water) is STATIC — it never
// changes during a game. Only pill presence and base state change dynamically.
// We build the static terrain map once and copy+overlay each tick instead of
// calling cellAtTile() 65536 times (which caused 50ms+ handler violations).
let _staticTerrainMap: Uint8Array | null = null;
let _waterTileList: Uint16Array | null = null;   // tiles with isTrueWater
let _waterTileCount = 0;
let _staticTerrainBuilt = false;

/** Reset the cached static-terrain layer. Used by the headless harness so each
 *  boot rebuilds terrain from its own (fresh) map — prevents cross-boot state
 *  leaking between simulation trials. No effect on the live game (single map). */
export function _resetStaticTerrainCache(): void {
  _staticTerrainMap = null;
  _waterTileList = null;
  _waterTileCount = 0;
  _staticTerrainBuilt = false;
}

/** Reset the static terrain cache (call when joining a new game/map). */
export function resetStaticTerrainCache(): void {
  _staticTerrainBuilt = false;
  _staticTerrainMap   = null;
  _waterTileList      = null;
  _waterTileCount     = 0;
}

/**
 * Builds the BrainState from Orona game objects.
 * Called every tick before the brain runs.
 *
 * IMPORTANT: The worldMap, dangerMap, blockedMap, occupancyMap, allyMap arrays
 * are 65536 bytes each and should be reused (pass as pre-allocated arrays to
 * avoid GC pressure during the 50 Hz tick loop).
 */
export function buildBrainState(
  myTank: OronaTankLike,
  oronaMap: OronaMapLike,
  allTanks: OronaTankLike[],
  tickNum: number,
  // Pre-allocated scratch arrays (reused each tick):
  worldMap: Uint8Array,
  dangerMap: Uint8Array,
  blockedMap: Uint8Array,
  occupancyMap: Uint8Array,
  allyMap: Uint8Array,
  sightMap: Uint8Array,
  visitMap: Uint8Array,
  ownerMap: Uint8Array,
): BrainState {
  // ── World map terrain encoding ─────────────────────────────────────────────
  // Rebuild worldMap from Orona cells.
  // This is expensive (65536 lookups) — may want to cache and update incrementally.
  // The 0x80 flag on a world map byte means "this water cell has a boat available"
  // (original Bolo BMAP encoding). Cost for 0x80|terrain = 19 (cheap, boat navigable).
  // Without 0x80, water terrain (type 1=river, 10=deep-sea) costs 1000 (impassable).
  // We set 0x80 on water cells ONLY when the brain's tank is on a boat, meaning
  // the tank can navigate water. When on land, water is treated as impassable walls.
  const tankOnBoat = !!(myTank.onBoat);

  // Build the worldMap efficiently using a cached static terrain layer.
  // Terrain is STATIC (never changes during a game). Pills and bases overlay it.
  // On first call: build the static terrain + water-tile index from cellAtTile().
  // On subsequent calls: copy cached base, overlay pills/bases, apply boat flag.
  if (!_staticTerrainBuilt || !_staticTerrainMap) {
    _staticTerrainMap = new Uint8Array(65536);
    _waterTileList    = new Uint16Array(65536);
    _waterTileCount   = 0;

    for (let ty = 0; ty < 256; ty++) {
      for (let tx = 0; tx < 256; tx++) {
        const cell = oronaMap.cellAtTile(tx, ty);
        const idx = (ty << 8) | tx;
        // Static terrain — no pill/base overlay here (applied per-tick below)
        const terrainId = TERRAIN_ASCII_TO_ID[cell.type?.ascii ?? '|'] ?? Terrain.WALL;
        _staticTerrainMap[idx] = terrainId;
        if (terrainId === Terrain.RIVER || terrainId === Terrain.DEEP_SEA) {
          _waterTileList[_waterTileCount++] = idx;
        }
      }
    }
    _staticTerrainBuilt = true;
  }

  // Fast path: copy static terrain, then overlay dynamic elements
  worldMap.set(_staticTerrainMap);

  // Overlay pill tiles — only active (armour > 0) pills block routing.
  // Dead pills (armour=0) are driven over to capture; their tile should show
  // the underlying terrain so the A* can route onto it.
  for (const pill of oronaMap.pills) {
    if ((pill.armour ?? 0) <= 0) continue;   // dead/empty: don't block routing
    if (pill.cell) {
      worldMap[(pill.cell.y << 8) | pill.cell.x] = Terrain.PILL;
    } else if (pill.x != null && pill.y != null) {
      worldMap[(((pill.y >> 8) & 0xFF) << 8) | ((pill.x >> 8) & 0xFF)] = Terrain.PILL;
    }
  }

  // Overlay base tiles.
  // ALLY bases must stay PASSABLE: the tank has to drive ONTO its own base to refuel
  // (refuel requires tank.cell === base.cell). Marking them 0x40 (cost 1000, impassable)
  // made A* unable to route to a refuel target → Refuel showed route:MISS/noRoute and the
  // tank drifted off the map past its bases instead of reaching one (observed live on
  // SlugfestVII). The binary used a quality PENALTY (~5000, avoid routing THROUGH), not a
  // hard block — a penalty still lets a base be a reachable DESTINATION. We keep it simple:
  // ally + neutral bases are plain passable BASE (driving over your own base is harmless).
  //
  // Only ENEMY bases with armour > 9 AND an active owner are blocked: world_map.ts
  // getTankSpeed/getTankTurn return 0 on that tile (a tank that lands there is frozen), so
  // A* must route around; goalGetBase shoots them from adjacent. Threshold matches
  // world_map.ts:83 (`owner != null && armour > 9`); using owner (not just team) matters —
  // when a team leaves, owner becomes null and the base is passable even if team persists.
  for (const base of oronaMap.bases) {
    const isAlly = base.team != null && base.team === myTank.team;
    const isEnemyArmoured = !isAlly && base.owner != null && (base.armour ?? 0) > 9;
    const terrain = isEnemyArmoured ? (0x40 | Terrain.BASE) : Terrain.BASE;
    if (base.cell) {
      worldMap[(base.cell.y << 8) | base.cell.x] = terrain;
    } else if (base.x != null && base.y != null) {
      worldMap[(((base.y >> 8) & 0xFF) << 8) | ((base.x >> 8) & 0xFF)] = terrain;
    }
  }

  // Apply 0x80 boat-navigable flag to water tiles when tank is on a boat
  if (tankOnBoat && _waterTileList) {
    for (let i = 0; i < _waterTileCount; i++) {
      worldMap[_waterTileList[i]] |= 0x80;
    }
  }

  // ── Occupancy map: mark tiles with tanks ──────────────────────────────────
  occupancyMap.fill(0);
  for (const t of allTanks) {
    if (t.x != null && t.y != null) {
      const tx = (t.x >> 8) & 0xFF;
      const ty = (t.y >> 8) & 0xFF;
      occupancyMap[(ty << 8) | tx]++;
    }
  }

  // ── Danger map: mark tiles in enemy pill firing arcs ─────────────────────
  // For each active armed enemy pill, trace rays outward and mark what it can shoot:
  // ≤2 tiles → 3, ≤4 → 2, ≤DANGER_TILES → 1; a tile keeps the worst value any pill gives it.
  //
  // Three things here were wrong, all measurable against the engine (shell.ts collide(),
  // world_pillbox.ts:254):
  //
  //   RANGE. A pillbox reaches 1919 world units — 1792 of shell plus the 127 collision
  //   radius — which is 7.5 tiles, not the 6 this used to trace. Deaths clustered at 7-8
  //   tiles, i.e. precisely in the band the map called safe.
  //
  //   BARRIERS. It stopped rays at WATER and let them through WALLS, on a note that "shots
  //   pass through walls in Bolo". They do not: a shell dies on isType('|','}','#','b'), and
  //   combat.ts:213 already says so ("Earlier wall-penetration model was wrong"). A river
  //   stops nothing. So this both invented danger behind walls and missed it across rivers.
  //
  //   RESOLUTION. 16 rays is every 22.5°, which at 7 tiles leaves 2.7-tile gaps between
  //   adjacent rays — most of the outer ring was never marked at all. 64 rays close it.
  const DANGER_TILES = 7;    // 1919 units of pill reach = 7.5 tiles
  const DANGER_RAYS = 64;    // every 5.6°: ~0.7-tile spacing at the outer ring
  dangerMap.fill(0);
  const myTeamId = myTank.team ?? 0;
  for (const pill of oronaMap.pills) {
    if (pill.inTank) continue;
    if (pill.team === myTeamId) continue;        // friendly pill: no danger
    if (!pill.armour || pill.armour <= 0) continue; // dead pill: no danger

    const px = pill.x != null ? (pill.x >> 8) & 0xFF : -1;
    const py = pill.y != null ? (pill.y >> 8) & 0xFF : -1;
    if (px < 0) continue;

    for (let ray = 0; ray < DANGER_RAYS; ray++) {
      const angle = (ray * 256) / DANGER_RAYS;
      const cosA  = Math.cos(angle * Math.PI / 128);
      const sinA  = Math.sin(angle * Math.PI / 128);

      for (let r = 1; r <= DANGER_TILES; r++) {
        const tx = Math.round(px + cosA * r) & 0xFF;
        const ty = Math.round(py + sinA * r) & 0xFF;
        const idx = (ty << 8) | tx;
        const terrain = worldMap[idx] & 0x0F;

        // What actually stops a shell: wall, shot-wall, forest, boat (shell.ts collide()).
        // Water is not on that list; walls are.
        if (terrain === 0 || terrain === 8 || terrain === 5 || terrain === 9) break;

        const danger: number = r <= 2 ? 3 : r <= 4 ? 2 : 1;
        if (danger > dangerMap[idx]) {
          dangerMap[idx] = danger;
        }
      }
    }
  }

  // ── Blocked map: cleared each tick, then populated by addTanks.
  // Walls are already impassable via examineTerrainCostTable[0]=1000.
  // The blockedMap adds a 500 penalty to non-wall tiles (used for enemy
  // builder positions set by addTanks via 0x40 worldMap flag).
  blockedMap.fill(0);

  // ── Ally map: team ownership per tile ─────────────────────────────────────
  allyMap.fill(0xFF);  // 0xFF = neutral/unknown
  for (const base of oronaMap.bases) {
    if (base.cell && base.team != null) {
      const idx = (base.cell.y << 8) | base.cell.x;
      allyMap[idx] = base.team;
    }
  }
  for (const pill of oronaMap.pills) {
    if (pill.cell && pill.team != null) {
      const idx = (pill.cell.y << 8) | pill.cell.x;
      allyMap[idx] = pill.team;
    }
  }

  // ── Pre-compute centers of gravity for ally and enemy bases ───────────────
  // Used by base.distToAllyCoG and base.difficulty computations below.
  let _allyCogX = 0, _allyCogY = 0, _allyCogN = 0;
  let _enemyCogX = 0, _enemyCogY = 0, _enemyCogN = 0;
  for (const b of oronaMap.bases) {
    if (b.x == null || b.y == null) continue;
    if (b.team === myTeamId) {
      _allyCogX += b.x; _allyCogY += b.y; _allyCogN++;
    } else if (b.team != null) {
      _enemyCogX += b.x; _enemyCogY += b.y; _enemyCogN++;
    }
  }
  const allyCogX  = _allyCogN  > 0 ? Math.round(_allyCogX  / _allyCogN)  : 0;
  const allyCogY  = _allyCogN  > 0 ? Math.round(_allyCogY  / _allyCogN)  : 0;
  const enemyCogX = _enemyCogN > 0 ? Math.round(_enemyCogX / _enemyCogN) : 0;
  const enemyCogY = _enemyCogN > 0 ? Math.round(_enemyCogY / _enemyCogN) : 0;

  // ── Build tank state ───────────────────────────────────────────────────────
  const myTeam = myTank.team ?? 0;
  const tankX = myTank.x ?? 0;
  const tankY = myTank.y ?? 0;

  const tank: TankState = {
    x: tankX, y: tankY,
    tileX: (tankX >> 8) & 0xFF,
    tileY: (tankY >> 8) & 0xFF,
    direction: myTank.direction,
    facingDir: myTank.direction,
    speed: myTank.speed,
    localX: tankX & 0xFF,
    localY: tankY & 0xFF,
    altX: 0, altY: 0,  // set from builder position if available
    team: myTeam,
    armor: myTank.armour,
    shells: myTank.shells ?? 0,             // raw 0-40 shell count for binary-accurate thresholds
    ammo: Math.round((myTank.shells ?? 0) / 5),  // shells 0-40 → ammo 0-8
    shellCount: Math.round(myTank.firingRange * 2),  // firingRange 1-7 → byte[52]
    mineCount: myTank.mines,
    pillsCarried: myTank.getCarryingPillboxes ? myTank.getCarryingPillboxes().length : 0,
    resourceCount: myTank.trees,
    // resourceEnabled mirrors TankRecord+42: 0=can harvest, nonzero=skip harvest.
    // We set it based on whether the tank has room for more trees (cap 40).
    resourceEnabled: (myTank.trees ?? 0) >= 40,
    mineDeployEnabled: myTank.mines > 0,
    onBoat: !!(myTank.onBoat),
    manBehaviorA: 1,
    manBehaviorB: 0,
    builderInTank: !myTank.builder || (myTank.builder.$.x == null),
    manPtr: null,       // filled below if builder is on map
    menInGame: allTanks.filter(t => t.team === myTeam && t.builder != null).length,
    pillsInGame: oronaMap.pills.length,
    basesInGame: oronaMap.bases.length,
    baseCountOwned: oronaMap.bases.filter((b: any) => b.team === myTeam).length,
  };

  // Builder (man) state.
  // In Orona, builder.x and builder.y are null when the builder is inside the
  // tank (not deployed on the map). Only create manPtr when the builder has a
  // real position — otherwise the brain would navigate toward tile (0,0).
  if (myTank.builder) {
    const b = myTank.builder.$;
    const bx: number | null = b.x ?? null;
    const by: number | null = b.y ?? null;
    tank.altX = bx ?? 0;
    tank.altY = by ?? 0;
    if (bx != null && by != null) {
      // Builder is deployed on the map with a valid position
      tank.manPtr = {
        index: 0,
        active: true,
        x: bx,
        y: by,
        distMetric: 0,
        baseIndex: 16,              // 16 = not in base
        terrainFlag: 0,
        attackable: false,
        pathTiming: 0x7FFFFFFF,     // default: no valid path
        interceptComputed: false,
        interceptX: 0,
        interceptY: 0,
        actionCode: b.order,
        oronaBuilder: b,
      };
    }
    // If x/y are null, builder is in tank → leave manPtr as null so the brain
    // does not issue a GetMan goal or navigate toward (0, 0).
  }

  // ── Build pill states ──────────────────────────────────────────────────────
  const pills: PillState[] = oronaMap.pills.map((p: any, i: number): PillState => ({
    index: i,
    active: !p.inTank,
    x: p.x ?? 0,
    y: p.y ?? 0,
    altX: p.x ?? 0,
    altY: p.y ?? 0,
    backupX: p.x ?? 0,
    backupY: p.y ?? 0,
    tileX: p.x != null ? (p.x >> 8) & 0xFF : 0,
    tileY: p.y != null ? (p.y >> 8) & 0xFF : 0,
    ownerByte: p.team ?? 0xFF,
    ownerByte2: p.team ?? 0xFF,
    surroundOwner: 16,
    surroundOwner2: 16,
    armour: p.armour ?? 0,
    // captureDifficulty: count of neutral bases where this pill appears in ally/enemy
    // pill mask (PillToGet 0x00cec4: pill[+12] is incremented per qualifying base).
    // Computed in post-processing below after bases are built; init to 0.
    captureDifficulty: 0,
    // defenderCount: count enemy/neutral tanks within 5 tiles of this pill
    // that could contest our attack. Also add 1 if the pill itself is actively
    // firing (haveTarget). This is used by ChooseGoal cost functions.
    defenderCount: (() => {
      const px = p.x ?? 0;
      const py = p.y ?? 0;
      const DEFEND_RANGE = 5 * 256;  // 5 tiles
      let count = p.haveTarget ? 1 : 0;
      for (const t of allTanks) {
        if (t === myTank) continue;
        if (t.team === myTeamId) continue;    // ally tank: not a defender
        if (t.armour === 255 || t.x == null || t.y == null) continue;  // dead
        if (Math.abs(t.x - px) < DEFEND_RANGE && Math.abs(t.y - py) < DEFEND_RANGE) {
          count++;
        }
      }
      return Math.min(255, count);
    })(),
    // Neutral pills (team=null) ARE attackable — p.team !== myTeam is true for null
    attackable: p.team !== myTeam,
    capturable: !p.inTank && p.armour < 15,
    alreadyTargeted: false,
    processingBlocked: false,
    distToTank: p.x != null ? Math.round(
      Math.hypot((p.x - tankX) * 0.0039, (p.y - tankY) * 0.0039) * 256
    ) : 0xFFFF,
    repairTargetX: p.x ?? 0,
    repairTargetY: p.y ?? 0,
    lastAttemptTick: 0,
    shieldDelay: 100,
    approachSpeed: 1,
    approachSpeedMax: 7,
    approachSpeedTier: 0,
    manTimeCacheValid: false,
    manTimeCached: 0,
    lastShotTick: 0,
    coverSaveX: 0,
    coverSaveY: 0,
    oronaPill: p,
  }));

  // ── Build base states ──────────────────────────────────────────────────────
  const bases: BaseState[] = oronaMap.bases.map((b: any, i: number): BaseState => {
    const bx = b.x ?? 0;
    const by = b.y ?? 0;

    // distToAllyCoG: distance from this base to the ally center of gravity
    const distToAllyCoG = _allyCogN > 0
      ? Math.round(Math.hypot(bx - allyCogX, by - allyCogY))
      : 0xFFFF;

    // distToEnemyCoG: used to compute difficulty tier
    const distToEnemyCoG = _enemyCogN > 0
      ? Math.round(Math.hypot(bx - enemyCogX, by - enemyCogY))
      : 0xFFFF;

    // difficulty (0-3): bases close to enemy frontline are harder.
    // Threshold: each tier is ~15 tiles (3840 BWorld).
    const difficulty = _enemyCogN > 0
      ? Math.max(0, 3 - Math.min(3, Math.floor(distToEnemyCoG / 3840)))
      : 0;

    // distToFrontline: midpoint between ally and enemy CoG
    const frontlineX = _allyCogN > 0 && _enemyCogN > 0 ? Math.round((allyCogX + enemyCogX) / 2) : 0;
    const frontlineY = _allyCogN > 0 && _enemyCogN > 0 ? Math.round((allyCogY + enemyCogY) / 2) : 0;
    const distToFrontline = (frontlineX || frontlineY)
      ? Math.round(Math.hypot(bx - frontlineX, by - frontlineY))
      : 0;

    // Compute pill masks: scan all active pills within ~7 tiles (1792 BWorld).
    // Bits 0-15 correspond to pill indices. The masks drive KillBase (defend ally
    // bases that have enemy pills nearby) and cost adjustments in killBaseCostForBase.
    const PILL_RANGE = 7 * 256;  // 7 tiles in BWorld
    let neutralPillMask = 0;
    let allyPillMask    = 0;
    let enemyPillMask   = 0;
    let minDistToEnemyPill = 0xFFFF;
    for (const p of oronaMap.pills) {
      if (p.inTank) continue;
      if (p.x == null || p.y == null) continue;
      const pdx = Math.abs(p.x - bx);
      const pdy = Math.abs(p.y - by);
      if (pdx >= PILL_RANGE || pdy >= PILL_RANGE) continue;
      const bit = 1 << (p.index ?? 0);
      if (p.team == null) {
        neutralPillMask |= bit;
      } else if (p.team === myTeam) {
        allyPillMask |= bit;
      } else {
        enemyPillMask |= bit;
        const dist = Math.round(Math.hypot(pdx, pdy));
        if (dist < minDistToEnemyPill) minDistToEnemyPill = dist;
      }
    }

    return {
      index: i,
      x: bx,
      y: by,
      tileX: b.x != null ? (bx >> 8) & 0xFF : 0,
      tileY: b.y != null ? (by >> 8) & 0xFF : 0,
      armor: b.armour ?? 0,
      buildable: b.armour >= 0,
      flags: b.team === myTeam ? 0x01 : (b.team != null ? 0x02 : 0x00),
      isAlly: b.team === myTeam,
      isEnemy: b.team !== myTeam && b.team != null,
      defended: (b.shells ?? 0) > 0,
      difficulty,
      forceFlag: false,
      newRefuelTrigger: b.refueling != null,
      teamId: b.team ?? 0,
      minDistToEnemyPill,
      distToTank: b.x != null ? Math.round(Math.hypot(bx - tankX, by - tankY)) : 0xFFFF,
      distToAllyCoG,
      distToFrontline,
      neutralPillMask,
      allyPillMask,
      enemyPillMask,
      nearbyBaseCount: 0,
      nearbyBasePtrs: [],
      nearbyPillCount: 0,
      nearbyPillPtrs: [],
      oronaBase: b,
    };
  });

  // ── Compute captureDifficulty for pills (PillToGet 0x00cec4) ─────────────
  // For each neutral base (neither ally nor enemy), increment captureDifficulty
  // for every pill that appears in that base's allyPillMask or enemyPillMask.
  // Pills near many neutral bases are strategically central → lower GetPillCost.
  for (const pill of pills) {
    let count = 0;
    const bit = 1 << pill.index;
    for (const base of bases) {
      if (base.isAlly || base.isEnemy) continue;
      if ((base.allyPillMask & bit) || (base.enemyPillMask & bit)) count++;
    }
    pill.captureDifficulty = Math.min(7, count);
  }

  // ── Build visible tank states ──────────────────────────────────────────────
  const tanks: EnemyTankState[] = allTanks
    .filter(t => t !== myTank)
    .map((t, i) => ({
      index: i,
      x: t.x ?? 0,
      y: t.y ?? 0,
      direction: t.direction,
      team: t.team ?? 0,
      isAlly: t.team === myTeam,
      isEnemy: t.team !== myTeam,
      attackable: t.team !== myTeam && t.team != null && t.armour < 255,
      active: t.armour !== 255 && t.x != null,
      distanceMetric: t.x != null && t.y != null ? Math.round(Math.hypot(t.x - tankX, t.y - tankY)) : 0x7FFFFFFF,
      flags: t.team === myTeam ? 0 : 1,
      teamFlag: t.team ?? 0,
      oronaTank: t,
    }));

  return {
    tank,
    worldMap, dangerMap, blockedMap, occupancyMap, allyMap, sightMap, visitMap, ownerMap,
    bases, pills, tanks,
    baseCount: oronaMap.bases.length,
    pillCount: oronaMap.pills.length,
    teamBitmask: PILL_BITMASK[myTeam & 0x0F],
    tickCounter: tickNum,
    tickCount: tickCount(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// GOAL INDEX CONSTANTS (from ChooseGoal dispatch table)
// ─────────────────────────────────────────────────────────────────────────────

export const Goal = {
  PLACE_PILL : 0,
  EXPLORE    : 1,
  FIX_PILL   : 2,
  GET_BASE   : 3,
  GET_MAN    : 4,
  GET_PILL   : 5,
  KILL_BASE  : 6,
  KILL_MAN   : 7,
  KILL_TANK  : 8,
  REFUEL     : 9,
  TOUR_BASES : 10,
  NO_GOAL    : 12,
} as const;

export type GoalId = (typeof Goal)[keyof typeof Goal];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: COORDINATE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Convert tile coords to BWorld center */
export function tileToBWorld(tile: number): number {
  return (tile << 8) + 128;
}

/** Convert BWorld coord to tile index */
export function bworldToTile(bworld: number): number {
  return (bworld >> 8) & 0xFF;
}

/** Compute world-map index from tile coordinates */
export function mapIndex(tileX: number, tileY: number): number {
  return ((tileY & 0xFF) << 8) | (tileX & 0xFF);
}

/** Euclidean distance in BWorld units (integer approximation) */
export function bworldDist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2, dy = y1 - y2;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

/** Signed 16-bit word (simulate 68k WORD sign extension) */
export function signedWord(v: number): number {
  // Mask to 16 bits FIRST. Without this, a negative input like -512 evaluates
  // (-512 & 0x8000) on its 32-bit two's-complement form (0xFFFFFE00) → 0x8000
  // is set → returns -512 - 0x10000 = -66048. That made computeDistanceBetween
  // return garbage (~66096) whenever the target was left/above the tank, which
  // defeated all distance-gated nav logic (fine-steering, approach slowdown) and
  // left the tank idle/orbiting on up-left targets.
  v &= 0xFFFF;
  return (v & 0x8000) ? v - 0x10000 : v;
}

/** Unsigned byte mask */
export function byte(v: number): number {
  return v & 0xFF;
}

/** Clamp to 0-255 range */
export function clampByte(v: number): number {
  return Math.max(0, Math.min(255, v)) & 0xFF;
}
