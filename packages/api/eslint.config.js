import path from 'path';
import { fileURLToPath } from 'url';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config([
  {
    ignores: ['dist', 'node_modules', 'data'],
  },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
]);
