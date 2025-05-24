// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'interactive-player': 'src/interactive-player.ts',
    'interactive-player-processor': 'src/interactive-player-processor.ts',
  },
  target: 'es2020',
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  outDir: 'dist',
  cjsInterop: true,
});
