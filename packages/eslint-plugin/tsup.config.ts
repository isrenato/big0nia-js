import { fileURLToPath } from 'node:url';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  dts: { resolve: false },
  noExternal: ['@big0nia/core'],
  esbuildOptions(options) {
    options.alias = { '@big0nia/core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) };
  },
});
