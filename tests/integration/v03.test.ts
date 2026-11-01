// V0.3 · Control Center: autenticación de administradores con 2FA, alta de negocios, invitaciones,
// selector de negocio, suscripciones manuales, suspensión y aislamiento entre negocios.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { currentStep, totpAt } from '../../server/totp';
import { Device, PASSWORD, identify, key, loggedIn, newBusiness, registerCustomer } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await db.end(); });

const ADMIN_EMAIL = 'ops@vlux.test';
const ADMIN_PASSWORD = 'clave-admin-sintetica-2026';
let secret = '';
let stepUsed = 0;
/** Siguiente código TOTP válido que no se haya usado (la ventana acepta ±1 paso). */
const nextCode = () => {
  const s = Math.max(currentStep() - 1, stepUsed + 1);
  if (s > currentStep() + 1) throw new Error('sin pasos TOTP libres en la ventana');
  stepUsed = s;
  return totpAt(secret, s);
};

async function adminLogin(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
  const d = new Device('admin');
  const r = await d.post('/api/admin/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { d, next: r.json.next as string };
}

let A: Device; // sesión de administrador verificada para el resto de pruebas

before(async () => {
  await db.query('TRUNCATE platform_admins CASCADE');
  await resetRateLimits();
});

test('primer administrador: requiere el código de instalación y solo funciona una vez', async () => {
  const d = new Device('instalación');
  assert.equal((await d.get('/api/admin/bootstrap')).json.needsBootstrap, true);
  const bad = await d.post('/api/admin/bootstrap', { setupToken: 'x'.repeat(40), email: ADMIN_EMAIL, displayName: 'Operación VLUX', password: ADMIN_PASSWORD });
  assert.equal(bad.status, 401);
  const weak = await d.post('/api/admin/bootstrap', { setupToken: process.env.PLATFORM_ADMIN_TOKEN, email: ADMIN_EMAIL, displayName: 'Operación VLUX', password: 'corta12345' });
  assert.equal(weak.status, 422);
  const ok = await d.post('/api/admin/bootstrap', { setupToken: process.env.PLATFORM_ADMIN_TOKEN, email: ADMIN_EMAIL, displayName: 'Operación VLUX', password: ADMIN_PASSWORD });
  assert.equal(ok.status, 201);
  const again = await d.post('/api/admin/bootstrap', { setupToken: process.env.PLATFORM_ADMIN_TOKEN, email: 'otro@vlux.test', displayName: 'Otro', password: ADMIN_PASSWORD });
  assert.equal(again.status, 409);
  const row = (await db.query('SELECT password_hash FROM platform_admins WHERE email = $1', [ADMIN_EMAIL])).rows[0];
  assert.ok(!row.password_hash.includes(ADMIN_PASSWORD), 'la contraseña no se guarda en claro');
});

test('sin segundo factor no hay acceso; alta de TOTP con códigos de recuperación', async () => {
  const { d, next } = await adminLogin();
  assert.equal(next, 'enroll');
  assert.equal((await d.get('/api/admin/overview')).status, 403);
  const start = await d.post('/api/admin/auth/enroll/start');
  assert.equal(start.status, 200);
  secret = start.json.secret;
  assert.match(start.json.otpauthUri, /^otpauth:\/\/totp\/VLUX/);
  const enc = (await db.query('SELECT totp_secret_enc FROM platform_admins WHERE email = $1', [ADMIN_EMAIL])).rows[0].totp_secret_enc;
  assert.ok(!enc.includes(secret), 'el secreto TOTP se guarda cifrado');
  assert.equal((await d.post('/api/admin/auth/enroll/confirm', { code: '000000' })).status, 401);
  const conf = await d.post('/api/admin/auth/enroll/confirm', { code: nextCode() });
  assert.equal(conf.status, 200, JSON.stringify(conf.json));
  assert.equal(conf.json.recoveryCodes.length, 8);
  assert.equal((await d.get('/api/admin/overview')).status, 200);
  A = d;
  (globalThis as any).recovery = conf.json.recoveryCodes;
});

test('inicio de sesión con TOTP: código incorrecto, repetido (replay) y de recuperación de un solo uso', async () => {
  await resetRateLimits();
  const { d, next } = await adminLogin();
  assert.equal(next, 'verify');
  assert.equal((await d.post('/api/admin/auth/totp', { code: '123456' })).status, 401);
  const code = nextCode();
  assert.equal((await d.post('/api/admin/auth/totp', { code })).status, 200);
  assert.equal((await d.get('/api/admin/overview')).status, 200);

  const second = await adminLogin();
  assert.equal((await second.d.post('/api/admin/auth/totp', { code })).status, 401, 'el mismo código no sirve dos veces');
  const rc = (globalThis as any).recovery[0];
  assert.equal((await second.d.post('/api/admin/auth/totp', { code: rc })).status, 200);
  const third = await adminLogin();
  assert.equal((await third.d.post('/api/admin/auth/totp', { code: rc })).status, 401, 'código de recuperación usado');
  await db.query('UPDATE platform_admins SET failed_logins = 0 WHERE email = $1', [ADMIN_EMAIL]);
});

test('sesiones: se listan, se revocan y una sesión revocada deja de servir', async () => {
  await resetRateLimits();
  const { d } = await adminLogin();
  await d.post('/api/admin/auth/totp', { code: nextCode() });
  const me = (await d.get('/api/admin/auth/me')).json.admin;
  const list = await A.get('/api/admin/sessions');
  assert.ok(list.json.sessions.some((s: any) => s.id === me.sessionId));
  assert.equal((await A.post(`/api/admin/sessions/${me.sessionId}/revoke`)).status, 200);
  assert.equal((await d.get('/api/admin/overview')).status, 401);
  const cookie = (await new Device('x').post('/api/admin/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
  assert.equal(cookie.status, 200);
});

test('bloqueo tras 5 contraseñas incorrectas (sin revelar si el correo existe)', async () => {
  await resetRateLimits();
  const tmp = `tmp-${randomUUID().slice(0, 6)}@vlux.test`;
  const inv = await A.post('/api/admin/admins/invite', { email: tmp, displayName: 'Temporal' });
  assert.equal(inv.status, 201);
  assert.equal((await new Device('n').post('/api/admin/admins/accept', { token: inv.json.link.split('#')[1], password: ADMIN_PASSWORD })).status, 200);
  const d = new Device('atacante');
  for (let i = 0; i < 5; i++) assert.equal((await d.post('/api/admin/auth/login', { email: tmp, password: 'incorrecta-xyz' })).status, 401);
  await resetRateLimits();
  assert.equal((await d.post('/api/admin/auth/login', { email: tmp, password: ADMIN_PASSWORD })).status, 429);
  assert.equal((await d.post('/api/admin/auth/login', { email: 'nadie@vlux.test', password: 'x' })).status, 401);
});

test('el personal de un negocio no entra al Control Center y el Control Center apagado responde 404', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  assert.equal((await owner.get('/api/admin/overview')).status, 401);
  assert.equal((await owner.get('/api/admin/businesses')).status, 401);
  const prev = process.env.CONTROL_CENTER_ENABLED;
  process.env.CONTROL_CENTER_ENABLED = '0';
  try {
    assert.equal((await A.get('/api/admin/overview')).status, 404);
  } finally {
    if (prev === undefined) delete process.env.CONTROL_CENTER_ENABLED; else process.env.CONTROL_CENTER_ENABLED = prev;
  }
});

const wizard = (over: Record<string, unknown> = {}) => ({
  name: 'Café Prueba Metepec', vertical: 'cafeteria', city: 'Metepec', ownerName: 'Dueña Sintética',
  ownerEmail: `owner-${randomUUID().slice(0, 8)}@ejemplo.test`, logoDataUrl: null, primaryColor: '#111111', accentColor: '#22D3EE',
  rules: { stampsRequired: 6, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Café americano' },
  reviewUrl: 'https://g.page/r/sintetico/review', plan: 'piloto', ...over,
});

test('asistente: crea negocio + reglas + suscripción + invitación en una sola operación', async () => {
  const before = (await db.query('SELECT count(*)::int n FROM businesses')).rows[0].n;
  const r = await A.post('/api/admin/businesses', wizard());
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.match(r.json.slug, /^cafe-prueba-metepec/);
  assert.match(r.json.ownerInvitation.link, /\/invitacion#.{20,}/);
  assert.equal(r.json.ownerInvitation.delivery, 'manual');
  const d = (await A.get(`/api/admin/businesses/${r.json.businessId}`)).json;
  assert.equal(d.program.stampsRequired, 6);
  assert.equal(d.subscription.plan, 'piloto');
  assert.equal(d.subscription.commercialStatus, 'piloto');
  assert.ok(d.subscription.pilotEndDate);
  assert.equal(d.invitations[0].status, 'pendiente');
  assert.equal(d.staff.length, 0, 'el dueño aún no existe: solo invitación');
  // Mismo nombre otra vez: identificador con sufijo, no error.
  const r2 = await A.post('/api/admin/businesses', wizard());
  assert.notEqual(r2.json.slug, r.json.slug);
  // Identificador explícito ocupado: falla y no deja nada a medias.
  const mid = (await db.query('SELECT count(*)::int n FROM businesses')).rows[0].n;
  const dup = await A.post('/api/admin/businesses', wizard({ slug: r.json.slug }));
  assert.equal(dup.status, 409);
  assert.equal((await db.query('SELECT count(*)::int n FROM businesses')).rows[0].n, mid);
  assert.equal(mid, before + 2);
  const audit = (await A.get('/api/admin/audit')).json.events;
  assert.ok(audit.some((e: any) => e.action === 'business.created'));
});

test('asistente: logotipo y datos inválidos se rechazan', async () => {
  assert.equal((await A.post('/api/admin/businesses', wizard({ logoDataUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }))).status, 422);
  assert.equal((await A.post('/api/admin/businesses', wizard({ ownerEmail: 'no-es-correo' }))).status, 422);
  assert.equal((await A.post('/api/admin/businesses', wizard({ plan: 'enterprise' }))).status, 422);
  const ok = await A.post('/api/admin/businesses', wizard({ logoDataUrl: 'data:image/png;base64,iVBORw0KGgo=' }));
  assert.equal(ok.status, 201);
});

async function createViaWizard(over: Record<string, unknown> = {}) {
  const body = wizard(over);
  const r = await A.post('/api/admin/businesses', body);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { ...r.json, ownerEmail: body.ownerEmail as string, token: (r.json.ownerInvitation.link as string).split('#')[1] };
}

test('invitación: se inspecciona, se acepta una sola vez y abre la sesión del dueño', async () => {
  await resetRateLimits();
  const b = await createViaWizard();
  const d = new Device('dueño nuevo');
  const info = await d.post('/api/invitations/inspect', { token: b.token });
  assert.equal(info.status, 200);
  assert.equal(info.json.role, 'OWNER');
  assert.equal(info.json.accountExists, false);
  assert.equal((await d.post('/api/invitations/accept', { token: b.token, password: 'corta' })).status, 422);
  const acc = await d.post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  assert.equal(acc.json.businessSlug, b.slug);
  const me = (await d.get('/api/staff/me')).json.session;
  assert.equal(me.role, 'OWNER');
  assert.equal(me.business.slug, b.slug);
  assert.equal((await new Device('otro').post('/api/invitations/accept', { token: b.token, password: PASSWORD })).status, 409, 'no se reutiliza');
  assert.equal((await new Device('otro').post('/api/invitations/inspect', { token: b.token })).status, 409);
  const hash = (await db.query('SELECT password_hash FROM staff_users WHERE email = $1', [b.ownerEmail])).rows[0].password_hash;
  assert.ok(!hash.includes(PASSWORD));
});

test('invitación: vencida (410), revocada (404) y reenviada (la anterior deja de servir)', async () => {
  await resetRateLimits();
  const b = await createViaWizard();
  await db.query("UPDATE staff_invitations SET expires_at = now() - interval '1 minute' WHERE business_id = $1", [b.businessId]);
  assert.equal((await new Device('x').post('/api/invitations/inspect', { token: b.token })).status, 410);
  const det = (await A.get(`/api/admin/businesses/${b.businessId}`)).json;
  assert.equal(det.invitations[0].status, 'vencida');
  const re = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${det.invitations[0].id}/resend`);
  assert.equal(re.status, 200);
  const newToken = re.json.link.split('#')[1];
  assert.equal((await new Device('x').post('/api/invitations/inspect', { token: newToken })).status, 200);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${re.json.invitationId}/revoke`)).status, 200);
  assert.equal((await new Device('x').post('/api/invitations/inspect', { token: newToken })).status, 404);
  assert.equal((await new Device('x').post('/api/invitations/inspect', { token: 'z'.repeat(43) })).status, 404);
});

test('cuenta existente: se vincula solo con su contraseña actual, nunca se sobrescribe; intentos limitados', async () => {
  await resetRateLimits();
  const first = await newBusiness(); // dueña con cuenta y contraseña PASSWORD
  const before = (await db.query('SELECT password_hash FROM staff_users WHERE email = $1', [first.ownerEmail])).rows[0].password_hash;
  const b = await createViaWizard({ ownerEmail: first.ownerEmail });
  const d = new Device('dueña existente');
  assert.equal((await d.post('/api/invitations/inspect', { token: b.token })).json.accountExists, true);
  const wrong = await d.post('/api/invitations/accept', { token: b.token, password: 'otra-contraseña-nueva-123' });
  assert.equal(wrong.status, 401);
  const ok = await d.post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.linkedExisting, true);
  const after = (await db.query('SELECT password_hash FROM staff_users WHERE email = $1', [first.ownerEmail])).rows[0].password_hash;
  assert.equal(after, before, 'la contraseña existente no cambia');

  // Límite de intentos: 5 contraseñas incorrectas cancelan la invitación.
  const second = await newBusiness();
  const c = await createViaWizard({ ownerEmail: second.ownerEmail });
  for (let i = 0; i < 5; i++) assert.equal((await new Device('a').post('/api/invitations/accept', { token: c.token, password: `mala-${i}-xxxxxxxx` })).status, 401);
  assert.equal((await new Device('a').post('/api/invitations/accept', { token: c.token, password: PASSWORD })).status, 404);
});

test('selector: con varios negocios no se elige el primero en silencio; se puede cambiar de negocio', async () => {
  await resetRateLimits();
  const first = await newBusiness();
  const b = await createViaWizard({ ownerEmail: first.ownerEmail });
  await new Device('v').post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  const d = new Device('dueña con 2 negocios');
  const r = await d.post('/api/staff/login', { email: first.ownerEmail, password: PASSWORD });
  assert.equal(r.status, 200);
  assert.equal(r.json.chooseBusiness, true);
  assert.equal(r.json.businesses.length, 2);
  assert.equal(d.cookies.has('vlx_staff'), false, 'no se abre sesión hasta elegir');
  const pick = await d.post('/api/staff/login', { email: first.ownerEmail, password: PASSWORD, businessSlug: b.slug });
  assert.equal(pick.json.session.business.slug, b.slug);
  const sw = await d.post('/api/staff/switch', { slug: first.slug });
  assert.equal(sw.status, 200);
  assert.equal(sw.json.session.business.slug, first.slug);
  assert.equal((await d.get('/api/staff/me')).json.session.business.slug, first.slug);
  const other = await newBusiness();
  assert.equal((await d.post('/api/staff/switch', { slug: other.slug })).status, 403, 'no puede cambiar a un negocio ajeno');
});

test('aislamiento (J): el dueño del segundo negocio no ve datos del primero', async () => {
  await resetRateLimits();
  const one = await createViaWizard();
  const ownerOne = new Device('dueño 1');
  await ownerOne.post('/api/invitations/accept', { token: one.token, password: PASSWORD });
  const cust = await registerCustomer(one.slug);
  const two = await createViaWizard();
  const ownerTwo = new Device('dueño 2');
  await ownerTwo.post('/api/invitations/accept', { token: two.token, password: PASSWORD });
  assert.equal((await ownerTwo.get('/api/owner/customers')).json.customers.length, 0);
  assert.equal((await ownerOne.get('/api/owner/customers')).json.customers.length, 1);
  assert.equal((await ownerTwo.post('/api/staff/cards/lookup', { code: cust.publicCode })).status, 404);
  const invOne = (await A.get(`/api/admin/businesses/${one.businessId}`)).json.invitations[0];
  assert.equal((await ownerTwo.post(`/api/owner/invitations/${invOne.id}/revoke`)).status, 404, 'no toca invitaciones de otro negocio');
  assert.equal((await ownerTwo.get('/api/admin/businesses')).status, 401);
});

test('dueño invita empleados por enlace (solo EMPLEADO, nunca DUEÑO)', async () => {
  await resetRateLimits();
  const b = await createViaWizard();
  const owner = new Device('dueño');
  await owner.post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  const email = `emp-${randomUUID().slice(0, 6)}@ejemplo.test`;
  const inv = await owner.post('/api/owner/invitations', { email, displayName: 'Empleado Link', role: 'OWNER' });
  assert.equal(inv.status, 201);
  const token = inv.json.link.split('#')[1];
  const e = new Device('empleado');
  assert.equal((await e.post('/api/invitations/inspect', { token })).json.role, 'EMPLOYEE');
  await e.post('/api/invitations/accept', { token, password: PASSWORD });
  assert.equal((await e.get('/api/staff/me')).json.session.role, 'EMPLOYEE');
  assert.equal((await e.get('/api/owner/dashboard')).status, 403);
  assert.equal((await owner.post('/api/owner/invitations', { email, displayName: 'Otra vez' })).status, 409, 'ya es miembro');
  const list = (await owner.get('/api/owner/invitations')).json.invitations;
  assert.equal(list[0].status, 'aceptada');
});

test('suscripción manual: estados comerciales sin cobros ni suspensión automática', async () => {
  const b = await createViaWizard({ plan: 'inicio' });
  const det = (await A.get(`/api/admin/businesses/${b.businessId}`)).json;
  assert.equal(det.subscription.commercialStatus, 'activo');
  const put = await A.req('PUT', `/api/admin/businesses/${b.businessId}/subscription`, {
    plan: 'crecimiento', commercialStatus: 'vencido', startDate: '2026-11-01', pilotEndDate: null, renewalDate: '2026-12-01',
    priceCents: 59900, currency: 'MXN', notes: 'Pago pendiente (dato sintético)',
  });
  assert.equal(put.status, 200);
  const after = (await A.get(`/api/admin/businesses/${b.businessId}`)).json;
  assert.equal(after.subscription.commercialStatus, 'vencido');
  assert.equal(after.subscription.priceCents, 59900);
  assert.equal(after.status, 'active', 'vencido NO suspende el servicio');
  assert.equal((await A.req('PUT', `/api/admin/businesses/${b.businessId}/subscription`, { ...put, commercialStatus: 'moroso' })).status, 422);
  const plans = (await A.get('/api/admin/plans')).json.plans;
  assert.deepEqual(plans.map((p: any) => p.code), ['piloto', 'inicio', 'crecimiento']);
  assert.equal((await A.req('PUT', '/api/admin/plans/inicio', { name: 'Inicio', priceCents: 31900, currency: 'MXN' })).status, 200);
});

test('suspender exige confirmación y motivo, corta sesiones y la página pública; reactivar restaura', async () => {
  await resetRateLimits();
  const b = await createViaWizard();
  const owner = new Device('dueño');
  await owner.post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'suspended', reason: 'Prueba' })).status, 422);
  const s = await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'suspended', reason: 'Prueba sintética', confirm: true });
  assert.equal(s.status, 200);
  assert.ok(s.json.sessionsRevoked >= 1);
  assert.equal((await owner.get('/api/owner/dashboard')).status, 401);
  assert.equal((await new Device('c').get(`/api/public/businesses/${b.slug}`)).status, 404);
  const r = await A.post(`/api/admin/businesses/${b.businessId}/status`, { status: 'active', reason: 'Fin de prueba', confirm: true });
  assert.equal(r.status, 200);
  assert.equal((await new Device('c').get(`/api/public/businesses/${b.slug}`)).status, 200);
  const audit = (await A.get('/api/admin/audit')).json.events.map((e: any) => e.action);
  assert.ok(audit.includes('business.suspended') && audit.includes('business.reactivated'));
});

test('métricas: demo y reales por separado; conteos correctos por negocio', async () => {
  await resetRateLimits();
  const b = await createViaWizard({ isDemo: true });
  const owner = new Device('dueño');
  await owner.post('/api/invitations/accept', { token: b.token, password: PASSWORD });
  const cust = await registerCustomer(b.slug);
  const cardId = await identify(owner, cust.publicCode);
  assert.equal((await owner.post(`/api/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: key() })).status, 200);
  const list = (await A.get('/api/admin/businesses')).json.businesses;
  const row = list.find((x: any) => x.id === b.businessId);
  assert.equal(row.customers, 1);
  assert.equal(row.isDemo, true);
  assert.ok(row.owner);
  assert.ok(row.lastActivity);
  const det = (await A.get(`/api/admin/businesses/${b.businessId}`)).json;
  assert.deepEqual({ c: det.stats.customers, cards: det.stats.cards, p: det.stats.purchases, s: det.stats.stamps }, { c: 1, cards: 1, p: 1, s: 1 });
  const ov = (await A.get('/api/admin/overview')).json;
  assert.ok(ov.demo.businesses >= 1 && ov.demo.customers >= 1);
  assert.equal(typeof ov.real.businesses, 'number');
  assert.equal(ov.infrastructure.database.ok, true);
  assert.ok(Array.isArray(ov.activity));
});

test('métricas globales: la función de estadísticas solo la puede ejecutar la app, no anon/public', async () => {
  const r = (await db.query("SELECT has_function_privilege('public', 'platform_business_stats()', 'EXECUTE') AS pub")).rows[0];
  assert.equal(r.pub, false);
});
