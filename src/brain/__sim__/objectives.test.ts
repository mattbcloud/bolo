import { describe, it, expect } from 'vitest';
import { evaluateFullLoop } from './harness';

(globalThis as any).__BRAIN_DBG__ = false;

/**
 * ACCEPTANCE TEST — "smartly go after objectives."
 *
 * The brain must still be able to take pillboxes. This is the only hard assertion about capture in
 * __sim__ — coverloop, capfloor, covercapture, capture and eval all measure it and print, but assert
 * nothing, so they would report a total collapse just as cheerfully as a good run.
 *
 * WHAT THIS REPLACES, AND WHY. It used to run ONE fixed seed from (115,109) and demand a capture,
 * and it had been red since the day it was written. That was not a capability failure: the same
 * start tile over 30 other seeds captures in 17 of them, on a SHORTER 5000-tick budget. The old
 * assertion simply landed on a seed in the ~43% that fail, so it reported "the brain cannot capture"
 * when the truth was "the brain captures unreliably" — a coin flip wearing an assertion, and one
 * that left `npm test` permanently non-zero, which costs more than it sounds: a suite with a known
 * red cannot tell you that nothing else broke.
 *
 * It also counted captures with the buggy detector that harness.ts:285-296 documents and replaced —
 * `p.owner === myTeam` compares an object reference to a team number and is never true, and keying
 * by position collapses every carried pill to "null,null". evaluateFullLoop's counter is correct;
 * this now uses it rather than keeping a second, worse copy.
 *
 * THE FLOOR. Parameters are coverloop's exactly, so the number asserted here is the same one the
 * session notes track, comparable run to run. Seeds are fixed and fdf6423 made the sim
 * deterministic, so `capturedAny` is a reproducible number rather than a sample: today it is 17/30.
 * The floor sits at 12 — far enough below to let unrelated brain tuning move without nuisance
 * failures, far enough above zero to catch the capability actually breaking. It is a floor to RAISE
 * as the brain improves, not a target to sit on.
 *
 * The unreliability itself is a real, open defect, and this test does not pretend otherwise: on the
 * seed the old version used, the brain walks past an unguarded pillbox three tiles from its spawn
 * and spends the whole budget on pills 55+ tiles away.
 */
describe('objectives: the brain captures pills', () => {
  it('captures in at least 12 of 30 seeded trials from (115,109)', () => {
    const r = evaluateFullLoop([115, 109], { trials: 30, ticks: 5000, baseSeed: 1000 });

    // eslint-disable-next-line no-console
    console.log(`[objectives] capturedAny=${r.capturedAny}/${r.trials} ` +
      `meanCaptures=${r.meanCaptures.toFixed(2)} meanDeaths=${r.meanDeaths.toFixed(2)} ` +
      `caps=[${r.captures.join(',')}]`);

    expect(r.capturedAny, 'trials capturing at least one pill').toBeGreaterThanOrEqual(12);
  });
});
