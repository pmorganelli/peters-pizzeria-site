import { defineConfig } from 'vitest/config';

// Server and client-logic tests both run fine under plain Node — nothing here
// touches the DOM, so there's no jsdom dependency to install or configure.
// See CLAUDE.md's Testing section for where test files live and what they cover.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
    // Each test file gets its own module registry, so the in-memory Map
    // singletons in api/_lib/store.js and api/_lib/slices.js (persisted on
    // `globalThis` to survive hot reload in dev) never leak state across files.
    isolate: true,
  },
});
