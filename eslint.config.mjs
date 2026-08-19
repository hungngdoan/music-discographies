import js from '@eslint/js';
import astro from 'eslint-plugin-astro';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

// Prettier already owns formatting, so nothing here is stylistic. The point of
// this config is the one rule Prettier cannot help with: react-hooks
// exhaustive-deps, which polices stale closures and missing dependencies. That
// is the exact class of bug this codebase has already shipped twice, and it is
// the reason ESLint is here at all.

export default [
  {
    ignores: [
      'dist/**',
      '.astro/**',
      'build/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },

  js.configs.recommended,

  // ---------------------------------------------------------------- React
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // The rule this config exists for. A warning is something nobody reads
      // on a repo with no lint history, so it is an error.
      'react-hooks/exhaustive-deps': 'error',

      // The new JSX transform means React is not in scope and prop types are
      // not the validation layer here; the JSON Schema is.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
    },
  },

  // ------------------------------------------------------------------ Astro
  ...astro.configs.recommended,
  {
    // Astro frontmatter is TypeScript even in a project with no .ts files:
    // `interface Props` is how a layout declares what it accepts, and the
    // default script parser rejects the keyword outright.
    files: ['**/*.astro'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        extraFileExtensions: ['.astro'],
      },
      globals: { ...globals.browser },
    },
  },

  // ------------------------------------------------- Node scripts and config
  {
    files: ['scripts/**/*.mjs', '*.config.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  },

  // Playwright specs run assertions in the browser via evaluate(), so both
  // sets of globals are legitimately in scope.
  {
    files: ['tests/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },

  // Must stay last: switches off anything that would fight Prettier.
  prettier,
];
