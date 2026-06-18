/**
 * A* Routing Engine — aIndy3.1 TypeScript Port
 *
 * Implements the complete pathfinding infrastructure:
 *   HeapEmpty / HeapInsert / HeapDeleteMin — binary min-heap (priority queue)
 *   InitWorldCosts  (0x021802) — reset world cost table before WorldRouteFind
 *   InitLocalCosts  (0x021edc) — reset + seed local cost table before LocalRouteFind
 *   Examine         (0x0223e0) — evaluate neighbor tile and insert into heap
 *   WorldVisit      (0x021878) — world-scale A* expansion
 *   LocalVisit      (0x022214) — local-scale A* expansion
 *   WorldRouteFind  (0x0216dc) — top-level world routing call
 *   LocalRouteFind  (0x021e6c) — top-level local routing call
 *   ManTicksFromPath (0x00bc9c) — man path-cost simulator (replaces stub)
 *
 * Architecture (from worldvisit_localvisit_examine_decode.md):
 *   WorldRouteFind sets search bounds (±14 tiles from dest), calls InitWorldCosts,
 *   then WorldVisit. WorldVisit seeds the heap with the DESTINATION tile and expands
 *   outward until the TANK tile is reached. The resulting route is stored in
 *   routeLookupTable[tile] = prevTile, allowing backtracking from dest→tank.
 *   NavigateToCoords reads routeLookupTable[tankTile] to get the next step.
 *
 * All tile coordinates: 0-255 (uint8). Map index: (tileY<<8)|tileX.
 * Cost sentinel: 0x7D01 = "unreachable / not yet visited".
 * Visited flag: bit 0x8000 in worldRouteCostTable / localRouteCostTable.
 */

import { A4State, type RoutingHeap } from './a4_state.js';
import { signedWord } from './aindy_interface.js';
import { manstopped, stuarts_aim } from './pathfinding.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const UNVISITED   = 0x7D01;   // sentinel: unreachable / not visited
export const VISITED_BIT = 0x8000;   // bit set when tile is in open/closed set
const BASE_ENTRANCE_COST = 0x4001;   // special cost for base entrance tiles
const HEAP_CAPACITY      = 16384;    // max nodes in priority queue (increased for wider searches)
export const SEARCH_RADIUS = 20;      // WorldRouteFind ±20-tile window. Original used 14 + ExpandWorldLimits
                                     // (adaptive growth on failure). Without that, 20 is needed.
                                     // Water is now cost 19 (traversable) so this is sufficient.

// Timeout: WorldVisit bails after this many ticks (~200ms at 50Hz)
const WORLD_VISIT_TIMEOUT = 10;

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY QUEUE (MIN-HEAP)
// Stores routing nodes for Dijkstra/A* expansion.
// Each node: { cost, prevTile, currTile }
// ─────────────────────────────────────────────────────────────────────────────

// RoutingHeap interface is defined in a4_state.ts and imported above.
// Each A4State instance owns a4.routingHeap (allocated in A4State constructor).

/**
 * HeapEmpty (0x01259c) — Reset the priority queue.
 */
export function heapEmpty(heap: RoutingHeap): void {
  heap.size = 0;
}

/**
 * HeapInsert (0x0125ce) — Insert a node with the given cost.
 *
 * @param baseTileFlag  Special cost type (0x4001 for base entrance, else 0)
 * @param cost          Accumulated path cost to this tile
 * @param prevTile      Packed tile we came from (y<<8|x)
 * @param currTile      Packed tile being inserted (y<<8|x)
 * @returns true on success, false if heap full
 */
export function heapInsert(
  heap: RoutingHeap,
  _baseTileFlag: number,
  cost: number,
  prevTile: number,
  currTile: number,
): boolean {
  if (heap.size >= HEAP_CAPACITY) return false;

  const i = heap.size++;
  heap.costs[i] = cost;
  heap.prevs[i] = prevTile & 0xFFFF;
  heap.currs[i] = currTile & 0xFFFF;

  // Sift up
  _siftUp(heap, i);
  return true;
}

/**
 * HeapDeleteMin (0x0122da) — Pop the lowest-cost node.
 *
 * @returns { cost, prevTile, currTile } or null if heap empty
 */
export function heapDeleteMin(heap: RoutingHeap): { cost: number; prevTile: number; currTile: number } | null {
  if (heap.size === 0) return null;

  const result = {
    cost:     heap.costs[0],
    prevTile: heap.prevs[0],
    currTile: heap.currs[0],
  };

  // Replace root with last element and sift down
  heap.size--;
  if (heap.size > 0) {
    heap.costs[0] = heap.costs[heap.size];
    heap.prevs[0] = heap.prevs[heap.size];
    heap.currs[0] = heap.currs[heap.size];
    _siftDown(heap, 0);
  }

  return result;
}

function _siftUp(heap: RoutingHeap, i: number): void {
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (heap.costs[parent] <= heap.costs[i]) break;
    _swap(heap, parent, i);
    i = parent;
  }
}

function _siftDown(heap: RoutingHeap, i: number): void {
  const n = heap.size;
  while (true) {
    let smallest = i;
    const left  = 2 * i + 1;
    const right = 2 * i + 2;
    if (left  < n && heap.costs[left]  < heap.costs[smallest]) smallest = left;
    if (right < n && heap.costs[right] < heap.costs[smallest]) smallest = right;
    if (smallest === i) break;
    _swap(heap, smallest, i);
    i = smallest;
  }
}

function _swap(heap: RoutingHeap, a: number, b: number): void {
  let t: number;
  t = heap.costs[a]; heap.costs[a] = heap.costs[b]; heap.costs[b] = t;
  t = heap.prevs[a]; heap.prevs[a] = heap.prevs[b]; heap.prevs[b] = t;
  t = heap.currs[a]; heap.currs[a] = heap.currs[b]; heap.currs[b] = t;
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT WORLD COSTS (0x021802)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * InitWorldCosts — Fill world cost table rows within search bounds with 0x7D01.
 *
 * Only fills tiles within the current search box (A4[12876-12879]):
 * minY..maxY × minX..maxX. Pre-filled with 0x7D01 at startup.
 * This function refreshes only the active window to reduce cost.
 *
 * Gated by A4[13016]: set to 1 after first call (skip if called again this search).
 */
export function initWorldCosts(a4: A4State): void {
  const costs = a4.worldRouteCostTable;
  const minY = a4.worldRouteMinY & 0xFF;
  const maxY = a4.worldRouteMaxY & 0xFF;
  const minX = a4.worldRouteMinX & 0xFF;
  const maxX = a4.worldRouteMaxX & 0xFF;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      costs[((y & 0xFF) << 8) | (x & 0xFF)] = UNVISITED;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT LOCAL COSTS (0x021edc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * InitLocalCosts — Reset local cost table, seed heap with destination tile.
 *
 * 1. Fill ±14-tile bounding box with 0x7D01 (unvisited)
 * 2. HeapEmpty
 * 3. Validate target in range
 * 4. Handle special terrain at target (pill→open, base entrance→flag)
 * 5. Seed heap with destination tile at cost 0
 */
export function initLocalCosts(a4: A4State, heap: RoutingHeap, targetX: number, targetY: number): void {
  const tx = a4.tankTileX & 0xFF;
  const ty = a4.tankTileY & 0xFF;
  const minX = Math.max(0, tx - SEARCH_RADIUS);
  const maxX = Math.min(255, tx + SEARCH_RADIUS);
  const minY = Math.max(0, ty - SEARCH_RADIUS);
  const maxY = Math.min(255, ty + SEARCH_RADIUS);

  // Phase 1: fill with sentinel
  const costs = a4.localRouteCostTable;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      costs[((y & 0xFF) << 8) | (x & 0xFF)] = UNVISITED;
    }
  }

  // Phase 2: reset heap
  heapEmpty(heap);

  // Phase 3: target-range validation
  const dx = Math.abs(targetX - tx);
  const dy = Math.abs(targetY - ty);
  if (dx > SEARCH_RADIUS || dy > SEARCH_RADIUS) {
    a4.noLocalRouteFlag = 1;
    return;
  }
  a4.noLocalRouteFlag = 0;

  // Phase 4: determine start tile terrain
  const startIdx = ((targetY & 0xFF) << 8) | (targetX & 0xFF);
  const rawTile   = a4.worldMap[startIdx] & 0x0F;
  let   baseEntranceCost = 0;

  if (rawTile === 0x0A) {     // base entrance
    baseEntranceCost = BASE_ENTRANCE_COST;
    a4.visitTerrainModifierFlag = 1;
  } else {
    a4.visitTerrainModifierFlag = 0;
  }

  // Phase 5: seed heap
  costs[startIdx] = VISITED_BIT;
  a4.routeLookupTable[startIdx]   = 0;
  a4.routeIterCountTable[startIdx]  = baseEntranceCost;
  a4.routeIterCountTable2[startIdx] = 0;

  heapInsert(heap, baseEntranceCost, 0, startIdx, startIdx);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXAMINE (0x0223e0)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Examine — Evaluate a neighbor tile and insert into priority queue.
 *
 * Steps (from worldvisit_localvisit_examine_decode.md):
 *   1. Read terrain type of neighbor (with water/building flag bits)
 *   2. Look up cost from examineTerrainCostTable (A4[7610])
 *   3. Apply danger / blocked / occupancy adjustments
 *   4. Add A* heuristic (Manhattan dist to tank)
 *   5. If not visited: mark visited, store prev tile, insert into heap
 *
 * Uses worldRouteCostTable for world routing, localRouteCostTable for local.
 *
 * @param costTable   Which cost table to use (world or local)
 * @param tile        Packed neighbor tile (y<<8|x)
 * @param prevCost    Accumulated cost to source tile
 * @param tankTile    Packed tank tile (y<<8|x) for heuristic
 * @param minX maxX minY maxY  Search bounds
 */
export function examine(
  a4: A4State,
  heap: RoutingHeap,
  costTable: Uint16Array,
  tile: number,
  prevTile: number,
  prevCost: number,
  tankTile: number,
  minX: number, maxX: number,
  minY: number, maxY: number,
): void {
  const tileX = tile & 0xFF;
  const tileY = (tile >> 8) & 0xFF;

  // Bounds check
  if (tileX < minX || tileX > maxX || tileY < minY || tileY > maxY) return;

  // Already visited?
  if ((costTable[tile] & VISITED_BIT) !== 0) return;

  // Terrain lookup with flag preservation
  const rawCell = a4.worldMap[tile];
  let terrainIdx: number;
  if (rawCell & 0x80) {
    terrainIdx = (rawCell & 0x0F) | 0x80;  // water flag
  } else if (rawCell & 0x40) {
    terrainIdx = (rawCell & 0x0F) | 0x40;  // building flag
  } else {
    terrainIdx = rawCell & 0x0F;
  }

  // Cost from terrain table (A4[7610], filled by InitializeCosts)
  let tileCost = a4.examineTerrainCostTable[terrainIdx] ?? 1000;
  if (tileCost >= 1000) return;   // impassable terrain

  // Danger / blocked adjustments
  if (a4.blockedMap[tile]) {
    tileCost += 500;   // heavy penalty for blocked tiles
  }
  if (a4.dangerEvalEnable) {
    const danger = a4.dangerMap[tile];
    if (danger > 0) tileCost += danger * 20;
  }

  // Occupancy penalty
  const occ = a4.occupancyMap[tile];
  if (occ > 3) {
    tileCost += occ;
  } else if (occ > 2) {
    tileCost += 2;
  }

  // A* heuristic: Manhattan distance to tank tile
  const tankX = tankTile & 0xFF;
  const tankY = (tankTile >> 8) & 0xFF;
  const heuristic = Math.abs(tileX - tankX) + Math.abs(tileY - tankY);

  // Total cost = accumulated cost + terrain cost + heuristic
  const totalCost = prevCost + tileCost + heuristic;

  // Mark visited and store back-pointer
  costTable[tile] = (totalCost & 0x7FFF) | VISITED_BIT;
  a4.routeLookupTable[tile] = prevTile & 0xFFFF;
  a4.routeIterCountTable[tile] = totalCost & 0xFFFF;

  heapInsert(heap, 0, totalCost, prevTile, tile);
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD VISIT (0x021878)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WorldVisit — World-scale A* expansion.
 *
 * Seeds the heap at the DESTINATION tile, expands outward, terminates
 * when the TANK tile is popped. The result is a route from any tile back
 * to the destination: routeLookupTable[tile] → prevTile toward destination.
 *
 * @param destTileX  Destination tile X (where we want to go)
 * @param destTileY  Destination tile Y
 * @returns true if tank tile reached (route found), false if exhausted
 */
export function worldVisit(
  a4: A4State,
  heap: RoutingHeap,
  destTileX: number,
  destTileY: number,
): boolean {
  const costs = a4.worldRouteCostTable;
  const destTile = ((destTileY & 0xFF) << 8) | (destTileX & 0xFF);
  const tankTile = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);

  const minX = a4.worldRouteMinX & 0xFF;
  const maxX = a4.worldRouteMaxX & 0xFF;
  const minY = a4.worldRouteMinY & 0xFF;
  const maxY = a4.worldRouteMaxY & 0xFF;

  // Initialization phase: seed dest tile
  if (!a4.worldCostsInitDone) {
    initWorldCosts(a4);

    const rawCell = a4.worldMap[destTile];
    const terrain  = rawCell & 0x0F;
    let   seedCost = 0;
    if (terrain === 0x0A) {          // base entrance
      seedCost = BASE_ENTRANCE_COST;
      a4.visitTerrainModifierFlag = 1;
    } else if (terrain === 0) {      // wall
      seedCost = 5;
    } else if (rawCell & 0x80) {     // water
      seedCost = 4;
    }

    costs[destTile] = (seedCost & 0x7FFF) | VISITED_BIT;
    a4.routeLookupTable[destTile]  = destTile & 0xFFFF;
    a4.routeIterCountTable[destTile] = 0;

    heapEmpty(heap);
    heapInsert(heap, seedCost, 0, destTile, destTile);
    a4.worldCostsInitDone = 1;
  }

  // Main A* loop with timeout.
  // Budget: 8ms per tick (leaves headroom in a 20ms tick at 50Hz).
  // A* is split across multiple ticks via worldCostsInitDone continuations.
  //
  // CRITICAL: clear the timeout gate at the start of each call.  If a previous
  // call timed out (gate=1) but this call completes normally (heap exhausted),
  // the gate MUST be 0 so navigation can detect "A* done, tank not reachable"
  // vs "A* still running".  Leaving it at 1 hides the exhausted-window condition
  // and the tank steers against walls forever.
  a4.worldVisitTimeoutGate = 0;
  const startMs = Date.now();

  while (heap.size > 0) {
    if (Date.now() - startMs > 8) {
      a4.worldVisitTimeoutGate = 1;
      a4.worldVisitTimeoutCounter++;
      break;
    }

    const node = heapDeleteMin(heap);
    if (node === null) break;

    const { cost: nodeCost, prevTile, currTile } = node;

    // Clear visited flag in cost table (tile is now "closed")
    costs[currTile] &= ~VISITED_BIT;

    // Done: reached tank tile
    if (currTile === tankTile) return true;

    // Expand 4 cardinal neighbors (inside bounds)
    const cx = currTile & 0xFF;
    const cy = (currTile >> 8) & 0xFF;
    const prevCost = a4.routeIterCountTable[currTile] & 0x7FFF;

    if (cx > minX) examine(a4, heap, costs, currTile - 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);  // W
    if (cx < maxX) examine(a4, heap, costs, currTile + 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);  // E
    if (cy > minY) examine(a4, heap, costs, currTile - 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);  // N
    if (cy < maxY) examine(a4, heap, costs, currTile + 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);  // S
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL VISIT (0x022214)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LocalVisit — Local-scale A* expansion for man navigation.
 *
 * Searches within ±halfRadius tiles of the tank.
 * Seeded by InitLocalCosts with the destination tile.
 * Terminates when the tank tile is popped.
 *
 * @returns { x, y } of the next step (toward destination) or null
 */
export function localVisit(
  a4: A4State,
  heap: RoutingHeap,
  halfRadius: number,
): { x: number; y: number } | null {
  const costs   = a4.localRouteCostTable;
  const tankTile = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);

  const minX = Math.max(0, a4.tankTileX - halfRadius);
  const maxX = Math.min(255, a4.tankTileX + halfRadius);
  const minY = Math.max(0, a4.tankTileY - halfRadius);
  const maxY = Math.min(255, a4.tankTileY + halfRadius);

  while (heap.size > 0) {
    const node = heapDeleteMin(heap);
    if (node === null) break;

    const { currTile } = node;
    costs[currTile] &= ~VISITED_BIT;

    if (currTile === tankTile) {
      // Tank tile reached — extract output X/Y
      return { x: tankTile & 0xFF, y: (tankTile >> 8) & 0xFF };
    }

    a4.visitTerrainModifierFlag = 0;

    const cx = currTile & 0xFF;
    const cy = (currTile >> 8) & 0xFF;
    const prevCost = a4.routeIterCountTable[currTile] & 0x7FFF;

    if (cx > minX) examine(a4, heap, costs, currTile - 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cx < maxX) examine(a4, heap, costs, currTile + 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cy > minY) examine(a4, heap, costs, currTile - 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cy < maxY) examine(a4, heap, costs, currTile + 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD ROUTE FIND (0x0216dc)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * WorldRouteFind — Top-level world-scale A* routing.
 *
 * 1. Snapshot global state
 * 2. Expand search bounds to ±14 tiles from dest
 * 3. Init cost table (once per tick via gate)
 * 4. Run WorldVisit
 *
 * @param destX  Destination tile X (0-255)
 * @param destY  Destination tile Y (0-255)
 */
export function worldRouteFind(
  a4: A4State,
  heap: RoutingHeap,
  destX: number,
  destY: number,
): void {
  // Snapshot state (mirrors original 0x0216ec-0x021708)
  a4.worldRouteTickSnapshot        = a4.tickCounter;
  a4.worldRouteDangerFlag          = a4.dangerEvalEnable;
  a4.worldRouteTankByte47          = a4.refuelPathBudget & 0xFF;
  a4.worldRouteResourceConstraint  = a4.resourceConstraint;

  // Expand bounds to include dest ± SEARCH_RADIUS (original uses ±14; we use ±20).
  // Only EXPAND — never shrink.  Caller resets to 255/0/255/0 before the first
  // call so this behaves like a "min(current, candidate)" for minX/Y and
  // "max(current, candidate)" for maxX/Y, matching the original's BLE/BGE logic.
  const newMinX = Math.max(0,   destX - SEARCH_RADIUS);
  const newMaxX = Math.min(255, destX + SEARCH_RADIUS);
  const newMinY = Math.max(0,   destY - SEARCH_RADIUS);
  const newMaxY = Math.min(255, destY + SEARCH_RADIUS);

  if (newMinX < a4.worldRouteMinX) a4.worldRouteMinX = newMinX;
  if (newMaxX > a4.worldRouteMaxX) a4.worldRouteMaxX = newMaxX;
  if (newMinY < a4.worldRouteMinY) a4.worldRouteMinY = newMinY;
  if (newMaxY > a4.worldRouteMaxY) a4.worldRouteMaxY = newMaxY;

  // Also ensure tank tile is always inside the search window.
  if (a4.tankTileX < a4.worldRouteMinX) a4.worldRouteMinX = a4.tankTileX;
  if (a4.tankTileX > a4.worldRouteMaxX) a4.worldRouteMaxX = a4.tankTileX;
  if (a4.tankTileY < a4.worldRouteMinY) a4.worldRouteMinY = a4.tankTileY;
  if (a4.tankTileY > a4.worldRouteMaxY) a4.worldRouteMaxY = a4.tankTileY;

  // Init costs if not done this search (gate prevents double-init on timeout continuation)
  if (!a4.worldCostsInitDone) {
    initWorldCosts(a4);
  }

  worldVisit(a4, heap, destX, destY);
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL ROUTE FIND (0x021e6c)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * LocalRouteFind — Top-level local-scale A* for man pathfinding.
 *
 * Snapshots tank state, inits local costs, runs LocalVisit.
 *
 * @param destX  Destination tile X
 * @param destY  Destination tile Y
 */
export function localRouteFind(
  a4: A4State,
  heap: RoutingHeap,
  destX: number,
  destY: number,
): { x: number; y: number } | null {
  // Snapshot (man behavior bytes come from tank state, default to 1/0)
  a4.localRouteTankByte77     = 1;   // myTank.byte[77]: man behavior A
  a4.localRouteTankByte76     = 0;   // myTank.byte[76]: man behavior B
  a4.localRouteTankTileX      = a4.tankTileX;
  a4.localRouteTankTileY      = a4.tankTileY;
  a4.localRouteTickSnapshot   = a4.tickCounter;
  a4.localRouteDangerFlag     = a4.dangerEvalEnable;
  a4.localRouteResourceConstraint = a4.resourceConstraint;

  initLocalCosts(a4, heap, destX, destY);
  if (a4.noLocalRouteFlag) return null;

  return localVisit(a4, heap, SEARCH_RADIUS);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACT NEXT STEP FROM WORLD ROUTE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the next tile to move toward in the world route.
 *
 * WorldVisit stores back-pointers: routeLookupTable[tile] = prevTile (toward dest).
 * To find the next step FROM the tank: follow back-pointers from tank tile to dest,
 * but stop at the first hop (one tile away from tank).
 *
 * @param destTile  Packed destination tile
 * @returns packed tile for the next step, or the dest tile if unreachable
 */
export function getNextStepTile(a4: A4State, destTile: number): number {
  const tankTile = ((a4.tankTileY & 0xFF) << 8) | (a4.tankTileX & 0xFF);

  if (tankTile === destTile) return destTile;

  // Follow routeLookupTable back-pointers from dest toward tank.
  // Build path: destTile → ... → tankTile, then return element at index [len-2].
  // To avoid O(n) in common cases, we walk up to 2 tiles from the tank.
  const costs = a4.useLocalRouteForNav ? a4.localRouteCostTable : a4.worldRouteCostTable;

  // If A* hasn't reached the tank tile yet (UNVISITED — A* still computing or just
  // restarted), the cost table is empty but routeLookupTable still holds the OLD
  // backpointers from the previous run.  Use them rather than falling back to
  // destTile directly: the old route avoids obstacles even if it points toward a
  // slightly different destination.  This prevents the tank from steering straight
  // through forest/water during the 2-5 tick A* restart window.
  if (costs[tankTile] === UNVISITED) {
    const oldBP = a4.routeLookupTable[tankTile];
    if (oldBP && oldBP !== tankTile) return oldBP;  // old route still valid
    return destTile;                                  // no prior route: unavoidable direct steer
  }

  // A* has reached tank tile: use fresh backpointer.
  const nextTile = a4.routeLookupTable[tankTile];
  if (!nextTile || nextTile === tankTile) return destTile;

  return nextTile;
}

// ─────────────────────────────────────────────────────────────────────────────
// ManTicksFromPath REAL IMPLEMENTATION (0x00bc9c)
// Replaces the Euclidean-distance stub in pathfinding.ts
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ManTicksFromPath — Simulate man path and return cost in ticks.
 *
 * Algorithm (routing_decode.md):
 *   1. Same-tile fast path: use SANE FP estimate (simplified here)
 *   2. Simulation loop: call manstopped + stuarts_aim each step
 *      Each successful step adds 2 to the accumulator.
 *   3. Returns step_count × 2 (or 0 if path blocked)
 *
 * A2 accumulator: each successful nav step = +2.
 *
 * @returns tick cost (0 = trivial/blocked, >0 = navigable path cost)
 */
export function manTicksFromPath(
  a4: A4State,
  startX: number, startY: number,
  destX: number, destY: number,
): number {
  const destTileX = (destX >> 8) & 0xFF;
  const destTileY = (destY >> 8) & 0xFF;

  // Set destination gate for manstopped
  a4.manDestTileX    = destTileX;
  a4.manDestTileY    = destTileY;
  a4.manLocScratchFlag = 1;

  const curTileX = (startX >> 8) & 0xFF;
  const curTileY = (startY >> 8) & 0xFF;

  // Same-tile fast path
  if (curTileX === destTileX && curTileY === destTileY) {
    const dx = signedWord(destX - startX);
    const dy = signedWord(destY - startY);
    const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    const terrain = a4.worldMap[((curTileY & 0xFF) << 8) | (curTileX & 0xFF)] & 0x0F;
    const shift   = a4.terrainScaleShift[terrain] ?? 2;
    // result ≈ floor((dist >> shift) * 1.2)
    const result = Math.floor((dist >> shift) * 1.2);
    a4.manLocScratchFlag = 0;
    return result;
  }

  // Simulation loop
  let curX = startX & 0xFFFF;
  let curY = startY & 0xFFFF;
  const tankX = (a4.tankTileX << 8) + 128;
  const tankY = (a4.tankTileY << 8) + 128;
  let   accumulator = 0;

  const MAX_STEPS = 400;  // prevent runaway

  for (let step = 0; step < MAX_STEPS; step++) {
    const tileX = (curX >> 8) & 0xFF;
    const tileY = (curY >> 8) & 0xFF;

    // Arrival check
    if (tileX === destTileX && tileY === destTileY) break;

    const tileIdx   = ((tileY & 0xFF) << 8) | (tileX & 0xFF);
    const terrain   = a4.worldMap[tileIdx] & 0x0F;
    const shiftAmt  = a4.terrainScaleShift[terrain] ?? 2;

    // Direction to destination
    const dx = signedWord(destX - curX);
    const dy = signedWord(destY - curY);
    const dir = stuarts_aim(dx, dy);

    // Movement slopes (from STUARTS_X / MAN_Y_SLOPES)
    // Import the slope arrays directly
    const xSlope = _STUARTS_X[dir] >> shiftAmt;
    const ySlope = _MAN_Y[dir]     >> shiftAmt;

    // Try combined move
    const nextX = (curX - ySlope) & 0xFFFF;
    const nextY = (curY - xSlope) & 0xFFFF;

    if (manstopped(a4, nextX, nextY, 0, tankX, tankY)) {
      curX = nextX;
      curY = nextY;
      accumulator += 2;
    } else {
      // Try X-only
      const tryX = (curX - ySlope) & 0xFFFF;
      if (ySlope !== 0 && manstopped(a4, tryX, curY, 0, tankX, tankY)) {
        curX = tryX;
        accumulator += 2;
      }
      // Try Y-only
      else {
        const tryY = (curY - xSlope) & 0xFFFF;
        if (xSlope !== 0 && manstopped(a4, curX, tryY, 0, tankX, tankY)) {
          curY = tryY;
          accumulator += 2;
        } else {
          // Completely stuck
          a4.manLocScratchFlag = 0;
          return 0;
        }
      }
    }
  }

  a4.manLocScratchFlag = 0;
  return accumulator;
}

// Pre-imported slope arrays (avoid circular dependency by inlining the formula)
const _STUARTS_X = new Int16Array(256).map((_, i) =>
  Math.round(Math.cos(i * 2 * Math.PI / 256) * 128));
const _MAN_Y = new Int16Array(256).map((_, i) =>
  -Math.round(Math.sin(i * 2 * Math.PI / 256) * 128));

// ─────────────────────────────────────────────────────────────────────────────
// A4STATE EXTENSIONS NEEDED
// These fields need to be added to A4State for routing to work.
// They are accessed as a4.routingHeap (allocated separately and stored here)
// ─────────────────────────────────────────────────────────────────────────────

// Convenience: A4State doesn't store heap directly (heap is passed as arg).
// Callers should create one heap per A4State and pass it through.
// See navigation.ts which creates a4.heap and passes it to all routing calls.

// ─────────────────────────────────────────────────────────────────────────────
// TANK LOCAL ROUTE FIND — two-phase routing Phase 2
// ─────────────────────────────────────────────────────────────────────────────

const LOCAL_ROUTE_RADIUS = 14;  // Binary: LocalVisit uses ±14 tile window

/**
 * TankLocalRouteFind — Fine-navigation A* for the last ≤14 tiles (binary 0x021e6c).
 *
 * Phase 2 of NavigateToCoords' two-phase routing.  WorldRouteFind covers the
 * global path; this refines the local segment every 120 ticks when the tank is
 * within 14 tiles of the destination.
 *
 * Writes results to localRouteCostTable (separate from worldRouteCostTable) and
 * the shared routeLookupTable.  After a successful run, FindCheapestSquare reads
 * from localRouteCostTable via a4.useLocalRouteForNav = true.
 *
 * @param destX  Destination tile X
 * @param destY  Destination tile Y
 */
export function tankLocalRouteFind(
  a4: A4State,
  heap: RoutingHeap,
  destX: number,
  destY: number,
): void {
  const tx = a4.tankTileX & 0xFF;
  const ty = a4.tankTileY & 0xFF;
  const dx = Math.abs(tx - destX);
  const dy = Math.abs(ty - destY);

  // Only run within LOCAL_ROUTE_RADIUS tiles of destination
  if (dx > LOCAL_ROUTE_RADIUS || dy > LOCAL_ROUTE_RADIUS) {
    a4.useLocalRouteForNav = false;
    return;
  }

  const minX = Math.max(0, tx - LOCAL_ROUTE_RADIUS);
  const maxX = Math.min(255, tx + LOCAL_ROUTE_RADIUS);
  const minY = Math.max(0, ty - LOCAL_ROUTE_RADIUS);
  const maxY = Math.min(255, ty + LOCAL_ROUTE_RADIUS);

  const costs = a4.localRouteCostTable;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      costs[((y & 0xFF) << 8) | (x & 0xFF)] = UNVISITED;
    }
  }
  heapEmpty(heap);

  const startIdx  = ((destY & 0xFF) << 8) | (destX & 0xFF);
  const tankTile  = ((ty & 0xFF) << 8) | (tx & 0xFF);

  costs[startIdx]                    = VISITED_BIT;
  a4.routeLookupTable[startIdx]      = startIdx & 0xFFFF;
  a4.routeIterCountTable[startIdx]   = 0;

  heapInsert(heap, 0, 0, startIdx, startIdx);

  const startMs = Date.now();
  while (heap.size > 0) {
    if (Date.now() - startMs > 4) {
      // Timed out: leave useLocalRouteForNav unchanged (use old result if any)
      return;
    }
    const node = heapDeleteMin(heap);
    if (!node) break;
    const { cost: nodeCost, currTile } = node;

    costs[currTile] &= ~VISITED_BIT;

    if (currTile === tankTile) break;  // route found

    const cx = currTile & 0xFF;
    const cy = (currTile >> 8) & 0xFF;
    const prevCost = a4.routeIterCountTable[currTile] & 0x7FFF;

    if (cx > minX) examine(a4, heap, costs, currTile - 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cx < maxX) examine(a4, heap, costs, currTile + 1,     currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cy > minY) examine(a4, heap, costs, currTile - 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);
    if (cy < maxY) examine(a4, heap, costs, currTile + 0x100, currTile, prevCost, tankTile, minX, maxX, minY, maxY);
  }

  // Success if tank tile was visited
  if ((costs[tankTile] & ~VISITED_BIT) < UNVISITED || (costs[tankTile] & VISITED_BIT)) {
    a4.useLocalRouteForNav = true;
  }
}

// A4State already has: worldRouteCostTable, localRouteCostTable, routeLookupTable,
// routeIterCountTable, routeIterCountTable2 (all Uint16Array 65536).
// Missing fields needed (will be added via declaration merging or just used directly):
//   a4.manBehaviorA, a4.manBehaviorB — from TankState
