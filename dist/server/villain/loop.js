/**
 * Game Loop
 *
 * Ticks run on setInterval (unchanged — safe for networked play).
 * Frames run on requestAnimationFrame and receive an alpha value in [0, 1)
 * representing how far through the current tick interval we are, enabling
 * sub-tick render interpolation without touching tick timing.
 */
/**
 * Report a throw out of the tick or frame callback. The loop keeps running either way; the point is
 * that the failure stops being invisible. Counted per distinct message and logged sparsely, because
 * a broken loop repeats 50 times a second.
 */
const loopErrorCounts = new Map();
function reportLoopError(where, err) {
    const message = err instanceof Error ? err.message : String(err);
    const key = `${where}:${message}`;
    const count = (loopErrorCounts.get(key) ?? 0) + 1;
    loopErrorCounts.set(key, count);
    // Log the first occurrence, then one in every 500. A broken loop repeats 50x/second, so logging
    // each time floods; logging only once would let a permanently-broken loop fall silent, which is
    // the failure mode this whole change exists to stop.
    if (count !== 1 && count % 500 !== 0)
        return;
    console.error(`[LOOP] uncaught error in ${where}() (occurrence ${count}):`, err);
    if (count !== 1)
        return; // report to the server once
    const report = globalThis.__reportClientError;
    if (typeof report === 'function') {
        report({
            kind: 'loop-error',
            message: `${where}(): ${message}`,
            stack: err instanceof Error ? err.stack : undefined,
        });
    }
}
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
                    try {
                        options.tick();
                    }
                    catch (err) {
                        // setInterval survives a throw, so a broken tick fails SILENTLY forever — 50 times a
                        // second, unnoticed, while everything downstream of the throw (the network heartbeat
                        // included) quietly stops running. Report it instead.
                        reportLoopError('tick', err);
                    }
                }, options.rate);
            }
            if (options.frame && hasBrowserAPIs) {
                const frameLoop = (now) => {
                    if (!running)
                        return;
                    const alpha = Math.min(1, (now - lastTickTime) / options.rate);
                    // Reschedule in `finally`: a throw out of frame() used to end the rAF chain for good,
                    // so a single bad draw froze the picture permanently with nothing logged. Report the
                    // error and keep the loop alive — a dropped frame beats a dead renderer.
                    try {
                        options.frame(alpha);
                    }
                    catch (err) {
                        reportLoopError('frame', err);
                    }
                    finally {
                        frameRequest = globalThis.window.requestAnimationFrame(frameLoop);
                    }
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