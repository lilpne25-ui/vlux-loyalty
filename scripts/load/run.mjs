// V0.4.5 · Prueba de carga reproducible SOLO contra un servidor local (se niega a apuntar a otro host).
// Simula, por negocio: una caja que abre tarjetas y registra operaciones, el panel del dueño que sondea el tablero
// y clientes que abren su tarjeta. Mide p50/p95/p99, errores y RPS por tipo de solicitud; muestrea CPU y memoria
// del proceso del servidor y las conexiones a PostgreSQL.
// Uso: node scripts/load/run.mjs --fixture fx.json --base http://127.0.0.1:8787 --businesses 100 --seconds 60 \
//        --op-interval 4000 --dash-interval 8000 --customer-interval 6000 --server-pid <pid> [--out resultado.json]
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
// CPU en % de UN núcleo (100 = un núcleo completo).

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > -1 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://127.0.0.1:8787');
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) { console.error('Rechazado: solo servidores locales.'); process.exit(1); }
const fx = JSON.parse(fs.readFileSync(arg('fixture'), 'utf8'));
const NB = Math.min(Number(arg('businesses', fx.businesses.length)), fx.businesses.length);
const SECONDS = Number(arg('seconds', 60));
const OP_MS = Number(arg('op-interval', 4000));        // cada caja registra una operación cada N ms
const DASH_MS = Number(arg('dash-interval', 8000));    // sondeo del panel del dueño (igual que la app)
const CUST_MS = Number(arg('customer-interval', 6000)); // un cliente por negocio abre su tarjeta cada N ms
const PID = arg('server-pid');
const OUT = arg('out');

const lat = {}; const errs = {}; const codes = {};
const rec = (k, ms, status) => { (lat[k] ??= []).push(ms); if (status >= 400 || status === 0) { errs[k] = (errs[k] ?? 0) + 1; codes[`${k}:${status}`] = (codes[`${k}:${status}`] ?? 0) + 1; } };
async function call(kind, path, { method = 'GET', cookie, body } = {}) {
  const t = performance.now(); let status = 0;
  try {
    const r = await fetch(BASE + path, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    status = r.status; await r.arrayBuffer();
  } catch { status = 0; }
  rec(kind, performance.now() - t, status);
  return status;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => ms * (0.5 + Math.random());
const end = Date.now() + SECONDS * 1000;

async function cashier(b, idx) {
  const cookie = `vlx_staff=${b.ownerToken}`;
  const type = fx.programTypes[idx % fx.programTypes.length];
  await sleep(Math.random() * OP_MS);
  while (Date.now() < end) {
    const card = b.cards[Math.floor(Math.random() * b.cards.length)];
    await call('caja.ver_tarjeta', `/api/staff/cards/${card.id}`, { cookie });
    const body = { itemCount: 1, idempotencyKey: `carga-${crypto.randomUUID()}`, confirmDuplicate: true };
    if (type === 'points') body.amountCents = 5000 + Math.floor(Math.random() * 30000);
    await call('caja.registrar', `/api/staff/cards/${card.id}/purchases`, { method: 'POST', cookie, body });
    await sleep(jitter(OP_MS));
  }
}
async function dashboard(b) {
  const cookie = `vlx_staff=${b.ownerToken}`;
  await sleep(Math.random() * DASH_MS);
  while (Date.now() < end) { await call('panel.tablero', '/api/owner/dashboard', { cookie }); await sleep(DASH_MS); }
}
async function customers(b) {
  await sleep(Math.random() * CUST_MS);
  while (Date.now() < end) {
    const card = b.cards[Math.floor(Math.random() * b.cards.length)];
    await call('cliente.tarjeta', `/api/me/${b.slug}/card`, { cookie: `vlx_card_${b.slug}=${card.token}` });
    await sleep(jitter(CUST_MS));
  }
}

const samples = [];
// CPU del proceso servidor: delta de utime+stime en /proc (ps %cpu es el promedio de toda la vida del proceso).
const ticks = () => { const f = fs.readFileSync(`/proc/${PID}/stat`, 'utf8').split(') ')[1].split(' '); return Number(f[11]) + Number(f[12]); };
let prev = null;
async function sampler() {
  while (Date.now() < end) {
    const s = { t: Date.now() };
    if (PID) { try {
      const now = { tk: ticks(), t: performance.now() };
      if (prev) s.cpu = Math.round(((now.tk - prev.tk) / 100) / ((now.t - prev.t) / 1000) * 1000) / 10;
      prev = now;
      s.rssMb = Math.round(Number(fs.readFileSync(`/proc/${PID}/status`, 'utf8').match(/VmRSS:\s+(\d+)/)[1]) / 1024);
    } catch { /* proceso terminado */ } }
    try { s.pgConns = Number(execFileSync('psql', [process.env.DATABASE_ADMIN_URL, '-Atc', "select count(*) from pg_stat_activity where datname = current_database()"]).toString().trim()); } catch { /* sin psql */ }
    samples.push(s); await sleep(2000);
  }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] * 10) / 10 : null; };
const t0 = Date.now();
const bs = fx.businesses.slice(0, NB);
await Promise.all([sampler(), ...bs.map((b, i) => cashier(b, i)), ...bs.map(dashboard), ...bs.map(customers)]);
const secs = (Date.now() - t0) / 1000;
const rows = Object.entries(lat).map(([k, a]) => ({ tipo: k, n: a.length, rps: Math.round((a.length / secs) * 10) / 10, p50: pct(a, 50), p95: pct(a, 95), p99: pct(a, 99), max: Math.round(Math.max(...a)), errores: errs[k] ?? 0 }));
const all = Object.values(lat).flat();
const total = { tipo: 'TOTAL', n: all.length, rps: Math.round((all.length / secs) * 10) / 10, p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99), max: Math.round(Math.max(...all)), errores: Object.values(errs).reduce((a, b) => a + b, 0) };
const res = {
  config: { base: BASE, negocios: NB, segundos: SECONDS, opIntervalMs: OP_MS, dashIntervalMs: DASH_MS, customerIntervalMs: CUST_MS },
  resultados: [...rows, total], codigos: codes,
  servidor: { cpuMaxPct: Math.max(0, ...samples.filter((s) => s.cpu != null).map((s) => s.cpu)), cpuMedPct: pct(samples.filter((s) => s.cpu != null).map((s) => s.cpu), 50), rssMaxMb: Math.max(0, ...samples.map((s) => s.rssMb ?? 0)), pgConnsMax: Math.max(0, ...samples.map((s) => s.pgConns ?? 0)) },
};
console.table(res.resultados);
console.log(JSON.stringify({ servidor: res.servidor, codigos: codes }));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 2));
