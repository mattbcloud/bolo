import { describe, it } from 'vitest';
import { evaluateFullLoop } from './harness';
(globalThis as any).__BRAIN_DBG__ = false;
describe('EVAL baseline (mean stability at N=30)', () => {
  it('two N=30 runs', () => {
    const a = evaluateFullLoop([115, 109], { trials: 30, ticks: 5000, baseSeed: 1000 });
    const b = evaluateFullLoop([115, 109], { trials: 30, ticks: 5000, baseSeed: 1000 });
    console.log(`[eval] A: meanCaptures=${a.meanCaptures.toFixed(2)} meanDeaths=${a.meanDeaths.toFixed(2)} capturedAny=${a.capturedAny}/30`);
    console.log(`[eval] B: meanCaptures=${b.meanCaptures.toFixed(2)} meanDeaths=${b.meanDeaths.toFixed(2)} capturedAny=${b.capturedAny}/30`);
  });
});
