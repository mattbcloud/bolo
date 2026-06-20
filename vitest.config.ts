import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom provides document/Image so the brain's _showBrainIndicator() and any
    // renderer DOM touches are harmless in the headless brain harness.
    environment: 'jsdom',
    include: ['src/brain/__sim__/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
