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
