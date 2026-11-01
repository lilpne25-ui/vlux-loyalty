// V0.4.2 · RLS de businesses, hash de logo almacenado, acceso de demostración (sin contraseñas publicadas) y rutas heredadas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool, getPool, withTenant } from '../../server/db';
import { createBusiness } from '../../server/services/businesses';
import { hashPassword } from '../../server/security';
import { resetRateLimits } from '../../server/ratelimit';
import { Device, newBusiness } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { delete process.env.DEMO_ACCESS; delete process.env.DEMO_BUSINESS_SLUG; await closePool(); await admin.end(); });

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('RLS businesses: sin contexto o con otro negocio no se puede actualizar; con el propio sí', async () => {
  const a = await newBusiness(); const b = await newBusiness();
  const pool = getPool();
  const noCtx = await pool.query("UPDATE businesses SET city = 'X-sin-contexto' WHERE id = $1", [b.businessId]);
  assert.equal(noCtx.rowCount, 0, 'sin app.business_id no debe actualizar');
  const cross = await withTenant(a.businessId, (tx) => tx.query("UPDATE businesses SET city = 'X-cruzado' WHERE id = $1", [b.businessId]));
  assert.equal(cross.rowCount, 0, 'el negocio A no debe poder editar al B');
  const own = await withTenant(a.businessId, (tx) => tx.query("UPDATE businesses SET city = 'Propia' WHERE id = $1", [a.businessId]));
  assert.equal(own.rowCount, 1);
  const check = (await admin.query('SELECT slug, city FROM businesses WHERE id = ANY($1)', [[a.businessId, b.businessId]])).rows;
  assert.ok(!check.some((r) => /X-/.test(r.city)));
  // El rol de la aplicación sigue sin poder borrar negocios.
  await assert.rejects(() => pool.query('DELETE FROM businesses WHERE id = $1', [b.businessId]), /permission denied|denegado/i);
});

test('hash de logotipo: lo calcula la base al escribir y la API pública lo usa sin recalcular', async () => {
  const a = await newBusiness();
  assert.equal((await admin.query('SELECT logo_hash FROM businesses WHERE id = $1', [a.businessId])).rows[0].logo_hash, null);
  await withTenant(a.businessId, (tx) => tx.query('UPDATE businesses SET logo_data_url = $2 WHERE id = $1', [a.businessId, PNG]));
  const h = (await admin.query('SELECT logo_hash, substr(md5(logo_data_url),1,12) AS h FROM businesses WHERE id = $1', [a.businessId])).rows[0];
  assert.equal(h.logo_hash, h.h);
  const d = new Device('x');
  const r = await d.get(`/api/public/businesses/${a.slug}`);
  assert.equal(r.status, 200);
  assert.match(JSON.stringify(r.json), new RegExp(h.h));
  const logo = await d.get(`/api/public/businesses/${a.slug}/logo?v=${h.h}`);
  assert.equal(logo.status, 200);
});

test('acceso de demostración: apagado por omisión; encendido solo abre cuentas reservadas del negocio sintético', async () => {
  await resetRateLimits();
  delete process.env.DEMO_ACCESS;
  const d0 = new Device('anon');
  assert.equal((await d0.get('/api/public/demo')).json.enabled, false);
  assert.equal((await d0.post('/api/public/demo/session', { role: 'OWNER' })).status, 404);

  const slug = 'demo-' + randomUUID().slice(0, 6);
  const pw = randomUUID() + randomUUID();
  const biz = await createBusiness({
    slug, name: 'Demo ' + slug, vertical: 'otro', isDemo: true, reviewUrl: null,
    rules: { stampsRequired: 6, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 30, rewardDescription: 'Cortesía' },
    owner: { email: 'dueno@demo.vlux.invalid', displayName: 'Dueño demo', password: pw },
  });
  const u = (await admin.query("INSERT INTO staff_users (email, password_hash, display_name) VALUES ('caja@demo.vlux.invalid', $1, 'Caja demo') ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id", [await hashPassword(pw)])).rows[0].id;
  await admin.query("INSERT INTO staff_memberships (business_id, user_id, role) VALUES ($1, $2, 'EMPLOYEE') ON CONFLICT DO NOTHING", [biz.businessId, u]);

  process.env.DEMO_ACCESS = '1'; process.env.DEMO_BUSINESS_SLUG = slug;
  const st = await d0.get('/api/public/demo');
  assert.deepEqual(st.json, { enabled: true, slug });
  assert.equal((await d0.post('/api/public/demo/session', { role: 'ADMIN' })).status, 422);

  const owner = new Device('dueno');
  const r = await owner.post('/api/public/demo/session', { role: 'OWNER' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.landing, '/panel');
  const me = await owner.get('/api/staff/me');
  assert.equal(me.json.session.demo, true);
  assert.equal(me.json.session.business.slug, slug);
  assert.equal((await owner.get('/api/owner/dashboard')).status, 200);
  assert.equal((await owner.post('/api/staff/password', { currentPassword: 'x', newPassword: 'y'.repeat(14) })).status, 403);
  assert.equal((await owner.post('/api/owner/staff', { email: 'nuevo@ejemplo.test', displayName: 'Nuevo', password: pw })).status, 403);
  assert.equal((await owner.req('PUT', '/api/owner/program', { name: 'Hack' })).status, 403);

  const cashier = new Device('caja');
  assert.equal((await cashier.post('/api/public/demo/session', { role: 'EMPLOYEE' })).json.landing, '/caja');
  assert.equal((await cashier.get('/api/owner/dashboard')).status, 403, 'la caja no entra al panel');

  // La sesión de demostración vence pronto (2 h) y no abre otros negocios.
  const exp = (await admin.query("SELECT extract(epoch FROM expires_at - now())/3600 AS h FROM staff_sessions WHERE business_id = $1 ORDER BY created_at DESC LIMIT 1", [biz.businessId])).rows[0].h;
  assert.ok(Number(exp) <= 2.01, `sesión demasiado larga: ${exp} h`);
  const other = await newBusiness();
  const sw = await owner.post('/api/staff/switch', { slug: other.slug });
  assert.notEqual(sw.status, 200, 'la sesión demo no puede cambiar a otro negocio');
});

test('el login normal no abre las cuentas reservadas de demostración (contraseña desconocida)', async () => {
  await resetRateLimits();
  const d = new Device('x');
  const r = await d.post('/api/staff/login', { email: 'dueno@demo.vlux.invalid', password: 'cualquiera-123456' });
  assert.equal(r.status, 401);
});

test('el Control Center sigue apagado sin CONTROL_CENTER_ENABLED en producción y /api/admin no existe en el público', async () => {
  const d = new Device('x');
  const r = await d.get('/api/admin/overview');
  assert.ok([401, 404].includes(r.status));
});
