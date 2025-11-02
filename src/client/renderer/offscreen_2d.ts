/**
 * Offscreen 2D Renderer
 *
 * This renderer builds on the Direct2dRenderr, but caches segments of the map, and then blits these
 * larger segments rather than individual tiles. The idea is to reduce the large amount of drawImage
 * calls.
 *
 * At the time of writing, this doesn't appear to increase performance in Chromium at all, compared
 * to Direct2dRenderer. However, Firefox does get a really nice speed boost out of it.
 */

import { TILE_SIZE_PIXELS, MAP_SIZE_TILES } from '../../constants';
import { Common2dRenderer } from './common_2d';

const { floor } = Math;

// The width and height of segments. The total map size in tiles should be divisible by this number.
const SEGMENT_SIZE_TILES = 16;
// The width and height of the map in segments.
const MAP_SIZE_SEGMENTS = MAP_SIZE_TILES / SEGMENT_SIZE_TILES;
// The width and height of a segment in pixels.
const SEGMENT_SIZE_PIXEL = SEGMENT_SIZE_TILES * TILE_SIZE_PIXELS;

/**
 * Cached segment
 *
 * This class represents a single map segment.
 */
class CachedSegment {
  renderer: Offscreen2dRenderer;
  sx: number;
  sy: number;
  ex: number;
  ey: number;
  psx: number;
  psy: number;
  pex: number;
  pey: number;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;

  constructor(renderer: Offscreen2dRenderer, x: number, y: number) {
    this.renderer = renderer;

    // Tile bounds
    this.sx = x * SEGMENT_SIZE_TILES;
    this.sy = y * SEGMENT_SIZE_TILES;
    this.ex = this.sx + SEGMENT_SIZE_TILES - 1;
    this.ey = this.sy + SEGMENT_SIZE_TILES - 1;

    // Pixel bounds
    this.psx = x * SEGMENT_SIZE_PIXEL;
    this.psy = y * SEGMENT_SIZE_PIXEL;
    this.pex = this.psx + SEGMENT_SIZE_PIXEL - 1;
    this.pey = this.psy + SEGMENT_SIZE_PIXEL - 1;
  }

  isInView(sx: number, sy: number, ex: number, ey: number): boolean {
    // Compare canvas pixel bounds to our own.
    // We can reduce the number of conditions by checking if we don't overlap, rather than if we do.
    if (ex < this.psx || ey < this.psy) return false;
    else if (sx > this.pex || sy > this.pey) return false;
    else return true;
  }

  build(): void {
    // Create the canvas.
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SEGMENT_SIZE_PIXEL;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    this.ctx = ctx;

    // Apply a permanent translation, so we can draw regular map pixel coordinates.
    this.ctx.translate(-this.psx, -this.psy);

    // Iterate the map tiles in this segment, and draw them.
    this.renderer.world.map.each((cell: any) => {
      this.onRetile(cell, cell.tile[0], cell.tile[1]);
    }, this.sx, this.sy, this.ex, this.ey);
  }

  clear(): void {
    this.canvas = this.ctx = null;
  }

  onRetile(cell: any, tx: number, ty: number): void {
    if (!this.canvas) return;
    const obj = cell.pill || cell.base;
    if (obj) {
      this.renderer.drawStyledTile(
        cell.tile[0],
        cell.tile[1],
        obj.owner?.$?.team,
        cell.x * TILE_SIZE_PIXELS,
        cell.y * TILE_SIZE_PIXELS,
        this.ctx!
      );
    } else {
      this.renderer.drawTile(cell.tile[0], cell.tile[1], cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS, this.ctx!);
    }
  }
}

/**
 * Renderer
 *
 * The off-screen renderer keeps a 2D array of instances of MapSegment.
 */
export class Offscreen2dRenderer extends Common2dRenderer {
  cache!: CachedSegment[][];

  setup(): void {
    super.setup();

    this.cache = new Array(MAP_SIZE_SEGMENTS);
    for (let y = 0; y < MAP_SIZE_SEGMENTS; y++) {
      const row = (this.cache[y] = new Array(MAP_SIZE_SEGMENTS));
      for (let x = 0; x < MAP_SIZE_SEGMENTS; x++) {
        row[x] = new CachedSegment(this, x, y);
      }
    }
  }

  /**
   * When a cell is retiled, we store the tile index and update the segment.
   */
  onRetile(cell: any, tx: number, ty: number): void {
    cell.tile = [tx, ty];

    // Guard against retile calls before setup() has been called
    if (!this.cache) return;

    const segx = floor(cell.x / SEGMENT_SIZE_TILES);
    const segy = floor(cell.y / SEGMENT_SIZE_TILES);

    // Additional guard: ensure the row and segment exist
    if (!this.cache[segy] || !this.cache[segy][segx]) return;

    this.cache[segy][segx].onRetile(cell, tx, ty);
  }

  /**
   * Drawing the map is a matter of iterating the map segments that are on-screen, and blitting
   * the off-screen canvas to the main canvas. The segments are prepared on-demand from here, and
   * extra care is taken to only build one segment per frame.
   */
  drawMap(sx: number, sy: number, w: number, h: number): void {
    const ex = sx + w - 1;
    const ey = sy + h - 1;

    let alreadyBuiltOne = false;
    for (const row of this.cache) {
      for (const segment of row) {
        // Skip if not in view.
        if (!segment.isInView(sx, sy, ex, ey)) {
          if (segment.canvas) segment.clear();
          continue;
        }

        // Make sure the segment buffer is available.
        if (!segment.canvas) {
          if (alreadyBuiltOne) continue;
          segment.build();
          alreadyBuiltOne = true;
        }

        // Blit the segment to the screen.
        this.ctx.drawImage(
          segment.canvas!,
          0,
          0,
          SEGMENT_SIZE_PIXEL,
          SEGMENT_SIZE_PIXEL,
          segment.psx,
          segment.psy,
          SEGMENT_SIZE_PIXEL,
          SEGMENT_SIZE_PIXEL
        );
      }
    }
  }
}

export default Offscreen2dRenderer;
