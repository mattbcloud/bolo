import { configDefaults, defineConfig } from 'vitest/config';

// The old brain's long simulations: each plays out headless games for 10 s to 18 min, and
// together they make a full run take over half an hour. They run only with SLOW=1
// (`npm run test:slow`), which is also needed to run one of them by path.
const SLOW_SIMS = [
  'directness', 'eval', 'objectives', 'capfloor', 'deaths', 'coverexp', 'coverloop',
  'noroute', 'stallwatch', 'circle', 'killtank', 'thrash', 'stall', 'killtank_los',
  'coverdiag', 'aimlatency', 'covergraze', 'killtank_noroute', 'coverfire',
].map((name) => `src/brain/__sim__/${name}.test.ts`);

export default defineConfig({
  test: {
    // jsdom provides document/Image so the brain's _showBrainIndicator() and any
    // renderer DOM touches are harmless in the headless brain harness.
    environment: 'jsdom',
    include: ['src/brain/__sim__/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: process.env.SLOW ? configDefaults.exclude : [...configDefaults.exclude, ...SLOW_SIMS],
    testTimeout: 30_000,
  },
});
