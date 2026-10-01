import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  noExternal: ['@big0nia/core'],
  esbuildOptions(options) {
    options.alias = { '@big0nia/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) };
  },
});
