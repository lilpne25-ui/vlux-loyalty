// V0.4.5 · Ciclo de vida de negocios (T01–T09): crear, editar, suspender, reactivar, archivar, restaurar,
// preparar eliminación, eliminar un negocio sintético y conservar el personal compartido con otros negocios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { adminWithMfa, closeAdminHelpers, freshCode as fc } from './admin-helpers';
import { Device, PASSWORD, identify, key, loggedIn, registerCustomer, withEmployee } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await db.end(); await closeAdminHelpers(); });

const LC_EMAIL = `lc-${randomUUID().slice(0, 6)}@vlux.test`;
const LC_PASSWORD = 'clave-admin-ciclo-de-vida-2026';
let secret = '';
let A: Device;
const freshCode = () => fc(LC_EMAIL, secret);

before(async () => {
  const r = await adminWithMfa(LC_EMAIL, LC_PASSWORD);
  A = r.d; secret = r.secret;
});

const rules = { stampsRequired: 5, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Café de cortesía' };
async function create(name: string, opts: { isDemo?: boolean; ownerEmail?: string } = {}) {
  await resetRateLimits();
  const r = await A.post('/api/admin/businesses', {
    name, vertical: 'cafeteria', city: 'Toluca', ownerName: 'Dueña Sintética', ownerEmail: opts.ownerEmail ?? `owner-${randomUUID().slice(0, 8)}@ejemplo.test`,
    primaryColor: '#2B1B14', accentColor: '#C9A15B', rules, plan: 'piloto', isDemo: !!opts.isDemo,
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json as { businessId: string; slug: string; ownerInvitation: { link: string } };
}
async function accept(link: string) {
  const d = new Device('dueño');
  const r = await d.post('/api/invitations/accept', { token: link.split('#')[1], password: PASSWORD });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return d;
}

test('T01–T04: crear, editar, suspender y reactivar siguen funcionando', async () => {
  const b = await create('Café Ciclo de Vida');
  const ed = await A.req('PATCH', `/api/admin/businesses/${b.businessId}`, { name: 'Café Ciclo Editado', vertical: 'cafeteria', city: 'Metepec', primaryColor: '#111111', accentColor: '#C9A15B', cardFinish: 'silver', reviewUrl: null, logoDataUrl: null });
  assert.equal(ed.status, 200, JSON.stringify(ed.json));
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'suspended', reason: 'prueba', confirm: true })).status, 200);
  assert.equal((await new Device('x').get(`/api/public/businesses/${b.slug}`)).status, 404);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'active', reason: 'prueba', confirm: true })).status, 200);
  assert.equal((await new Device('x').get(`/api/public/businesses/${b.slug}`)).status, 200);
});

test('T05–T06: archivar saca de operación y de métricas; restaurar vuelve a suspendido', async () => {
  const b = await create('Barbería Archivo');
  const owner = await accept(b.ownerInvitation.link);
  await registerCustomer(b.slug);
  const before = (await A.get('/api/admin/overview')).json.real;
  // Una invitación pendiente que el archivo debe revocar.
  const inv = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: `emp-${randomUUID().slice(0, 6)}@ejemplo.test`, displayName: 'Empleado', role: 'EMPLOYEE' });
  assert.equal(inv.status, 201);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/archive`, { reason: 'x', confirm: true })).status, 422, 'motivo obligatorio');
  const ar = await A.post(`/api/admin/businesses/${b.businessId}/archive`, { reason: 'Cerró el local', confirm: true });
  assert.equal(ar.status, 200, JSON.stringify(ar.json));
  assert.ok(ar.json.sessionsRevoked >= 1 && ar.json.invitationsRevoked >= 1);
  assert.equal((await owner.get('/api/staff/me')).json.session, null, 'el personal pierde la sesión');
  assert.equal((await new Device('x').get(`/api/public/businesses/${b.slug}`)).status, 404, 'registro sin servicio');
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'active', reason: 'intento', confirm: true })).status, 409, 'no se reactiva sin restaurar');
  const after1 = (await A.get('/api/admin/overview')).json.real;
  assert.equal(after1.archived, before.archived + 1);
  assert.equal(after1.customers, before.customers - 1, 'sus clientes salen de las métricas activas');
  const row = (await A.get('/api/admin/businesses')).json.businesses.find((x: any) => x.id === b.businessId);
  assert.equal(row.status, 'archived');
  // Los datos siguen ahí.
  assert.equal((await db.query('SELECT count(*)::int n FROM customers WHERE business_id = $1', [b.businessId])).rows[0].n, 1);
  const rs = await A.post(`/api/admin/businesses/${b.businessId}/restore`, { reason: 'Reabrió' });
  assert.equal(rs.status, 200);
  assert.equal(rs.json.status, 'suspended');
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'active', reason: 'Reabrió', confirm: true })).status, 200);
  assert.equal((await new Device('x').get(`/api/public/businesses/${b.slug}`)).status, 200);
});

test('T07: la vista previa muestra conteos, personal compartido y bloqueos; sin efectos', async () => {
  const b = await create('Negocio Real Con Clientes');
  await accept(b.ownerInvitation.link);
  await registerCustomer(b.slug);
  let p = await A.get(`/api/admin/businesses/${b.businessId}/deletion-preview`);
  assert.equal(p.status, 200);
  assert.equal(p.json.canDelete, false);
  assert.match(p.json.blockers.join(' '), /archiva/);
  assert.equal(p.json.counts.customers, 1);
  assert.equal(p.json.counts.staff, 1);
  await A.post(`/api/admin/businesses/${b.businessId}/archive`, { reason: 'Prueba de bloqueo', confirm: true });
  p = await A.get(`/api/admin/businesses/${b.businessId}/deletion-preview`);
  assert.equal(p.json.canDelete, false, 'negocio real con clientes: solo archivo');
  assert.equal(p.json.requiresSyntheticDeclaration, true);
  // Intento directo: rechazado aunque tenga respaldo y 2FA.
  const ex = await A.post(`/api/admin/businesses/${b.businessId}/export`);
  const sha = ex.headers.get('x-content-sha256')!;
  const del = await A.post(`/api/admin/businesses/${b.businessId}/delete`, { confirmSlug: b.slug, reason: 'Intento', code: await freshCode(), backupSha256: sha });
  assert.equal(del.status, 409);
  assert.equal((await db.query('SELECT count(*)::int n FROM businesses WHERE id = $1', [b.businessId])).rows[0].n, 1);
  // Defensa en profundidad: la función de BD también lo rechaza aunque se llame directamente.
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  try {
    // 0016: la función exige alcance de plataforma; sin él ni siquiera llega a evaluar las reglas de negocio.
    const has0016 = (await app.query("SELECT to_regprocedure('public.app_scope()') IS NOT NULL AS ok")).rows[0].ok as boolean;
    await assert.rejects(app.query('SELECT platform_purge_business($1, $2)', [b.businessId, b.slug]), has0016 ? /alcance de plataforma requerido/ : /clientes reales/);
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.scope', 'platform', true)");
    await assert.rejects(app.query('SELECT platform_purge_business($1, $2)', [b.businessId, b.slug]), /clientes reales/);
    await app.query('ROLLBACK');
    // vlux_app no puede borrar filas directamente.
    await assert.rejects(app.query('DELETE FROM businesses WHERE id = $1', [b.businessId]), /permission denied/);
  } finally { await app.end(); }
});

test('T08–T09: eliminación segura de un negocio sintético; el personal compartido se conserva', async () => {
  // Negocio que sobrevive y comparte a su dueña con el que se elimina.
  const sharedEmail = `compartida-${randomUUID().slice(0, 6)}@ejemplo.test`;
  const keep = await create('Negocio Que Se Queda', { ownerEmail: sharedEmail });
  const keepOwner = await accept(keep.ownerInvitation.link);
  const keepCustomer = await registerCustomer(keep.slug);
  const emp = await withEmployee(keepOwner);
  const empDev = await loggedIn('emp', emp.email);
  const keepCard = await identify(empDev, keepCustomer.publicCode);
  assert.equal((await empDev.post(`/api/staff/cards/${keepCard}/purchases`, { itemCount: 1, idempotencyKey: key() })).status, 200);

  const demo = await create('Demo Para Borrar', { ownerEmail: sharedEmail });
  // La dueña compartida acepta con su contraseña actual (cuenta existente).
  const dd = new Device('dueña');
  assert.equal((await dd.post('/api/invitations/accept', { token: demo.ownerInvitation.link.split('#')[1], password: PASSWORD })).status, 200);
  // Una persona que SOLO está en la demo (se borra).
  const soloLink = (await A.post(`/api/admin/businesses/${demo.businessId}/invitations`, { email: `solo-${randomUUID().slice(0, 6)}@ejemplo.test`, displayName: 'Solo Demo', role: 'EMPLOYEE' })).json.link;
  const solo = new Device('solo');
  assert.equal((await solo.post('/api/invitations/accept', { token: soloLink.split('#')[1], password: PASSWORD })).status, 200);
  const c1 = await registerCustomer(demo.slug, 'Cliente Demo');
  const soloCard = await identify(solo, c1.publicCode);
  for (let i = 0; i < 5; i++) assert.equal((await solo.post(`/api/staff/cards/${soloCard}/purchases`, { itemCount: 1, idempotencyKey: key(), confirmDuplicate: true })).status, 200);

  await A.post(`/api/admin/businesses/${demo.businessId}/archive`, { reason: 'Demo vencida', confirm: true });
  // Declarar datos sintéticos: frase + 2FA.
  assert.equal((await A.post(`/api/admin/businesses/${demo.businessId}/declare-synthetic`, { phrase: 'si', code: await freshCode() })).status, 422);
  assert.equal((await A.post(`/api/admin/businesses/${demo.businessId}/declare-synthetic`, { phrase: 'DATOS DE PRUEBA', code: '000000' })).status, 401);
  const ds = await A.post(`/api/admin/businesses/${demo.businessId}/declare-synthetic`, { phrase: 'datos de prueba', code: await freshCode() });
  assert.equal(ds.status, 200, JSON.stringify(ds.json));

  const p = (await A.get(`/api/admin/businesses/${demo.businessId}/deletion-preview`)).json;
  assert.equal(p.canDelete, true, JSON.stringify(p.blockers));
  assert.equal(p.counts.customers, 1);
  assert.equal(p.counts.purchases, 5);
  assert.equal(p.staff.find((s: any) => s.email === sharedEmail).sharedWithOtherBusinesses, true);

  // Sin respaldo: rechazado.
  await resetRateLimits();
  const noBackup = await A.post(`/api/admin/businesses/${demo.businessId}/delete`, { confirmSlug: demo.slug, reason: 'Limpieza', code: await freshCode(), backupSha256: 'a'.repeat(64) });
  assert.equal(noBackup.status, 409);
  const ex = await A.post(`/api/admin/businesses/${demo.businessId}/export`);
  assert.equal(ex.status, 200);
  const body = typeof ex.json === 'string' ? ex.json : JSON.stringify(ex.json, null, 2);
  const sha = ex.headers.get('x-content-sha256')!;
  assert.equal(createHash('sha256').update(body).digest('hex'), sha, 'la huella corresponde al archivo descargado');
  assert.ok(!/password_hash|token_hash|code_hash/.test(body), 'el respaldo no incluye hashes de credenciales');
  assert.equal(ex.json.data.customers.length, 1);
  // Confirmación incorrecta y 2FA incorrecto.
  assert.equal((await A.post(`/api/admin/businesses/${demo.businessId}/delete`, { confirmSlug: 'otro', reason: 'Limpieza', code: await freshCode(), backupSha256: sha })).status, 422);
  assert.equal((await A.post(`/api/admin/businesses/${demo.businessId}/delete`, { confirmSlug: demo.slug, reason: 'Limpieza', code: '111111', backupSha256: sha })).status, 401);
  await resetRateLimits();
  const del = await A.post(`/api/admin/businesses/${demo.businessId}/delete`, { confirmSlug: demo.slug, reason: 'Limpieza de demos', code: await freshCode(), backupSha256: sha });
  assert.equal(del.status, 200, JSON.stringify(del.json));
  assert.equal(del.json.counts.purchases, 5);
  assert.equal(del.json.counts.usersKept, 1);
  assert.equal(del.json.counts.usersDeleted, 1);

  // Nada del negocio queda; la lápida y la bitácora global sí.
  for (const t of ['businesses', 'customers', 'cards', 'purchases', 'stamp_events', 'audit_events', 'staff_memberships', 'staff_invitations'])
    assert.equal((await db.query(`SELECT count(*)::int n FROM ${t} WHERE ${t === 'businesses' ? 'id' : 'business_id'} = $1`, [demo.businessId])).rows[0].n, 0, t);
  assert.equal((await db.query('SELECT count(*)::int n FROM business_deletions WHERE business_id = $1', [demo.businessId])).rows[0].n, 1);
  assert.ok((await db.query("SELECT count(*)::int n FROM platform_audit_events WHERE business_id = $1 AND action = 'business.deleted'", [demo.businessId])).rows[0].n === 1);
  await assert.rejects(db.query('DELETE FROM business_deletions'), /solo inserción/);

  // T09: la dueña compartida sigue entrando a su otro negocio; su negocio y datos intactos.
  assert.equal((await db.query('SELECT count(*)::int n FROM staff_users WHERE email = $1', [sharedEmail])).rows[0].n, 1);
  const again = await loggedIn('dueña de nuevo', sharedEmail);
  assert.equal((await again.get('/api/staff/me')).json.session.businessSlug ?? (await again.get('/api/staff/me')).json.session.business?.slug, keep.slug);
  assert.equal((await db.query('SELECT count(*)::int n FROM purchases WHERE business_id = $1', [keep.businessId])).rows[0].n, 1);
  assert.equal((await new Device('x').get(`/api/public/businesses/${keep.slug}`)).status, 200);
  const keepCardView = await keepCustomer.phone.get(`/api/me/${keep.slug}/card`);
  assert.equal(keepCardView.status, 200);
  // El Control Center sigue listando la actividad global sin errores.
  assert.equal((await A.get('/api/admin/overview')).status, 200);
  assert.equal((await A.get('/api/admin/audit')).status, 200);
  assert.equal((await A.get('/api/admin/deletions')).json.deletions.some((x: any) => x.slug === demo.slug), true);
});

test('un negocio de demostración archivado se elimina sin declaración; ruta protegida sin 2FA', async () => {
  const b = await create('Demo Marcada', { isDemo: true });
  await registerCustomer(b.slug);
  assert.equal((await new Device('anónimo').get(`/api/admin/businesses/${b.businessId}/deletion-preview`)).status, 401);
  await A.post(`/api/admin/businesses/${b.businessId}/archive`, { reason: 'Demo vieja', confirm: true });
  const p = (await A.get(`/api/admin/businesses/${b.businessId}/deletion-preview`)).json;
  assert.equal(p.canDelete, true);
  const ex = await A.post(`/api/admin/businesses/${b.businessId}/export`);
  const r = await A.post(`/api/admin/businesses/${b.businessId}/delete`, { confirmSlug: b.slug, reason: 'Demo vieja', code: await freshCode(), backupSha256: ex.headers.get('x-content-sha256') });
  assert.equal(r.status, 200, JSON.stringify(r.json));
});
