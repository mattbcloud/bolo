/**
 * Game Loop
 *
 * Simple game loop implementation for managing tick and frame callbacks.
 */

interface LoopOptions {
  rate: number;
  tick?: () => void;
  frame?: () => void;
}

interface Loop {
  start(): void;
  stop(): void;
}

export function createLoop(options: LoopOptions): Loop {
  let tickInterval: NodeJS.Timeout | null = null;
  let frameRequest: number | null = null;
  let running = false;

  // Check if we're in a browser environment
  const hasBrowserAPIs = typeof globalThis !== 'undefined' &&
    typeof (globalThis as any).window !== 'undefined' &&
    typeof (globalThis as any).window.requestAnimationFrame === 'function';

  return {
    start() {
      if (running) return;
      running = true;

      if (options.tick) {
        tickInterval = setInterval(options.tick, options.rate);
      }

      if (options.frame && hasBrowserAPIs) {
        const frameLoop = () => {
          if (!running) return;
          options.frame!();
          frameRequest = ((globalThis as any).window as any).requestAnimationFrame(frameLoop);
        };
        frameLoop();
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
