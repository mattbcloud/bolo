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
}

function newMetrics(): ScenarioMetrics {
  return { reached: false, ticksToReach: -1, turnConflictTicks: 0,
           maxBends: 0, stuckEpisodes: 0, pathRecomputes: 0 };
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

/** Step navigation IN ISOLATION (no goal selection, no combat). Brain must be
 *  DISABLED on the world; we drive navigateToCoords + applyControls manually,
 *  then step the engine (world.tick with brain off just moves the tank). */
export function runNavOnlyScenario(
  world: any, targetTileX: number, targetTileY: number,
  { maxTicks = 3000, stuckWindow = 200 } = {},
): ScenarioMetrics & { a4: any } {
  const maps = makeBrainMaps();
  let tickN = 0;
  const seed = buildBrainState(world.player, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
  const a4: any = brainOpen(seed) ?? null;
  if (!a4) throw new Error('brainOpen returned null');

  const m = newMetrics();
  let lastPath: Uint16Array | null = null;
  let stuckTile = -1, stuckSince = 0;
  const tx = tileToBWorld(targetTileX), ty = tileToBWorld(targetTileY);

  for (let t = 0; t < maxTicks; t++) {
    const state = buildBrainState(world.player, world.map, world.tanks ?? [], tickN++, ...mapsArr(maps));
    syncBrainState(a4, state);
    a4.steeringWord = 0; a4.firingWord = 0;
    navigateToCoords(a4, tx, ty, 0);
    applyControls(world.player, { steeringWord: a4.steeringWord, firingWord: a4.firingWord });
    world.tick(); // brain disabled → just advances the tank from these controls

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
}

/** Evaluate the FULL brain over N seeded trials from a fixed land start and report
 *  mean captures/deaths. Multi-trial averaging is the trustworthy metric given the
 *  brain's residual stochasticity. `startTile` should be passable land. */
export function evaluateFullLoop(
  startTile: [number, number],
  { trials = 12, ticks = 6000, baseSeed = 1000 } = {},
): EvalResult {
  const captures: number[] = [], deaths: number[] = [];
  for (let k = 0; k < trials; k++) {
    const world = bootHeadlessWorld(baseSeed + k * 7919);
    const a4 = enableBrain(world);
    placeTank(world, startTile[0], startTile[1], false);
    const t = world.player, myTeam = t.team;
    const owned = new Set<string>();
    let caps = 0, dy = 0, prevArmour = t.armour;
    for (let i = 0; i < ticks; i++) {
      world.tick();
      if (t.armour === 255 && prevArmour !== 255) dy++;
      prevArmour = t.armour;
      for (const p of (world.map.pills ?? [])) {
        if (p.owner === myTeam || p.team === myTeam) {
          const key = p.cell ? `${p.cell.x},${p.cell.y}` : `${p.x},${p.y}`;
          if (!owned.has(key)) { owned.add(key); caps++; }
        }
      }
    }
    captures.push(caps); deaths.push(dy);
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    trials, ticks, captures, deaths,
    meanCaptures: sum(captures) / trials,
    meanDeaths: sum(deaths) / trials,
    capturedAny: captures.filter((c) => c >= 1).length,
  };
}

function mapsArr(m: ReturnType<typeof makeBrainMaps>) {
  return [m.worldMap, m.dangerMap, m.blockedMap, m.occupancyMap,
          m.allyMap, m.sightMap, m.visitMap, m.ownerMap] as const;
}
