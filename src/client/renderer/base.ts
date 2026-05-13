/**
 * Base Renderer
 *
 * The base class for all renderers is defined here. A renderer is responsible for drawing the map,
 * objects on the map, HUD map overlays and HUD screen overlays. Especially of the last two points,
 * a lot of shared code lives in this base class. Methods that need to be implemented by subclasses
 * are stubbed out here. All renderers also implement the `MapView` interface.
 */

import {
  TILE_SIZE_PIXELS,
  TILE_SIZE_WORLD,
  PIXEL_SIZE_WORLD,
  MAP_SIZE_PIXELS,
} from '../../constants';
import * as sounds from '../../sounds';
import TEAM_COLORS from '../../team_colors';

const { min: mathMin, max: mathMax, round: mathRound, cos: mathCos, sin: mathSin, PI: mathPI, sqrt: mathSqrt } = Math;

// Linearly interpolate a world-space position between prev and curr.
// Snaps (returns curr) when prev is unknown or the jump is too large to be
// normal movement (teleport / respawn threshold: 500 world units).
function lerpPos(prev: number | null, curr: number, alpha: number): number {
  if (prev === null) return curr;
  const d = curr - prev;
  if (d * d > 250000) return curr;
  return prev + d * alpha;
}

/**
 * One animated smoke blob in the fog overlay.
 * The blurred ellipse is pre-rendered to `canvas` once (in initFogBlobs) so
 * that every animation frame only needs a cheap drawImage blit — no per-frame
 * filter / rasterisation cost.
 */
interface FogBlob {
  baseBx: number;    // home x (fog zone, px)
  baseBy: number;    // home y (fog zone, px)
  phase: number;     // oscillation phase offset (radians)
  speed: number;     // oscillation speed (radians / ms)
  amplitude: number; // drift radius (px)
  canvas: HTMLCanvasElement; // pre-rendered blurred ellipse texture
  halfW: number;     // canvas.width  / 2  (for centering on bx/by)
  halfH: number;     // canvas.height / 2
}

export class BaseRenderer {
  world: any;
  images: any;
  soundkit: any;
  canvas: HTMLCanvasElement;
  lastCenter: [number, number];
  mouse: [number, number];
  hud?: HTMLDivElement;
  tankIndicators?: Record<string, HTMLDivElement>;
  pillIndicators?: Array<[HTMLDivElement, any]>;
  baseIndicators?: Array<[HTMLDivElement, any]>;
  playerIndicators?: Array<HTMLDivElement>;
  currentTool: string = 'forest';
  hudPanels: HTMLElement[] = [];
  hudPanelFracs: Map<HTMLElement, { xFrac: number; yFrac: number }> = new Map();
  fogCanvas?: HTMLCanvasElement;          // animated overlay (composited each frame)
  fogCtx?: CanvasRenderingContext2D;
  fogStaticCanvas?: HTMLCanvasElement;    // offscreen: static dark fog + hole punch
  fogStaticCtx?: CanvasRenderingContext2D;
  fogBlobs: FogBlob[] = [];              // animated cloud blobs
  fogLastDraw: number = 0;              // timestamp of last fog redraw (ms)
  fogCx: number = 0;                    // visible-window left edge (px, updated on resize)
  fogCy: number = 0;                    // visible-window top  edge (px, updated on resize)
  fogBlobCanvas?: HTMLCanvasElement;     // offscreen: blobs masked to fog zone
  fogBlobCtx?: CanvasRenderingContext2D;
  fogSeed: number = (Math.random() * 0xffffffff) | 0; // randomised once per session

  /**
   * The constructor takes a reference to the World it needs to draw. Once the constructor finishes,
   * `Map#setView` is called to hook up this renderer instance, which causes onRetile to be invoked
   * once for each tile to initialize.
   */
  constructor(world: any) {
    this.world = world;
    this.images = this.world.images;
    this.soundkit = this.world.soundkit;

    this.canvas = document.createElement('canvas');
    document.body.appendChild(this.canvas);
    this.lastCenter = this.world.map.findCenterCell().getWorldCoordinates();

    this.mouse = [0, 0];
    this.canvas.addEventListener('click', (e) => this.handleClick(e));
    this.canvas.addEventListener('mousemove', (e) => {
      this.mouse = [e.pageX, e.pageY];
    });

    this.setup();
    this.initFogOfWar();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  /**
   * Subclasses use this as their constructor.
   */
  setup(): void {}

  /**
   * Create the fog of war overlay canvas. A fixed-position canvas sits above the game canvas
   * (z-index 99, below the HUD at 100) and masks the visible area to a 200×200 pixel window
   * centered on screen with a soft gradient fade at the edges.
   */
  initFogOfWar(): void {
    // Visible overlay canvas (animated blobs composited here every frame).
    this.fogCanvas = document.createElement('canvas');
    this.fogCanvas.style.position = 'fixed';
    this.fogCanvas.style.top = '0';
    this.fogCanvas.style.left = '0';
    this.fogCanvas.style.pointerEvents = 'none';
    this.fogCanvas.style.zIndex = '99';
    document.body.appendChild(this.fogCanvas);
    this.fogCtx = this.fogCanvas.getContext('2d')!;

    // Offscreen canvas for the static dark fog + Gaussian hole punch.
    this.fogStaticCanvas = document.createElement('canvas');
    this.fogStaticCtx = this.fogStaticCanvas.getContext('2d')!;

    // Offscreen canvas that holds blobs pre-masked to the fog zone each frame.
    this.fogBlobCanvas = document.createElement('canvas');
    this.fogBlobCtx = this.fogBlobCanvas.getContext('2d')!;

    // Lightweight rAF heartbeat — keeps fog animating in the lobby (when the
    // game's draw() loop isn't running).  On skipped frames updateFogIfDue
    // returns after a single number comparison, so this adds negligible cost.
    const tick = (now: number) => {
      this.updateFogIfDue(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Render the fog of war mask onto the fog canvas. The visible window is 200×200 pixels,
   * centered on screen.
   *
   * Technique: a single CSS-blurred rectangle is punched through the fog with
   * destination-out. The rect is padded 3× the blur sigma beyond the visible edges,
   * placing the visible boundary ~3σ inside the fully-erased zone (~99.97% clear —
   * imperceptible residual). Because the falloff is a continuous Gaussian on both the
   * inner and outer sides, there are no hard lines at any window size. No secondary
   * hard-clear rect is drawn (that was the source of the inner seam in earlier versions).
   *
   * The smoke blob animation is handled by `initFogBlobs` / `startFogAnimation` /
   * `drawFogFrame`. The static dark layer is drawn once (on resize) to `fogStaticCanvas`
   * by `drawFog`, then blitted cheaply every frame.
   */
  /**
   * Draw only the static parts of the fog (dark base + Gaussian hole punch) to
   * `fogStaticCanvas`. This is expensive (blurred rect) so it runs only on resize.
   * The animated blob layer is composited on top each frame by `drawFogFrame`.
   */
  drawFog(): void {
    if (!this.fogStaticCanvas || !this.fogStaticCtx) return;

    const vw = 200;
    const vh = 200;
    const blurPx = 45;
    const pad = blurPx * 3; // 3σ → visible edges are 99.97% clear

    const fw = this.fogStaticCanvas.width;
    const fh = this.fogStaticCanvas.height;
    const cx = Math.round((fw - vw) / 2);
    const cy = Math.round((fh - vh) / 2);

    const ctx = this.fogStaticCtx;
    ctx.clearRect(0, 0, fw, fh);

    // Solid base fog — fully opaque so nothing bleeds through outside the window.
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    ctx.fillRect(0, 0, fw, fh);

    // Single Gaussian hole punch — smooth on both inner and outer edges, no seams.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.filter = `blur(${blurPx}px)`;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fillRect(cx - pad, cy - pad, vw + pad * 2, vh + pad * 2);
    ctx.restore();
  }

  /**
   * Populate `fogBlobs` with home positions scattered around the visible-window
   * perimeter in the fog zone. Call this whenever the window is resized.
   */
  initFogBlobs(cx: number, cy: number, vw: number, vh: number, minOut: number, maxOut: number): void {
    // Use the session seed (set once at class init) so positions differ each
    // page load but stay stable across window resizes within the same session.
    let seed = this.fogSeed;
    const rand = (): number => {
      seed = Math.imul(seed, 1664525) + 1013904223 | 0;
      return (seed >>> 0) / 0xffffffff;
    };

    this.fogBlobs = [];
    const perimeter = 2 * (vw + vh);

    for (let i = 0; i < 70; i++) {
      // Pick a point on the visible-window perimeter
      const pPos = rand() * perimeter;
      let bx: number, by: number;
      if (pPos < vw) {
        bx = cx + pPos;               by = cy;
      } else if (pPos < vw + vh) {
        bx = cx + vw;                 by = cy + (pPos - vw);
      } else if (pPos < 2 * vw + vh) {
        bx = cx + vw - (pPos - vw - vh); by = cy + vh;
      } else {
        bx = cx;                      by = cy + vh - (pPos - 2 * vw - vh);
      }

      // Push outward from the window centre into the fog zone
      const dx = bx - (cx + vw / 2);
      const dy = by - (cy + vh / 2);
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const outward = minOut + rand() * (maxOut - minOut);
      bx += (dx / len) * outward;
      by += (dy / len) * outward;

      // Draw parameters (only needed here for pre-rendering)
      const rx       = 70 + rand() * 100;  // 70–170 px  (was 20–75)
      const ry       = 45 + rand() * 70;   // 45–115 px  (was 12–50)
      const rotation = rand() * mathPI;
      const blobBlur = 18 + rand() * 28;   // 18–46 px   (was 8–30)
      const opacity  = 0.10 + rand() * 0.22; // slightly more subtle at large size

      // Pre-render the blurred ellipse to a small offscreen canvas.
      // A blurred ellipse needs ~3σ of padding on every side so the
      // Gaussian doesn't get clipped at the canvas edge.
      const blurPad  = Math.ceil(blobBlur * 3);
      const halfSize = Math.ceil(Math.max(rx, ry));  // covers any rotation
      const blobW    = (halfSize + blurPad) * 2;
      const blobH    = (halfSize + blurPad) * 2;
      const bc       = document.createElement('canvas');
      bc.width  = blobW;
      bc.height = blobH;
      const bctx = bc.getContext('2d')!;
      bctx.filter    = `blur(${blobBlur}px)`;
      // Smoke-grey — lighter than the near-black fog so the blob is actually visible
      // as a lighter cloud shape when composited on top of the dark fog layer.
      bctx.fillStyle = `rgba(90, 95, 110, ${opacity})`;
      bctx.beginPath();
      bctx.ellipse(blobW / 2, blobH / 2, rx, ry, rotation, 0, mathPI * 2);
      bctx.fill();

      this.fogBlobs.push({
        baseBx:    bx,
        baseBy:    by,
        phase:     rand() * mathPI * 2,
        speed:     0.00018 + rand() * 0.00022,   // 28–58 s per cycle — visibly drifting
        amplitude: 18 + rand() * 32,            // 18–50 px drift — clearly perceptible
        canvas:    bc,
        halfW:     blobW / 2,
        halfH:     blobH / 2,
      });
    }
  }

  /**
   * Called from the game's own draw() loop — no separate rAF needed.
   * Redraws the fog canvas at most 12 fps; in between, the browser compositor
   * reuses the unchanged fog canvas texture for free.
   * `now` is the DOMHighResTimeStamp already available in the game frame.
   */
  updateFogIfDue(now: number): void {
    const FOG_INTERVAL = 1000 / 12; // ~83 ms between redraws
    if (now - this.fogLastDraw < FOG_INTERVAL) return;
    this.fogLastDraw = now;

    if (!this.fogCanvas || !this.fogCtx || !this.fogStaticCanvas || !this.fogBlobCanvas || !this.fogBlobCtx) return;

    const fw = this.fogStaticCanvas.width;
    const fh = this.fogStaticCanvas.height;

    // ── Pass A: build masked blob layer on fogBlobCanvas ────────────────────
    const bctx = this.fogBlobCtx;
    bctx.clearRect(0, 0, fw, fh);

    if (this.fogBlobs.length > 0) {
      for (const b of this.fogBlobs) {
        const bx = b.baseBx + Math.cos(now * b.speed + b.phase)       * b.amplitude;
        const by = b.baseBy + Math.sin(now * b.speed * 0.7 + b.phase) * b.amplitude;
        bctx.drawImage(b.canvas, bx - b.halfW, by - b.halfH);
      }
      // Mask blobs to the fog zone via the static canvas alpha (Gaussian edge —
      // no hard line). destination-in: result alpha = blob alpha × static alpha.
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(this.fogStaticCanvas, 0, 0);
      bctx.globalCompositeOperation = 'source-over';
    }

    // ── Pass B: composite onto the visible fogCanvas ─────────────────────────
    const ctx = this.fogCtx;
    ctx.clearRect(0, 0, fw, fh);
    ctx.drawImage(this.fogStaticCanvas, 0, 0);  // dark base
    ctx.drawImage(this.fogBlobCanvas, 0, 0);     // smoke blobs on top
  }

  /**
   * This methods takes x and y coordinates to center the screen on. The callback provided should be
   * invoked exactly once. Any drawing operations used from within the callback will have a
   * translation applied so that the given coordinates become the center on the screen.
   */
  centerOn(x: number, y: number, cb: (left: number, top: number, width: number, height: number) => void): void {}

  /**
   * Draw the tile (tx,ty), which are x and y indices in the base tilemap (and not pixel
   * coordinates), so that the top left corner of the tile is placed at (sdx,sdy) pixel coordinates
   * on the screen. The destination coordinates may be subject to translation from centerOn.
   */
  drawTile(tx: number, ty: number, sdx: number, sdy: number): void {}

  /**
   * Similar to drawTile, but draws from the styled tilemap. Takes an additional parameter `style`,
   * which is a selection from the team colors. The overlay tile is drawn in this color on top of
   * the tile from the styled tilemap. If the style doesn't exist, no overlay is drawn.
   */
  drawStyledTile(tx: number, ty: number, style: any, sdx: number, sdy: number): void {}

  /**
   * Draw the map section that intersects with the given boundary box (sx,sy,w,h). The boundary
   * box is given in pixel coordinates. This may very well be a no-op if the renderer can do all of
   * its work in onRetile.
   */
  drawMap(sx: number, sy: number, w: number, h: number): void {}

  /**
   * Draw an arrow towards the builder. Only called when the builder is outside the tank.
   */
  drawBuilderIndicator(builder: any): void {}

  /**
   * Inherited from MapView.
   */
  onRetile(cell: any, tx: number, ty: number): void {}

  // Common functions

  /**
   * Draw a single frame.
   */
  draw(alpha: number = 1): void {
    let x: number | null, y: number | null;

    // Check if we're viewing a pillbox instead of the tank
    const viewTarget = this.world.getViewTarget ? this.world.getViewTarget() : null;

    if (viewTarget) {
      // Center on the pillbox (static — no interpolation needed)
      ({ x, y } = viewTarget);
    } else if (this.world.player) {
      // Center on the player's tank, interpolated between ticks
      const p = this.world.player;
      if (p.fireball) {
        const fb = p.fireball.$;
        x = lerpPos(fb.prevX, fb.x, alpha);
        y = lerpPos(fb.prevY, fb.y, alpha);
      } else {
        x = lerpPos(p.prevX, p.x, alpha);
        y = lerpPos(p.prevY, p.y, alpha);
      }
    } else {
      x = y = null;
    }

    // Remember or restore the last center position. We use this after tank
    // death, so as to keep drawing something useful while we fade.
    if (x == null || y == null) {
      [x, y] = this.lastCenter;
    } else {
      this.lastCenter = [x, y];
    }

    this.centerOn(x, y, (left, top, width, height) => {
      // Draw all canvas elements.
      this.drawMap(left, top, width, height);
      for (const obj of this.world.objects) {
        // Skip null objects (destroyed objects remain as null in the array)
        if (!obj) continue;

        // Skip hidden tanks (except for the local player's own tank)
        if (obj.hidden && obj !== this.world.player) continue;

        if (obj.styled != null && obj.x != null && obj.y != null) {
          const [tx, ty] = obj.getTile();
          const ox = mathRound(lerpPos(obj.prevX, obj.x, alpha) / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          const oy = mathRound(lerpPos(obj.prevY, obj.y, alpha) / PIXEL_SIZE_WORLD) - TILE_SIZE_PIXELS / 2;
          if (obj.styled === true) {
            this.drawStyledTile(tx, ty, obj.team, ox, oy);
          } else if (obj.styled === false) {
            this.drawTile(tx, ty, ox, oy);
          }
        }
      }
      this.drawOverlay(alpha);
    });

    // Update all DOM HUD elements.
    if (this.hud) {
      this.updateHud();
    }

    // Update fog blobs in sync with the game frame (no competing rAF loop).
    this.updateFogIfDue(performance.now());

    // Process the builder action queue — dispatches next queued action as soon
    // as the builder returns to the tank.
    if (this.world.processBuilderQueue) {
      this.world.processBuilderQueue();
    }
  }

  /**
   * Play a sound effect.
   */
  playSound(sfx: number, x: number, y: number, owner: any): void {
    let mode: string;

    if (this.world.player && owner === this.world.player) {
      mode = 'Self';
    } else {
      const dx = x - this.lastCenter[0];
      const dy = y - this.lastCenter[1];
      const dist = mathSqrt(dx * dx + dy * dy);
      if (dist > 40 * TILE_SIZE_WORLD) {
        mode = 'None';
      } else if (dist > 15 * TILE_SIZE_WORLD) {
        mode = 'Far';
      } else {
        mode = 'Near';
      }
    }

    if (mode === 'None') return;

    let name: string | undefined;
    switch (sfx) {
      case sounds.BIG_EXPLOSION:
        name = `bigExplosion${mode}`;
        break;
      case sounds.BUBBLES:
        name = mode === 'Self' ? 'bubbles' : undefined;
        break;
      case sounds.FARMING_TREE:
        name = `farmingTree${mode}`;
        break;
      case sounds.HIT_TANK:
        name = `hitTank${mode}`;
        break;
      case sounds.MAN_BUILDING:
        name = `manBuilding${mode}`;
        break;
      case sounds.MAN_DYING:
        name = `manDying${mode}`;
        break;
      case sounds.MAN_LAY_MINE:
        name = mode === 'Near' ? 'manLayMineNear' : undefined;
        break;
      case sounds.MINE_EXPLOSION:
        name = `mineExplosion${mode}`;
        break;
      case sounds.SHOOTING:
        name = `shooting${mode}`;
        break;
      case sounds.SHOT_BUILDING:
        name = `shotBuilding${mode}`;
        break;
      case sounds.SHOT_TREE:
        name = `shotTree${mode}`;
        break;
      case sounds.TANK_SINKING:
        name = `tankSinking${mode}`;
        break;
    }

    if (name) {
      (this.soundkit as any)[name]();
    }
  }

  handleResize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;

    // Adjust the body as well, to prevent accidental scrolling on some browsers.
    document.body.style.width = `${window.innerWidth}px`;
    document.body.style.height = `${window.innerHeight}px`;

    // Reposition panels that have been placed explicitly (dragged or restored
    // from localStorage) so they maintain their relative position in the new viewport.
    for (const el of this.hudPanels) {
      const fracs = this.hudPanelFracs.get(el);
      if (!fracs) continue; // CSS-anchored default position — browser handles it
      this.setPanelPosition(
        el,
        Math.round(fracs.xFrac * window.innerWidth),
        Math.round(fracs.yFrac * window.innerHeight),
      );
    }

    // Resize both fog canvases, redraw the static base, and re-place the blobs.
    if (this.fogCanvas && this.fogStaticCanvas && this.fogBlobCanvas) {
      this.fogCanvas.width        = window.innerWidth;
      this.fogCanvas.height       = window.innerHeight;
      this.fogStaticCanvas.width  = window.innerWidth;
      this.fogStaticCanvas.height = window.innerHeight;
      this.fogBlobCanvas.width    = window.innerWidth;
      this.fogBlobCanvas.height   = window.innerHeight;
      this.drawFog(); // re-render static layer at new size

      const vw = 200, vh = 200, blurPx = 45, pad = blurPx * 3;
      const cx = Math.round((window.innerWidth  - vw) / 2);
      const cy = Math.round((window.innerHeight - vh) / 2);
      this.fogCx = cx;
      this.fogCy = cy;
      // minOut = pad (135 px) keeps base positions well outside the visible window;
      // maxOut = pad * 2.5 spreads blobs deeper into the fog zone.
      this.initFogBlobs(cx, cy, vw, vh, pad, pad * 2.5);
    }
  }

  handleClick(e: MouseEvent): void {
    e.preventDefault();
    this.world.input.focus();
    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);

    // If the builder is currently away from the tank, queue the action so it
    // runs automatically when the builder returns (up to 10 queued actions).
    const player  = this.world.player;
    const builder = player && player.armour !== 255 && player.builder
      ? player.builder.$
      : null;

    if (builder && builder.order !== builder.states.inTank) {
      this.world.queueBuildOrder(this.currentTool, cell);
      return;
    }

    // Builder is idle — execute immediately as before.
    const [action, trees, flexible] = this.world.checkBuildOrder(this.currentTool, cell);
    if (action) {
      this.world.buildOrder(action, trees, cell);
    }
  }

  /**
   * Get the view area in pixel coordinates when looking at the given world coordinates.
   */
  getViewAreaAtWorld(x: number, y: number): [number, number, number, number] {
    const { width, height } = this.canvas;
    let left = mathRound(x / PIXEL_SIZE_WORLD - width / 2);
    left = mathMax(0, mathMin(MAP_SIZE_PIXELS - width, left));
    let top = mathRound(y / PIXEL_SIZE_WORLD - height / 2);
    top = mathMax(0, mathMin(MAP_SIZE_PIXELS - height, top));
    return [left, top, width, height];
  }

  /**
   * Get the map cell at the given screen coordinates.
   */
  getCellAtScreen(x: number, y: number): any {
    const [cameraX, cameraY] = this.lastCenter;
    const [left, top, width, height] = this.getViewAreaAtWorld(cameraX, cameraY);
    return this.world.map.cellAtPixel(left + x, top + y);
  }

  // HUD elements

  /**
   * Draw HUD elements that overlay the map. These are elements that need to be drawn in regular
   * game coordinates, rather than screen coordinates.
   */
  drawOverlay(alpha: number = 1): void {
    const player = this.world.player;
    if (player && player.armour !== 255) {
      if (player.builder) {
        const b = player.builder.$;
        if (!(b.order === b.states.inTank || b.order === b.states.parachuting)) {
          this.drawBuilderIndicator(b);
        }
      }
      // Only draw reticle if gunsightVisible is true
      if (this.world.gunsightVisible) {
        this.drawReticle(alpha);
      }
    }
    this.drawNames();
    this.drawCursor();
  }

  drawReticle(alpha: number = 1): void {
    const p = this.world.player;
    const distance = p.firingRange * TILE_SIZE_PIXELS;
    const rad = (256 - p.direction) * 2 * mathPI / 256;
    const px = lerpPos(p.prevX, p.x, alpha);
    const py = lerpPos(p.prevY, p.y, alpha);
    const x = mathRound(px / PIXEL_SIZE_WORLD + mathCos(rad) * distance) - TILE_SIZE_PIXELS / 2;
    const y = mathRound(py / PIXEL_SIZE_WORLD + mathSin(rad) * distance) - TILE_SIZE_PIXELS / 2;
    this.drawTile(17, 4, x, y);
  }

  drawCursor(): void {
    const [mx, my] = this.mouse;
    const cell = this.getCellAtScreen(mx, my);
    this.drawTile(18, 6, cell.x * TILE_SIZE_PIXELS, cell.y * TILE_SIZE_PIXELS);
  }

  drawNames(): void {
    // Implemented in subclasses
  }

  /**
   * Create the HUD container.
   */
  initHud(): void {
    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    document.body.appendChild(this.hud);
    this.initHudTankStatus();
    this.initHudPillboxes();
    this.initHudBases();
    this.initHudPlayers();
    this.initHudStats();
    this.initHudToolSelect();
    this.initHudNotices();
    this.updateHud();

    // Make every panel draggable; saved positions are restored from localStorage.
    const panels = ['tankStatus', 'pillStatus', 'baseStatus', 'playersStatus', 'statsStatus', 'tool-select'];
    for (const id of panels) {
      const el = document.getElementById(id);
      if (el) this.makeDraggable(el, id);
    }
  }

  /**
   * Make a HUD panel repositionable by dragging. A 4-pixel threshold separates
   * a drag from a normal click so child controls (radio buttons, etc.) still work.
   * The final position is written to localStorage under `hud-<key>` and restored
   * automatically on the next page load.
   */
  /**
   * Set a panel's position in px, clamp it to the viewport, and record the
   * viewport-relative fractions so resize can restore proportional placement.
   * Pass `key` to also persist the fractions to localStorage.
   */
  setPanelPosition(el: HTMLElement, left: number, top: number, key?: string): void {
    const maxL    = Math.max(0, window.innerWidth  - el.offsetWidth);
    const maxT    = Math.max(0, window.innerHeight - el.offsetHeight);
    const clampedL = Math.max(0, Math.min(left, maxL));
    const clampedT = Math.max(0, Math.min(top,  maxT));

    el.style.left   = `${clampedL}px`;
    el.style.top    = `${clampedT}px`;
    el.style.right  = '';
    el.style.bottom = '';

    const xFrac = window.innerWidth  > 0 ? clampedL / window.innerWidth  : 0;
    const yFrac = window.innerHeight > 0 ? clampedT / window.innerHeight : 0;
    this.hudPanelFracs.set(el, { xFrac, yFrac });

    if (key) {
      localStorage.setItem(`hud-${key}`, JSON.stringify({ xFrac, yFrac }));
    }
  }

  makeDraggable(el: HTMLElement, key: string): void {
    this.hudPanels.push(el);

    // Restore a previously saved position.
    // New format: { xFrac, yFrac } — viewport fractions.
    // Legacy format: { top, left } — raw pixels (migrated on first save).
    const raw = localStorage.getItem(`hud-${key}`);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as any;
        let left: number, top: number;
        if ('xFrac' in saved) {
          left = saved.xFrac * window.innerWidth;
          top  = saved.yFrac * window.innerHeight;
        } else {
          left = saved.left ?? 0;
          top  = saved.top  ?? 0;
        }
        this.setPanelPosition(el, left, top);
      } catch { /* ignore malformed data and keep CSS defaults */ }
    }

    el.style.cursor = 'grab';

    el.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Let INPUT and LABEL elements handle their own click behaviour.
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'LABEL') return;

      const rect   = el.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startL = rect.left;
      const startT = rect.top;
      let dragging  = false;

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (!dragging) {
          // Require at least 4 px of movement before committing to a drag.
          if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
          dragging = true;
          // Anchor the element with explicit top/left so bottom/right don't fight us.
          el.style.left        = `${startL}px`;
          el.style.top         = `${startT}px`;
          el.style.right       = '';
          el.style.bottom      = '';
          el.style.cursor      = 'grabbing';
          el.style.zIndex      = '200';
          el.style.userSelect  = 'none';
          // Prevent text in other HUD elements from being selected during drag.
          document.body.style.userSelect = 'none';
        }

        // Snap to an 8-pixel grid, then clamp to the viewport.
        const GRID  = 8;
        const snap  = (v: number) => Math.round(v / GRID) * GRID;
        const maxL  = window.innerWidth  - el.offsetWidth;
        const maxT  = window.innerHeight - el.offsetHeight;
        el.style.left = `${snap(Math.max(0, Math.min(maxL, startL + dx)))}px`;
        el.style.top  = `${snap(Math.max(0, Math.min(maxT, startT + dy)))}px`;
      };

      const onUp = () => {
        if (dragging) {
          el.style.cursor                = 'grab';
          el.style.zIndex                = '';
          el.style.userSelect            = '';
          document.body.style.userSelect = '';
          // Persist the new position as viewport fractions.
          this.setPanelPosition(el, parseFloat(el.style.left), parseFloat(el.style.top), key);
        }
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  initHudTankStatus(): void {
    const container = document.createElement('div');
    container.id = 'tankStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.tankIndicators = {};
    for (const indicator of ['shells', 'mines', 'armour', 'trees']) {
      const bar = document.createElement('div');
      bar.className = 'gauge';
      bar.id = `tank-${indicator}`;
      container.appendChild(bar);

      const content = document.createElement('div');
      content.className = 'gauge-content';
      bar.appendChild(content);
      this.tankIndicators[indicator] = content;
    }
  }

  /**
   * Create the pillbox status indicator.
   */
  initHudPillboxes(): void {
    const container = document.createElement('div');
    container.id = 'pillStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.pillIndicators = this.world.map.pills.map((pill: any) => {
      const node = document.createElement('div');
      node.className = 'pill';
      container.appendChild(node);
      return [node, pill];
    });
  }

  /**
   * Create the base status indicator.
   */
  initHudBases(): void {
    const container = document.createElement('div');
    container.id = 'baseStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.baseIndicators = this.world.map.bases.map((base: any, index: number) => {
      const node = document.createElement('div');
      node.className = 'base';
      // Store the base idx as a data attribute for debugging
      node.setAttribute('data-base-idx', base.idx);
      node.setAttribute('data-array-index', index.toString());
      container.appendChild(node);
      return [node, base];
    });
  }

  /**
   * Create the connected players indicator.
   */
  initHudPlayers(): void {
    const container = document.createElement('div');
    container.id = 'playersStatus';
    this.hud!.appendChild(container);

    const deco = document.createElement('div');
    deco.className = 'deco';
    container.appendChild(deco);

    this.playerIndicators = [];
  }

  /**
   * Create the stats status indicator (kills/deaths).
   */
  initHudStats(): void {
    const container = document.createElement('div');
    container.id = 'statsStatus';
    this.hud!.appendChild(container);

    // First line: Kills (left) and Team Score (right)
    const firstLine = document.createElement('div');
    firstLine.className = 'stat-line';
    container.appendChild(firstLine);

    // Kills (left side)
    const killsGroup = document.createElement('span');
    killsGroup.className = 'stat-group-left';
    firstLine.appendChild(killsGroup);

    const killsIcon = document.createElement('span');
    killsIcon.className = 'stat-icon';
    killsIcon.textContent = '\u2620'; // ☠ skull and crossbones
    killsGroup.appendChild(killsIcon);

    const killsValue = document.createElement('span');
    killsValue.className = 'stat-value';
    killsValue.id = 'stat-kills';
    killsValue.textContent = '0';
    killsGroup.appendChild(killsValue);

    // Team score (right side)
    const scoreGroup = document.createElement('span');
    scoreGroup.className = 'stat-group-right';
    firstLine.appendChild(scoreGroup);

    const scoreIcon = document.createElement('span');
    scoreIcon.className = 'stat-icon';
    scoreIcon.id = 'stat-score-icon';
    scoreIcon.textContent = '\u2605'; // ★ star
    scoreGroup.appendChild(scoreIcon);

    const scoreValue = document.createElement('span');
    scoreValue.className = 'stat-value';
    scoreValue.id = 'stat-score';
    scoreValue.textContent = '0';
    scoreGroup.appendChild(scoreValue);

    // Second line: Deaths
    const deathsLine = document.createElement('div');
    deathsLine.className = 'stat-line';
    container.appendChild(deathsLine);

    const deathsIcon = document.createElement('span');
    deathsIcon.className = 'stat-icon';
    deathsIcon.textContent = '\u2020'; // † dagger
    deathsLine.appendChild(deathsIcon);

    const deathsValue = document.createElement('span');
    deathsValue.className = 'stat-value';
    deathsValue.id = 'stat-deaths';
    deathsValue.textContent = '0';
    deathsLine.appendChild(deathsValue);
  }

  /**
   * Create the build tool selection
   */
  initHudToolSelect(): void {
    const tools = document.createElement('div');
    tools.id    = 'tool-select';
    tools.title = 'Double-click to switch horizontal / vertical';
    this.hud!.appendChild(tools);

    for (const toolType of ['forest', 'road', 'building', 'pillbox', 'mine']) {
      this.initHudTool(tools, toolType);
    }

    const forestInput = tools.querySelector<HTMLInputElement>('#tool-forest');
    if (forestInput) forestInput.checked = true;

    // Apply orientation via inline styles (avoids CSS hot-reload timing issues).
    const applyOrient = (vertical: boolean) => {
      tools.style.width      = vertical ? '56px'  : '280px';
      tools.style.marginLeft = vertical ? '0'     : '-140px';
      tools.style.textAlign  = vertical ? 'left'  : 'center';

      for (const lbl of Array.from(tools.querySelectorAll<HTMLElement>('label'))) {
        lbl.style.display      = vertical ? 'block' : '';
        lbl.style.marginRight  = vertical ? '0'     : '';
        lbl.style.marginBottom = vertical ? '2px'   : '';
      }

      localStorage.setItem('hud-tool-orient', vertical ? 'vertical' : 'horizontal');
    };

    // Restore saved orientation.
    applyOrient(localStorage.getItem('hud-tool-orient') === 'vertical');

    // Document-level dblclick: fires anywhere inside the tray.
    // Using document-level so nothing between the tray and document can swallow it.
    document.addEventListener('dblclick', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest || !target.closest('#tool-select')) return;
      e.preventDefault();
      applyOrient(tools.style.width !== '56px');
    });
  }

  /**
   * Create a single build tool item.
   */
  initHudTool(tools: HTMLDivElement, toolType: string): void {
    const toolname = `tool-${toolType}`;
    const tool = document.createElement('input');
    tool.type = 'radio';
    tool.name = 'tool';
    tool.id = toolname;
    tools.appendChild(tool);

    const label = document.createElement('label');
    label.htmlFor = toolname;
    tools.appendChild(label);

    const span = document.createElement('span');
    span.className = `bolo-tool bolo-${toolname}`;
    label.appendChild(span);

    tool.addEventListener('click', (e) => {
      this.currentTool = toolType;
      this.world.input.focus();
    });
  }

  /**
   * Show WIP notice and Github ribbon. These are really a temporary hacks, so FIXME someday.
   */
  initHudNotices(): void {
    if (location.hostname.split('.')[1] === 'github') {
      const notice = document.createElement('div');
      notice.innerHTML = `
        This is a work-in-progress; less than alpha quality!<br>
        To see multiplayer in action, follow instructions on Github.
      `;
      Object.assign(notice.style, {
        position: 'absolute',
        top: '70px',
        left: '0px',
        width: '100%',
        textAlign: 'center',
        fontFamily: 'monospace',
        fontSize: '16px',
        fontWeight: 'bold',
        color: 'white',
      });
      this.hud!.appendChild(notice);
    }

    if (location.hostname.split('.')[1] === 'github' || location.hostname.substr(-6) === '.no.de') {
      const ribbon = document.createElement('a');
      ribbon.href = 'http://github.com/stephank/orona';
      Object.assign(ribbon.style, {
        position: 'absolute',
        top: '0px',
        right: '0px',
      });
      ribbon.innerHTML = '<img src="http://s3.amazonaws.com/github/ribbons/forkme_right_darkblue_121621.png" alt="Fork me on GitHub">';
      this.hud!.appendChild(ribbon);
    }
  }

  /**
   * Update the HUD elements.
   */
  updateHud(): void {
    // Pillboxes.
    if (this.pillIndicators) {
      for (let i = 0; i < this.pillIndicators.length; i++) {
        const [node] = this.pillIndicators[i];
        // Always read the current pill from world.map.pills, not the cached reference
        const pill = this.world.map.pills[i];
        if (!pill) continue;

        const statuskey = `${pill.inTank};${pill.carried};${pill.armour};${pill.team};${pill.owner_idx}`;
        // Remove the early continue to always update
        pill.hudStatusKey = statuskey;

        if (pill.inTank || pill.carried) {
          node.setAttribute('status', 'carried');
        } else if (pill.armour === 0) {
          node.setAttribute('status', 'dead');
        } else {
          node.setAttribute('status', 'healthy');
        }
        const color = TEAM_COLORS[pill.team] || { r: 112, g: 112, b: 112 };
        node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;
      }
    }

    // Bases.
    if (this.baseIndicators) {
      for (let i = 0; i < this.baseIndicators.length; i++) {
        const [node] = this.baseIndicators[i];
        // Always read the current base from world.map.bases, not the cached reference
        const base = this.world.map.bases[i];
        if (!base) {
          console.warn(`[HUD] Base at indicator index ${i} is null/undefined`);
          continue;
        }

        const statuskey = `${base.armour};${base.team};${base.owner_idx}`;
        // Remove the early continue to always update
        base.hudStatusKey = statuskey;

        if (base.armour <= 9) {
          node.setAttribute('status', 'vulnerable');
        } else {
          node.setAttribute('status', 'healthy');
        }
        const color = TEAM_COLORS[base.team] || { r: 112, g: 112, b: 112 };
        const newColor = `rgb(${color.r},${color.g},${color.b})`;
        if (node.style.backgroundColor !== newColor) {
          node.style.backgroundColor = newColor;
        }
      }
    }

    // Connected Players.
    if (this.playerIndicators) {
      const container = document.getElementById('playersStatus');
      if (container) {
        // Get all valid tanks (filter out null/undefined)
        const validTanks = this.world.tanks.filter((tank: any) => tank);

        // Remove excess indicators if we have more than the current number of valid tanks
        while (this.playerIndicators.length > validTanks.length) {
          const node = this.playerIndicators.pop();
          if (node) {
            node.remove();
          }
        }

        // Update or create indicators for each valid tank
        for (let i = 0; i < validTanks.length; i++) {
          const tank = validTanks[i];

          // Create indicator if it doesn't exist for this index
          if (!this.playerIndicators[i]) {
            const node = document.createElement('div');
            node.className = 'player';
            container.appendChild(node);
            this.playerIndicators[i] = node;
          }

          const node = this.playerIndicators[i];

          // Update team color
          const color = TEAM_COLORS[tank.team] || { r: 112, g: 112, b: 112 };
          node.style.backgroundColor = `rgb(${color.r},${color.g},${color.b})`;

          // Show X overlay for destroyed tanks
          const isDead = tank.armour === 255;
          if (isDead) {
            node.setAttribute('data-dead', 'true');
          } else {
            node.removeAttribute('data-dead');
          }
        }
      }
    }

    // Tank.
    const p = this.world.player;

    // Stats (kills/deaths/team score).
    if (p && p.kills !== undefined && p.deaths !== undefined) {
      const killsElement = document.getElementById('stat-kills');
      const deathsElement = document.getElementById('stat-deaths');
      const scoreElement = document.getElementById('stat-score');
      const scoreIconElement = document.getElementById('stat-score-icon');

      if (killsElement) {
        killsElement.textContent = p.kills.toString();
      }
      if (deathsElement) {
        deathsElement.textContent = p.deaths.toString();
      }
      if (scoreElement && p.team !== undefined && p.team >= 0 && p.team <= 5) {
        // Calculate team ranking
        const teamScoresWithIndex = this.world.teamScores.map((score: number, index: number) => ({ team: index, score }));
        // Sort by score descending (highest score = 1st place)
        teamScoresWithIndex.sort((a: { team: number; score: number }, b: { team: number; score: number }) => b.score - a.score);

        // Find player's team rank
        const rank = teamScoresWithIndex.findIndex((item: { team: number; score: number }) => item.team === p.team) + 1;

        // Get ordinal suffix
        const getOrdinal = (n: number): string => {
          const s = ['th', 'st', 'nd', 'rd'];
          const v = n % 100;
          return n + (s[(v - 20) % 10] || s[v] || s[0]);
        };

        scoreElement.textContent = getOrdinal(rank);

        // Set star icon color to team color
        if (scoreIconElement) {
          const color = TEAM_COLORS[p.team] || { r: 192, g: 192, b: 240 };
          scoreIconElement.style.color = `rgb(${color.r},${color.g},${color.b})`;
        }
      }
    }
    p.hudLastStatus = p.hudLastStatus || {};
    if (this.tankIndicators) {
      for (const [prop, node] of Object.entries(this.tankIndicators)) {
        const value = p.armour === 255 ? 0 : p[prop];
        if (p.hudLastStatus[prop] === value) continue;
        p.hudLastStatus[prop] = value;

        node.style.height = `${mathRound((value / 40) * 100)}%`;
      }
    }
  }
}

export default BaseRenderer;
