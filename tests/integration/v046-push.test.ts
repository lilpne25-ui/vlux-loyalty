// V0.4.6 · VLUX NOTIFICATION ENGINE (T20–T27) y ubicación (T28–T31). El servicio push es SIMULADO: ninguna
// solicitud sale a la red; se descifra cada mensaje con las llaves del "navegador" para revisar su contenido.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { b64u, generateVapidKeys } from '../../server/push/webpush';
import { __setPushFetch, runNotificationJob } from '../../server/services/notifications';
import { Device, newBusiness, loggedIn, withEmployee, registerCustomer, key, identify, PASSWORD } from './helpers';
import { distanceMeters, describeDistance } from '../../src/components/Nearby';
import { adminWithMfa, closeAdminHelpers } from './admin-helpers';
import { resetRateLimits } from '../../server/ratelimit';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
type Sent = { url: string; headers: Record<string, string>; body: Buffer };
let sent: Sent[] = [];
let nextStatus: number[] = [];
before(() => {
  const k = generateVapidKeys();
  process.env.VAPID_PUBLIC_KEY = k.publicKey;
  process.env.VAPID_PRIVATE_KEY = k.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:accesos@vlux.com.mx';
  __setPushFetch((async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: Buffer.from(init.body as Uint8Array) });
    return new Response(null, { status: nextStatus.shift() ?? 201 });
  }) as unknown as typeof fetch);
});
beforeEach(() => { sent = []; nextStatus = []; });
after(async () => { __setPushFetch(undefined); delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT; await closePool(); await db.end(); await closeAdminHelpers(); });

function browser() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const endpoint = `https://fcm.googleapis.com/fcm/send/${randomUUID()}`;
  const decrypt = (msg: Buffer) => {
    const h = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
    const salt = msg.subarray(0, 16), asPub = msg.subarray(21, 21 + msg[20]), ct = msg.subarray(21 + msg[20]);
    const ikm = h(h(auth, ua.computeSecret(asPub)), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPub, Buffer.from([1])]));
    const prk = h(salt, ikm);
    const d = createDecipheriv('aes-128-gcm', h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
    d.setAuthTag(ct.subarray(ct.length - 16));
    const p = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    return JSON.parse(p.subarray(0, p.lastIndexOf(2)).toString('utf8'));
  };
  return { endpoint, keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) }, decrypt };
}

const NO_QUIET = { rewardsEnabled: true, progressEnabled: true, progressRemaining: 1, returnEnabled: false, returnAfterDays: 30, appointmentsEnabled: false, quietStartHour: 0, quietEndHour: 0, maxPerWeek: 2 };

async function setup(stampsRequired = 3) {
  const b = await newBusiness({ stampsRequired });
  const owner = await loggedIn('dueño', b.ownerEmail);
  const emp = await loggedIn('caja', (await withEmployee(owner)).email);
  assert.equal((await owner.req('PUT', '/api/owner/communication/settings', NO_QUIET)).status, 200);
  return { b, owner, emp };
}
async function customer(slug: string, cats = { rewards: true, reminders: true, promotions: false }) {
  const c = await registerCustomer(slug, 'Cliente Push');
  const br = browser();
  const r = await c.phone.post(`/api/me/${slug}/push/subscribe`, { endpoint: br.endpoint, keys: br.keys, categories: cats, platform: 'android' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return { ...c, br };
}
const stamp = (emp: Device, cardId: string) => emp.post(`/api/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: key(), confirmDuplicate: true });

test('T20: sin llaves VAPID las notificaciones quedan apagadas; con llaves se publica solo la llave pública', async () => {
  const anon = new Device('navegador');
  const saved = process.env.VAPID_PRIVATE_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  assert.deepEqual((await anon.get('/api/public/push-config')).json, { enabled: false, publicKey: null });
  const b = await newBusiness();
  const c = await registerCustomer(b.slug);
  const br = browser();
  assert.equal((await c.phone.post(`/api/me/${b.slug}/push/subscribe`, { endpoint: br.endpoint, keys: br.keys, categories: { rewards: true, reminders: false, promotions: false } })).status, 409);
  process.env.VAPID_PRIVATE_KEY = saved;
  const on = (await anon.get('/api/public/push-config')).json;
  assert.equal(on.enabled, true);
  assert.equal(on.publicKey, process.env.VAPID_PUBLIC_KEY);
  assert.ok(!JSON.stringify(on).includes(saved!), 'nunca la privada');
});

test('T21: suscribirse exige la tarjeta del cliente, un servicio push conocido y al menos una categoría; nada se activa solo', async () => {
  const { b } = await setup();
  const c = await registerCustomer(b.slug);
  const br = browser();
  const body = { endpoint: br.endpoint, keys: br.keys, categories: { rewards: true, reminders: false, promotions: false } };
  assert.equal((await new Device('sin tarjeta').post(`/api/me/${b.slug}/push/subscribe`, body)).status, 401);
  assert.equal((await c.phone.post(`/api/me/${b.slug}/push/subscribe`, { ...body, endpoint: 'https://169.254.169.254/latest/meta-data' })).status, 422, 'SSRF bloqueado');
  assert.equal((await c.phone.post(`/api/me/${b.slug}/push/subscribe`, { ...body, categories: { rewards: false, reminders: false, promotions: false } })).status, 422);
  const before = (await db.query('SELECT count(*)::int AS n FROM push_subscriptions s JOIN cards c ON c.id = s.card_id WHERE c.business_id = $1', [b.businessId])).rows[0].n;
  assert.equal(before, 0, 'registrarse no suscribe a nadie');
  assert.equal((await c.phone.post(`/api/me/${b.slug}/push/subscribe`, body)).status, 200);
  const st = await c.phone.post(`/api/me/${b.slug}/push/status`, { endpoint: br.endpoint });
  assert.deepEqual(st.json.categories, { rewards: true, reminders: false, promotions: false });
  const audit = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'push.subscribed'", [b.businessId])).rows;
  assert.equal(audit.length, 1);
  assert.ok(!JSON.stringify(audit).includes(br.endpoint) && !JSON.stringify(audit).includes(br.keys.auth), 'la bitácora no guarda endpoint ni llaves');
});

test('T22: recompensa lista y "casi lo logras" llegan cifradas, sin datos personales y con enlace a la tarjeta', async () => {
  const { b, emp } = await setup(3);
  const c = await customer(b.slug);
  const cardId = await identify(emp, c.publicCode);
  await stamp(emp, cardId);
  assert.equal(sent.length, 0, 'con 1 de 3 todavía no hay aviso');
  const r2 = await stamp(emp, cardId);
  assert.equal(r2.status, 200);
  assert.equal(sent.length, 1, 'faltando 1: aviso de progreso');
  const p = c.br.decrypt(sent[0].body);
  assert.match(p.title, /casi lo logras/);
  assert.equal(p.url, `/n/${b.slug}`);
  assert.equal(sent[0].headers.Urgency, 'low');
  const r3 = await stamp(emp, cardId);
  assert.ok(r3.json.rewardUnlocked);
  assert.equal(sent.length, 2);
  const rw = c.br.decrypt(sent[1].body);
  assert.match(rw.title, /recompensa lista/);
  assert.match(rw.body, /Bebida de cortesía/);
  assert.ok(!JSON.stringify(rw).includes('Cliente Push'), 'sin nombre del cliente');
  assert.ok(!JSON.stringify(rw).includes(c.publicCode), 'sin código de tarjeta');
  assert.ok(sent[1].headers.Authorization.startsWith('vapid t='));
  const out = (await db.query("SELECT template, status, devices_sent FROM notification_outbox WHERE business_id = $1 ORDER BY created_at", [b.businessId])).rows;
  assert.deepEqual(out.map((o) => [o.template, o.status, o.devices_sent]), [['progress', 'sent', 1], ['reward_ready', 'sent', 1]]);
});

test('T23: sin duplicados (llave por recompensa) y reintento acotado ante fallas temporales', async () => {
  const { b, emp } = await setup(3);
  const c = await customer(b.slug, { rewards: true, reminders: false, promotions: false });
  const cardId = await identify(emp, c.publicCode);
  nextStatus = [503];
  await stamp(emp, cardId);
  await stamp(emp, cardId);
  await stamp(emp, cardId);
  assert.equal(sent.length, 1, 'solo recompensa (sin recordatorios)');
  let row = (await db.query("SELECT status, attempts, scheduled_at > now() AS later FROM notification_outbox WHERE business_id = $1", [b.businessId])).rows[0];
  assert.equal(row.status, 'queued', '503: vuelve a la cola');
  assert.ok(row.later, 'con espera');
  await db.query("UPDATE notification_outbox SET scheduled_at = now() WHERE business_id = $1", [b.businessId]);
  await runNotificationJob({ budgetMs: 10_000 });
  row = (await db.query("SELECT status, attempts FROM notification_outbox WHERE business_id = $1", [b.businessId])).rows[0];
  assert.equal(row.status, 'sent');
  assert.equal(row.attempts, 2);
  await runNotificationJob({ budgetMs: 10_000 });
  assert.equal(sent.length, 2, 'una vez enviada no se repite');
});

test('T24: aislamiento entre negocios: un negocio jamás envía a suscriptores de otro (RLS)', async () => {
  const A = await setup(3), B = await setup(3);
  const ca = await customer(A.b.slug, { rewards: true, reminders: true, promotions: true });
  const cb = await customer(B.b.slug, { rewards: true, reminders: true, promotions: true });
  const promo = await B.owner.post('/api/owner/communication/promotions', { title: '2x1 hoy', body: 'Muestra tu tarjeta en caja.' });
  assert.equal(promo.status, 201, JSON.stringify(promo.json));
  assert.equal(promo.json.audience, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, cb.br.endpoint);
  assert.ok(!sent.some((s) => s.url === ca.br.endpoint));
  // Como vlux_app con el negocio B fijado, las suscripciones de A no existen.
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  try {
    await app.query('BEGIN');
    await app.query("SELECT set_config('app.business_id', $1, true)", [B.b.businessId]);
    const seen = (await app.query('SELECT business_id FROM push_subscriptions')).rows;
    assert.ok(seen.length >= 1 && seen.every((r) => r.business_id === B.b.businessId));
    await assert.rejects(app.query("INSERT INTO notification_outbox (business_id, category, template, dedupe_key, title, body, url, expires_at) VALUES ($1,'promotions','promotion','x','t','b','/n/x', now() + interval '1 hour')", [A.b.businessId]), /row-level security/);
    await app.query('ROLLBACK');
  } finally { await app.end(); }
  // El cliente de A no puede suscribirse en B con su tarjeta de A.
  const br = browser();
  assert.equal((await ca.phone.post(`/api/me/${B.b.slug}/push/subscribe`, { endpoint: br.endpoint, keys: br.keys, categories: { rewards: true, reminders: false, promotions: false } })).status, 401);
});

test('T25: el cliente cambia categorías o desactiva todo; un endpoint vencido (410) se desactiva solo', async () => {
  const { b, emp } = await setup(3);
  const c = await customer(b.slug);
  const pref = await c.phone.post(`/api/me/${b.slug}/push/preferences`, { endpoint: c.br.endpoint, categories: { rewards: false, reminders: true, promotions: false } });
  assert.equal(pref.status, 200);
  const cardId = await identify(emp, c.publicCode);
  nextStatus = [410];
  await stamp(emp, cardId);
  await stamp(emp, cardId);
  assert.equal(sent.length, 1, 'progreso (recordatorios) sí');
  const sub = (await db.query("SELECT disabled_at, disabled_reason FROM push_subscriptions WHERE endpoint = $1", [c.br.endpoint])).rows[0];
  assert.ok(sub.disabled_at);
  assert.equal(sub.disabled_reason, 'expired');
  await stamp(emp, cardId);
  assert.equal(sent.length, 1, 'ya no se envía a un endpoint vencido ni a categorías desactivadas');
  // Reactiva y luego "Desactivar todas".
  await c.phone.post(`/api/me/${b.slug}/push/subscribe`, { endpoint: c.br.endpoint, keys: c.br.keys, categories: { rewards: true, reminders: true, promotions: false } });
  const off = await c.phone.post(`/api/me/${b.slug}/push/unsubscribe`, {});
  assert.equal(off.json.subscribed, false);
  assert.equal((await c.phone.post(`/api/me/${b.slug}/push/status`, { endpoint: c.br.endpoint })).json.subscribed, false);
});

test('T26: horas de silencio posponen, tope semanal de recordatorios y máximo 2 promociones en 30 días', async () => {
  const { b, owner, emp } = await setup(3);
  const c = await customer(b.slug, { rewards: true, reminders: true, promotions: true });
  // Silencio todo el día salvo una hora imposible: 0→23 cubre 23 de 24 horas; forzamos con la hora actual.
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  await owner.req('PUT', '/api/owner/communication/settings', { ...NO_QUIET, quietStartHour: h, quietEndHour: (h + 2) % 24 });
  const cardId = await identify(emp, c.publicCode);
  await stamp(emp, cardId);
  await stamp(emp, cardId);
  assert.equal(sent.length, 0, 'en silencio no se envía');
  const q = (await db.query("SELECT status, scheduled_at > now() AS later FROM notification_outbox WHERE business_id = $1", [b.businessId])).rows[0];
  assert.deepEqual(q, { status: 'queued', later: true }, 'pospuesto, no perdido');
  // Tope semanal: con max_per_week = 1 y un recordatorio ya enviado, el siguiente se omite.
  await owner.req('PUT', '/api/owner/communication/settings', { ...NO_QUIET, maxPerWeek: 1 });
  await db.query("UPDATE notification_outbox SET scheduled_at = now() WHERE business_id = $1", [b.businessId]);
  await runNotificationJob({ budgetMs: 10_000 });
  assert.equal(sent.length, 1);
  await db.query("INSERT INTO notification_outbox (business_id, card_id, category, template, dedupe_key, title, body, url, expires_at) VALUES ($1,$2,'reminders','return','manual-test','t','b','/n/x', now() + interval '1 hour')", [b.businessId, cardId]);
  await runNotificationJob({ budgetMs: 10_000 });
  assert.equal(sent.length, 1);
  assert.equal((await db.query("SELECT skip_reason FROM notification_outbox WHERE dedupe_key = 'manual-test'")).rows[0].skip_reason, 'weekly_limit');
  // Promociones: 2 por 30 días.
  for (let i = 0; i < 2; i++) assert.equal((await owner.post('/api/owner/communication/promotions', { title: `Promo ${i}`, body: 'Muestra tu tarjeta.' })).status, 201);
  const third = await owner.post('/api/owner/communication/promotions', { title: 'Promo 3', body: 'Muestra tu tarjeta.' });
  assert.equal(third.status, 429);
  assert.equal(third.json.error.code, 'promotion_limit');
  const ov = (await owner.get('/api/owner/communication')).json;
  assert.deepEqual(ov.promotionsLimit, { used: 2, max: 2 });
  assert.equal(ov.subscribers.promotions, 1);
  assert.ok(!JSON.stringify(ov).includes(c.br.endpoint), 'el dueño ve agregados, nunca endpoints');
});

test('T27: "te extrañamos" una sola vez por ausencia y recordatorio de cita genérico 20–28 h antes; anonimizar apaga avisos', async () => {
  const { b, owner, emp } = await setup(5);
  const c = await customer(b.slug, { rewards: true, reminders: true, promotions: false });
  const cardId = await identify(emp, c.publicCode);
  await stamp(emp, cardId);
  await owner.req('PUT', '/api/owner/communication/settings', { ...NO_QUIET, returnEnabled: true, returnAfterDays: 14, appointmentsEnabled: true, maxPerWeek: 3 });
  await db.query("UPDATE cards SET last_visit_at = now() - interval '20 days' WHERE id = $1", [cardId]);
  const before = sent.length;
  await runNotificationJob({ budgetMs: 10_000 });
  await runNotificationJob({ budgetMs: 10_000 });
  const returns = sent.slice(before).map((s) => c.br.decrypt(s.body)).filter((p) => /te extraña/.test(p.title));
  assert.equal(returns.length, 1, 'una sola vez');
  // Cita: dentro de 24 h → recordatorio con hora, sin motivo.
  const starts = new Date(Date.now() + 24 * 3600_000).toISOString();
  const ap = await owner.post('/api/owner/appointments', { cardCode: c.publicCode, startsAt: starts });
  assert.equal(ap.status, 201, JSON.stringify(ap.json));
  const n0 = sent.length;
  await runNotificationJob({ budgetMs: 10_000 });
  const appt = sent.slice(n0).map((s) => c.br.decrypt(s.body));
  assert.equal(appt.length, 1);
  assert.match(appt[0].title, /tu cita es mañana/);
  assert.match(appt[0].body, /^Te esperamos mañana a las /);
  assert.equal((await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'appointments' AND column_name ~ 'reason|motivo|diagnos|notes|service'")).rowCount, 0, 'sin columnas clínicas');
  // Anonimizar al cliente: sus suscripciones quedan desactivadas.
  const cust = (await db.query('SELECT customer_id FROM cards WHERE id = $1', [cardId])).rows[0].customer_id;
  assert.equal((await owner.post(`/api/owner/customers/${cust}/anonymize`, {})).status, 200);
  assert.equal((await db.query("SELECT disabled_reason FROM push_subscriptions WHERE card_id = $1", [cardId])).rows[0].disabled_reason, 'card_revoked');
});

test('T28–T31: ubicación pública del negocio, cálculo en el teléfono, sin endpoint para la ubicación del cliente', async () => {
  await resetRateLimits();
  const A = (await adminWithMfa(`geo-${randomUUID().slice(0, 6)}@vlux.test`, 'clave-admin-ubicacion-2026')).d;
  const b = await newBusiness();
  const d = (await A.get(`/api/admin/businesses/${b.businessId}`)).json;
  assert.equal(d.location, null, 'sin ubicación por omisión');
  const edit = { name: d.name, vertical: d.vertical, city: d.city, primaryColor: d.primaryColor, accentColor: d.accentColor, cardFinish: d.cardFinish, reviewUrl: d.reviewUrl, logoDataUrl: null, logoFit: null, logoOriginalDataUrl: null };
  assert.equal((await A.req('PATCH', `/api/admin/businesses/${b.businessId}`, { ...edit, location: { lat: 95, lng: 0 } })).status, 422);
  assert.equal((await A.req('PATCH', `/api/admin/businesses/${b.businessId}`, { ...edit, location: { lat: 19.2826, lng: -99.6557 } })).status, 200);
  const pub = await new Device('cliente').get(`/api/public/businesses/${b.slug}`);
  assert.deepEqual(pub.json.business.location, { lat: 19.2826, lng: -99.6557 });
  // Editar sin "location" conserva la ubicación.
  await A.req('PATCH', `/api/admin/businesses/${b.businessId}`, edit);
  assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}`)).json.business.location, { lat: 19.2826, lng: -99.6557 });
  // Permiso de ubicación solo para el propio sitio (nunca para iframes de terceros).
  const res = await new Device('n').req('GET', '/api/health');
  assert.match(res.headers.get('permissions-policy') ?? '', /geolocation=\(self\)/);
  // No existe ninguna ruta para enviar la ubicación del cliente.
  const c = await registerCustomer(b.slug);
  assert.equal((await c.phone.post(`/api/me/${b.slug}/location`, { lat: 19.28, lng: -99.65 })).status, 404);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name IN ('cards','customers','visits','push_subscriptions') AND column_name ~ '^(lat|lng|latitude|longitude|location|geo.*|coords?)$'")).rows[0].n, 0, 'nada guarda ubicación de clientes');
  // Cálculo local: Toluca centro → Metepec centro ≈ 5–8 km.
  const m = distanceMeters({ lat: 19.2826, lng: -99.6557 }, { lat: 19.2513, lng: -99.6047 });
  assert.ok(m > 5000 && m < 8000, String(m));
  assert.equal(describeDistance(80), 'Estás aquí o muy cerca');
  assert.equal(describeDistance(420), 'Estás a unos 400 m');
  void PASSWORD;
});
