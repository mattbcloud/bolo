/**
 * Headless brain simulation harness.
 *
 * Boots a BoloLocalWorld WITHOUT renderer/HUD/loop, enables the AI brain, and
 * steps the simulation in pure Node (jsdom provides document/Image). Lets the
 * brain's navigation be measured objectively — reached?, turn-conflict ticks,
 * route bends, stuck episodes — as automated regression tests.
 *
 * See plan: ~/.claude/plans/reflective-sniffing-rain.md (Phase 1).
 */

import { BoloLocalWorld } from '../../client/world/local';
import WorldMap from '../../world_map';
import EverardIsland from '../../client/everard';
import { decodeBase64 } from '../../client/base64';
import { Tank } from '../../objects/tank';
import { brainOpen, syncBrainState } from '../brain_init';
import { buildBrainState, applyControls, _resetStaticTerrainCache, resetStaticTerrainCache } from '../aindy_interface';
import { aIndy_Think } from '../aindy_think';
import { navigateToCoords } from '../navigation';

const TILE = 256; // BWorld units per tile
export const tileToBWorld = (t: number) => (t * TILE) + (TILE >> 1);
const decode = (packed: number) => [packed & 0xFF, (packed >> 8) & 0xFF] as const;

/** Fresh set of the 8 scratch maps buildBrainState needs (mirrors local.ts). */
function makeBrainMaps() {
  return {
    worldMap:     new Uint8Array(65536),
    dangerMap:    new Uint8Array(65536),
    blockedMap:   new Uint8Array(65536),
    occupancyMap: new Uint8Array(65536),
    allyMap:      new Uint8Array(65536).fill(0xFF),
    sightMap:     new Uint8Array(65536),
    visitMap:     new Uint8Array(65536),
    ownerMap:     new Uint8Array(65536).fill(0x10),
  };
}

/** Make the simulation deterministic: seed Math.random (the brain's Random()) and
 *  freeze the wall clock so tickCount()/pathfinding time-budgets (Date.now /
 *  performance.now) can't introduce machine-speed-dependent variation. Without
 *  this, the same scenario diverges run-to-run (captures observed as 0,3,2).
 *  Pass different seeds to sample the stochastic policy across trials. */
export function seedHarness(seed = 0x9e3779b9): void {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const frozen = () => 0; // elapsed always 0 → pathfinding runs to completion, deterministically
  Date.now = frozen;
  if (typeof performance !== 'undefined') (performance as any).now = frozen;
}

/** Boot a headless world: map + objects + tank, but no renderer/HUD/loop. */
export function bootHeadlessWorld(seed = 0x9e3779b9): any {
  seedHarness(seed);
  _resetStaticTerrainCache(); // fresh terrain per boot — no cross-trial leakage
  const world: any = new BoloLocalWorld();
  // Replicates BoloLocalWorld.loaded() MINUS commonInitialization()/renderer/
  // initHud()/loop.start() — none of which the simulation tick needs.
  world.map = WorldMap.load(decodeBase64(EverardIsland));
  // Give map cells a back-reference to the world so WorldMapCell.hasTankOnBoat()
  // (which reads `map.world.tanks` with NO optional chaining) doesn't crash the
  // moment a builder builds a boat/road — which made any boat/water scenario
  // untestable. We expose `tanks` (for hasTankOnBoat) and a no-op `mapChanged`, but
  // DELIBERATELY omit `spawn`: the spawn sites are `if (world?.spawn)`-guarded, so
  // omitting spawn keeps FloodFill OFF. Enabling the full `world` (with spawn) turns
  // on FloodFill + retile callbacks during map setup and wall-building, materially
  // changing sim behaviour (measured: N=30 captures 0.40→0.17). The mapChanged guard
  // is only `?.` (null-check) — a DEFINED proxy lacking mapChanged still crashes on
  // call — so the no-op is required.
  world.map.world = {
    get tanks() { return world.tanks ?? []; },
    // Invalidate the brain's cached static-terrain layer on any terrain change so a
    // BUILT WALL (or harvested forest / built road) becomes visible to the brain's
    // worldMap. Without this the brain (and checkBarriers/cover) can never see cover it
    // builds — terrain was wrongly assumed static. Mirrors local.ts mapChanged.
    mapChanged() { resetStaticTerrainCache(); },
  };
  // No-op renderer: the sim tick calls renderer.playSound() (and friends) for
  // sound/visual effects. Headless has no renderer, so any method is a no-op.
  world.renderer = new Proxy({}, { get: () => () => undefined });
  world.spawnMapObjects();
  world.player = world.spawn(Tank);
  world.player.spawn(0); // team 0
  return world;
}

/** Enable the brain via the normal toggle (jsdom makes the DOM indicator harmless). */
export function enableBrain(world: any): any {
  world.toggleBrainControl();
  if (!world.brainEnabled || !world.brainA4) throw new Error('brain failed to enable');
  return world.brainA4;
}

/** Move the tank to a tile centre. Placing on land clears onBoat (a tank spawns
 *  onBoat=true; an on-boat tank cannot move on a land tile, so for land-navigation
 *  scenarios we must put it in the on-land state). */
export function placeTank(world: any, tileX: number, tileY: number, onBoat = false): void {
  world.player.x = tileToBWorld(tileX);
  world.player.y = tileToBWorld(tileY);
  world.player.cell = world.map.cellAtWorld(world.player.x, world.player.y);
  world.player.onBoat = onBoat;
}

/** Heading-change count along a packed-tile path: 0-1 = straight, >=2 = real detour. */
export function pathBends(path: Uint16Array | null): number {
  if (!path || path.length < 3) return 0;
  let bends = 0, pdx = 0, pdy = 0;
  for (let i = 1; i < path.length; i++) {
    const [ax, ay] = decode(path[i]);
    const [bx, by] = decode(path[i - 1]);
    const sdx = Math.sign(ax - bx), sdy = Math.sign(ay - by);
    if (i > 1 && (sdx !== pdx || sdy !== pdy)) bends++;
    pdx = sdx; pdy = sdy;
  }
  return bends;
}

/** True if the straight tile-line start->target crosses a tile the PLANNER treats
 *  as impassable (cost >= 1000). Uses the brain's own cost view for exactness. */
export function lineIsObstructed(a4: any, sx: number, sy: number, tx: number, ty: number): boolean {
  const steps = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
  if (steps === 0) return false;
  for (let i = 1; i < steps; i++) {
    const x = Math.round(sx + ((tx - sx) * i) / steps);
    const y = Math.round(sy + ((ty - sy) * i) / steps);
    const raw = a4.worldMap[(y << 8) | x];
    if ((a4.examineTerrainCostTable[raw] ?? 1000) >= 1000) return true;
  }
  return false;
}

export interface Objective { kind: 'pill' | 'base'; x: number; y: number; obstructed: boolean }

/** Nearest capturable objective whose straight-line approach from (sx,sy) is
 *  obstructed (so "must route around terrain" is a meaningful assertion).
 *  Falls back to the nearest objective even if its approach is open. */
export function findObstructedObjective(world: any, a4: any, sx: number, sy: number): Objective | null {
  const cands: { kind: 'pill' | 'base'; x: number; y: number }[] = [];
  for (const p of (world.map.pills ?? [])) {
    const c = p.cell ?? p;
    if (c && c.x != null && c.y != null) cands.push({ kind: 'pill', x: c.x, y: c.y });
  }
  for (const b of (world.map.bases ?? [])) {
    const c = b.cell ?? b;
    if (c && c.x != null && c.y != null) cands.push({ kind: 'base', x: c.x, y: c.y });
  }
  cands.sort((a, c) => Math.hypot(a.x - sx, a.y - sy) - Math.hypot(c.x - sx, c.y - sy));
  for (const c of cands) {
    if (lineIsObstructed(a4, sx, sy, c.x, c.y)) return { ...c, obstructed: true };
  }
  return cands.length ? { ...cands[0], obstructed: false } : null;
}

export interface ScenarioMetrics {
  reached: boolean;
  ticksToReach: number;
  turnConflictTicks: number;
  maxBends: number;
  stuckEpisodes: number;
  pathRecomputes: number;
  // Boat metrics: board = land->boat transitions, disembark = boat->land. A clean crossing is
  // ~1 board + ~1 disembark; many of either is acquire/disembark thrash. ticksOnBoat gauges
  // how much of the trip rode the river (vs slogging land/swamp).
  boardCount: number;
  disembarkCount: number;
  ticksOnBoat: number;
}

function newMetrics(): ScenarioMetrics {
  return { reached: false, ticksToReach: -1, turnConflictTicks: 0,
           maxBends: 0, stuckEpisodes: 0, pathRecomputes: 0,
           boardCount: 0, disembarkCount: 0, ticksOnBoat: 0 };
}

/** Step the FULL brain loop (aIndy_Think runs nav AND combat) toward a target tile. */
export function runFullLoopScenario(
  world: any, a4: any, targetTileX: number, targetTileY: number,
  { maxTicks = 3000, stuckWindow = 200 } = {},
): ScenarioMetrics {
  const m = newMetrics();
  let lastPath: Uint16Array | null = null;
  let stuckTile = -1, stuckSince = 0;

  for (let t = 0; t < maxTicks; t++) {
    world.tick();

    const ccw = !!(a4.steeringWord & 0x04) || !!(a4.firingWord & 0x04);
    const cw  = !!(a4.steeringWord & 0x08) || !!(a4.firingWord & 0x08);
    if (ccw && cw) m.turnConflictTicks++;

    if (a4.navPath !== lastPath) {
      lastPath = a4.navPath; m.pathRecomputes++;
      m.maxBends = Math.max(m.maxBends, pathBends(a4.navPath));
    }

    if (Math.abs(a4.tankTileX - targetTileX) <= 1 && Math.abs(a4.tankTileY - targetTileY) <= 1) {
      m.reached = true; m.ticksToReach = t; break;
    }

    const tile = (a4.tankTileY << 8) | a4.tankTileX;
    if (tile === stuckTile) {
      if (t - stuckSince === stuckWindow) m.stuckEpisodes++;
    } else { stuckTile = tile; stuckSince = t; }
  }
  return m;
}

/**
 * THE NETWORK-LATENCY DRIVER — the thing this harness could not do.
 *
 * Every other scenario here runs BoloLocalWorld with authority=true: `runBrainTick` writes the
 * brain's control flags straight onto the tank in-process, and reads the tank's facing back the
 * same tick. Zero latency in both directions. In a real game the brain is a CLIENT
 * (client/world/client.ts `_runBrainTick`): it writes its flags into a throwaway object, ships
 * START/STOP deltas down a WebSocket, and reads back a facing the server replicated to it. So a
 * turn command costs a trip out and its result costs a trip back, and the aim loop the brain
 * closes is a delayed loop — which is a completely different control problem from the one the
 * harness has been measuring. That gap is why aim fixes keep passing here and failing live.
 *
 * `cmdLatency` is the uplink: ticks from the brain deciding to turn to the engine acting on it
 * (the live telemetry in client.ts measures exactly this). `obsLatency` is the downlink: how
 * stale the facing the brain reads is. They default to the same value, so `cmdLatency: 3` means
 * a 6-tick loop.
 *
 * Only the FACING is delayed on the downlink. Live, the whole replicated world is stale, but
 * facing is the loop under test and delaying position as well would move navigation errors into
 * an aim measurement. The uplink delays everything, including the trigger — which is faithful,
 * and part of the bug: a shot decided on a good bearing still leaves the barrel `cmdLatency`
 * ticks later, wherever the hull has swung to by then.
 *
 * The world's own brain is left DISABLED; call `step()` instead of `world.tick()`.
 */
export function makeLatentDriver(
  world: any,
  { cmdLatency = 0, obsLatency = cmdLatency }: { cmdLatency?: number; obsLatency?: number } = {},
) {
  const maps = makeBrainMaps();
  let tickN = 0;
  const seed = buildBrainState(world.player, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
  const a4: any = brainOpen(seed) ?? null;
  if (!a4) throw new Error('brainOpen returned null');
  world.brainEnabled = false;   // we are the brain loop now

  const cmdQ: Array<{ steeringWord: number; firingWord: number }> = [];
  const dirQ: number[] = [];

  return {
    a4,
    /** One brain tick + one engine tick, with the loop delays applied. */
    step() {
      const p = world.player;

      // ── Downlink: hand the brain the facing it would have received by now ──
      dirQ.push(p.direction);
      const seenDir = dirQ.length > obsLatency ? dirQ.shift()! : dirQ[0];
      const liveDir = p.direction;
      p.direction = seenDir;

      let controls: any;
      try {
        const state = buildBrainState(p, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
        controls = aIndy_Think(a4, state);
      } finally {
        p.direction = liveDir;   // the ENGINE always runs on the truth
      }

      // ── Uplink: the engine acts on what was decided cmdLatency ticks ago ──
      p.accelerating = p.braking = false;
      p.turningClockwise = p.turningCounterClockwise = false;
      p.shooting = p.layingMine = false;
      cmdQ.push({ steeringWord: controls.steeringWord, firingWord: controls.firingWord });
      if (cmdQ.length > cmdLatency) applyControls(p, cmdQ.shift()!);

      world.tick();
    },
  };
}

/** Step navigation IN ISOLATION (no goal selection, no combat). Brain must be
 *  DISABLED on the world; we drive navigateToCoords + applyControls manually,
 *  then step the engine (world.tick with brain off just moves the tank). */
export function runNavOnlyScenario(
  world: any, targetTileX: number, targetTileY: number,
  { maxTicks = 3000, stuckWindow = 200, trace = false }:
    { maxTicks?: number; stuckWindow?: number; trace?: boolean } = {},
): ScenarioMetrics & { a4: any } {
  const maps = makeBrainMaps();
  let tickN = 0;
  const seed = buildBrainState(world.player, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
  const a4: any = brainOpen(seed) ?? null;
  if (!a4) throw new Error('brainOpen returned null');

  const m = newMetrics();
  let lastPath: Uint16Array | null = null;
  let stuckTile = -1, stuckSince = 0;
  let prevOnBoat = !!world.player.onBoat;
  const tx = tileToBWorld(targetTileX), ty = tileToBWorld(targetTileY);

  for (let t = 0; t < maxTicks; t++) {
    const state = buildBrainState(world.player, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;
    navigateToCoords(a4, tx, ty, 0);
    applyControls(world.player, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick(); // brain disabled → just advances the tank from these controls

    const ob = !!world.player.onBoat;
    if (ob) m.ticksOnBoat++;
    if (ob !== prevOnBoat) { if (ob) m.boardCount++; else m.disembarkCount++; prevOnBoat = ob; }

    if (trace) {
      const sw = a4.steeringWord, dirs = [(sw&0x04)?'CCW':'', (sw&0x08)?'CW':'', (sw&0x10)?'FWD':'', (sw&0x02)?'BRK':''].filter(Boolean).join('|');
      // eslint-disable-next-line no-console
      console.log(`t=${t} pos=(${a4.tankTileX},${a4.tankTileY}) boat=${ob?1:0} spd=${(world.player.speed).toFixed(1)} dir=${Math.round(world.player.direction)} steer=${dirs||'-'} boatNeeded=${a4.boatNeeded?1:0} acq=${a4.boatBuildTileX>=0&&a4.boatNeeded?`(${a4.boatBuildTileX},${a4.boatBuildTileY})`:'-'}`);
    }

    if (a4.navPath !== lastPath) {
      lastPath = a4.navPath; m.pathRecomputes++;
      m.maxBends = Math.max(m.maxBends, pathBends(a4.navPath));
    }
    if (Math.abs(a4.tankTileX - targetTileX) <= 1 && Math.abs(a4.tankTileY - targetTileY) <= 1) {
      m.reached = true; m.ticksToReach = t; break;
    }
    const tile = (a4.tankTileY << 8) | a4.tankTileX;
    if (tile === stuckTile) { if (t - stuckSince === stuckWindow) m.stuckEpisodes++; }
    else { stuckTile = tile; stuckSince = t; }
  }
  return { ...m, a4 };
}

export interface EvalResult {
  trials: number; ticks: number;
  captures: number[]; deaths: number[];
  meanCaptures: number; meanDeaths: number;
  capturedAny: number; // # of trials that captured >=1 pill
  // BASE captures, tracked separately and for the same reason the pill counter exists: a base is
  // the tank's only source of armour and shells, so "how many bases did it take" is the economy,
  // and `captures` above counts PILLS ONLY — it is structurally blind to it. Any change that
  // trades early pill-grinding for base-taking makes `meanCaptures` fall while the brain gets
  // strictly better, which reads as a regression unless these are on the scoreboard too.
  baseCaptures: number[];
  meanBaseCaptures: number;
  baseCapturedAny: number; // # of trials that captured >=1 base
  // Time-integrated map control: mean number owned per tick over the run. Holding ground for the
  // whole game and touching it once on the final tick are the same to the counters above; these
  // tell them apart. meanControl = pills + bases, and it is the one to read (see the note in the
  // loop on why bases alone is circular in an opponent-free harness).
  meanPillsHeld: number;
  meanBasesHeld: number;
  meanControl: number;
}

/** Evaluate the FULL brain over N seeded trials from a fixed land start and report
 *  mean captures/deaths. Multi-trial averaging is the trustworthy metric given the
 *  brain's residual stochasticity. `startTile` should be passable land. */
export function evaluateFullLoop(
  startTile: [number, number],
  // gameMode drives RESPAWN RESUPPLY (Tank.reset, src/objects/tank.ts:124) and therefore what a
  // death costs. The default 'open' hands back armour 40 / shells 40 / mines 40 / trees 40, which
  // makes dying the cheapest resupply on the map — so an unqualified run of this harness rewards
  // grind-until-you-die and is blind to any economy. 'tournament' (shells = 2 x neutral bases,
  // no mines/trees) and 'strict' (0/0/0) price death properly.
  { trials = 12, ticks = 6000, baseSeed = 1000, gameMode = 'open' as 'open' | 'tournament' | 'strict' } = {},
): EvalResult {
  const captures: number[] = [], deaths: number[] = [], baseCaptures: number[] = [];
  const pillsHeld: number[] = [], basesHeld: number[] = [];
  for (let k = 0; k < trials; k++) {
    const world = bootHeadlessWorld(baseSeed + k * 7919);
    world.gameMode = gameMode;
    const a4 = enableBrain(world);
    placeTank(world, startTile[0], startTile[1], false);
    const t = world.player, myTeam = t.team;
    // Count DISTINCT pills the tank captures, keyed by each pill's STABLE array index.
    // A captured pill reads team === our team (engine sets pill.team = owner.team on
    // pickup; a carried pill also has owner === our tank). The OLD counter keyed by
    // position (`${p.cell.x},${p.cell.y}` else `${p.x},${p.y}`) — but a captured pill
    // goes inTank with x/y/cell nulled, so every carried pill collapsed to the single
    // key "null,null" and multi-captures were UNDER-COUNTED; its `p.owner === myTeam`
    // test also compared a tank ref to a team number (never true). Seed `owned` with
    // any pills already ours at spawn so only NEW captures count.
    const owned = new Set<number>();
    const pillIsMine = (p: any) => p && (p.team === myTeam || p.owner?.$ === t || p.owner === t);
    const pills0 = world.map.pills ?? [];
    for (let pi = 0; pi < pills0.length; pi++) if (pillIsMine(pills0[pi])) owned.add(pi);
    // Bases, counted the same way and keyed by the same stable array index. Ownership is
    // `base.team === myTeam` — the exact test buildBrainState uses (aindy_interface.ts:632).
    // Seeded with anything already ours at spawn so only NEW captures count, and Set membership
    // means a base retaken after being lost is not double-counted (matching the pill counter).
    const ownedBases = new Set<number>();
    const baseIsMine = (b: any) => b && b.team === myTeam;
    const bases0 = world.map.bases ?? [];
    for (let bi = 0; bi < bases0.length; bi++) if (baseIsMine(bases0[bi])) ownedBases.add(bi);
    // MAP CONTROL, integrated over time. The capture counters above are one-shot: they say the tank
    // touched an objective once, never that it still holds it, and they weight a capture on the last
    // tick the same as one on the first. Bolo is won by holding ground, so also accumulate how much
    // was owned on every tick and divide by the run length -> "mean objectives held".
    //
    // READ BASES AND PILLS TOGETHER, never bases alone. This harness has no opponent, so nothing
    // ever takes a base back: bases-held is monotonic and any brain that simply walks at bases early
    // scores well on it by construction. Pills are the contested half — they shoot back and have to
    // be ground down — so bases+pills is the only combination here that prices the actual trade-off
    // between grabbing free ground and fighting for defended ground.
    let caps = 0, bcaps = 0, dy = 0, prevArmour = t.armour;
    let pillHeldTicks = 0, baseHeldTicks = 0;
    for (let i = 0; i < ticks; i++) {
      world.tick();
      if (t.armour === 255 && prevArmour !== 255) dy++;
      prevArmour = t.armour;
      const pills = world.map.pills ?? [];
      let pillsNow = 0;
      for (let pi = 0; pi < pills.length; pi++) {
        if (pillIsMine(pills[pi])) { pillsNow++; if (!owned.has(pi)) { owned.add(pi); caps++; } }
      }
      pillHeldTicks += pillsNow;
      const bases = world.map.bases ?? [];
      let basesNow = 0;
      for (let bi = 0; bi < bases.length; bi++) {
        if (baseIsMine(bases[bi])) { basesNow++; if (!ownedBases.has(bi)) { ownedBases.add(bi); bcaps++; } }
      }
      baseHeldTicks += basesNow;
    }
    captures.push(caps); deaths.push(dy); baseCaptures.push(bcaps);
    pillsHeld.push(pillHeldTicks / ticks); basesHeld.push(baseHeldTicks / ticks);
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    trials, ticks, captures, deaths,
    meanCaptures: sum(captures) / trials,
    meanDeaths: sum(deaths) / trials,
    capturedAny: captures.filter((c) => c >= 1).length,
    baseCaptures,
    meanBaseCaptures: sum(baseCaptures) / trials,
    baseCapturedAny: baseCaptures.filter((c) => c >= 1).length,
    meanPillsHeld: sum(pillsHeld) / trials,
    meanBasesHeld: sum(basesHeld) / trials,
    meanControl: (sum(pillsHeld) + sum(basesHeld)) / trials,
  };
}

function mapsArr(m: ReturnType<typeof makeBrainMaps>) {
  return [m.worldMap, m.dangerMap, m.blockedMap, m.occupancyMap,
          m.allyMap, m.sightMap, m.visitMap, m.ownerMap] as const;
}
