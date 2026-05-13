/**
 * Game Loop
 *
 * Ticks run on setInterval (unchanged — safe for networked play).
 * Frames run on requestAnimationFrame and receive an alpha value in [0, 1)
 * representing how far through the current tick interval we are, enabling
 * sub-tick render interpolation without touching tick timing.
 */

interface LoopOptions {
  rate: number;
  tick?: () => void;
  frame?: (alpha: number) => void;
}

interface Loop {
  start(): void;
  stop(): void;
}

export function createLoop(options: LoopOptions): Loop {
  let tickInterval: NodeJS.Timeout | null = null;
  let frameRequest: number | null = null;
  let running = false;
  let lastTickTime: number = 0;

  const hasBrowserAPIs = typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).window !== 'undefined' &&
    typeof (globalThis as any).window.requestAnimationFrame === 'function';

  return {
    start() {
      if (running) return;
      running = true;

      if (options.tick) {
        lastTickTime = performance.now();
        tickInterval = setInterval(() => {
          lastTickTime = performance.now();
          options.tick!();
        }, options.rate);
      }

      if (options.frame && hasBrowserAPIs) {
        const frameLoop = (now: number) => {
          if (!running) return;
          const alpha = Math.min(1, (now - lastTickTime) / options.rate);
          options.frame!(alpha);
          frameRequest = ((globalThis as any).window as any).requestAnimationFrame(frameLoop);
        };
        frameRequest = ((globalThis as any).window as any).requestAnimationFrame(frameLoop);
      }
    },

    stop() {
      running = false;
      if (tickInterval) {
        clearInterval(tickInterval);
        tickInterval = null;
      }
      if (frameRequest !== null && hasBrowserAPIs) {
        ((globalThis as any).window as any).cancelAnimationFrame(frameRequest);
        frameRequest = null;
      }
    },
  };
}
