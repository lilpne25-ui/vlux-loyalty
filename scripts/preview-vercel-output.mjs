// Emulador LOCAL mínimo de .vercel/output para pruebas: aplica las rutas de config.json, sirve
// static/ y llama a la Function empaquetada (functions/api.func/index.mjs) como lo haría Vercel.
// No sustituye una prueba en Vercel real; sirve para verificar el empaquetado y el ruteo.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const out = join(import.meta.dirname, '..', '.vercel', 'output');
const config = JSON.parse(readFileSync(join(out, 'config.json'), 'utf8'));
const handler = (await import(join(out, 'functions', 'api.func', 'index.mjs'))).default;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const port = Number(process.env.PORT || 8788);

function staticFile(path) {
  const f = join(out, 'static', decodeURIComponent(path));
  if (!f.startsWith(join(out, 'static'))) return null;
  return existsSync(f) && statSync(f).isFile() ? f : null;
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let dest = null; const headers = {};
  for (const r of config.routes) {
    if (r.handle === 'filesystem') {
      const f = url.pathname === '/' ? staticFile('index.html') : staticFile(url.pathname);
      if (f) { dest = { file: f }; break; }
      continue;
    }
    if (!new RegExp(r.src).test(url.pathname)) continue;
    Object.assign(headers, r.headers || {});
    if (r.continue) continue;
    dest = r.dest === '/api' ? { fn: true } : { file: staticFile(r.dest) };
    break;
  }
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  // Vercel sobrescribe estas cabeceras en su borde; aquí se simula con la IP del socket.
  req.headers['x-vercel-forwarded-for'] = req.socket.remoteAddress;
  if (dest?.fn) return handler(req, res);
  if (!dest?.file) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('content-type', types[extname(dest.file)] || 'application/octet-stream');
  res.end(readFileSync(dest.file));
}).listen(port, () => console.log(`Emulador de Vercel Output en http://localhost:${port}`));
