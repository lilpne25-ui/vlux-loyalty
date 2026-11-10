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
const APP_VERSION = JSON.parse(readFileSync(join(import.meta.dirname, 'package.json'), 'utf8')).version as string;

export default defineConfig(({ command }) => ({
  plugins: [serviceWorker()],
  oxc: { jsx: { runtime: 'automatic', development: command !== 'build' } },
  // El build siempre usa React de producción, aunque NODE_ENV del shell diga otra cosa (.env de desarrollo).
  // 1.0.x · __APP_VERSION__ viaja en «Reportar problema» (sale de package.json, igual que APP_VERSION del servidor).
  define: command === 'build' ? { 'process.env.NODE_ENV': JSON.stringify('production'), __APP_VERSION__: JSON.stringify(APP_VERSION) } : { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8787', '/t': 'http://localhost:8787' },
  },
  build: { outDir: 'dist/client', sourcemap: false, target: 'es2020', chunkSizeWarningLimit: 700 },
}));
