/**
 * What a builder order costs, in trees. Shared by the client (to show and send the order) and the
 * server (to charge it), so the two can't drift apart. The server must never charge a tree count
 * the client claims: before this, an order sent with 0 trees built walls, roads and boats for free.
 *
 * Keyed by the action the SERVER receives. The client rewrites the player's tool into that action
 * first (`checkBuildOrder` in client/world/mixin.ts): "building" on a damaged wall is sent as
 * `repair`, "road" on forest as `forest`, and so on.
 *
 * Validity here is only what's needed to price the order. The builder re-checks the cell when it
 * arrives (`Builder.reached`), because the cell can change while it walks there.
 */

import type { MapCell } from './map';

/** Pillbox armour runs 0-15 (`WorldPillbox.repair` caps it at 15); at 15 there's nothing to repair. */
const PILL_MAX_ARMOUR = 15;

/**
 * Trees a build order costs on this cell, as [cost, flexible], or null if the action can't target
 * this cell. `flexible` means a tank with fewer trees may still send what it has: only pillbox
 * repair, which repairs 4 armour per tree (`WorldPillbox.repair`).
 */
export function buildCost(action: string, cell: MapCell): [number, boolean] | null {
  const c: any = cell;
  switch (action) {
    case 'forest':
      // Harvesting is free and yields 4 trees on arrival.
      if (c.base || c.pill || !c.isType('#')) return null;
      return [0, false];

    case 'road':
      if (c.base || c.pill || c.isType('|', '}', 'b', '^', '#', '=')) return null;
      if (c.isType(' ') && c.hasTankOnBoat?.()) return null;
      return [2, false];

    case 'building':
      if (c.base || c.pill || c.isType('b', '^', '#', '}', '|', ' ')) return null;
      if (c.hasTank?.()) return null;   // a wall under a tank traps it (fix-list 21)
      return [2, false];

    case 'repair':
      if (c.pill) {
        const armour = c.pill.armour;
        if (armour >= PILL_MAX_ARMOUR) return null;
        if (armour >= 11) return [1, true];
        if (armour >= 7) return [2, true];
        if (armour >= 3) return [3, true];
        return [4, true];
      }
      if (c.isType('}')) return [1, false];
      return null;

    case 'boat':
      if (!c.isType(' ') || c.hasTankOnBoat?.()) return null;
      return [5, false];

    case 'pillbox':
      // Placement; needing a carried pillbox is checked by the caller.
      if (c.pill || c.base || c.isType('b', '^', '#', '|', '}', ' ')) return null;
      if (c.hasTank?.()) return null;   // a pillbox under a tank traps it (fix-list 21)
      return [4, false];

    case 'mine':
      // Costs a mine, not trees.
      if (c.base || c.pill || c.isType('^', ' ', '|', 'b', '}')) return null;
      return [0, false];

    default:
      return null;
  }
}

/**
 * What to charge a tank holding `tankTrees` for this order, or null to refuse it. The one rule
 * every authority uses (the server, and the offline world the brain harness runs on), so the
 * number the client sends is never what gets charged.
 */
export function buildCharge(action: string, cell: MapCell, tankTrees: number): number | null {
  const priced = buildCost(action, cell);
  if (!priced) return null;
  const [cost, flexible] = priced;
  if (flexible) {
    // Pillbox repair: charge what the tank has, up to the full price, but never nothing.
    const charge = Math.min(cost, tankTrees);
    return charge > 0 ? charge : null;
  }
  return tankTrees >= cost ? cost : null;
}
