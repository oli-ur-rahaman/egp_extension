import js from '@eslint/js';
import globals from 'globals';
import noSiteKnowledge from './tools/eslint-rules/no-site-knowledge.js';

export default [
  {
    ignores: ['dist/**', 'vendor/**', 'node_modules/**', 'recon/**', 'coverage/**', 'playwright-report/**', 'test-results/**'],
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Extension code: browser + chrome.* globals, and no portal knowledge allowed.
    files: ['src/**/*.js'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker, chrome: 'readonly' },
    },
    plugins: { egp: { rules: { 'no-site-knowledge': noSiteKnowledge } } },
    rules: {
      'egp/no-site-knowledge': 'error',
    },
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
