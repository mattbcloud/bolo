import { describe, it } from 'vitest';
import { evaluateFullLoop } from './harness';
(globalThis as any).__BRAIN_DBG__ = false;

describe('cover method full-loop eval', () => {
  it('N=30 captures/deaths from (115,109)', () => {
    const r = evaluateFullLoop([115, 109], { trials: 30, ticks: 5000, baseSeed: 1000 });
    // eslint-disable-next-line no-console
    console.log(`[loop] meanCaptures=${r.meanCaptures.toFixed(2)} meanDeaths=${r.meanDeaths.toFixed(2)} ` +
      `capturedAny=${r.capturedAny}/30 caps=[${r.captures.join(',')}]`);
    // Bases are the economy (armour + shells); meanCaptures counts PILLS only, so read both.
    // eslint-disable-next-line no-console
    console.log(`[loop] meanBaseCaptures=${r.meanBaseCaptures.toFixed(2)} ` +
      `baseCapturedAny=${r.baseCapturedAny}/30 bases=[${r.baseCaptures.join(',')}]`);
    // Time-integrated map control. meanControl is the summary number; the split shows which half
    // of the board it came from. Bases alone is circular here (nothing contests them) — read both.
    // eslint-disable-next-line no-console
    console.log(`[loop] meanControl=${r.meanControl.toFixed(3)} ` +
      `(pillsHeld=${r.meanPillsHeld.toFixed(3)} basesHeld=${r.meanBasesHeld.toFixed(3)})`);
  });
});
