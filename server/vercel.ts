// Entrada para Vercel Functions (runtime Node.js). NO abre un servidor HTTP: exporta un manejador
// (req, res) que Vercel invoca por cada solicitud. La app Hono y el pool de BD se crean una sola vez
// por instancia y se reutilizan entre invocaciones.
import { getRequestListener } from '@hono/node-server';
import { buildApp } from './app';

const app = buildApp();
export default getRequestListener(app.fetch);
