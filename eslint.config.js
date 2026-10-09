import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// Deliberately small: catch the mistakes that build cleanly and only break at
// render (undefined names, TDZ, hook misuse). Style is not enforced here.
export default [
  { ignores: ['dist/**', 'work/**', '**/node_modules/**', '.vite/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['mcp/**', 'scripts/**', 'smoke/**', 'examples/**', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
