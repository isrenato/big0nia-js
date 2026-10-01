import tsParser from '@typescript-eslint/parser';
import big0nia from '@big0nia/eslint-plugin';

// Dogfood: lint big0nia's own source with its own recommended preset. Requires `npm run build` first,
// since the plugin is loaded from its built workspace package.
export default [
  { ignores: ['**/dist/**'] },
  { files: ['packages/*/src/**/*.ts'], languageOptions: { parser: tsParser } },
  big0nia.configs.recommended,
];
