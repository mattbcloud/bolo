import { describe, it, expect } from 'vitest';
import {
  traceShell, pillShotReaches, coverAimBand, coverShotHits, solveCoverSlot,
  holdableBand, dirToFloat,
} from '../cover_solver';

/**
 * The cover-method geometry, on a synthetic map so the assertions are about the MODEL and not
 * about whatever the pathfinder happened to do that run: open grass, one pillbox, one brick
 * beside it. Layout mirrors the measured Everard case (pill 112,108 / cover 113,108), so the
 * numbers here are comparable to the ones recorded from the live map.
 */
const PILL_X = 112, PILL_Y = 108;
const COV_X = 113, COV_Y = 108;

function makeA4(coverTerrain: number) {
  const worldMap = new Uint8Array(65536).fill(7);            // grass everywhere
  worldMap[(PILL_Y << 8) | PILL_X] = 12;                     // live pillbox
  worldMap[(COV_Y << 8) | COV_X] = coverTerrain;             // its cover
  const examineTerrainCostTable = new Uint16Array(256).fill(1);
  return { worldMap, examineTerrainCostTable } as any;
}

/** World point at tile (tx,ty) offset (ox,oy) inside it. */
const at = (tx: number, ty: number, ox: number, oy: number) => [(tx << 8) + ox, (ty << 8) + oy] as const;

describe('cover firing solver', () => {
  it('directly behind the cover there is no shot — safe but silent', () => {
    const a4 = makeA4(0);
    // lat = 0: the tank, the cover and the pill are collinear, so both pill edges fall inside
    // the cover tile. This is the failure the old code sat in, target stuck at armour 9-14.
    for (const r of [4, 5, 6]) {
      const [x, y] = at(PILL_X + r, PILL_Y, 128, 128);
      expect(pillShotReaches(a4, PILL_X, PILL_Y, x, y), `r=${r} must be shielded`).toBe(false);
      expect(coverAimBand(a4, x, y, PILL_X, PILL_Y), `r=${r} must have no shot`).toBeNull();
    }
  });

  it('a lateral offset opens a window while the cover still blocks the reply', () => {
    const a4 = makeA4(0);
    const [x, y] = at(PILL_X + 4, PILL_Y + 3, 32, 128);       // r=4, lat=+3, the measured slot
    expect(pillShotReaches(a4, PILL_X, PILL_Y, x, y)).toBe(false);
    const band = coverAimBand(a4, x, y, PILL_X, PILL_Y);
    expect(band).not.toBeNull();
    expect(band!.width).toBeGreaterThan(holdableBand(a4, PILL_X + 4, PILL_Y + 3));
  });

  it('the asymmetry that makes cover work: our shot threads where the reply does not', () => {
    const a4 = makeA4(0);
    const [x, y] = at(PILL_X + 4, PILL_Y + 3, 32, 128);
    // Same line, opposite directions, different outcomes — because a shell flies in constant
    // integer steps from where it was FIRED, and the pill is stuck firing from its cell centre
    // while the tank picks its sub-tile phase.
    const toPill = dirToFloat(x, y, (PILL_X << 8) + 128, (PILL_Y << 8) + 128);
    expect(traceShell(a4, x, y, toPill, PILL_X, PILL_Y)).toBe('hit');
    expect(pillShotReaches(a4, PILL_X, PILL_Y, x, y)).toBe(false);
  });

  it('a pillbox blocks only its collision disc, a brick blocks its whole cell', () => {
    // The engine tests the pill in the cell BEFORE terrain and only within 127 of that cell's
    // centre; a pill's underlying terrain ('=', '~', '.') never stops a shell. So a captured
    // pillbox used as cover is leakier than a brick — not merely more durable, which is what
    // the earlier tile-granular model assumed.
    const brick = makeA4(0), pillCover = makeA4(12);
    const [x, y] = at(PILL_X + 4, PILL_Y + 2, 128, 128);
    const bBand = coverAimBand(brick, x, y, PILL_X, PILL_Y);
    const pBand = coverAimBand(pillCover, x, y, PILL_X, PILL_Y);
    expect(bBand).not.toBeNull();
    expect(pBand).not.toBeNull();
    expect(pBand!.width).toBeGreaterThan(bBand!.width);
  });

  it('solves to a lateral slot at the measured sweet spot, and never to lat=0', () => {
    const a4 = makeA4(0);
    const [fx, fy] = at(PILL_X + 6, PILL_Y + 6, 128, 128);
    const slot = solveCoverSlot(a4, { tileX: PILL_X, tileY: PILL_Y } as any, COV_X, COV_Y, fx, fy);
    expect(slot).not.toBeNull();
    expect(slot!.lat).not.toBe(0);
    expect(Math.abs(slot!.lat)).toBeGreaterThanOrEqual(2);
    expect(slot!.r).toBeGreaterThanOrEqual(4);
    // Whatever it picks must be a position it can actually shoot and survive from.
    expect(pillShotReaches(a4, PILL_X, PILL_Y, slot!.x, slot!.y)).toBe(false);
    expect(slot!.band).toBeGreaterThan(holdableBand(a4, (slot!.x >> 8) & 0xFF, (slot!.y >> 8) & 0xFF));
  });

  it('the fire gate refuses a shot that would hit our own cover', () => {
    const a4 = makeA4(0);
    const [x, y] = at(PILL_X + 4, PILL_Y + 1, 128, 128);
    // Aim straight down the cover axis from a near-collinear slot: the brick eats it.
    const intoCover = dirToFloat(x, y, (COV_X << 8) + 128, (COV_Y << 8) + 128);
    expect(coverShotHits(a4, x, y, intoCover, PILL_X, PILL_Y)).toBe(false);
  });

  it('respects the tank’s own shell range', () => {
    const a4 = makeA4(0);
    const [x, y] = at(PILL_X + 6, PILL_Y + 3, 128, 128);      // ~6.7 tiles out
    const toPill = dirToFloat(x, y, (PILL_X << 8) + 128, (PILL_Y << 8) + 128);
    expect(traceShell(a4, x, y, toPill, PILL_X, PILL_Y, 7)).not.toBe('miss');
    expect(traceShell(a4, x, y, toPill, PILL_X, PILL_Y, 3)).toBe('miss');   // short shell expires
  });
});
