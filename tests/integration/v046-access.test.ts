// V0.4.6 · Centro de accesos (T01–T07) y PWA del dueño (parte de servidor de T08–T13).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { Device, PASSWORD, loggedIn } from './helpers';
import { adminWithMfa, closeAdminHelpers } from './admin-helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
let A: Device;
before(async () => { A = (await adminWithMfa(`acc-${randomUUID().slice(0, 6)}@vlux.test`, 'clave-admin-accesos-2026-x')).d; });
after(async () => { await closePool(); await db.end(); await closeAdminHelpers(); });

async function newBiz(name = 'Barbería Accesos') {
  await resetRateLimits();
  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@ejemplo.test`;
  const r = await A.post('/api/admin/businesses', {
    name: `${name} ${randomUUID().slice(0, 4)}`, vertical: 'barberia', city: 'Metepec', ownerName: 'Dueño Accesos', ownerEmail,
    primaryColor: '#1F2A44', accentColor: '#C9A15B', rules: { stampsRequired: 5, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Corte de cortesía' }, plan: 'piloto',
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { ...r.json, ownerEmail } as { businessId: string; slug: string; ownerEmail: string; ownerInvitation: { invitationId: string; link: string }; access: Record<string, string> };
}
const tokenOf = (link: string) => link.split('#')[1];
const detail = async (id: string) => (await A.get(`/api/admin/businesses/${id}`)).json;

test('T01: los enlaces permanentes (panel, caja, acceso, clientes) no llevan credenciales y apuntan al negocio correcto', async () => {
  const b = await newBiz();
  const d = await detail(b.businessId);
  for (const [k, url] of Object.entries(d.access as Record<string, string>)) {
    assert.ok(!url.includes('#'), `${k} sin fragmento secreto`);
    assert.ok(!/token|code|password|clave/i.test(url), `${k} sin credenciales: ${url}`);
  }
  assert.match(d.access.ownerUrl, new RegExp(`/panel\\?negocio=${b.slug}$`));
  assert.match(d.access.cashierUrl, new RegExp(`/caja\\?negocio=${b.slug}$`));
  assert.match(d.access.loginUrl, new RegExp(`/acceso\\?negocio=${b.slug}$`));
  // Abrir el enlace permanente sin sesión no da acceso a nada.
  const anon = new Device('anónimo');
  assert.equal((await anon.get('/api/owner/dashboard')).status, 401);
});

test('T02: renovar una invitación pendiente genera un token NUEVO e invalida el anterior', async () => {
  const b = await newBiz();
  const old = tokenOf(b.ownerInvitation.link);
  const r = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/resend`, {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const fresh = tokenOf(r.json.link);
  assert.notEqual(fresh, old);
  const anon = new Device('dueño');
  assert.notEqual((await anon.post('/api/invitations/inspect', { token: old })).status, 200, 'el token viejo ya no sirve');
  const ok = await anon.post('/api/invitations/inspect', { token: fresh });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.businessSlug, b.slug);
});

test('T03: una invitación consumida nunca vuelve a mostrar su token; el dueño activado recibe su enlace permanente', async () => {
  const b = await newBiz();
  const anon = new Device('dueño');
  const acc = await anon.post('/api/invitations/accept', { token: tokenOf(b.ownerInvitation.link), password: PASSWORD, displayName: 'Dueño Activo' });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  assert.equal(acc.json.role, 'OWNER');
  assert.equal((await anon.post('/api/invitations/inspect', { token: tokenOf(b.ownerInvitation.link) })).status >= 400, true);
  const d = await detail(b.businessId);
  const inv = d.invitations.find((x: any) => x.id === b.ownerInvitation.invitationId);
  assert.ok(inv.acceptedAt || inv.status === 'accepted', 'aparece como aceptada');
  assert.ok(!JSON.stringify(d).includes(tokenOf(b.ownerInvitation.link)), 'el detalle nunca incluye el token');
  const re = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/resend`, {});
  assert.equal(re.status, 409, 'no se renueva una invitación ya usada');
  const owner = d.staff.find((s: any) => s.role === 'OWNER');
  assert.equal(owner.accountState, 'activa');
  assert.ok(owner.lastLogin, 'último acceso visible');
  // El token se guarda solo como hash.
  const row = (await db.query('SELECT token_hash FROM staff_invitations WHERE id = $1', [b.ownerInvitation.invitationId])).rows[0];
  assert.ok(!String(row.token_hash).includes(tokenOf(b.ownerInvitation.link)));
});

test('T04: activación en persona: código de un solo uso, 30 min, resistente a adivinanzas', async () => {
  const b = await newBiz();
  const r = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/resend`, { delivery: 'in_person' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.mode, 'in_person');
  assert.match(r.json.accessCode, /^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/);
  const minutes = (new Date(r.json.expiresAt).getTime() - Date.now()) / 60_000;
  assert.ok(minutes > 25 && minutes <= 30.5, `vence en ~30 min (${minutes})`);
  const stored = (await db.query('SELECT access_code_hash, delivery FROM staff_invitations WHERE id = $1', [r.json.invitationId])).rows[0];
  assert.equal(stored.delivery, 'in_person');
  assert.ok(stored.access_code_hash && !stored.access_code_hash.toString('utf8').includes(r.json.accessCode.replace('-', '')), 'solo hash');
  const phone = new Device('teléfono del dueño');
  const ins = await phone.post('/api/invitations/inspect', { code: r.json.accessCode.toLowerCase().replace('-', ' ') });
  assert.equal(ins.status, 200, 'acepta minúsculas y espacios');
  const acc = await phone.post('/api/invitations/accept', { code: r.json.accessCode, password: PASSWORD, displayName: 'Dueño Presencial' });
  assert.equal(acc.status, 200, JSON.stringify(acc.json));
  assert.equal((await new Device('otro').post('/api/invitations/accept', { code: r.json.accessCode, password: PASSWORD, displayName: 'Intruso' })).status >= 400, true, 'un solo uso');
  // Fuerza bruta: 10 intentos por IP en 15 min.
  await resetRateLimits();
  const attacker = new Device('atacante');
  let limited = false;
  for (let i = 0; i < 12; i++) {
    const t = await attacker.post('/api/invitations/inspect', { code: 'ABCDE-FGHJK' });
    if (t.status === 429) { limited = true; break; }
    assert.equal(t.status >= 400, true);
  }
  assert.ok(limited, 'se limita la adivinanza de códigos');
});

test('T05: restablecer contraseña desde el Control Center: enlace de un solo uso; nunca se muestra la contraseña', async () => {
  const b = await newBiz();
  await new Device('dueño').post('/api/invitations/accept', { token: tokenOf(b.ownerInvitation.link), password: PASSWORD, displayName: 'Dueño' });
  const owner = (await detail(b.businessId)).staff.find((s: any) => s.role === 'OWNER');
  const r = await A.post(`/api/admin/businesses/${b.businessId}/staff/${owner.membershipId}/reset-link`, {});
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(!JSON.stringify(r.json).includes(PASSWORD));
  const token = r.json.resetLink.split('#')[1];
  assert.ok(token && token.length >= 32);
  const nuevo = 'otra-contraseña-segura-456';
  const anon = new Device('dueño');
  assert.equal((await anon.post('/api/staff/password-reset', { token, newPassword: nuevo })).status, 200);
  assert.ok((await anon.post('/api/staff/password-reset', { token, newPassword: 'tercera-contraseña-789' })).status >= 400, 'un solo uso');
  await loggedIn('dueño', b.ownerEmail, nuevo);
  const ev = (await db.query("SELECT details FROM platform_audit_events WHERE action = 'staff.reset_issued' AND details::text LIKE $1", [`%${owner.membershipId}%`])).rows;
  for (const e of ev) assert.ok(!JSON.stringify(e).includes(token), 'la bitácora no guarda el enlace');
});

test('T06: sin cuentas duplicadas; T07: un empleado nunca obtiene acceso de dueño', async () => {
  const b = await newBiz();
  await new Device('dueño').post('/api/invitations/accept', { token: tokenOf(b.ownerInvitation.link), password: PASSWORD, displayName: 'Dueño' });
  const dup = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: b.ownerEmail, displayName: 'Otra vez', role: 'OWNER' });
  assert.equal(dup.status, 409, 'el correo ya tiene acceso');
  const empEmail = `emp-${randomUUID().slice(0, 6)}@ejemplo.test`;
  const inv = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: empEmail, displayName: 'Cajera', role: 'EMPLOYEE', delivery: 'in_person' });
  assert.equal(inv.status, 201, JSON.stringify(inv.json));
  const phone = new Device('caja');
  const acc = await phone.post('/api/invitations/accept', { code: inv.json.accessCode, password: PASSWORD, displayName: 'Cajera' });
  assert.equal(acc.json.role, 'EMPLOYEE');
  assert.equal((await phone.get('/api/owner/dashboard')).status, 403);
  assert.equal((await phone.post('/api/owner/invitations', { email: 'x@ejemplo.test', displayName: 'X' })).status, 403);
  assert.equal((await phone.get('/api/owner/communication')).status, 403);
  // Compartir: solo se registra el método, nunca el enlace.
  const fresh = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: `e2-${randomUUID().slice(0, 6)}@ejemplo.test`, displayName: 'Otro', role: 'EMPLOYEE' });
  const sh = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${fresh.json.invitationId}/share`, { method: 'whatsapp_opened' });
  assert.equal(sh.status, 200, JSON.stringify(sh.json));
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${fresh.json.invitationId}/share`, { method: 'enviado_seguro' })).status, 422);
  const audit = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'invitation.shared'", [b.businessId])).rows;
  assert.equal(audit.length, 1);
  assert.deepEqual(Object.keys(audit[0].details).sort(), ['method']);
  assert.ok(!JSON.stringify(audit).includes(tokenOf(fresh.json.link)));
});

test('T08–T11 (servidor): manifiesto del panel por negocio, íconos propios y entrada solo al negocio correcto', async () => {
  const b1 = await newBiz('Panel Uno'), b2 = await newBiz('Panel Dos');
  await new Device('d1').post('/api/invitations/accept', { token: tokenOf(b1.ownerInvitation.link), password: PASSWORD, displayName: 'D1' });
  const anon = new Device('navegador');
  const m = await anon.get(`/api/pwa/${b1.slug}/staff/panel/manifest.webmanifest`);
  assert.equal(m.status, 200);
  assert.equal(m.json.id, `/panel?negocio=${b1.slug}`);
  assert.equal(m.json.start_url, `/panel?negocio=${b1.slug}&fuente=app`);
  assert.equal(m.json.display, 'standalone');
  assert.ok(m.json.icons.every((i: any) => i.src.startsWith(`/api/pwa/${b1.slug}/icon/panel-`)));
  assert.ok(!/token/i.test(JSON.stringify(m.json)) && ![m.json.id, m.json.start_url, ...m.json.icons.map((i: any) => i.src)].some((u: string) => u.includes('#')), 'el manifiesto no lleva credenciales');
  const caja = await anon.get(`/api/pwa/${b1.slug}/staff/caja/manifest.webmanifest`);
  assert.notEqual(caja.json.id, m.json.id, 'panel y caja se instalan como apps distintas');
  const icon = await anon.req('GET', `/api/pwa/${b1.slug}/icon/panel-192.png`);
  assert.equal(icon.status, 200);
  assert.equal(icon.headers.get('content-type'), 'image/png');
  // Login desde el enlace de OTRO negocio: no abre sesión en un negocio ajeno.
  const forb = await anon.post('/api/staff/login', { email: b1.ownerEmail, password: PASSWORD, businessSlug: b2.slug });
  assert.equal(forb.status, 403);
  const ok = await anon.post('/api/staff/login', { email: b1.ownerEmail, password: PASSWORD, businessSlug: b1.slug });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.session.business.slug, b1.slug);
  // Cookie de sesión HttpOnly, sin contraseña.
  const raw = await anon.req('POST', '/api/staff/login', { email: b1.ownerEmail, password: PASSWORD, businessSlug: b1.slug });
  const sc = raw.headers.getSetCookie().find((c) => c.startsWith('vlx_staff='))!;
  assert.match(sc, /HttpOnly/i);
  assert.match(sc, /Max-Age=43200/i, 'la sesión vence a las 12 h');
  // Cambiar a un negocio del que no es miembro: rechazado.
  assert.ok((await anon.post('/api/staff/switch', { slug: b2.slug })).status >= 400);
});
