// 1.0.x · Tarea INDEPENDIENTE de retención de «Perdí mi acceso» (0017): GET /api/internal/recovery/retention.
// Lo que se demuestra: (1) solo usuarios con secreto de servidor; (2) nunca genera avisos, correos ni push (control
// positivo: la MISMA notificación sí sale por la ruta de avisos); (3) la ruta de avisos ya no toca la retención;
// (4) límites de filas y modo de prueba sin cambios; (5) sin 0017 responde available:false. Todo en base local.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { b64u, generateVapidKeys } from '../../server/push/webpush';
import { __setPushFetch } from '../../server/services/notifications';
import { resetRecoverySchemaCache } from '../../server/services/recovery';
import { Device, identify, key, loggedIn, newBusiness, registerCustomer, withEmployee } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 3 });
const has0017 = (await db.query("SELECT to_regclass('public.recovery_requests') IS NOT NULL AS ok")).rows[0].ok as boolean;
const need0017 = has0017 ? {} : { skip: 'la base no tiene 0017 (caso cubierto por RT-10)' };

const CRON = 'cron-secreto-de-prueba-local-con-mas-de-32-caracteres';
const RET = 'retencion-secreto-de-prueba-local-con-mas-de-32-car';
const saved = { cron: process.env.CRON_SECRET, ret: process.env.RECOVERY_RETENTION_SECRET };

let pushes: string[] = [];
let outbound: string[] = [];
const realFetch = globalThis.fetch;
before(() => {
  const k = generateVapidKeys();
  process.env.VAPID_PUBLIC_KEY = k.publicKey;
  process.env.VAPID_PRIVATE_KEY = k.privateKey;
  process.env.VAPID_SUBJECT = 'mailto:accesos@vlux.com.mx';
  process.env.CRON_SECRET = CRON;
  process.env.RECOVERY_RETENTION_SECRET = RET;
  __setPushFetch((async (url: string) => { pushes.push(url); return new Response(null, { status: 201 }); }) as unknown as typeof fetch);
  // Cualquier salida HTTP (proveedor de correo, WhatsApp, push sin simular) queda registrada y se bloquea.
  globalThis.fetch = (async (u: string | URL | Request) => { outbound.push(String(u instanceof Request ? u.url : u)); return new Response(null, { status: 599 }); }) as typeof fetch;
});
beforeEach(() => { pushes = []; outbound = []; resetRecoverySchemaCache(); });
after(async () => {
  globalThis.fetch = realFetch;
  __setPushFetch(undefined);
  for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) delete process.env[k];
  if (saved.cron === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved.cron;
  if (saved.ret === undefined) delete process.env.RECOVERY_RETENTION_SECRET; else process.env.RECOVERY_RETENTION_SECRET = saved.ret;
  await closePool(); await db.end();
});

const anon = new Device('programador');
const run = (qs = '', token: string | null = RET, extra: Record<string, string> = {}) =>
  anon.req('GET', `/api/internal/recovery/retention${qs}`, undefined, { ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...extra });
const notifRun = () => anon.req('GET', '/api/internal/notifications/run', undefined, { authorization: `Bearer ${CRON}` });

/** Huella de TODO lo que podría producir un mensaje: avisos, correos, suscripciones push y bitácora. */
async function messagingFingerprint() {
  const one = async (sql: string) => (await db.query(sql)).rows[0].h as string;
  return {
    notification_outbox: await one("SELECT md5(coalesce(string_agg(id::text || status || coalesce(sent_at::text,'') || coalesce(skip_reason,''), ',' ORDER BY id), '')) AS h FROM notification_outbox"),
    email_outbox: await one("SELECT md5(coalesce(string_agg(id::text || status, ',' ORDER BY id), '')) AS h FROM email_outbox"),
    push_subscriptions: await one("SELECT md5(coalesce(string_agg(id::text || coalesce(disabled_at::text,'') || coalesce(last_success_at::text,''), ',' ORDER BY id), '')) AS h FROM push_subscriptions"),
  };
}

/** Negocio con un cliente suscrito a push y UNA notificación vencida en cola (lista para enviarse). */
async function businessWithDueNotification() {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const emp = await loggedIn('caja', (await withEmployee(owner)).email);
  const NO_QUIET = { rewardsEnabled: true, progressEnabled: true, progressRemaining: 1, returnEnabled: false, returnAfterDays: 30, appointmentsEnabled: false, quietStartHour: 0, quietEndHour: 0, maxPerWeek: 2 };
  assert.equal((await owner.req('PUT', '/api/owner/communication/settings', NO_QUIET)).status, 200);
  const c = await registerCustomer(b.slug, 'Cliente Retención');
  const ua = createECDH('prime256v1'); ua.generateKeys();
  const sub = await c.phone.post(`/api/me/${b.slug}/push/subscribe`, {
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`, platform: 'android',
    keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(randomBytes(16)) }, categories: { rewards: true, reminders: true, promotions: false },
  });
  assert.equal(sub.status, 200, JSON.stringify(sub.json));
  const cardId = await identify(emp, c.publicCode);
  const dedupe = 'rt-' + key();
  await db.query(`INSERT INTO notification_outbox (business_id, card_id, category, template, dedupe_key, title, body, url, expires_at)
                  VALUES ($1,$2,'reminders','return',$3,'Te esperamos','Vuelve pronto','/n/x', now() + interval '1 hour')`, [b.businessId, cardId, dedupe]);
  return { b, dedupe };
}

/** Solicitudes de recuperación sintéticas: una abierta caducada (debe vencer) y una cerrada hace 91 días (debe borrarse). */
async function seedRecovery(businessId: string) {
  const ins = async (status: string, contact: string, extra: string) => (await db.query(
    `INSERT INTO recovery_requests (business_id, contact, contact_type, contact_hash, status, expires_at${extra ? ', resolved_at' : ''})
     VALUES ($1, $2, 'whatsapp', $3, $4, ${status === 'pending' ? "now() - interval '1 second'" : "now() - interval '100 days'"}${extra ? `, ${extra}` : ''}) RETURNING id`,
    [businessId, contact, randomBytes(32), status])).rows[0].id as string;
  const open = await ins('pending', '7225559999', '');
  const old = await ins('resolved', '******9998', "now() - interval '91 days'");
  return { open, old };
}
const rowState = async (id: string) => (await db.query('SELECT status, contact FROM recovery_requests WHERE id = $1', [id])).rows[0] ?? null;

test('RT-01: sin secreto de servidor no corre: anónimo, token incorrecto, por URL, sin «Bearer» o secreto corto → 401', async () => {
  for (const [qs, token, extra] of [
    ['', null, {}],
    ['', 'x'.repeat(RET.length), {}],
    ['', RET.slice(0, -1) + '!', {}],
    [`?token=${RET}`, null, {}],
    [`?secret=${CRON}`, null, {}],
    ['', null, { authorization: RET }],
    ['', null, { authorization: `bearer ${RET}` }],
    ['', null, { cookie: `token=${RET}` }],
  ] as Array<[string, string | null, Record<string, string>]>) {
    const r = await run(qs, token, extra);
    assert.equal(r.status, 401, `${qs} ${token} ${JSON.stringify(extra)}`);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  // Secretos mal configurados (<32) = cerrado, aunque el token coincida.
  process.env.RECOVERY_RETENTION_SECRET = 'corto-de-31-caracteres-aaaaaaaa'; process.env.CRON_SECRET = '';
  assert.equal((await run('', 'corto-de-31-caracteres-aaaaaaaa')).status, 401);
  process.env.RECOVERY_RETENTION_SECRET = RET; process.env.CRON_SECRET = CRON;
  // Sesiones de personal tampoco sirven (no es una ruta de usuario).
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  assert.equal((await owner.get('/api/internal/recovery/retention')).status, 401);
});

test('RT-02: el secreto dedicado NO abre la ruta de avisos; CRON_SECRET (el que envía Vercel Schedules) abre ambas', async () => {
  assert.equal((await anon.req('GET', '/api/internal/notifications/run', undefined, { authorization: `Bearer ${RET}` })).status, 401);
  assert.equal((await run('?dryRun=1', RET)).status, 200);
  assert.equal((await run('?dryRun=1', CRON)).status, 200);
});

test('RT-03: la retención NO genera avisos, correos ni push; la misma notificación SÍ sale por la ruta de avisos (control)', need0017, async () => {
  const { b, dedupe } = await businessWithDueNotification();
  const { open, old } = await seedRecovery(b.businessId);
  const before = await messagingFingerprint();
  const r = await run('?limit=2000');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.available, true);
  assert.equal(r.json.dryRun, false);
  assert.ok(r.json.expired >= 1 && r.json.deleted >= 1, JSON.stringify(r.json));
  assert.deepEqual(Object.keys(r.json).sort(), ['available', 'busy', 'deleted', 'dryRun', 'expired', 'limit', 'ms']);
  // Retención aplicada…
  assert.deepEqual(await rowState(open), { status: 'expired', contact: '******9999' });
  assert.equal(await rowState(old), null);
  // …y ningún mensaje: tablas de mensajería idénticas, cero push, cero HTTP saliente.
  assert.deepEqual(await messagingFingerprint(), before);
  assert.deepEqual(pushes, []);
  assert.deepEqual(outbound, []);
  assert.equal((await db.query('SELECT status FROM notification_outbox WHERE dedupe_key = $1', [dedupe])).rows[0].status, 'queued');
  // Control positivo: la notificación SÍ estaba lista; la ruta de avisos la envía (prueba que la anterior no la omitió por azar).
  const n = await notifRun();
  assert.equal(n.status, 200);
  assert.ok(n.json.sent >= 1, JSON.stringify(n.json));
  assert.ok(pushes.length >= 1);
  assert.notEqual((await db.query('SELECT status FROM notification_outbox WHERE dedupe_key = $1', [dedupe])).rows[0].status, 'queued');
});

test('RT-04: la ruta de avisos ya NO ejecuta la retención (respuesta sin recoveryRetention y filas intactas)', need0017, async () => {
  const b = await newBusiness();
  const { open, old } = await seedRecovery(b.businessId);
  const n = await notifRun();
  assert.equal(n.status, 200);
  assert.ok(!('recoveryRetention' in n.json), JSON.stringify(n.json));
  assert.deepEqual(await rowState(open), { status: 'pending', contact: '7225559999' });
  assert.ok(await rowState(old));
  await run('?limit=2000'); // limpieza
});

test('RT-05: dryRun ejecuta el barrido y lo DESHACE: cuenta lo que haría sin cambiar ninguna fila', need0017, async () => {
  const b = await newBusiness();
  const { open, old } = await seedRecovery(b.businessId);
  const snap = async () => (await db.query("SELECT md5(coalesce(string_agg(id::text || status || contact || coalesce(resolved_at::text,'') || encode(contact_hash,'hex'), ',' ORDER BY id), '')) AS h, count(*)::int AS n FROM recovery_requests")).rows[0];
  const s0 = await snap();
  const before = await messagingFingerprint();
  const r = await run('?dryRun=1&limit=2000');
  assert.equal(r.status, 200);
  assert.equal(r.json.dryRun, true);
  assert.ok(r.json.expired >= 1 && r.json.deleted >= 1, JSON.stringify(r.json));
  assert.deepEqual(await snap(), s0, 'ninguna fila cambió');
  assert.deepEqual(await rowState(open), { status: 'pending', contact: '7225559999' });
  assert.ok(await rowState(old));
  assert.deepEqual(await messagingFingerprint(), before);
  // Repetible: mismo resultado en la segunda corrida de prueba; la real aplica lo mismo.
  const r2 = await run('?dryRun=true&limit=2000');
  assert.deepEqual([r2.json.expired, r2.json.deleted], [r.json.expired, r.json.deleted]);
  const real = await run('?limit=2000');
  assert.deepEqual([real.json.expired, real.json.deleted], [r.json.expired, r.json.deleted]);
});

test('RT-06: límite de filas: 1..2000 (500 por omisión); fuera de rango o no entero → 422 sin ejecutar', need0017, async () => {
  for (const bad of ['0', '-1', '2001', '1.5', 'abc', '', '1e3x']) {
    const r = await run(`?limit=${encodeURIComponent(bad)}`);
    assert.equal(r.status, 422, bad);
    assert.equal(r.json.error.code, 'invalid_limit');
  }
  assert.equal((await run('?dryRun=quiza')).status, 422);
  assert.equal((await run('?dryRun=1')).json.limit, 500);
  // Con limit=1 cada pasada procesa como máximo 1 vencida y 1 borrada.
  const b = await newBusiness();
  await seedRecovery(b.businessId); await seedRecovery(b.businessId);
  const r = await run('?limit=1');
  assert.equal(r.status, 200);
  assert.ok(r.json.expired <= 1 && r.json.deleted <= 1, JSON.stringify(r.json));
  await run('?limit=2000');
  const left = (await db.query("SELECT count(*)::int AS n FROM recovery_requests WHERE business_id = $1 AND (status = 'pending' OR resolved_at < now() - interval '90 days')", [b.businessId])).rows[0].n;
  assert.equal(left, 0);
});

test('RT-07: tiempo acotado y sin solapes: si otro barrido corre, responde busy sin esperar ni tocar datos', need0017, async () => {
  const b = await newBusiness();
  const { open } = await seedRecovery(b.businessId);
  const holder = await db.connect();
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT pg_advisory_xact_lock(hashtext('vlux.recovery_retention_sweep'))");
    const t0 = Date.now();
    const r = await run('?limit=2000');
    assert.equal(r.status, 200);
    assert.deepEqual([r.json.busy, r.json.expired, r.json.deleted], [true, 0, 0]);
    assert.ok(Date.now() - t0 < 2000, 'no espera el candado');
    assert.deepEqual(await rowState(open), { status: 'pending', contact: '7225559999' });
  } finally { await holder.query('ROLLBACK'); holder.release(); }
  // Fila bloqueada por otra transacción: lock_timeout 1 s → falla rápido (500 controlado), sin colgar la función.
  const locker = await db.connect();
  try {
    await locker.query('BEGIN');
    await locker.query('SELECT 1 FROM recovery_requests WHERE id = $1 FOR UPDATE', [open]);
    const t0 = Date.now();
    const r = await run('?limit=2000');
    assert.ok(Date.now() - t0 < 4000, `terminó en ${Date.now() - t0} ms`);
    assert.ok(r.status === 500 || r.status === 503, `status ${r.status}`);
  } finally { await locker.query('ROLLBACK'); locker.release(); }
  assert.equal((await run('?limit=2000')).json.busy, false);
});

test('RT-08: con 0016 corre con alcance «worker» (sin alcance la función se niega)', need0017, async () => {
  const has0016 = (await db.query("SELECT to_regprocedure('public.require_scope(text)') IS NOT NULL AS ok")).rows[0].ok;
  const r = await run('?dryRun=1');
  assert.equal(r.status, 200);
  assert.equal(r.json.available, true);
  if (has0016) {
    const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await app.connect();
    try { await assert.rejects(app.query('SELECT recovery_retention_sweep(10)'), /alcance de trabajo requerido/); } finally { await app.end(); }
  }
});

test('RT-09: aislamiento de código: la ruta y el servicio de retención no usan avisos, correo ni push', async () => {
  // Garantía estática: el módulo de recuperación no importa el motor de notificaciones ni el correo.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../server/services/recovery.ts', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/notifications'|from '\.\.\/push|from '\.\.\/email|runNotificationJob|sendEmail/.test(src));
  const app = readFileSync(new URL('../../server/app.ts', import.meta.url), 'utf8');
  const route = app.slice(app.indexOf("api.get('/internal/recovery/retention'"), app.indexOf("// ---------- PWA: vincular"));
  assert.ok(route.length > 100 && !/runNotificationJob|dispatch|sendEmail|webpush/i.test(route));
});

test('RT-10: compatibilidad: sin 0017 responde available:false (200) y no falla; con 0017 available:true', async () => {
  const r = await run('?dryRun=1');
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.available, has0017);
  assert.deepEqual(pushes, []);
  assert.deepEqual(outbound, []);
});
