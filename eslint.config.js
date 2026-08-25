// Flat config (ESLint 9). Three environments live in this repo and they want
// different globals, so each gets its own block rather than one permissive
// catch-all that would let a `window` reference into a serverless handler:
//
//   * src/**      — browser + React 19 (JSX, hooks, a11y)
//   * api/**      — Node serverless handlers, no DOM
//   * scripts/**  — Node build/dev tooling
//
// ESLint is pinned to 9.x deliberately: eslint-plugin-react and
// eslint-plugin-jsx-a11y both still cap their peer range at ^9, and this repo
// has been burned before by a peer split that fails `npm ci` in CI before a
// single test runs (see CLAUDE.md, Dependencies). Move to 10 when those two
// plugins ship v10 support — nothing else here blocks it.

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default [
  {
    // Build output, deps, and the generated sitemap are not ours to lint.
    ignores: ['dist/**', 'node_modules/**', 'public/**', 'photos/**', '.vercel/**'],
  },

  js.configs.recommended,

  // ---------------------------------------------------------------------
  // Client: React 19 in the browser.
  // ---------------------------------------------------------------------
  {
    files: ['src/**/*.{js,jsx}', 'tests/helpers/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.flat.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The automatic JSX runtime means no file imports React just to render.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',

      // This codebase nests label text one level deeper than the rule's
      // default depth of 2 (`<label><span><span>Caption</span></span>`), which
      // made it report a correctly-associated wrapping label as having no
      // accessible text. The association is real; only the search depth was
      // short.
      'jsx-a11y/label-has-associated-control': ['error', { depth: 3 }],

      // Not in react/recommended, but the codebase already reasons about it
      // explicitly (see the add-on unit rows in OrderPage, where index keys are
      // a deliberate choice tied to the persisted cart shape). Enabling it
      // keeps that documented disable meaningful instead of stale, and catches
      // the next place someone reaches for an index key without thinking.
      'react/no-array-index-key': 'warn',

      // Correctness rules worth being loud about in a codebase that leans
      // hard on effects, timers, and GSAP cleanup.
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { contact, notes, ...rest } = order` is how this codebase
          // strips fields that must never reach a client (api/orders.js's
          // publicOrder, api/slices.js's publicSlice/adminSlice). Those names
          // are unused by design — flagging them invites someone to "tidy"
          // away the only thing keeping a private field out of a response.
          ignoreRestSiblings: true,
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },

  // ---------------------------------------------------------------------
  // Server: Vercel serverless handlers. No DOM globals on purpose — a
  // `window` or `localStorage` reference here is a real bug, and this is
  // what catches it.
  // ---------------------------------------------------------------------
  {
    files: ['api/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { contact, notes, ...rest } = order` is how this codebase
          // strips fields that must never reach a client (api/orders.js's
          // publicOrder, api/slices.js's publicSlice/adminSlice). Those names
          // are unused by design — flagging them invites someone to "tidy"
          // away the only thing keeping a private field out of a response.
          ignoreRestSiblings: true,
        },
      ],
      'no-console': 'off', // handlers log to Vercel's function logs
      eqeqeq: ['warn', 'smart'],
      'no-var': 'error',
      'prefer-const': 'warn',
    },
  },

  // ---------------------------------------------------------------------
  // Tests: same environment as the code under test, plus Node for the
  // handler suites. Vitest has `globals: false`, so describe/it/expect are
  // imported explicitly and need no global declarations.
  // ---------------------------------------------------------------------
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      'no-console': 'off',
    },
  },

  // The test harness straddles both worlds: it renders components (browser)
  // but also builds Buffers and reads process.env to drive the handler suites.
  {
    files: ['tests/helpers/**/*.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },

  // Root-level tool configs run under Node.
  {
    files: ['*.config.js', '*.config.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
];
