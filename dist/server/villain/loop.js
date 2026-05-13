/**
 * Game Loop
 *
 * Ticks run on setInterval (unchanged — safe for networked play).
 * Frames run on requestAnimationFrame and receive an alpha value in [0, 1)
 * representing how far through the current tick interval we are, enabling
 * sub-tick render interpolation without touching tick timing.
 */
export function createLoop(options) {
    let tickInterval = null;
    let frameRequest = null;
    let running = false;
    let lastTickTime = 0;
    const hasBrowserAPIs = typeof globalThis !== 'undefined' &&
        typeof globalThis.window !== 'undefined' &&
        typeof globalThis.window.requestAnimationFrame === 'function';
    return {
        start() {
            if (running)
                return;
            running = true;
            if (options.tick) {
                lastTickTime = performance.now();
                tickInterval = setInterval(() => {
                    lastTickTime = performance.now();
                    options.tick();
                }, options.rate);
            }
            if (options.frame && hasBrowserAPIs) {
                const frameLoop = (now) => {
                    if (!running)
                        return;
                    const alpha = Math.min(1, (now - lastTickTime) / options.rate);
                    options.frame(alpha);
                    frameRequest = globalThis.window.requestAnimationFrame(frameLoop);
                };
                frameRequest = globalThis.window.requestAnimationFrame(frameLoop);
            }
        },
        stop() {
            running = false;
            if (tickInterval) {
                clearInterval(tickInterval);
                tickInterval = null;
            }
            if (frameRequest !== null && hasBrowserAPIs) {
                globalThis.window.cancelAnimationFrame(frameRequest);
                frameRequest = null;
            }
        },
    };
}
//# sourceMappingURL=loop.js.map