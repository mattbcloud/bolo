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
export declare function createLoop(options: LoopOptions): Loop;
export {};
//# sourceMappingURL=loop.d.ts.map