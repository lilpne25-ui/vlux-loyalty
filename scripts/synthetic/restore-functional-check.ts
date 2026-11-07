// Prueba funcional de la aplicación REAL (buildApp) sobre una base RESTAURADA sintética.
// Guardas: solo bases cuyo nombre empieza con vlux_ (drill|restore|synth) y en localhost.
// Uso: DATABASE_ADMIN_URL=... DATABASE_URL=... APP_FUNC_PASSWORD=... npx tsx scripts/synthetic/restore-functional-check.ts
import assert from 'node:assert/strict';
import pg from 'pg';

const admin = process.env.DATABASE_ADMIN_URL, app = process.env.DATABASE_URL;
if (!admin || !app) throw new Error('Faltan DATABASE_ADMIN_URL y DATABASE_URL');
for (const u of [admin, app]) {
  const x = new URL(u);
  if (!['localhost', '127.0.0.1'].includes(x.hostname) || !/^\/vlux_(drill|restore|synth)/.test(x.pathname)) throw new Error('Rechazado: solo bases sintéticas locales vlux_drill*/vlux_restore*/vlux_synth*');
}
const { hashPassword } = await import('../../server/security');
const { buildApp } = await import('../../server/app');
const PW = 'contraseña-sintetica-local-123';
const a = new pg.Client({ connectionString: admin }); await a.connect();
const hash = await hashPassword(PW);
// Solo sobre la COPIA: contraseña conocida para dos dueños y una caja sintéticos.
await a.query("UPDATE staff_users SET password_hash = $1 WHERE email IN ('dueno1@example.com','dueno2@example.com','caja1-1@example.com')", [hash]);
const biz = async (slug: string) => (await a.query('SELECT id FROM businesses WHERE slug=$1', [slug])).rows[0].id as string;
const b1 = await biz('synth-01'), b2 = await biz('synth-02');
const card1 = (await a.query('SELECT id, public_code, stamp_balance FROM cards WHERE business_id=$1 ORDER BY created_at, id LIMIT 1 OFFSET 7', [b1])).rows[0];
const card2 = (await a.query('SELECT id, public_code FROM cards WHERE business_id=$1 ORDER BY created_at, id LIMIT 1', [b2])).rows[0];
const before = Number((await a.query('SELECT count(*) FROM purchases WHERE business_id=$1', [b1])).rows[0].count);
const before2 = Number((await a.query('SELECT count(*) FROM purchases WHERE business_id=$1', [b2])).rows[0].count);

const server = buildApp();
async function login(email: string) {
  const cookies = new Map<string, string>();
  const req = async (method: string, path: string, body?: unknown) => {
    const h: Record<string, string> = {}; if (body !== undefined) h['content-type'] = 'application/json';
    if (cookies.size) h.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await server.request(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of res.headers.getSetCookie()) { const [p] = sc.split(';'); const i = p.indexOf('='); const v = p.slice(i + 1); if (/max-age=0/i.test(sc) || v === '') cookies.delete(p.slice(0, i)); else cookies.set(p.slice(0, i), v); }
    const t = await res.text(); let j: any = null; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
    return { status: res.status, json: j };
  };
  const r = await req('POST', '/api/staff/login', { email, password: PW });
  assert.equal(r.status, 200, `login ${email}: ${r.status}`);
  return req;
}
const out: string[] = [];
const ok = (m: string) => { out.push('PASS ' + m); console.log('PASS ' + m); };

const own1 = await login('dueno1@example.com');
const dash = await own1('GET', '/api/owner/dashboard'); assert.equal(dash.status, 200); ok('dueño sintético 1 inicia sesión y consulta su panel sobre la copia restaurada');
const custs = await own1('GET', '/api/owner/customers'); assert.equal(custs.status, 200);
assert.equal(custs.json.customers.length, 300); ok('el panel del dueño 1 lista exactamente 300 clientes (solo los suyos)');
const lk = await own1('POST', '/api/staff/cards/lookup', { code: card1.public_code }); assert.equal(lk.status, 200); assert.equal(lk.json.cardId, card1.id); ok('caja/dueño 1 identifica una tarjeta de su negocio');
const buy = await own1('POST', `/api/staff/cards/${card1.id}/purchases`, { itemCount: 1, idempotencyKey: 'func-' + Date.now() + '-abcdef', confirmDuplicate: true });
assert.equal(buy.status, 200, JSON.stringify(buy.json)); ok('registra una compra sintética nueva en la copia restaurada');
const after = Number((await a.query('SELECT count(*) FROM purchases WHERE business_id=$1', [b1])).rows[0].count); assert.equal(after, before + 1); ok('la compra quedó en la base (+1) con saldo coherente');
const bad = (await a.query("SELECT count(*) FROM cards c LEFT JOIN (SELECT card_id,sum(delta) s FROM stamp_events GROUP BY 1) e ON e.card_id=c.id WHERE c.stamp_balance<>coalesce(e.s,0)")).rows[0].count; assert.equal(Number(bad), 0); ok('saldo = libro mayor en todas las tarjetas tras la operación');

// Aislamiento: dueño del negocio 2 contra datos del negocio 1
const own2 = await login('dueno2@example.com');
const c2 = await own2('GET', '/api/owner/customers'); assert.equal(c2.status, 200); assert.equal(c2.json.customers.length, 300);
const ids1 = new Set((await a.query('SELECT id FROM customers WHERE business_id=$1', [b1])).rows.map((r) => r.id));
assert.ok(c2.json.customers.every((c: any) => !ids1.has(c.id ?? c.customerId))); ok('dueño 2 no ve ningún cliente del negocio 1');
const x = await own2('POST', '/api/staff/cards/lookup', { code: card1.public_code }); assert.ok([404, 403].includes(x.status), 'lookup cruzado ' + x.status); ok(`dueño 2 no puede identificar tarjeta del negocio 1 (HTTP ${x.status})`);
const y = await own2('POST', `/api/staff/cards/${card1.id}/purchases`, { itemCount: 1, idempotencyKey: 'cruz-' + Date.now() + '-abcdef', confirmDuplicate: true }); assert.ok(y.status >= 400, 'compra cruzada ' + y.status); ok(`dueño 2 no puede registrar compra en tarjeta del negocio 1 (HTTP ${y.status})`);
const z = await own2('GET', `/api/staff/cards/${card1.id}`); assert.ok(z.status >= 400); ok(`dueño 2 no puede ver la tarjeta del negocio 1 (HTTP ${z.status})`);
const w = await own2('GET', `/api/owner/customers/${(await a.query('SELECT id FROM customers WHERE business_id=$1 LIMIT 1', [b1])).rows[0].id}/export`); assert.ok(w.status >= 400); ok(`dueño 2 no puede exportar un cliente del negocio 1 (HTTP ${w.status})`);
const after2 = Number((await a.query('SELECT count(*) FROM purchases WHERE business_id=$1', [b2])).rows[0].count); assert.equal(after2, before2); ok('ningún intento cruzado escribió datos en el negocio 2 ni en el 1');
const sw = await own1('GET', '/api/staff/businesses'); assert.equal(sw.json.businesses.length, 1); ok('el dueño 1 solo ve su propio negocio en el selector');
await a.end();
console.log(`\nRESULTADO: ${out.length} verificaciones PASS`);
