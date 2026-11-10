// V0.4.6 · Medición local del motor de notificaciones (NO es una prueba en Supabase ni en Vercel reales).
// Siembra N negocios × C tarjetas con suscripción push, encola un aviso por tarjeta y mide la tarea programada
// con un servicio push SIMULADO (latencia configurable). Nunca sale nada a la red.
// Uso (BD de pruebas desechable):
//   node --env-file=.env.test --import tsx scripts/bench-notificaciones-v046.ts 100 300 40
//   (negocios, tarjetas por negocio, latencia simulada del servicio push en ms)
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { b64u, generateVapidKeys } from '../server/push/webpush';
import { __setPushFetch, runNotificationJob } from '../server/services/notifications';
import { closePool } from '../server/db';

const [N = 10, C = 300, LAT = 40] = process.argv.slice(2).map(Number);
const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 4 });
const k = generateVapidKeys();
Object.assign(process.env, { VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'mailto:bench@vlux.invalid' });
let calls = 0;
__setPushFetch((async () => { calls++; await new Promise((r) => setTimeout(r, LAT)); return new Response(null, { status: 201 }); }) as unknown as typeof fetch);

const ua = createECDH('prime256v1'); ua.generateKeys();
const P256 = b64u.enc(ua.getPublicKey()), AUTH = b64u.enc(randomBytes(16));
const tag = 'bench-' + randomUUID().slice(0, 6);

async function seed() {
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const b = (await admin.query(`INSERT INTO businesses (slug, name, city, vertical, primary_color, accent_color) VALUES ($1, $2, 'Toluca', 'cafeteria', '#2B1B14', '#C9A15B') RETURNING id`, [`${tag}-${i}`, `Bench ${i}`])).rows[0].id;
    await admin.query(`INSERT INTO notification_settings (business_id, quiet_start_hour, quiet_end_hour, max_per_week) VALUES ($1, 0, 0, 3)`, [b]);
    // Clientes, tarjetas, suscripciones y un aviso en cola por tarjeta (SQL masivo).
    await admin.query(
      `WITH c AS (INSERT INTO customers (business_id, display_name, privacy_notice_version, privacy_accepted_at)
                  SELECT $1, 'Cliente ' || g, 'bench', now() FROM generate_series(1, $2) g RETURNING id),
            k AS (INSERT INTO cards (business_id, customer_id, public_code)
                  SELECT $1, c.id, upper(translate(substr(md5(c.id::text), 1, 4), '01', '23')) || '-' || upper(translate(substr(md5(c.id::text), 5, 4), '01', '23')) FROM c
                  ON CONFLICT DO NOTHING RETURNING id),
            s AS (INSERT INTO push_subscriptions (business_id, card_id, endpoint, p256dh, auth, cat_rewards)
                  SELECT $1, k.id, 'https://fcm.googleapis.com/fcm/send/' || k.id, $3, $4, true FROM k RETURNING card_id)
       INSERT INTO notification_outbox (business_id, card_id, category, template, dedupe_key, title, body, url, expires_at)
       SELECT $1, s.card_id, 'rewards', 'reward_ready', 'bench:' || s.card_id, 'Bench: recompensa lista', 'Prueba de carga', '/n/bench', now() + interval '1 day' FROM s`,
      [b, C, P256, AUTH],
    );
  }
  return Date.now() - t0;
}

async function main() {
  const seedMs = await seed();
  const queued = (await admin.query("SELECT count(*)::int AS n FROM notification_outbox o JOIN businesses b ON b.id = o.business_id WHERE b.slug LIKE $1 AND o.status = 'queued'", [`${tag}-%`])).rows[0].n;
  const runs: { ms: number; sent: number; outOfTime: boolean }[] = [];
  let remaining = queued;
  while (remaining > 0 && runs.length < 200) {
    const t = Date.now();
    const r = await runNotificationJob({ budgetMs: 50_000 });
    runs.push({ ms: Date.now() - t, sent: r.sent, outOfTime: r.outOfTime });
    remaining = (await admin.query("SELECT count(*)::int AS n FROM notification_outbox o JOIN businesses b ON b.id = o.business_id WHERE b.slug LIKE $1 AND o.status = 'queued'", [`${tag}-%`])).rows[0].n;
    if (r.sent === 0 && r.processed === 0) break;
  }
  const total = runs.reduce((a, r) => a + r.ms, 0);
  const sent = runs.reduce((a, r) => a + r.sent, 0);
  const size = (await admin.query(`SELECT pg_total_relation_size('push_subscriptions') AS s, pg_total_relation_size('notification_outbox') AS o`)).rows[0];
  console.log(JSON.stringify({ negocios: N, tarjetasPorNegocio: C, latenciaPushMs: LAT, sembradoMs: seedMs, enCola: queued, enviados: sent, llamadasPush: calls,
    ejecuciones: runs.length, msTotal: total, avisosPorSegundo: Math.round((sent / Math.max(1, total)) * 1000), maxMsPorEjecucion: Math.max(...runs.map((r) => r.ms)),
    bytesTablaSuscripciones: Number(size.s), bytesTablaAvisos: Number(size.o), pendientes: remaining }, null, 2));
  // Limpieza: los negocios de prueba se borran en cascada.
  await admin.query("DELETE FROM notification_outbox WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE $1)", [`${tag}-%`]);
  await admin.query("DELETE FROM push_subscriptions WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE $1)", [`${tag}-%`]);
  await admin.query("DELETE FROM notification_settings WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE $1)", [`${tag}-%`]);
  await admin.query("DELETE FROM cards WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE $1)", [`${tag}-%`]);
  await admin.query("DELETE FROM customers WHERE business_id IN (SELECT id FROM businesses WHERE slug LIKE $1)", [`${tag}-%`]);
  await admin.query("DELETE FROM businesses WHERE slug LIKE $1", [`${tag}-%`]);
  await admin.end(); await closePool();
}
main().catch(async (e) => { console.error(e); process.exit(1); });
