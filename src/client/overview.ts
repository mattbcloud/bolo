/**
 * Overview Map
 *
 * A full-screen, scaled-down view of the whole map, toggled with the `overview` key
 * (default `O`). It reproduces the classic Bolo overview: the map is drawn from the same
 * tile artwork the main view uses, in three brightness levels —
 *
 *   hidden  — ground nobody on the team has been near: solid black.
 *   dim     — ground discovered earlier but not currently in sight: darkened.
 *   bright  — the boxes the team's tanks can see right now: undimmed, with a light wash.
 *
 * Vision is shared across a team. This class tracks live what its own client witnesses
 * (its tanks and team mates', every tick); the server owns the team's accumulated map and
 * sends it at join, which is the only way to inherit ground explored before this client
 * connected. Either way it's presentation only — the client already holds the whole map,
 * so nothing here affects game state.
 *
 * What gets shown is the map's *painted* area, not the full 256x256 grid: a BMAP is
 * mostly deep sea (Everard Island's playfield is 104x52 tiles in the middle of the grid),
 * so drawing the whole grid would shrink the island to a blob surrounded by black. The
 * painted bounding box plus a small margin of sea is scaled up uniformly — same pixels
 * per tile on both axes, so the map keeps its true shape — to fill as much of the window
 * as that shape allows.
 *
 * Rendering strategy: that region is rasterised once into an offscreen canvas at an
 * integer number of pixels per tile (`renderScale`), then blitted in one call per frame.
 * Terrain changes arrive via `invalidateTile` (from the renderer's `onRetile`) and only
 * redraw the tiles that changed. The shroud is a 256x256 canvas — one pixel per tile —
 * scaled up with smoothing off, so it stays perfectly tile-aligned.
 */

import { MAP_SIZE_TILES, OVERVIEW_SIGHT_TILES, TILE_SIZE_PIXELS, TILE_SIZE_WORLD } from '../constants';
import TEAM_COLORS from '../team_colors';

/**
 * Alpha of the shroud over discovered-but-not-visible terrain (0-255). Tuned so the
 * terrain there stays readable — you're meant to plan routes from it — while still
 * reading as clearly darker than the box the tank can see right now.
 */
const DIM_ALPHA = 115;

/** Tiles of open sea kept around the painted area, so the coast isn't flush to the edge. */
const BOUNDS_MARGIN = 4;

/** Cap on pixels per tile in the offscreen canvas — beyond this the tile art is upscaled. */
const MAX_RENDER_SCALE = 16;

interface Bounds {
  l: number;
  t: number;
  w: number;
  h: number;
}

/** An inclusive tile rectangle a tank can currently see. */
interface SightBox {
  sx: number;
  sy: number;
  ex: number;
  ey: number;
}

export class OverviewMap {
  world: any;
  isOpen = false;

  /** One byte per tile: 0 = never seen, 1 = discovered. */
  private discovered: Uint8Array;

  /** Full-screen display canvas; only in the DOM while open. */
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  /** Offscreen copy of the painted map area, `renderScale` pixels per tile. */
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapCtx: CanvasRenderingContext2D | null = null;

  /** Offscreen shroud, exactly one pixel per tile, covering the whole grid. */
  private shroudCanvas: HTMLCanvasElement;
  private shroudCtx: CanvasRenderingContext2D;
  private shroudData: ImageData;
  private shroudDirty = true;

  /** The tile region drawn on screen: the painted area plus a margin. */
  private bounds: Bounds | null = null;

  /** Pixels per tile in `mapCanvas` (integer). */
  private renderScale = 0;
  private dirtyTiles = new Set<number>();
  private needsFullBuild = true;

  constructor(world: any) {
    this.world = world;
    this.discovered = new Uint8Array(MAP_SIZE_TILES * MAP_SIZE_TILES);

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overview-map';
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      z-index: 15000;
      background: #000;
      cursor: default;
    `;
    this.ctx = this.canvas.getContext('2d')!;

    this.shroudCanvas = document.createElement('canvas');
    this.shroudCanvas.width = this.shroudCanvas.height = MAP_SIZE_TILES;
    this.shroudCtx = this.shroudCanvas.getContext('2d')!;
    this.shroudData = this.shroudCtx.createImageData(MAP_SIZE_TILES, MAP_SIZE_TILES);

    window.addEventListener('resize', () => {
      if (this.isOpen) this.resizeDisplay();
      // The map canvas is built at a specific scale; a resize may call for another.
      if (this.bounds && this.pickRenderScale(this.bounds) !== this.renderScale) {
        this.needsFullBuild = true;
      }
    });
  }

  // ── Discovery ─────────────────────────────────────────────────────────────

  /**
   * Record what the team can see right now. Called from the world's *tick*, not from the
   * render frame: a backgrounded tab has requestAnimationFrame suspended outright, so
   * tracking vision there would freeze discovery whenever the window isn't on top — and
   * two team mates comparing overviews would then see different maps. Ticks run on
   * setInterval, which keeps firing (throttled to ~1 Hz) while hidden; that is still far
   * faster than a tank can cross a sight box, so nothing is missed.
   */
  trackVision(): void {
    this.markVisible(this.sightBoxes());
  }

  /** Called every render frame; draws only when the overview is actually open. */
  render(): void {
    if (this.isOpen) this.draw();
  }

  /**
   * The boxes of tiles the team can see right now — one per living tank on your team,
   * your own included. Vision is shared: what a team mate is looking at counts as seen,
   * so their ground shows bright on your overview and stays discovered afterwards.
   */
  private sightBoxes(): SightBox[] {
    const player = this.world.player;
    if (!player) return [];

    const r = (OVERVIEW_SIGHT_TILES - 1) / 2;
    const boxes: SightBox[] = [];

    for (const tank of this.world.tanks || []) {
      if (!tank || tank.armour === 255 || tank.x == null || tank.y == null) continue;
      if (tank !== player && tank.team !== player.team) continue;

      const tx = Math.floor(tank.x / TILE_SIZE_WORLD);
      const ty = Math.floor(tank.y / TILE_SIZE_WORLD);
      boxes.push({
        sx: Math.max(0, tx - r),
        sy: Math.max(0, ty - r),
        ex: Math.min(MAP_SIZE_TILES - 1, tx + r),
        ey: Math.min(MAP_SIZE_TILES - 1, ty + r),
      });
    }

    return boxes;
  }

  /**
   * Merge the team's accumulated discovered map, sent by the server as one bit per tile.
   * This is what a client gets on join: everything its team explored before it connected,
   * which no amount of watching live tank positions could reconstruct.
   */
  applyDiscoveredMask(bytes: ArrayLike<number>): void {
    for (let i = 0, n = this.discovered.length; i < n; i++) {
      if (this.discovered[i]) continue;
      const byte = bytes[i >> 3];
      if (byte === undefined) break;
      if (byte & (1 << (i & 7))) {
        this.discovered[i] = 1;
        this.shroudDirty = true;
      }
    }
  }

  /** Mark individual tiles discovered — the server's incremental team updates. */
  addDiscoveredTiles(tiles: number[]): void {
    for (const idx of tiles) {
      if (idx >= 0 && idx < this.discovered.length && !this.discovered[idx]) {
        this.discovered[idx] = 1;
        this.shroudDirty = true;
      }
    }
  }

  private markVisible(boxes: SightBox[]): void {
    for (const box of boxes) {
      for (let y = box.sy; y <= box.ey; y++) {
        const row = y * MAP_SIZE_TILES;
        for (let x = box.sx; x <= box.ex; x++) {
          if (this.discovered[row + x] === 0) {
            this.discovered[row + x] = 1;
            this.shroudDirty = true;
          }
        }
      }
    }
  }

  // ── Terrain updates ───────────────────────────────────────────────────────

  /**
   * A tile changed appearance (wall built or shot, forest harvested, pill captured, …).
   * Called from the renderer's `onRetile`, which also fires for neighbouring tiles whose
   * artwork depends on this one.
   */
  invalidateTile(x: number, y: number): void {
    if (this.needsFullBuild || !this.mapCanvas) return;
    this.dirtyTiles.add(y * MAP_SIZE_TILES + x);
  }

  // ── Open / close ──────────────────────────────────────────────────────────

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.appendChild(this.canvas);
    this.resizeDisplay();
    this.draw();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.canvas.remove();
  }

  // ── Geometry ──────────────────────────────────────────────────────────────

  /**
   * The tile region worth drawing: the bounding box of everything that isn't deep sea,
   * grown by a margin. Falls back to the whole grid for a map with nothing painted.
   */
  private computeBounds(): Bounds {
    const cells = this.world.map?.cells;
    let l = MAP_SIZE_TILES, t = MAP_SIZE_TILES, r = -1, b = -1;

    if (cells) {
      for (let y = 0; y < MAP_SIZE_TILES; y++) {
        const row = cells[y];
        if (!row) continue;
        for (let x = 0; x < MAP_SIZE_TILES; x++) {
          const cell = row[x];
          if (!cell || cell.type?.ascii === '^') continue; // deep sea = unpainted
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > b) b = y;
        }
      }
    }

    if (r < l || b < t) return { l: 0, t: 0, w: MAP_SIZE_TILES, h: MAP_SIZE_TILES };

    l = Math.max(0, l - BOUNDS_MARGIN);
    t = Math.max(0, t - BOUNDS_MARGIN);
    r = Math.min(MAP_SIZE_TILES - 1, r + BOUNDS_MARGIN);
    b = Math.min(MAP_SIZE_TILES - 1, b + BOUNDS_MARGIN);
    return { l, t, w: r - l + 1, h: b - t + 1 };
  }

  /**
   * Screen pixels per tile: the same on both axes, so the map keeps its real proportions,
   * and as large as the window allows.
   */
  private fitScale(bounds: Bounds): number {
    return Math.min(window.innerWidth / bounds.w, window.innerHeight / bounds.h);
  }

  /** Pixels per tile to rasterise at: the display scale rounded up, within reason. */
  private pickRenderScale(bounds: Bounds): number {
    return Math.max(1, Math.min(MAX_RENDER_SCALE, Math.ceil(this.fitScale(bounds))));
  }

  private resizeDisplay(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  /**
   * The tile source for a cell: the plain tilemap, or a team-coloured one for cells
   * holding a pillbox or base. Mirrors what the main renderer does for the same cell.
   */
  private sourceFor(obj: any): CanvasImageSource | null {
    const renderer = this.world.renderer;
    if (!renderer || !renderer.images) return null;
    if (!obj || typeof renderer.getStyledSource !== 'function') return renderer.images.base;
    return renderer.getStyledSource(obj.team);
  }

  private drawTileTo(ctx: CanvasRenderingContext2D, cell: any, bounds: Bounds, scale: number): void {
    if (!cell.tile) return;
    const source = this.sourceFor(cell.pill || cell.base);
    if (!source) return;
    ctx.drawImage(
      source,
      cell.tile[0] * TILE_SIZE_PIXELS,
      cell.tile[1] * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      (cell.x - bounds.l) * scale,
      (cell.y - bounds.t) * scale,
      scale,
      scale
    );
  }

  /** Render the painted map area into the offscreen canvas at the current scale. */
  private buildMapCanvas(): void {
    const bounds = (this.bounds = this.computeBounds());
    const scale = (this.renderScale = this.pickRenderScale(bounds));

    if (!this.mapCanvas) {
      this.mapCanvas = document.createElement('canvas');
      this.mapCtx = this.mapCanvas.getContext('2d')!;
    }
    this.mapCanvas.width = bounds.w * scale;
    this.mapCanvas.height = bounds.h * scale;

    const ctx = this.mapCtx!;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, this.mapCanvas.width, this.mapCanvas.height);

    const cells = this.world.map?.cells;
    if (cells) {
      for (let y = bounds.t; y < bounds.t + bounds.h; y++) {
        const row = cells[y];
        if (!row) continue;
        for (let x = bounds.l; x < bounds.l + bounds.w; x++) {
          if (row[x]) this.drawTileTo(ctx, row[x], bounds, scale);
        }
      }
    }

    this.dirtyTiles.clear();
    this.needsFullBuild = false;
  }

  private flushDirtyTiles(): void {
    if (this.dirtyTiles.size === 0 || !this.mapCtx || !this.bounds) return;
    const cells = this.world.map?.cells;
    if (!cells) {
      this.dirtyTiles.clear();
      return;
    }

    const bounds = this.bounds;
    const scale = this.renderScale;
    for (const idx of this.dirtyTiles) {
      const x = idx % MAP_SIZE_TILES;
      const y = (idx - x) / MAP_SIZE_TILES;
      if (x < bounds.l || y < bounds.t || x >= bounds.l + bounds.w || y >= bounds.t + bounds.h) continue;
      const cell = cells[y]?.[x];
      if (!cell) continue;
      // Clear first: tile art can have transparent pixels that would otherwise stack.
      this.mapCtx.clearRect((x - bounds.l) * scale, (y - bounds.t) * scale, scale, scale);
      this.drawTileTo(this.mapCtx, cell, bounds, scale);
    }
    this.dirtyTiles.clear();
  }

  /** Repaint the one-pixel-per-tile shroud: opaque where hidden, dim where discovered. */
  private buildShroud(): void {
    const data = this.shroudData.data;
    for (let i = 0, n = this.discovered.length; i < n; i++) {
      const o = i * 4;
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = this.discovered[i] ? DIM_ALPHA : 255;
    }
    this.shroudCtx.putImageData(this.shroudData, 0, 0);
    this.shroudDirty = false;
  }

  private draw(): void {
    if (this.needsFullBuild || !this.mapCanvas) this.buildMapCanvas();
    else this.flushDirtyTiles();
    if (this.shroudDirty) this.buildShroud();

    const ctx = this.ctx;
    const bounds = this.bounds!;
    const rs = this.renderScale;           // offscreen pixels per tile
    const scale = this.fitScale(bounds);   // screen pixels per tile (both axes)
    const dw = bounds.w * scale;
    const dh = bounds.h * scale;
    const ox = Math.floor((this.canvas.width - dw) / 2);
    const oy = Math.floor((this.canvas.height - dh) / 2);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Smooth only when the offscreen copy isn't shown 1:1 — an integer scale stays crisp.
    ctx.imageSmoothingEnabled = scale !== rs;
    ctx.drawImage(this.mapCanvas!, 0, 0, bounds.w * rs, bounds.h * rs, ox, oy, dw, dh);

    // Shroud: hidden tiles go black, discovered-but-unseen tiles are darkened.
    // Always nearest-neighbour, so the edge of explored ground stays a hard tile edge.
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.shroudCanvas, bounds.l, bounds.t, bounds.w, bounds.h, ox, oy, dw, dh);

    // One bright box per tank on the team — punch each back out of the shroud by
    // redrawing that slice of the map, then wash it lighter so 'what the team can see
    // right now' reads at a glance.
    const boxes = this.sightBoxes();
    for (const box of boxes) {
      const bw = box.ex - box.sx + 1;
      const bh = box.ey - box.sy + 1;
      const dx = ox + (box.sx - bounds.l) * scale;
      const dy = oy + (box.sy - bounds.t) * scale;

      ctx.imageSmoothingEnabled = scale !== rs;
      ctx.drawImage(
        this.mapCanvas!,
        (box.sx - bounds.l) * rs, (box.sy - bounds.t) * rs, bw * rs, bh * rs,
        dx, dy, bw * scale, bh * scale
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.fillRect(dx, dy, bw * scale, bh * scale);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(dx + 0.5, dy + 0.5, bw * scale - 1, bh * scale - 1);
    }

    this.drawMarkers(ox, oy, bounds, scale, boxes);
  }

  /**
   * Objects on top of the terrain. Pillboxes and bases are shown anywhere the team has
   * been (their last known state), team tanks anywhere discovered, and enemy tanks only
   * inside a sight box — you can't see what nobody on the team is looking at.
   */
  private drawMarkers(
    ox: number,
    oy: number,
    bounds: Bounds,
    scale: number,
    boxes: SightBox[]
  ): void {
    const ctx = this.ctx;
    const dot = Math.max(3, scale * 0.6);
    const map = this.world.map;
    if (!map) return;

    const isDiscovered = (tx: number, ty: number) =>
      tx >= 0 && ty >= 0 && tx < MAP_SIZE_TILES && ty < MAP_SIZE_TILES &&
      this.discovered[ty * MAP_SIZE_TILES + tx] === 1;

    const inSight = (tx: number, ty: number) =>
      boxes.some(b => tx >= b.sx && tx <= b.ex && ty >= b.sy && ty <= b.ey);

    const teamColor = (team: number): string => {
      const c = TEAM_COLORS[team];
      return c ? `rgb(${c.r}, ${c.g}, ${c.b})` : '#c8c8c8'; // neutral / unowned
    };

    // Tile coordinates (fractional for tanks) to screen coordinates.
    const sx = (tx: number) => ox + (tx - bounds.l) * scale;
    const sy = (ty: number) => oy + (ty - bounds.t) * scale;

    // Pillboxes: diamonds.
    for (const pill of map.pills || []) {
      if (!isDiscovered(pill.x, pill.y)) continue;
      const cx = sx(pill.x + 0.5);
      const cy = sy(pill.y + 0.5);
      ctx.globalAlpha = inSight(pill.x, pill.y) ? 1 : 0.65;
      ctx.fillStyle = teamColor(pill.team);
      ctx.beginPath();
      ctx.moveTo(cx, cy - dot);
      ctx.lineTo(cx + dot, cy);
      ctx.lineTo(cx, cy + dot);
      ctx.lineTo(cx - dot, cy);
      ctx.closePath();
      ctx.fill();
    }

    // Bases: squares.
    for (const base of map.bases || []) {
      if (!isDiscovered(base.x, base.y)) continue;
      const cx = sx(base.x + 0.5);
      const cy = sy(base.y + 0.5);
      ctx.globalAlpha = inSight(base.x, base.y) ? 1 : 0.65;
      ctx.fillStyle = teamColor(base.team);
      ctx.fillRect(cx - dot, cy - dot, dot * 2, dot * 2);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx - dot + 0.5, cy - dot + 0.5, dot * 2 - 1, dot * 2 - 1);
    }

    // Tanks.
    const player = this.world.player;
    const labels: { text: string; cx: number; cy: number }[] = [];
    for (const tank of this.world.tanks || []) {
      if (!tank || tank.armour === 255 || tank.x == null || tank.y == null) continue;

      const tx = Math.floor(tank.x / TILE_SIZE_WORLD);
      const ty = Math.floor(tank.y / TILE_SIZE_WORLD);
      const friendly = player && tank.team === player.team;

      if (tank !== player) {
        if (friendly) {
          // Team mates are always known to their own team, forest cover included.
          if (!isDiscovered(tx, ty)) continue;
        } else {
          // An enemy shows only where the team is looking, and never from forest cover.
          if (tank.hidden || !inSight(tx, ty)) continue;
        }
      }

      ctx.globalAlpha = 1;
      const cx = sx(tank.x / TILE_SIZE_WORLD);
      const cy = sy(tank.y / TILE_SIZE_WORLD);
      this.drawTankSprite(tank, cx, cy, scale);
      // Labels go on after every sprite, so a name is never painted over by the tank
      // standing next to it.
      if (tank.name) labels.push({ text: tank.name, cx, cy });
    }

    for (const label of labels) {
      this.drawTankLabel(label.text, label.cx, label.cy, scale);
    }

    ctx.globalAlpha = 1;
  }

  /**
   * A player's name, in the same style the main view uses (renderer `drawNames`): a white
   * leader line up and to the right of the tank, kinked into a horizontal rule, with the
   * name sitting on the rule. The anchor offset follows the tile size — half a tile, as
   * in the main view — so the callout hugs the tank at any overview zoom.
   */
  private drawTankLabel(text: string, tankCx: number, tankCy: number, scale: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ctx.fillStyle = 'white';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 1;

    const metrics = ctx.measureText(text);
    let x = Math.round(tankCx + scale / 2);
    let y = Math.round(tankCy - scale / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    x += 12;
    y -= 9;
    ctx.lineTo(x, y);
    ctx.lineTo(x + metrics.width, y);
    ctx.stroke();
    ctx.fillText(text, x, y - 2);
  }

  /**
   * A tank: the real sprite, in team colour and pointing the way it's facing — the same
   * artwork the main view draws, taken from the styled tilemap. Drawn at exactly one tile,
   * so it sits at the same scale as the terrain around it.
   */
  private drawTankSprite(tank: any, cx: number, cy: number, scale: number): void {
    const ctx = this.ctx;
    const source = this.sourceFor(tank);
    if (!source || typeof tank.getTile !== 'function') return;

    const [tx, ty] = tank.getTile();
    const size = scale;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      source,
      tx * TILE_SIZE_PIXELS,
      ty * TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      TILE_SIZE_PIXELS,
      cx - size / 2,
      cy - size / 2,
      size,
      size
    );
  }
}

export default OverviewMap;
