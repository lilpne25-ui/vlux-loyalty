// Arranque del servidor: API + frontend compilado (dist/client) en un solo proceso.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildApp } from './app';
import { config } from './config';

const app = buildApp();
const clientDir = join(import.meta.dirname, '..', 'dist', 'client');
const indexPath = join(clientDir, 'index.html');

if (existsSync(indexPath)) {
  const indexHtml = readFileSync(indexPath, 'utf8');
  app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable'); });
  app.use('/*', serveStatic({ root: clientDir }));
  // Rutas del SPA (/, /n/:slug, /acceso, /caja, /panel...) devuelven index.html.
  app.get('*', (c) => (c.req.path.startsWith('/api/') ? c.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404) : c.html(indexHtml)));
} else {
  console.warn('dist/client no existe: ejecuta "npm run build:web" para servir el frontend.');
}

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`VLUX Loyalty escuchando en http://localhost:${info.port}`);
});
