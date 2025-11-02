/**
 * Common 2D Renderer
 *
 * This is a base class used to share common code between the Canvas2D renderers. It deals with a
 * fair amount of work concerning canvas initialization, preparing styled tilemaps and drawing
 * individual tiles. Subclasses differ mostly in the way they deal with drawing the map.
 */

import { TILE_SIZE_PIXELS, PIXEL_SIZE_WORLD } from '../../constants';
import { distance, heading } from '../../helpers';
import { BaseRenderer } from './base';
import TEAM_COLORS from '../../team_colors';

const { min, round, cos, sin, PI } = Math;

export class Common2dRenderer extends BaseRenderer {
  ctx!: CanvasRenderingContext2D;
  overlay!: Uint8ClampedArray;
  prestyled: Record<string, HTMLCanvasElement> = {};

  setup(): void {
    // Initialize the canvas.
    try {
      const context = this.canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get 2D context');
      }
      this.ctx = context;
      // Just access it, see if it throws.
      this.ctx.drawImage;
    } catch (e: any) {
      throw new Error(`Could not initialize 2D canvas: ${e.message}`);
    }

    // We need to get the raw pixel data from the overlay.
    const img = this.images.overlay;
    // Create a temporary canvas.
    const temp = document.createElement('canvas');
    temp.width = img.width;
    temp.height = img.height;
    // Copy the Image onto the canvas.
    const ctx = temp.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get temporary canvas context');
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(img, 0, 0);
    // Get the CanvasPixelArray object representing the overlay.
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    this.overlay = imageData.data;

    // This contains prestyled tilemaps, index by style/team.
    this.prestyled = {};
  }

  /**
   * We use an extra parameter `ctx` here, so that the offscreen renderer can
   * use the context specific to segments.
   */
  drawTile(tx: number, ty: number, dx: number, dy: number, ctx?: CanvasRenderingContext2D): void {
    (ctx || this.ctx).drawImage(
      this.images.base,
      tx * TILE_SIZE_PIXELS,
      ty * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      dx,
      dy,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS
    );
  }

  createPrestyled(color: { r: number; g: number; b: number }): HTMLCanvasElement {
    // Get the base image and it's width and height.
    const base = this.images.styled;
    const { width, height } = base;

    // Create the new canvas.
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;

    // Copy the base image into it.
    const ctx = source.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get canvas context');
    }
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(base, 0, 0);

    // Use pixel manipulation to blit the overlay.
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const i = 4 * (y * width + x);
        const factor = this.overlay[i] / 255;
        data[i + 0] = round(factor * color.r + (1 - factor) * data[i + 0]);
        data[i + 1] = round(factor * color.g + (1 - factor) * data[i + 1]);
        data[i + 2] = round(factor * color.b + (1 - factor) * data[i + 2]);
        data[i + 3] = min(255, data[i + 3] + this.overlay[i]);
      }
    }
    ctx.putImageData(imageData, 0, 0);

    // All done, return.
    return source;
  }

  drawStyledTile(tx: number, ty: number, style: any, dx: number, dy: number, ctx?: CanvasRenderingContext2D): void {
    // Get the prestyled tilemap, or create it.
    let source = this.prestyled[style];
    if (!source) {
      const color = TEAM_COLORS[style];
      if (color) {
        source = this.prestyled[style] = this.createPrestyled(color);
      } else {
        source = this.images.styled;
      }
    }

    // Draw from the prestyled tilemap.
    (ctx || this.ctx).drawImage(
      source,
      tx * TILE_SIZE_PIXELS,
      ty * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      dx,
      dy,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS
    );
  }

  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {
    this.ctx.save();
    const [left, top, width, height] = this.getViewAreaAtWorld(x, y);
    this.ctx.translate(-left, -top);
    cb(left, top, width, height);
    this.ctx.restore();
  }

  drawBuilderIndicator(b: any): void {
    const player = b.owner.$;
    const dist = distance(player, b);
    if (dist <= 128) return;

    const px = player.x / PIXEL_SIZE_WORLD;
    const py = player.y / PIXEL_SIZE_WORLD;
    this.ctx.save();

    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.globalAlpha = min(1.0, (dist - 128) / 1024);
    const offset = min(50, (dist / 10240) * 50) + 32;
    let rad = heading(player, b);
    this.ctx.beginPath();
    const x = px + cos(rad) * offset;
    const y = py + sin(rad) * offset;
    this.ctx.moveTo(x, y);
    rad += PI;
    this.ctx.lineTo(x + cos(rad - 0.4) * 10, y + sin(rad - 0.4) * 10);
    this.ctx.lineTo(x + cos(rad + 0.4) * 10, y + sin(rad + 0.4) * 10);
    this.ctx.closePath();
    this.ctx.fillStyle = 'yellow';
    this.ctx.fill();

    this.ctx.restore();
  }

  drawNames(): void {
    this.ctx.save();
    this.ctx.strokeStyle = this.ctx.fillStyle = 'white';
    this.ctx.font = 'bold 11px sans-serif';
    (this.ctx as any).textBaselines = 'alphabetic';
    this.ctx.textAlign = 'left';
    const player = this.world.player;
    for (const tank of this.world.tanks) {
      if (tank.name && tank.armour !== 255 && tank !== player) {
        if (player) {
          const dist = distance(player, tank);
          if (dist <= 768) continue;
          this.ctx.globalAlpha = min(1.0, (dist - 768) / 1536);
        } else {
          this.ctx.globalAlpha = 1.0;
        }
        const metrics = this.ctx.measureText(tank.name);
        this.ctx.beginPath();
        let x = round(tank.x / PIXEL_SIZE_WORLD) + 16;
        let y = round(tank.y / PIXEL_SIZE_WORLD) - 16;
        this.ctx.moveTo(x, y);
        x += 12;
        y -= 9;
        this.ctx.lineTo(x, y);
        this.ctx.lineTo(x + metrics.width, y);
        this.ctx.stroke();
        this.ctx.fillText(tank.name, x, y - 2);
      }
    }
    this.ctx.restore();
  }
}

export default Common2dRenderer;
