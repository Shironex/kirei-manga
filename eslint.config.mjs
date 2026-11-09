// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  // React + React Hooks, scoped to the desktop renderer and the landing island.
  {
    files: ['apps/desktop/src/**/*.{ts,tsx}', 'apps/landing/src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      // Pinned, not 'detect': eslint-plugin-react@7's detection calls the
      // context.getFilename() API that ESLint 10 removed, and throws.
      react: { version: '19.3' },
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      // TypeScript owns prop types and the JSX transform is automatic.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  // R3F JSX props are three.js object properties, not DOM attributes.
  {
    files: ['apps/landing/src/scene/**/*.tsx'],
    rules: { 'react/no-unknown-property': 'off' },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/release/**',
      '**/.astro/**',
      '**/coverage/**',
      '**/target/**',
      'apps/desktop/src-tauri/gen/**',
      '**/*.js',
    ],
  }
);
