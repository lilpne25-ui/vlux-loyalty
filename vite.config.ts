import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// V0.2.2: genera /sw.js con la lista de archivos públicos del build (sin dependencias extra).
function serviceWorker(): Plugin {
  let outDir = 'dist/client';
  return {
    name: 'vlux-service-worker',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    writeBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => f.startsWith('assets/') && /\.(js|css|woff2?|svg|png)$/.test(f)).sort();
      const buildId = createHash('sha256').update(files.join('|')).digest('hex').slice(0, 12);
      const tpl = readFileSync(join(import.meta.dirname, 'src', 'sw', 'sw-template.js'), 'utf8');
      const sw = tpl.replace("'__BUILD_ID__'", JSON.stringify(buildId)).replace('= __PRECACHE__;', '= ' + JSON.stringify(files.map((f) => `/${f}`)) + ';');
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

// El frontend se sirve desde el mismo servidor Node que la API (un solo despliegue).
// En desarrollo, Vite reenvía /api y /t al servidor local.
export default defineConfig(({ command }) => ({
  plugins: [serviceWorker()],
  oxc: { jsx: { runtime: 'automatic', development: command !== 'build' } },
  // El build siempre usa React de producción, aunque NODE_ENV del shell diga otra cosa (.env de desarrollo).
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production') } : undefined,
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/t': 'http://localhost:8787' },
  },
  build: { outDir: 'dist/client', sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 700 },
}));
