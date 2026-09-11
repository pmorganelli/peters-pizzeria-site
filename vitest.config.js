import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Two kinds of test live here, and they want different environments:
//
//   * Handler and pure-logic tests (api/**, src/utils/*.test.js) run under
//     plain Node — nothing they touch has a DOM.
//   * Component tests (*.test.jsx) render, and opt into jsdom per file with a
//     `// @vitest-environment jsdom` docblock on line 1.
//
// `node` stays the default because it's the cheaper environment and most of the
// suite is server-side; opting in per file keeps the API tests from paying for
// a DOM they never use. See CLAUDE.md's Testing section.
export default defineConfig({
  // The React plugin supplies the JSX transform (automatic runtime) that the
  // component tests need. Without it, esbuild's default classic transform
  // looks for a `React` binding none of these files import.
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    include: ['**/*.test.js', '**/*.test.jsx'],
    exclude: ['node_modules/**', 'dist/**'],
    // Each test file gets its own module registry, so the in-memory Map
    // singletons in api/_lib/store.js and api/_lib/slices.js (persisted on
    // `globalThis` to survive hot reload in dev) never leak state across files.
    isolate: true,
  },
});
