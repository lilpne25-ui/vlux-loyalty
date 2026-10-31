import { defineConfig } from 'vite';

// El frontend se sirve desde el mismo servidor Node que la API (un solo despliegue).
// En desarrollo, Vite reenvía /api y /t al servidor local.
export default defineConfig(({ command }) => ({
  oxc: { jsx: { runtime: 'automatic', development: command !== 'build' } },
  // El build siempre usa React de producción, aunque NODE_ENV del shell diga otra cosa (.env de desarrollo).
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : undefined,
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/t': 'http://localhost:8787' },
  },
  build: { outDir: 'dist/client', sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 700 },
}));
