/**
 * Game Loop
 *
 * Simple game loop implementation for managing tick and frame callbacks.
 */
export function createLoop(options) {
    let tickInterval = null;
    let frameRequest = null;
    let running = false;
    // Check if we're in a browser environment
    const hasBrowserAPIs = typeof globalThis !== 'undefined' &&
        typeof globalThis.window !== 'undefined' &&
        typeof globalThis.window.requestAnimationFrame === 'function';
    return {
        start() {
            if (running)
                return;
            running = true;
            if (options.tick) {
                tickInterval = setInterval(options.tick, options.rate);
            }
            if (options.frame && hasBrowserAPIs) {
                const frameLoop = () => {
                    if (!running)
                        return;
                    options.frame();
                    frameRequest = globalThis.window.requestAnimationFrame(frameLoop);
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
                globalThis.window.cancelAnimationFrame(frameRequest);
                frameRequest = null;
            }
        },
    };
}
//# sourceMappingURL=loop.js.map