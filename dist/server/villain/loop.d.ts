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
export declare function createLoop(options: LoopOptions): Loop;
export {};
//# sourceMappingURL=loop.d.ts.map