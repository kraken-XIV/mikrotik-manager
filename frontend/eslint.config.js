import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import simpleImportSort from 'eslint-plugin-simple-import-sort';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  // Static a11y gates for JSX (the dynamic half — focus management, traps —
  // is covered by behaviour and review; see docs/ for the a11y notes).
  jsxA11y.flatConfigs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooks,
      'simple-import-sort': simpleImportSort,
    },
    rules: {
      // Import ordering: light-touch, autofixable. Side-effect imports keep
      // their positions; everything else sorts to cut merge-conflict noise
      // and make import style uniform without a bundler change.
      'simple-import-sort/imports': 'error',
      // React rules
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Not needed with React 17+ JSX transform
      'react/prop-types': 'off', // TypeScript handles this

      // jsx-a11y: the recommended ruleset minus the five rules the tree does
      // not satisfy yet. Each is a documented follow-up, not a judgement that
      // the a11y concern is wrong — counts are from the first run of this
      // plugin (see the PR notes). To grow the floor: re-enable one rule, fix
      // its sites, keep CI red until both happen.
      'jsx-a11y/label-has-associated-control': 'off', // 345 sites: <label> + sibling <input> without htmlFor across ~80 settings/form files
      'jsx-a11y/no-static-element-interactions': 'off', //  28 sites: div/span with onClick that wants role+tabIndex or a native button
      'jsx-a11y/click-events-have-key-events': 'off', //  22 sites: same pattern, keyboard half
      'jsx-a11y/no-autofocus': 'off', //  21 sites: autoFocus in modals/search — deliberate UX until a focus-trap convention exists
      'jsx-a11y/no-noninteractive-element-interactions': 'off', //   1 site

      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'warn',
      // An error, not a warning. A function written, exported and unit-tested
      // but never wired into the component it was written for shipped a broken
      // port sort (#146) -- the warning was emitted and invisible among the
      // others, and the gate only fails on errors.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
);
