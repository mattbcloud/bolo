/**
 * Direct 2D Renderer
 *
 * The Direct2D renderer is probably the simplest possible renderer there is. It has nothing to do
 * with the DirectX technology. The name simply means that is draws the map tile-for-tile each frame.
 * This method appears to be fairly slow, at the time of writing.
 */

import { TILE_SIZE_PIXELS } from '../../constants';
import { Common2dRenderer } from './common_2d';

const { floor, ceil } = Math;

export class Direct2dRenderer extends Common2dRenderer {
  onRetile(cell: any, tx: number, ty: number): void {
    // Simply cache the tile index.
    cell.tile = [tx, ty];
  }

  drawMap(sx: number, sy: number, w: number, h: number): void {
    // Calculate pixel boundaries.
    const ex = sx + w - 1;
    const ey = sy + h - 1;

    // Calculate tile boundaries.
    const stx = floor(sx / TILE_SIZE_PIXELS);
    const sty = floor(sy / TILE_SIZE_PIXELS);
    const etx = ceil(ex / TILE_SIZE_PIXELS);
    const ety = ceil(ey / TILE_SIZE_PIXELS);

    // Iterate each tile in view.
    this.world.map.each(
      (cell: any) => {
        const obj = cell.pill || cell.base;
        if (obj) {
          this.drawStyledTile(
            cell.tile[0],
            cell.tile[1],
            obj.owner?.$?.team,
            cell.x * TILE_SIZE_PIXELS,
            cell.y * TILE_SIZE_PIXELS
          );
        } else {
          this.drawTile(cell.tile[0], cell.tile[1], cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
        }
      },
      stx,
      sty,
      etx,
      ety
    );
  }
}

export default Direct2dRenderer;
