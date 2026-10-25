/**
 * Forest regrowth, as in the 1989 Bolo.
 *
 * Every tick a few random tiles are scored by their terrain and the forest around them (a lone
 * grass tile ringed by forest scores very high, road in a built-up area very low). The best
 * candidate seen is remembered; once it has stayed the best for REGROW_HOLD_TICKS, a tree grows
 * there and the search starts over. A better candidate replaces it and restarts the clock.
 *
 * Shared by every authoritative world (the server, offline play, the headless harness) through
 * WorldMixin.growForest(). A networked client never grows trees: it gets them as map changes.
 */

/** Random tiles scored per tick. */
export const REGROW_SAMPLES_PER_TICK = 3;

/** How long the best candidate must stay the best before a tree grows: 500 ticks = 10 s. */
export const REGROW_HOLD_TICKS = 500;

/** How readily each terrain grows a tree. Anything not listed (forest, water, walls) never does. */
export const REGROW_WEIGHTS: Record<string, number> = {
  '.': 1.0,    // grass
  '~': 0.5,    // swamp
  '%': 0.3,    // crater
  ':': 0.3,    // rubble
  '=': 0.05,   // road
};

/** Taken off the score for each building (or shot building) among the 8 neighbours. */
export const REGROW_BUILDING_PENALTY = 1;

/**
 * How good a place `cell` is for a new tree: weight × (1 + forest neighbours)², minus the
 * building penalty. 0 or less never grows. A tile with a base, a pillbox (alive or dead), a
 * live tank or a mine scores 0.
 */
export function regrowScore(cell: any): number {
  const weight = REGROW_WEIGHTS[cell.type?.ascii] ?? 0;
  if (weight <= 0) return 0;
  if (cell.base || cell.pill || cell.mine || cell.hasTank?.()) return 0;

  let forest = 0;
  let buildings = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const neighbour = cell.neigh(dx, dy);
      if (neighbour.isType('#')) forest++;
      else if (neighbour.isType('|', '}')) buildings++;
    }
  }
  return weight * (1 + forest) ** 2 - REGROW_BUILDING_PENALTY * buildings;
}

/** The search: the best candidate so far, its score, and how long it has held. */
export class ForestRegrowth {
  best: any = null;
  bestScore = 0;
  held = 0;

  /**
   * One tick on `map`. `random` returns [0, 1). Returns the cell a tree grew on, if one did.
   */
  tick(map: any, random: () => number): any {
    // The best candidate has held for REGROW_HOLD_TICKS ticks since it became the best: grow a
    // tree, if it still qualifies (a tank, a road or a mine may have arrived meanwhile).
    if (this.best && ++this.held >= REGROW_HOLD_TICKS) {
      const cell = this.best;
      this.best = null;
      this.bestScore = 0;
      this.held = 0;
      if (regrowScore(cell) <= 0) return null;
      cell.setType('#');
      return cell;
    }

    for (let i = 0; i < REGROW_SAMPLES_PER_TICK; i++) {
      const cell = map.cellAtTile(Math.floor(random() * 256), Math.floor(random() * 256));
      if (cell === this.best) continue;
      const score = regrowScore(cell);
      if (score > this.bestScore) {
        this.best = cell;
        this.bestScore = score;
        this.held = 0;
      }
    }
    return null;
  }
}
