// V0.2.2: PWA (manifiesto e íconos por negocio) y vinculación de la app instalada con código de un solo uso.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { Device, newBusiness, registerCustomer } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await admin.end(); });

async function customerWithCode() {
  const b = await newBusiness();
  const cust = await registerCustomer(b.slug);
  const r = await cust.phone.post(`/api/me/${b.slug}/pair-code`);
  assert.equal(r.status, 201);
  return { b, cust, code: r.json.code as string };
}

test('vincular: sin tarjeta en este navegador no se puede generar código', async () => {
  const b = await newBusiness();
  const r = await new Device('extraño').post(`/api/me/${b.slug}/pair-code`);
  assert.equal(r.status, 401);
});

test('vincular: la app instalada abre la MISMA tarjeta con el código; Safari sigue funcionando', async () => {
  const { b, cust, code } = await customerWithCode();
  assert.match(code, /^\d{8}$/);
  const app = new Device('app instalada');
  assert.equal((await app.get(`/api/me/${b.slug}/card`)).json.card, null, 'sin vincular no ve nada');
  const r = await app.post(`/api/me/${b.slug}/pair`, { code: `${code.slice(0, 4)} ${code.slice(4)}` });
  assert.equal(r.status, 200);
  const cookie = r.headers.getSetCookie().join(';');
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i);
  const inApp = (await app.get(`/api/me/${b.slug}/card`)).json;
  const inSafari = (await cust.phone.get(`/api/me/${b.slug}/card`)).json;
  assert.equal(inApp.card.publicCode, cust.publicCode);
  assert.equal(inSafari.card.publicCode, cust.publicCode, 'vincular no revoca el acceso original');
  assert.ok(!JSON.stringify(r.json).includes(code), 'la respuesta no repite el código');
});

test('vincular: el código sirve una sola vez, caduca y es exclusivo del negocio', async () => {
  const { b, code } = await customerWithCode();
  assert.equal((await new Device('a').post(`/api/me/${b.slug}/pair`, { code })).status, 200);
  const again = await new Device('b').post(`/api/me/${b.slug}/pair`, { code });
  assert.equal(again.status, 404); assert.equal(again.json.error.code, 'invalid_code');

  const other = await newBusiness();
  const x = await customerWithCode();
  assert.equal((await new Device('c').post(`/api/me/${other.slug}/pair`, { code: x.code })).status, 404, 'otro negocio no acepta el código');

  const y = await customerWithCode();
  await admin.query("UPDATE card_pair_codes SET expires_at = now() - interval '1 second' WHERE business_id = $1", [y.b.businessId]);
  assert.equal((await new Device('d').post(`/api/me/${y.b.slug}/pair`, { code: y.code })).status, 404, 'caducado');
});

test('vincular: un código nuevo invalida el anterior; formato inválido 422; solo se guarda el hash', async () => {
  const { b, cust, code } = await customerWithCode();
  const second = (await cust.phone.post(`/api/me/${b.slug}/pair-code`)).json.code;
  assert.equal((await new Device('a').post(`/api/me/${b.slug}/pair`, { code })).status, 404, 'el primero ya no sirve');
  assert.equal((await new Device('b').post(`/api/me/${b.slug}/pair`, { code: '12ab' })).status, 422);
  const rows = (await admin.query('SELECT * FROM card_pair_codes WHERE business_id = $1', [b.businessId])).rows;
  const dump = JSON.stringify(rows);
  assert.ok(!dump.includes(code) && !dump.includes(second), 'el código en claro no está en la base');
  assert.deepEqual(Object.keys(rows[0]).sort(), ['business_id', 'card_id', 'code_hash', 'created_at', 'expires_at', 'id', 'used_at']);
  const audits = (await admin.query("SELECT count(*)::int n FROM audit_events WHERE business_id = $1 AND action = 'card.device_paired'", [b.businessId])).rows[0].n;
  assert.equal(audits, 0, 'sin canje exitoso no hay auditoría');
});

test('vincular: límite de intentos por IP (fuerza bruta)', async () => {
  await resetRateLimits();
  const b = await newBusiness();
  const d = new Device('atacante');
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await d.post(`/api/me/${b.slug}/pair`, { code: String(10_000_000 + i) })).status);
  assert.deepEqual(codes.slice(0, 10), Array(10).fill(404));
  assert.equal(codes[10], 429);
});

test('manifiesto: válido, por negocio, público y sin datos personales', async () => {
  const b = await newBusiness();
  const cust = await registerCustomer(b.slug);
  const r = await cust.phone.get(`/api/pwa/${b.slug}/manifest.webmanifest`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type')!, /application\/manifest\+json/);
  assert.match(r.headers.get('cache-control')!, /public/);
  assert.equal(r.headers.get('set-cookie'), null);
  const m = typeof r.json === 'string' ? JSON.parse(r.json) : r.json;
  assert.equal(m.id, `/n/${b.slug}`);
  assert.equal(m.start_url, `/n/${b.slug}?fuente=app`);
  assert.equal(m.scope, `/n/${b.slug}`);
  assert.ok(m.start_url.startsWith(m.scope), 'start_url dentro del scope');
  assert.equal(m.display, 'standalone');
  assert.ok(m.name.includes('Negocio ' + b.slug) && m.short_name.length <= 12);
  const sizes = m.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
  assert.deepEqual(sizes, ['192x192:any', '512x512:any', '512x512:maskable']);
  const text = JSON.stringify(m);
  assert.ok(!/token|\/t#|\/t\/|Cliente Sintético|cookie|[A-Za-z0-9_-]{40,}/i.test(text), 'sin tokens ni datos del cliente');
  assert.equal((await new Device('x').get('/api/pwa/no-existe/manifest.webmanifest')).status, 404);
});

test('íconos: PNG con el tamaño correcto, caché pública y rutas acotadas', async () => {
  const b = await newBusiness();
  for (const [file, size] of [['192.png', 192], ['512.png', 512], ['180.png', 180], ['maskable-512.png', 512]] as const) {
    const res = await (await import('./helpers')).app.request(`/api/pwa/${b.slug}/icon/${file}`);
    assert.equal(res.status, 200, file);
    assert.equal(res.headers.get('content-type'), 'image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(buf.readUInt32BE(16), size); assert.equal(buf.readUInt32BE(20), size);
  }
  assert.equal((await new Device('x').get(`/api/pwa/${b.slug}/icon/../../etc.png`)).status, 404);
  assert.equal((await new Device('x').get(`/api/pwa/${b.slug}/icon/64.png`)).status, 404);
});

test('revisión MSA: ícono en caché de CDN y memoria; códigos aislados por negocio (RLS)', async () => {
  const { app } = await import('./helpers');
  const b = await newBusiness();
  const r1 = await app.request(`/api/pwa/${b.slug}/icon/512.png`);
  assert.match(r1.headers.get('cache-control') ?? '', /s-maxage=86400/);
  const t0 = Date.now();
  const r2 = await app.request(`/api/pwa/${b.slug}/icon/512.png`);
  assert.equal(r2.status, 200);
  assert.ok(Date.now() - t0 < 100, 'la segunda petición sale de memoria, sin volver a dibujar');
  assert.deepEqual(Buffer.from(await r1.arrayBuffer()), Buffer.from(await r2.arrayBuffer()));

  // Política tenant_isolation: con el contexto de otro negocio no se ve ningún código.
  const { b: owner } = await customerWithCode();
  const other = await newBusiness();
  const c = await admin.connect();
  try {
    await c.query('BEGIN');
    await c.query('SET LOCAL ROLE vlux_app');
    await c.query("SELECT set_config('app.business_id', $1, true)", [other.businessId]);
    const seen = (await c.query('SELECT count(*)::int AS n FROM card_pair_codes WHERE business_id = $1', [owner.businessId])).rows[0].n;
    assert.equal(seen, 0, 'otro negocio no ve los códigos');
    await c.query("SELECT set_config('app.business_id', $1, true)", [owner.businessId]);
    const mine = (await c.query('SELECT count(*)::int AS n FROM card_pair_codes')).rows[0].n;
    assert.equal(mine, 1, 'el propio negocio sí ve su código');
  } finally { await c.query('ROLLBACK'); c.release(); }
});

test('revisión MSA: un número ya usado puede volver a emitirse (índice único solo entre códigos abiertos)', async () => {
  const { b, code } = await customerWithCode();
  assert.equal((await new Device('app').post(`/api/me/${b.slug}/pair`, { code })).status, 200);
  const before = (await admin.query('SELECT count(*)::int AS n FROM card_pair_codes WHERE business_id = $1', [b.businessId])).rows[0].n;
  // Fuerza la reaparición del mismo hash: inserta uno abierto con el mismo hash que el ya usado.
  await admin.query(`INSERT INTO card_pair_codes (code_hash, card_id, business_id, expires_at)
    SELECT code_hash, card_id, business_id, now() + interval '15 minutes' FROM card_pair_codes WHERE business_id = $1`, [b.businessId]);
  assert.equal((await admin.query('SELECT count(*)::int AS n FROM card_pair_codes WHERE business_id = $1', [b.businessId])).rows[0].n, before + 1);
});
