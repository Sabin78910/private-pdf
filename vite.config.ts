import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { injectPrecache } from './src/core/precache';
import { inlineCss } from './scripts/inline-css';

// Writes every built file into dist/sw.js so the web app works offline from the first visit.
function precacheServiceWorker(): Plugin {
  let files: string[] = [];
  let outDir = 'dist';
  return {
    name: 'precache-service-worker',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    generateBundle(_, bundle) {
      files = Object.keys(bundle);
    },
    closeBundle() {
      const sw = join(outDir, 'sw.js');
      writeFileSync(sw, injectPrecache(readFileSync(sw, 'utf8'), files));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [inlineCss(), precacheServiceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
