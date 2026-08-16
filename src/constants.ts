/**
 * Constants used for conversion between units.
 * The naming convention here is to always have the larger unit first and singular, and the smaller
 * unit last and plural.
 */

/** A single CSS pixel's size in world units. */
export const PIXEL_SIZE_WORLD = 8;

/** A single tile's size in pixels and world units. */
export const TILE_SIZE_PIXELS = 32;
export const TILE_SIZE_WORLD = TILE_SIZE_PIXELS * PIXEL_SIZE_WORLD;

/** The map's total size in tiles, pixels and world units. */
export const MAP_SIZE_TILES = 256;
export const MAP_SIZE_PIXELS = MAP_SIZE_TILES * TILE_SIZE_PIXELS;
export const MAP_SIZE_WORLD = MAP_SIZE_TILES * TILE_SIZE_WORLD;

/** The game tick length in milliseconds. */
export const TICK_LENGTH_MS = 20;

/** Fog-of-war visible window size in CSS pixels. */
export const FOG_WINDOW_W = 200;
export const FOG_WINDOW_H = 200;

/**
 * Size, in tiles, of the box a tank sees for overview-map purposes — the fog window above
 * plus a margin. Odd, so it centres on the tank's tile. Shared: the client uses it to draw
 * the bright area, the server to accumulate each team's discovered map.
 */
export const OVERVIEW_SIGHT_TILES = 15;
