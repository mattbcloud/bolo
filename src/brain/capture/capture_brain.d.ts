export interface BrainApp {
  player: any; map: any; tanks: any[]; objects: any[];
  ws: { readyState: number; send(msg: string): void };
}
export interface Brain {
  readonly agent: any; readonly running: boolean; readonly mode: string;
  start(): void; step(): void; stop(): void;
  stats(): { errors: number; lastError: string | null; deaths: number; mode: string };
}
export function createBrain(opts: { app: BrainApp; now: () => number; params?: Record<string, unknown>; forever?: boolean;
  fair?: boolean; difficulty?: 'easy' | 'normal' | 'hard' }): Brain;
export function createFairView(app: BrainApp, opts?: { delayTicks?: number }): BrainApp & { tick(): void };
export const DIFFICULTY: Record<'easy' | 'normal' | 'hard', { delayTicks: number; thinkEvery: number }>;
export const BRAIN_VERSION: { hook_md5: string; params_md5: string; built: string };
