// V0.2.1: comportamiento serverless (varias instancias, pooler) y funciones operativas del piloto.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool, getPool, isTransient, withTenant } from '../../server/db';
import { rateLimit } from '../../server/ratelimit';
import { Device, identify, key, loggedIn, newBusiness, PASSWORD, registerCustomer, withEmployee } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await admin.end(); });

const child = (script: string, args: string[], env: Record<string, string> = {}) =>
  JSON.parse(execFileSync(process.execPath, ['--import', 'tsx', `tests/integration/fixtures/${script}`, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }).trim().split('\n').pop()!);

async function setup(opts: Parameters<typeof newBusiness>[0] = {}) {
  const b = await newBusiness(opts);
  const owner = await loggedIn('dueño', b.ownerEmail);
  const empInfo = await withEmployee(owner);
  const emp = await loggedIn('empleado', empInfo.email);
  const cust = await registerCustomer(b.slug);
  const cardId = await identify(emp, cust.publicCode);
  return { b, owner, emp, empInfo, cust, cardId };
}
const buy = (emp: Device, cardId: string) => emp.post(`/api/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: key(), confirmDuplicate: true });

// ---------- Átomo 03 · conexiones ----------
test('pooler: conexiones reutilizadas no filtran el negocio de una transacción a otra', async () => {
  const A = await setup(), B = await setup();
  const ids = [A.b.businessId, B.b.businessId];
  // 60 transacciones intercaladas sobre un pool pequeño (las conexiones se reutilizan muchas veces).
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => {
    const biz = ids[i % 2];
    return withTenant(biz, async (tx) => {
      const seen = (await tx.query('SELECT DISTINCT business_id FROM customers')).rows.map((r) => r.business_id);
      return { biz, seen };
    });
  }));
  for (const r of results) assert.deepEqual(r.seen, [r.biz], 'cada transacción ve solo su negocio');
  // Fuera de una transacción el contexto queda vacío en TODAS las conexiones del pool.
  const leftovers = await Promise.all(Array.from({ length: 10 }, () => getPool().query("SELECT current_setting('app.business_id', true) AS v")));
  for (const l of leftovers) assert.ok(!l.rows[0].v, 'sin app.business_id residual');
  const none = await getPool().query('SELECT count(*)::int AS n FROM customers');
  assert.equal(none.rows[0].n, 0, 'sin contexto, RLS no muestra clientes');
});

test('pooler: el negocio A no puede leer, modificar, comprar ni canjear en el negocio B', async () => {
  const A = await setup(), B = await setup();
  for (let i = 0; i < 8; i++) await buy(B.emp, B.cardId);
  const rewardId = (await B.emp.get(`/api/staff/cards/${B.cardId}`)).json.card.reward.id;
  assert.equal((await A.emp.get(`/api/staff/cards/${B.cardId}`)).status, 404);
  assert.equal((await A.emp.post(`/api/staff/cards/${B.cardId}/purchases`, { itemCount: 1, idempotencyKey: key(), confirmDuplicate: true })).status, 404);
  assert.equal((await A.emp.post(`/api/staff/rewards/${rewardId}/redeem`)).status, 404);
  assert.equal((await A.owner.get(`/api/owner/customers`)).json.customers.length, 1);
  // Directo en BD con el rol de la app: actualizar una tarjeta de B con el contexto de A no toca filas.
  const upd = await withTenant(A.b.businessId, (tx) => tx.query('UPDATE cards SET stamp_balance = 99 WHERE id = $1', [B.cardId]));
  assert.equal(upd.rowCount, 0);
  await assert.rejects(withTenant(A.b.businessId, (tx) => tx.query('INSERT INTO visits (business_id, card_id, created_by) SELECT $1, id, $2 FROM cards WHERE id = $3', [B.b.businessId, randomUUID(), B.cardId]).then((r) => { if (!r.rowCount) throw new Error('sin filas'); })));
});

test('errores de conexión: reintenta y falla de forma controlada, sin tumbar el proceso', () => {
  const r = child('child-db.ts', [], { DATABASE_URL: 'postgres://vlux_app:x@127.0.0.1:1/vlux_loyalty_test' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ECONNREFUSED');
  assert.ok(r.ms >= 300, `hubo reintentos con espera (${r.ms} ms)`);
  assert.equal(isTransient({ code: '57P01' }), true);
  assert.equal(isTransient({ code: '23505' }), false);
});

test('rol de BD inseguro: en producción la app se niega a operar como superusuario', () => {
  const r = child('child-db.ts', [], { DATABASE_URL: process.env.DATABASE_ADMIN_URL!, NODE_ENV: 'production' });
  assert.equal(r.ok, false);
  assert.match(r.message, /superusuario/);
  const okRole = child('child-db.ts', [], { NODE_ENV: 'production' });
  assert.equal(okRole.ok, true, 'con vlux_app sí opera');
});

// ---------- Átomo 04 · límites compartidos ----------
test('rate limit compartido: dos instancias distintas suman al mismo contador', async () => {
  const k = 'prueba-instancias:' + randomUUID();
  const other = child('child-ratelimit.ts', [k, '4']);
  assert.equal(other.blocked, 0, 'la otra instancia usó 4 de 5');
  await rateLimit(k, 5, 60_000);
  await assert.rejects(rateLimit(k, 5, 60_000), (e: any) => e.status === 429 && e.details.retryAfterSeconds > 0);
  const stored = (await admin.query('SELECT key_hash FROM rate_limits WHERE key_hash = encode(sha256($1::bytea), $2)', [k, 'hex'])).rows;
  assert.equal(stored.length, 1, 'la llave se guarda como hash, no en claro');
});

test('login: el bloqueo de cuenta responde igual que el límite por IP (no revela si el correo existe)', async () => {
  const b = await newBusiness();
  const d = new Device('atacante');
  let last: any;
  for (let i = 0; i < 6; i++) last = await d.post('/api/staff/login', { email: b.ownerEmail, password: 'incorrecta-' + i });
  assert.equal(last.status, 429);
  assert.equal(last.json.error.code, 'rate_limited');
});

// ---------- Átomo 09 · operación del piloto ----------
test('anular compra: quita sellos, queda auditada, no cuenta en el panel y no se anula dos veces', async () => {
  const { owner, emp, cardId } = await setup();
  const p1 = await buy(emp, cardId);
  await buy(emp, cardId);
  const v = await owner.post(`/api/owner/purchases/${p1.json.purchaseId}/void`, { reason: 'Se registró dos veces' });
  assert.equal(v.status, 200);
  assert.equal(v.json.balance, 1);
  assert.equal((await owner.post(`/api/owner/purchases/${p1.json.purchaseId}/void`, { reason: 'otra vez' })).json.error.code, 'already_voided');
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.equal(k.purchases, 1);
  assert.equal(k.stamps, 1);
  const audit = (await admin.query("SELECT details FROM audit_events WHERE action = 'purchase.voided' AND entity_id = $1", [p1.json.purchaseId])).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].details.reason, 'Se registró dos veces');
  const ledger = (await admin.query('SELECT c.stamp_balance, sum(e.delta)::int AS l FROM cards c JOIN stamp_events e ON e.card_id = c.id WHERE c.id = $1 GROUP BY 1', [cardId])).rows[0];
  assert.equal(ledger.stamp_balance, ledger.l);
  assert.equal((await emp.post(`/api/owner/purchases/${p1.json.purchaseId}/void`, { reason: 'empleado' })).status, 403, 'solo el dueño anula');
});

test('anular compra: invalida el premio si ya no alcanza, y se rechaza si los sellos ya se canjearon', async () => {
  const { owner, emp, cardId } = await setup();
  const ps = [];
  for (let i = 0; i < 8; i++) ps.push((await buy(emp, cardId)).json.purchaseId);
  const v = await owner.post(`/api/owner/purchases/${ps[7]}/void`, { reason: 'Error de captura' });
  assert.equal(v.json.rewardVoided, true);
  assert.equal((await emp.get(`/api/staff/cards/${cardId}`)).json.card.reward, null);
  const again = (await buy(emp, cardId)).json;
  await emp.post(`/api/staff/rewards/${again.card.reward.id}/redeem`);
  const late = await owner.post(`/api/owner/purchases/${ps[0]}/void`, { reason: 'Muy tarde' });
  assert.equal(late.status, 409);
  assert.equal(late.json.error.code, 'stamps_already_used');
});

test('cambio de contraseña: exige la actual, cierra las otras sesiones y la nueva funciona', async () => {
  const b = await newBusiness();
  const s1 = await loggedIn('compu', b.ownerEmail);
  const s2 = await loggedIn('teléfono', b.ownerEmail);
  assert.equal((await s1.post('/api/staff/password', { currentPassword: 'mala-contraseña', newPassword: 'nueva-contraseña-123' })).status, 401);
  assert.equal((await s1.post('/api/staff/password', { currentPassword: PASSWORD, newPassword: 'nueva-contraseña-123' })).status, 200);
  assert.equal((await s1.get('/api/staff/me')).json.session.email, b.ownerEmail, 'la sesión actual sigue');
  assert.equal((await s2.get('/api/staff/me')).json.session, null, 'la otra sesión se cerró');
  await loggedIn('nuevo', b.ownerEmail, 'nueva-contraseña-123');
});

test('restablecimiento: el dueño emite un enlace de un solo uso para su empleado', async () => {
  const A = await setup(), B = await setup();
  const r = await A.owner.post(`/api/owner/staff/${A.empInfo.membershipId}/reset-link`);
  assert.equal(r.status, 200);
  assert.match(r.json.resetLink, /\/restablecer#[A-Za-z0-9_-]{43}$/);
  const token = r.json.resetLink.split('#')[1];
  assert.equal((await A.owner.post(`/api/owner/staff/${B.empInfo.membershipId}/reset-link`)).status, 404, 'no puede con empleados de otro negocio');
  assert.equal((await A.emp.post(`/api/owner/staff/${A.empInfo.membershipId}/reset-link`)).status, 403);
  const anon = new Device('empleado sin sesión');
  assert.equal((await anon.post('/api/staff/password-reset', { token, newPassword: 'corta' })).status, 422);
  assert.equal((await anon.post('/api/staff/password-reset', { token, newPassword: 'contraseña-nueva-456' })).status, 200);
  assert.equal((await anon.post('/api/staff/password-reset', { token, newPassword: 'contraseña-nueva-789' })).status, 400, 'un solo uso');
  assert.equal((await A.emp.get('/api/staff/me')).json.session, null, 'sesiones anteriores revocadas');
  await loggedIn('empleado', A.empInfo.email, 'contraseña-nueva-456');
});

test('enlace de tarjeta: reemitirlo revoca el anterior', async () => {
  const { emp, cust, cardId, b } = await setup();
  const old = cust.personalLink.split('#')[1];
  const r = await emp.post(`/api/staff/cards/${cardId}/link`);
  assert.equal(r.status, 200);
  const fresh = r.json.personalLink.split('#')[1];
  assert.notEqual(fresh, old);
  assert.equal((await new Device('x').post('/api/card-access', { token: old })).status, 404);
  assert.equal((await cust.phone.get(`/api/me/${b.slug}/card`)).json.card, null, 'el teléfono anterior pierde el acceso');
  assert.equal((await new Device('nuevo').post('/api/card-access', { token: fresh })).status, 200);
});

// ---------- Átomo 02 · endurecimiento de BD ----------
test('todas las tablas de la app tienen RLS activo y el rol de la app no es dueño ni BYPASSRLS', async () => {
  const noRls = (await admin.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity")).rows.map((r) => r.relname);
  assert.deepEqual(noRls, []);
  const role = (await admin.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'vlux_app'")).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false });
  const owned = (await admin.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND tableowner = 'vlux_app'")).rows[0].n;
  assert.equal(owned, 0);
});

test('respuestas de API y enlace /t no se guardan en caché', async () => {
  const d = new Device('x');
  assert.equal((await d.get('/api/health')).headers.get('cache-control'), 'private, no-store');
  assert.equal((await d.get('/t/' + 'A'.repeat(43))).headers.get('cache-control'), 'no-store');
  const nf = await d.get('/api/no-existe');
  assert.equal(nf.status, 404);
  assert.equal(nf.json.error.code, 'not_found');
});
