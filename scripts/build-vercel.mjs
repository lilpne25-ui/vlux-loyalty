// Genera .vercel/output (Build Output API v3) a partir del frontend de Vite y la API Hono.
//   static/            → archivos de Vite (CDN)
//   functions/api.func → API Hono empaquetada en un solo archivo (sin depender de node_modules)
//   config.json        → rutas: estáticos, /api/*, /t/*, fallback del SPA, encabezados y caché
// Uso: npm run build:vercel   (Vercel lo ejecuta como Build Command)
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, '.vercel', 'output');
const client = join(root, 'dist', 'client');
if (!existsSync(join(client, 'index.html'))) throw new Error('Falta dist/client: ejecuta "vite build" antes.');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'static'), { recursive: true });
cpSync(client, join(out, 'static'), { recursive: true });

const fn = join(out, 'functions', 'api.func');
mkdirSync(fn, { recursive: true });
await build({
  entryPoints: [join(root, 'server', 'vercel.ts')],
  outfile: join(fn, 'index.mjs'),
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Algunas dependencias CommonJS usan require(); en ESM hay que proveerlo.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  external: ['pg-native'],
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
});
writeFileSync(join(fn, '.vc-config.json'), JSON.stringify({
  runtime: 'nodejs22.x',
  handler: 'index.mjs',
  launcherType: 'Nodejs',
  shouldAddHelpers: false,
  supportsResponseStreaming: true,
  maxDuration: 15,
}, null, 2));
writeFileSync(join(fn, 'package.json'), JSON.stringify({ type: 'module' }));

// Encabezados de seguridad para el HTML y los estáticos (la API añade los suyos desde Hono).
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
const securityHeaders = {
  'content-security-policy': csp,
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(self), microphone=(), geolocation=(self)',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};
const config = {
  version: 3,
  routes: [
    // Archivos con hash: caché larga e inmutable.
    { src: '^/assets/(.*)$', headers: { 'cache-control': 'public, max-age=31536000, immutable' }, continue: true },
    // Service worker: siempre revalidar para que las actualizaciones lleguen.
    { src: '^/sw\\.js$', headers: { 'cache-control': 'no-cache, max-age=0', 'content-type': 'text/javascript; charset=utf-8' }, continue: true },
    // Todo lo demás: encabezados de seguridad.
    { src: '^/(?!api(?:/|$)|t/)(.*)$', headers: securityHeaders, continue: true },
    // API y enlaces personales SIEMPRE a la Function (antes del sistema de archivos y del fallback).
    { src: '^/api(/.*)?$', dest: '/api' },
    { src: '^/t/[^/]+$', dest: '/api' },
    { handle: 'filesystem' },
    // Fallback del SPA: rutas de React (/n/:slug, /acceso, /caja, /panel, /t, /restablecer...).
    { src: '^/(.*)$', dest: '/index.html', headers: { 'cache-control': 'public, max-age=0, must-revalidate' } },
  ],
};
// 1.0.x · Tarea programada de retención de «Perdí mi acceso» (0017) con Vercel Schedules (beta pública).
// APAGADA por omisión: solo se declara si el build corre con VLUX_SCHEDULE_RECOVERY_RETENTION=1 en un build de Preview
// (VERCEL_ENV=preview). Aun declarada,
// en Preview una schedule estática nueva nace INACTIVA (hay que habilitarla por rama con la CLI). Vercel envía
// `Authorization: Bearer $CRON_SECRET` a las rutas tipo path. Nunca llama a la ruta de avisos.
// Procedimiento: docs/release-1.0/TAREA_RETENCION_0017.md
const RECOVERY_RETENTION_SCHEDULE = {
  'recovery-retention': { schedule: '47 8 * * *', timezone: 'UTC', path: '/api/internal/recovery/retention', requestMethod: 'GET' },
};
// Doble llave: la bandera Y entorno Preview. En Production no se declara aunque la bandera exista por error.
if (process.env.VLUX_SCHEDULE_RECOVERY_RETENTION === '1' && process.env.VERCEL_ENV === 'preview') {
  config.schedules = RECOVERY_RETENTION_SCHEDULE;
  console.log('Vercel Schedules: recovery-retention DECLARADA (47 8 * * * UTC)');
}
writeFileSync(join(out, 'config.json'), JSON.stringify(config, null, 2));
console.log('Build Output API listo en .vercel/output');
