/**
 * Lazy loader for the capture brain package (src/brain/capture/, ~500 KB). It is pulled in with a
 * dynamic import the first time a player engages the brain, so it stays out of the initial client
 * bundle, and the one promise is shared so it loads once per page.
 */

export type CaptureBrainModule = typeof import('./capture/capture_brain.js');
export type CaptureBrain = ReturnType<CaptureBrainModule['createBrain']>;
export type BrainDifficulty = 'easy' | 'normal' | 'hard';

export const BRAIN_DIFFICULTIES: readonly BrainDifficulty[] = ['easy', 'normal', 'hard'];

export function isBrainDifficulty(level: unknown): level is BrainDifficulty {
  return typeof level === 'string' && (BRAIN_DIFFICULTIES as readonly string[]).includes(level);
}

let pending: Promise<CaptureBrainModule> | null = null;

export function loadCaptureBrain(): Promise<CaptureBrainModule> {
  if (!pending) {
    pending = import('./capture/capture_brain.js');
    // A failed load (a dropped chunk request) may succeed on the next toggle.
    pending.catch(() => { pending = null; });
  }
  return pending;
}

/** `?brain=legacy` keeps the old A4/aIndy brain behind the toggle for one release. */
export function legacyBrainRequested(): boolean {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('brain') === 'legacy';
  } catch {
    return false;
  }
}
