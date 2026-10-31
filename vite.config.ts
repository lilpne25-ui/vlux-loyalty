import { defineConfig } from 'vite';

// El frontend se sirve desde el mismo servidor Node que la API (un solo despliegue).
// En desarrollo, Vite reenvía /api y /t al servidor local.
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/t': 'http://localhost:8787' },
  },
  build: { outDir: 'dist/client', sourcemap: false, target: 'es2020' },
});
