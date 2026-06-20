import { describe, it } from 'vitest';
import { evaluateFullLoop } from './harness';
(globalThis as any).__BRAIN_DBG__ = false;

describe('cover method full-loop eval', () => {
  it('N=30 captures/deaths from (115,109)', () => {
    const r = evaluateFullLoop([115, 109], { trials: 30, ticks: 5000, baseSeed: 1000 });
    // eslint-disable-next-line no-console
    console.log(`[loop] meanCaptures=${r.meanCaptures.toFixed(2)} meanDeaths=${r.meanDeaths.toFixed(2)} ` +
      `capturedAny=${r.capturedAny}/30 caps=[${r.captures.join(',')}]`);
  });
});
