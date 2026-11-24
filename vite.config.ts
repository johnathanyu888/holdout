import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The client lives in src/client (same layout as the Devvit Web template), so the
// Devvit wiring can be added later without moving files.
export default defineConfig({
  root: r('./src/client'),
  publicDir: r('./src/client/public'),
  resolve: {
    alias: {
      '@shared': r('./src/shared'),
      '@client': r('./src/client'),
    },
  },
  build: {
    outDir: r('./dist/client'),
    emptyOutDir: true,
    target: 'es2022',
    // Phaser alone is ~1.2 MB minified (~320 KB gzipped); don't warn about it.
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true, port: 5173 },
});
