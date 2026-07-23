import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      // The unit under test is the data/decision logic in lib/. The Viewer is a
      // thin integration shell over the livekit-client SDK (real playback needs a
      // browser + a live publisher) — it's verified by `next build` + the Phase-1
      // browser check, not unit coverage.
      include: ['lib/**/*.ts'],
      exclude: ['**/*.d.ts'],
      all: true
    }
  }
});
