/**
 * Death / Respawn Overlay
 *
 * Timing is fully event-driven so the overlay stays in sync with actual game
 * events rather than fixed durations:
 *
 *   triggerDeath()   → waits for the fireball animation to finish
 *                      (80 ticks × 20 ms = 1 600 ms), then fades in to static
 *   triggerRespawn() → starts fading out; the static clears as the freshly-
 *                      spawned tank is revealed
 *
 * Phase flow:
 *   idle ──[triggerDeath]──► delay (1 600 ms) ──► fade-in (500 ms)
 *   ──► hold (until triggerRespawn) ──► fade-out (750 ms) ──► idle
 *
 * Z-index 99 puts the overlay above the game canvas (z 0) but below the
 * HUD (z 100), so all HUD elements remain visible throughout.
 */

/** How long to wait after death before showing static (fireball duration). */
const FIREBALL_DELAY_MS = 1_600; // 80 ticks × 20 ms/tick

const FADE_IN_MS  = 500;
const FADE_OUT_MS = 750; // slightly longer — lets the player see the respawned tank emerge

/** Internal render resolution (low-res → chunky TV-static look, cheap to draw). */
const NOISE_W = 320;
const NOISE_H = 180;

type Phase = 'idle' | 'delay' | 'fade-in' | 'hold' | 'fade-out';

export class DeathOverlay {
  private readonly el:        HTMLCanvasElement;
  private readonly ctx:       CanvasRenderingContext2D;
  private readonly imageData: ImageData;

  private phase:               Phase  = 'idle';
  private phaseStart:          number = 0;
  private rafId:               number = 0;
  private _opacity:            number = 0;
  private _fadeOutFromOpacity: number = 1;
  private _delayTimer:         ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.el = document.createElement('canvas');

    this.el.width  = NOISE_W;
    this.el.height = NOISE_H;

    this.el.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      'z-index:99',
      'opacity:0',
      'image-rendering:pixelated',
      'image-rendering:crisp-edges',
    ].join(';');

    document.body.appendChild(this.el);

    this.ctx       = this.el.getContext('2d')!;
    this.imageData = this.ctx.createImageData(NOISE_W, NOISE_H);

    // Pre-fill alpha once; only RGB is randomised each frame.
    const d = this.imageData.data;
    for (let i = 3; i < d.length; i += 4) d[i] = 255;
  }

  /**
   * Called when the tank dies (armour → 255).
   * Waits for the fireball to complete, then fades in to static.
   * Ignored if an animation is already running.
   */
  triggerDeath(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'delay';
    this._delayTimer = setTimeout(() => {
      if (this.phase === 'delay') {
        this._opacity = 0;
        this.phase    = 'fade-in';
        this.phaseStart = performance.now();
        cancelAnimationFrame(this.rafId);
        this.rafId = requestAnimationFrame(t => this._step(t));
      }
    }, FIREBALL_DELAY_MS);
  }

  /**
   * Called when the tank respawns (armour 255 → non-255).
   * Begins fading the static away, revealing the freshly-spawned tank.
   * Safe to call in any phase; fading out is a no-op if not yet showing static.
   */
  triggerRespawn(): void {
    // Nothing visible yet — just cancel the pending delay if any.
    if (this.phase === 'idle' || this.phase === 'delay') {
      if (this._delayTimer !== null) {
        clearTimeout(this._delayTimer);
        this._delayTimer = null;
      }
      this.phase = 'idle';
      return;
    }

    // Already fading out — leave it alone.
    if (this.phase === 'fade-out') return;

    // In fade-in or hold: switch to fade-out from current opacity.
    this._fadeOutFromOpacity = this._opacity;
    this.phase    = 'fade-out';
    this.phaseStart = performance.now();
    // The rAF loop is already running; it will pick up the phase change on the next frame.
  }

  destroy(): void {
    if (this._delayTimer !== null) clearTimeout(this._delayTimer);
    cancelAnimationFrame(this.rafId);
    this.el.remove();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private _setOpacity(v: number): void {
    this._opacity = v;
    this.el.style.opacity = String(v);
  }

  private _drawNoise(): void {
    const d = this.imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < 0.5 ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }

  private _step(now: number): void {
    const elapsed = now - this.phaseStart;

    switch (this.phase) {
      case 'fade-in': {
        const t = Math.min(elapsed / FADE_IN_MS, 1);
        this._setOpacity(t);
        this._drawNoise();
        if (t >= 1) { this.phase = 'hold'; this.phaseStart = now; }
        break;
      }

      case 'hold': {
        // Hold at full static until triggerRespawn() flips phase to 'fade-out'.
        this._setOpacity(1);
        this._drawNoise();
        break;
      }

      case 'fade-out': {
        const t = Math.min(elapsed / FADE_OUT_MS, 1);
        this._setOpacity(this._fadeOutFromOpacity * (1 - t));
        this._drawNoise();
        if (t >= 1) {
          this._setOpacity(0);
          this.phase = 'idle';
          return; // stop rAF loop
        }
        break;
      }

      default:
        return;
    }

    this.rafId = requestAnimationFrame(t => this._step(t));
  }
}
