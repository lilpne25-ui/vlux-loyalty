// 1.0.x · Recuperación de acceso del cliente (R2), WhatsApp del negocio y «Reportar problema» (R4). Migración 0017.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { resetRecoverySchemaCache, maskContact } from '../../server/services/recovery';
import { Device, loggedIn, newBusiness, withEmployee } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
after(async () => { await closePool(); await db.end(); });

async function setup() {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  return { ...b, owner };
}
async function register(slug: string, contact: string, name = 'Mariana') {
  const phone = new Device('cliente');
  const r = await phone.post(`/api/public/businesses/${slug}/register`, { displayName: name, contact, marketingConsent: false, privacyAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { phone, publicCode: r.json.publicCode as string, personalLink: r.json.personalLink as string };
}
const recover = (slug: string, body: unknown) => new Device('teléfono-nuevo').post(`/api/public/businesses/${slug}/recovery`, body);

test('R2-01: la respuesta es IDÉNTICA exista o no la tarjeta (sin enumeración de clientes)', async () => {
  const b = await setup();
  await register(b.slug, '722 111 2233');
  const yes = await recover(b.slug, { contact: '7221112233', name: 'Mariana' });
  const no = await recover(b.slug, { contact: '7229998877' });
  assert.equal(yes.status, 202);
  assert.equal(no.status, 202);
  assert.deepEqual(yes.json, no.json);
  assert.deepEqual(Object.keys(yes.json).sort(), ['businessWhatsapp', 'ok']);
  assert.ok(!JSON.stringify(yes.json).includes('7221112233'));
});

test('R2-02: el dueño ve la solicitud con la coincidencia y la repetición suma en vez de duplicar', async () => {
  const b = await setup();
  const c = await register(b.slug, 'cliente.r2@ejemplo.test', 'Paola');
  await recover(b.slug, { contact: 'Cliente.R2@ejemplo.test ' });
  await recover(b.slug, { contact: 'cliente.r2@ejemplo.test', name: 'Paola R.' });
  await recover(b.slug, { contact: '5512345678' });
  const r = await b.owner.get('/api/owner/recovery');
  assert.equal(r.status, 200);
  assert.equal(r.json.available, true);
  assert.equal(r.json.pending, 2);
  const matched = r.json.requests.find((x: any) => x.contactType === 'email');
  assert.equal(matched.requestCount, 2);
  assert.equal(matched.nameHint, 'Paola R.');
  assert.equal(matched.match.publicCode, c.publicCode);
  assert.equal(matched.match.contactMatches, true);
  const unmatched = r.json.requests.find((x: any) => x.contactType === 'whatsapp');
  assert.equal(unmatched.match, null);
});

test('R2-03: generar enlace revoca el anterior, abre la tarjeta en otro teléfono y queda en bitácora', async () => {
  const b = await setup();
  const c = await register(b.slug, '7221110000');
  await recover(b.slug, { contact: '722-111-0000' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const link = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
  assert.equal(link.status, 200, JSON.stringify(link.json));
  assert.match(link.json.personalLink, /\/t#[A-Za-z0-9_-]{40,}$/);
  assert.equal(link.json.card.publicCode, c.publicCode);
  assert.equal(link.json.contact, '7221110000');
  // El enlace viejo deja de servir; el nuevo abre la tarjeta.
  const oldToken = c.personalLink.split('#')[1];
  assert.equal((await new Device('viejo').post('/api/card-access', { token: oldToken })).status, 404);
  const fresh = new Device('nuevo');
  assert.equal((await fresh.post('/api/card-access', { token: link.json.personalLink.split('#')[1] })).status, 200);
  assert.equal((await fresh.get(`/api/me/${b.slug}/card`)).json.card.publicCode, c.publicCode);
  // Cerrar y comprobar bitácora (sin contacto ni token en los detalles).
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'link_sent' })).json.status, 'resolved');
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'link_sent' })).status, 409);
  const audit = (await db.query("SELECT action, details::text AS d FROM audit_events WHERE business_id = $1 AND (action LIKE 'recovery.%' OR action = 'card.link_reissued') ORDER BY id", [b.businessId])).rows;
  assert.deepEqual(audit.map((a) => a.action), ['recovery.requested', 'card.link_reissued', 'recovery.link_issued', 'recovery.closed']);
  for (const a of audit) assert.ok(!a.d.includes('7221110000') && !a.d.includes(link.json.personalLink.split('#')[1]), 'sin datos sensibles en bitácora');
  // La solicitud nunca guarda el token.
  const row = (await db.query('SELECT to_jsonb(r)::text AS j FROM recovery_requests r WHERE id = $1', [reqId])).rows[0];
  assert.ok(!row.j.includes(link.json.personalLink.split('#')[1]));
});

test('R2-04: sin coincidencia, el dueño elige la tarjeta a mano y se le avisa que el contacto no coincide', async () => {
  const b = await setup();
  const c = await register(b.slug, '');
  await recover(b.slug, { contact: '7220001111', name: 'Sin contacto' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const noCard = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
  assert.equal(noCard.status, 422);
  assert.equal(noCard.json.error.code, 'card_required');
  const cardId = (await b.owner.post('/api/staff/cards/lookup', { code: c.publicCode })).json.cardId;
  const r = await b.owner.post(`/api/owner/recovery/${reqId}/link`, { cardId });
  assert.equal(r.status, 200);
  assert.equal(r.json.card.contactMatches, false);
});

test('R2-05: aislamiento: un dueño no ve ni actúa sobre solicitudes de otro negocio', async () => {
  const a = await setup();
  const b = await setup();
  await register(a.slug, '7223334444');
  await recover(a.slug, { contact: '7223334444' });
  const reqId = (await a.owner.get('/api/owner/recovery')).json.requests[0].id;
  assert.equal((await b.owner.get('/api/owner/recovery')).json.requests.length, 0);
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/link`, {})).status, 404);
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'spam' })).status, 404);
});

test('R2-06: permisos: anónimo y empleado no ven la bandeja; datos inválidos se rechazan', async () => {
  const b = await setup();
  const emp = await withEmployee(b.owner);
  const e = await loggedIn('caja', emp.email);
  assert.equal((await new Device('anon').get('/api/owner/recovery')).status, 401);
  assert.equal((await e.get('/api/owner/recovery')).status, 403);
  assert.equal((await recover(b.slug, { contact: '123' })).status, 422);
  assert.equal((await recover(b.slug, { contact: '' })).status, 422);
  assert.equal((await recover(b.slug, { contact: 'no-es-correo@' })).status, 422);
  assert.equal((await recover('no-existe-xyz', { contact: '7221234567' })).status, 404);
});

test('R2-07: límite por IP: la sexta solicitud en una hora responde 429', async () => {
  const b = await setup();
  await resetRateLimits();
  const d = new Device('insistente');
  for (let i = 0; i < 5; i++) assert.equal((await d.post(`/api/public/businesses/${b.slug}/recovery`, { contact: `72200000${10 + i}` })).status, 202);
  assert.equal((await d.post(`/api/public/businesses/${b.slug}/recovery`, { contact: '7220000099' })).status, 429);
  await resetRateLimits();
});

test('R2-08: WhatsApp del negocio: el dueño lo configura y el cliente lo ve en la ayuda', async () => {
  const b = await setup();
  assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json, { recovery: true, businessWhatsapp: null });
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: '722 555 0101' })).json.businessWhatsapp, '7225550101');
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: '12345' })).status, 422);
  assert.equal((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json.businessWhatsapp, '7225550101');
  assert.equal((await recover(b.slug, { contact: '7220002222' })).json.businessWhatsapp, '7225550101');
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: null })).json.businessWhatsapp, null);
});

test('R2-09: vencidas a los 30 días se enmascaran; anonimizar al cliente enmascara y cierra sus solicitudes', async () => {
  const b = await setup();
  await register(b.slug, '7226667777', 'Vence');
  await recover(b.slug, { contact: '7226667777', name: 'Vence' });
  const c2 = await register(b.slug, 'borrar@ejemplo.test', 'Borrar');
  await recover(b.slug, { contact: 'borrar@ejemplo.test' });
  await db.query("UPDATE recovery_requests SET expires_at = now() - interval '1 minute' WHERE business_id = $1 AND contact_type = 'whatsapp'", [b.businessId]);
  const list = (await b.owner.get('/api/owner/recovery')).json.requests;
  const exp = list.find((x: any) => x.contactType === 'whatsapp');
  assert.equal(exp.status, 'expired');
  assert.equal(exp.contact, '******7777');
  assert.equal(exp.nameHint, null);
  const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c2.publicCode])).rows[0].customer_id;
  assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  const after = (await b.owner.get('/api/owner/recovery')).json.requests.find((x: any) => x.contactType === 'email');
  assert.equal(after.contact, 'b***@ejemplo.test');
  assert.equal(after.status, 'dismissed');
  assert.equal(maskContact('ana@x.mx', 'email'), 'a***@x.mx');
});

test('R2-10: compatibilidad: sin 0017 la app sigue funcionando y estas rutas responden 503 / disponible=false', async () => {
  const b = await setup();
  await db.query('ALTER TABLE recovery_requests RENAME TO recovery_requests_tmp');
  resetRecoverySchemaCache();
  try {
    assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json, { recovery: false, businessWhatsapp: null });
    const r = await recover(b.slug, { contact: '7221231234' });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'recovery_unavailable');
    assert.equal((await b.owner.get('/api/owner/recovery')).json.available, false);
    // Lo existente no cambia: registro, tarjeta, anonimizar.
    const c = await register(b.slug, '7224445555');
    assert.equal((await c.phone.get(`/api/me/${b.slug}/card`)).json.card.publicCode, c.publicCode);
    const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
    assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  } finally {
    await db.query('ALTER TABLE recovery_requests_tmp RENAME TO recovery_requests');
    resetRecoverySchemaCache();
  }
});

test('R2-11: RLS: vlux_app sin negocio fijado no ve solicitudes y no puede borrarlas', async () => {
  const b = await setup();
  await register(b.slug, '7228889999');
  await recover(b.slug, { contact: '7228889999' });
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  try {
    assert.equal((await app.query('SELECT count(*)::int AS n FROM recovery_requests')).rows[0].n, 0);
    await assert.rejects(app.query('DELETE FROM recovery_requests'), /permission denied/);
    await assert.rejects(app.query('UPDATE recovery_requests SET business_id = business_id'), /permission denied/);
  } finally { await app.end(); }
});

test('R4-01: reportar problema deja evento en bitácora con contexto; referencia validada', async () => {
  const b = await setup();
  const ref = 'VLX-AB23CD';
  const r = await b.owner.post('/api/staff/support-report', { ref, view: 'Panel › Accesos', description: 'No imprime el QR', device: 'iPhone · Safari 18', appVersion: '1.0.0-rc.1' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.recorded, true);
  const row = (await db.query("SELECT actor_type, details FROM audit_events WHERE business_id = $1 AND action = 'support.reported'", [b.businessId])).rows[0];
  assert.equal(row.actor_type, 'staff');
  assert.equal(row.details.ref, ref);
  assert.equal(row.details.view, 'Panel › Accesos');
  assert.equal(row.details.role, 'OWNER');
  assert.equal((await b.owner.post('/api/staff/support-report', { ref: 'x', view: 'Panel' })).status, 422);
  assert.equal((await new Device('anon').post('/api/staff/support-report', { ref, view: 'Panel' })).status, 401);
  // Caja también puede reportar.
  const emp = await withEmployee(b.owner);
  assert.equal((await (await loggedIn('caja', emp.email)).post('/api/staff/support-report', { ref: 'VLX-ZZ23CD', view: 'Caja' })).status, 201);
});

test('R4-02: la descripción se limita a 1000 caracteres y se quitan caracteres de control', async () => {
  const b = await setup();
  assert.equal((await b.owner.post('/api/staff/support-report', { ref: 'VLX-AB23CE', view: 'Panel', description: 'x'.repeat(1001) })).status, 422);
  const ok = await b.owner.post('/api/staff/support-report', { ref: 'VLX-AB23CF', view: 'Panel', description: 'hola\u0007mundo' });
  assert.equal(ok.status, 201);
  const d = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'support.reported'", [b.businessId])).rows[0].details;
  assert.equal(d.description, 'holamundo');
});

