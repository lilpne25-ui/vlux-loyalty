// 1.0 · Aislamiento entre negocios por la API HTTP (IDOR): el dueño del negocio A usa identificadores REALES del negocio B.
// Datos sintéticos. Cada intento debe fallar sin efecto alguno; se comprueba el estado en la base con el rol dueño del esquema.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { PASSWORD, Device, loggedIn, newBusiness, registerCustomer, withEmployee } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
after(async () => { await admin.end(); });

type Side = { biz: Awaited<ReturnType<typeof newBusiness>>; owner: Device; emp: { email: string; membershipId: string }; invitationId: string; customerId: string; cardId: string; code: string; rewardOwnerLink: string };
let A: Side, B: Side;

async function mk(): Promise<Side> {
  const biz = await newBusiness();
  const owner = await loggedIn('dueno', biz.ownerEmail);
  const emp = await withEmployee(owner);
  const inv = await owner.post('/api/owner/invitations', { email: `inv-${biz.slug}@ejemplo.test`, displayName: 'Invitado Sintético' });
  assert.equal(inv.status, 201);
  const cust = await registerCustomer(biz.slug);
  const row = (await admin.query('SELECT c.id AS card_id, c.customer_id FROM cards c WHERE c.business_id = $1 AND c.public_code = $2', [biz.businessId, cust.publicCode])).rows[0];
  return { biz, owner, emp, invitationId: inv.json.invitationId, customerId: row.customer_id, cardId: row.card_id, code: cust.publicCode, rewardOwnerLink: '' };
}
before(async () => { A = await mk(); B = await mk(); });

const state = async (sql: string, params: unknown[]) => (await admin.query(sql, params)).rows[0];

test('A no puede revocar, reenviar ni listar invitaciones de B', async () => {
  const rev = await A.owner.post(`/api/owner/invitations/${B.invitationId}/revoke`);
  assert.equal(rev.status, 404);
  const res = await A.owner.post(`/api/owner/invitations/${B.invitationId}/resend`);
  assert.equal(res.status, 404);
  assert.equal((await state('SELECT revoked_at FROM staff_invitations WHERE id = $1', [B.invitationId])).revoked_at, null);
  const list = await A.owner.get('/api/owner/invitations');
  assert.equal(list.status, 200);
  assert.ok(!JSON.stringify(list.json).includes(B.invitationId));
});

test('A no puede desactivar ni emitir restablecimiento a un empleado de B', async () => {
  const off = await A.owner.req('PATCH', `/api/owner/staff/${B.emp.membershipId}`, { active: false });
  assert.equal(off.status, 404);
  assert.equal((await state('SELECT active FROM staff_memberships WHERE id = $1', [B.emp.membershipId])).active, true);
  const reset = await A.owner.post(`/api/owner/staff/${B.emp.membershipId}/reset-link`);
  assert.equal(reset.status, 404);
  assert.equal((await state('SELECT count(*)::int n FROM password_reset_tokens t JOIN staff_memberships m ON m.user_id = t.user_id WHERE m.id = $1', [B.emp.membershipId])).n, 0);
  const staff = await A.owner.get('/api/owner/staff');
  assert.ok(!JSON.stringify(staff.json).includes(B.emp.email));
});

test('A no puede ver, exportar, anonimizar ni operar clientes y tarjetas de B', async () => {
  assert.equal((await A.owner.get(`/api/owner/customers/${B.customerId}/export`)).status, 404);
  assert.equal((await A.owner.post(`/api/owner/customers/${B.customerId}/anonymize`)).status, 404);
  assert.equal((await state('SELECT anonymized_at FROM customers WHERE id = $1', [B.customerId])).anonymized_at, null);
  const emp = await loggedIn('caja', A.emp.email);
  assert.equal((await emp.get(`/api/staff/cards/${B.cardId}`)).status, 404);
  assert.equal((await emp.post(`/api/staff/cards/${B.cardId}/purchases`, { idempotencyKey: 'k'.repeat(24), amountCents: 1000, items: 1 })).status >= 400, true);
  assert.equal((await emp.post(`/api/staff/cards/${B.cardId}/link`)).status, 404);
  assert.equal((await state('SELECT count(*)::int n FROM card_access_tokens WHERE card_id = $1 AND revoked_at IS NULL', [B.cardId])).n, 1, 'el enlace de B no se reemite');
  assert.equal((await state('SELECT count(*)::int n FROM purchases WHERE card_id = $1', [B.cardId])).n, 0);
  // El código público de B tampoco se resuelve desde el negocio A.
  assert.equal((await emp.post('/api/staff/cards/lookup', { code: B.code })).status, 404);
});

test('la sesión de A no sirve como sesión de B ni tras cambiar de cookie', async () => {
  const me = await A.owner.get('/api/staff/business');
  assert.equal(me.json.slug, A.biz.slug);
  const cookie = [...A.owner.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  const hijack = new Device('otro'); // reutiliza la cookie de A: sigue siendo A, nunca B
  for (const [k, v] of A.owner.cookies) hijack.cookies.set(k, v);
  assert.equal((await hijack.get('/api/staff/business')).json.slug, A.biz.slug);
  assert.ok(cookie.length > 0);
  const switchTo = await A.owner.post('/api/staff/switch', { slug: B.biz.slug });
  assert.equal(switchTo.status, 403);
  const stillA = await A.owner.get('/api/staff/business');
  assert.equal(stillA.json.slug, A.biz.slug, 'un cambio rechazado no revoca la sesión actual');
});

test('rutas del Control Center y funciones de plataforma no responden a sesiones de negocio', async () => {
  for (const path of ['/api/admin/businesses', '/api/admin/overview', `/api/admin/businesses/${B.biz.businessId}`, `/api/admin/businesses/${B.biz.businessId}/deletion-preview`]) {
    const r = await A.owner.get(path);
    assert.ok([401, 403, 404].includes(r.status), `${path} → ${r.status}`);
  }
  const exp = await A.owner.post(`/api/admin/businesses/${B.biz.businessId}/export`);
  assert.ok([401, 403, 404].includes(exp.status), `export → ${exp.status}`);
});

test('solicitudes simultáneas de A y B (mezcladas) nunca se cruzan', async () => {
  const jobs = Array.from({ length: 40 }, (_, i) => {
    const s = i % 2 ? B : A;
    return s.owner.get('/api/owner/staff').then((r) => ({ side: s, body: JSON.stringify(r.json), status: r.status }));
  });
  for (const j of await Promise.all(jobs)) {
    assert.equal(j.status, 200);
    const other = j.side === A ? B : A;
    assert.ok(j.body.includes(j.side.emp.email) && !j.body.includes(other.emp.email));
  }
});

test('contraseña incorrecta o negocio ajeno en el inicio de sesión no crea sesiones', async () => {
  const before = (await state('SELECT count(*)::int n FROM staff_sessions', [])).n;
  const d = new Device('x');
  assert.equal((await d.post('/api/staff/login', { email: A.biz.ownerEmail, password: PASSWORD + 'x' })).status, 401);
  assert.equal((await d.post('/api/staff/login', { email: A.biz.ownerEmail, password: PASSWORD, businessSlug: B.biz.slug })).status, 403);
  assert.equal((await state('SELECT count(*)::int n FROM staff_sessions', [])).n, before);
});
