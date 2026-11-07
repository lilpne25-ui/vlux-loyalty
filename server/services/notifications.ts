// V0.4.6 · VLUX NOTIFICATION ENGINE. Notificaciones Web Push por negocio, siempre con consentimiento.
// Reglas:
// - Nada se suscribe solo: el cliente toca un botón, el navegador pide permiso y el cliente elige categorías.
// - Categorías separadas: recompensas (operativo), recordatorios y promociones (comerciales, desactivadas por omisión).
// - Cada negocio solo puede enviar a las suscripciones de SUS tarjetas (RLS + business_id en cada consulta).
// - Límites: deduplicación por llave, horas de silencio, máximo semanal por tarjeta para recordatorios,
//   máximo de promociones por mes por negocio, caducidad de cada aviso y reintentos acotados.
// - El contenido no lleva datos sensibles: nombre del negocio, recompensa del programa y un enlace a la tarjeta.
import { z } from 'zod';
import { withTenant, getPool, type Tx } from '../db';
import { config } from '../config';
import { AppError, notFound } from '../errors';
import { audit } from './audit';
import type { StaffSession } from './auth';
import { isAllowedPushEndpoint, sendPush, vapidFromEnv, type VapidConfig } from '../push/webpush';

const TZ = 'America/Mexico_City';
const MAX_ATTEMPTS = 3;
export const PROMOTIONS_PER_30_DAYS = 2;

export type Category = 'rewards' | 'reminders' | 'promotions';
type Template = 'reward_ready' | 'progress' | 'return' | 'promotion' | 'appointment';
const catColumn: Record<Category, string> = { rewards: 'cat_rewards', reminders: 'cat_reminders', promotions: 'cat_promotions' };

// ---------- Configuración ----------
let fetchOverride: typeof fetch | undefined;
/** Solo pruebas: sustituye la red por un servicio push simulado. */
export function __setPushFetch(f: typeof fetch | undefined) { fetchOverride = f; }

export function pushConfig(): VapidConfig | null { return vapidFromEnv(); }
function extraHosts() {
  // Hosts adicionales SOLO fuera de producción (pruebas con un servicio push simulado).
  if (config.isProduction) return [];
  return (process.env.PUSH_TEST_ENDPOINT_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean);
}
export function publicPushConfig() {
  const v = pushConfig();
  return v ? { enabled: true, publicKey: v.publicKey } : { enabled: false, publicKey: null };
}

// ---------- Ajustes del negocio ----------
export const settingsSchema = z.object({
  rewardsEnabled: z.boolean(),
  progressEnabled: z.boolean(),
  progressRemaining: z.number().int().min(1).max(3),
  returnEnabled: z.boolean(),
  returnAfterDays: z.number().int().min(14).max(180),
  appointmentsEnabled: z.boolean(),
  quietStartHour: z.number().int().min(0).max(23),
  quietEndHour: z.number().int().min(0).max(23),
  maxPerWeek: z.number().int().min(1).max(3),
}).strict();
export type NotificationSettings = z.infer<typeof settingsSchema>;
const DEFAULTS: NotificationSettings = { rewardsEnabled: true, progressEnabled: true, progressRemaining: 1, returnEnabled: false, returnAfterDays: 30, appointmentsEnabled: false, quietStartHour: 21, quietEndHour: 9, maxPerWeek: 2 };

export async function loadSettings(tx: Tx): Promise<NotificationSettings> {
  const r = (await tx.query('SELECT * FROM notification_settings')).rows[0];
  if (!r) return { ...DEFAULTS };
  return { rewardsEnabled: r.rewards_enabled, progressEnabled: r.progress_enabled, progressRemaining: r.progress_remaining, returnEnabled: r.return_enabled, returnAfterDays: r.return_after_days, appointmentsEnabled: r.appointments_enabled, quietStartHour: r.quiet_start_hour, quietEndHour: r.quiet_end_hour, maxPerWeek: r.max_per_week };
}

export async function updateSettings(session: StaffSession, raw: unknown) {
  const s = settingsSchema.parse(raw);
  return withTenant(session.businessId, async (tx) => {
    await tx.query(
      `INSERT INTO notification_settings (business_id, rewards_enabled, progress_enabled, progress_remaining, return_enabled, return_after_days, appointments_enabled, quiet_start_hour, quiet_end_hour, max_per_week, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       ON CONFLICT (business_id) DO UPDATE SET rewards_enabled = EXCLUDED.rewards_enabled, progress_enabled = EXCLUDED.progress_enabled, progress_remaining = EXCLUDED.progress_remaining,
         return_enabled = EXCLUDED.return_enabled, return_after_days = EXCLUDED.return_after_days, appointments_enabled = EXCLUDED.appointments_enabled,
         quiet_start_hour = EXCLUDED.quiet_start_hour, quiet_end_hour = EXCLUDED.quiet_end_hour, max_per_week = EXCLUDED.max_per_week, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [session.businessId, s.rewardsEnabled, s.progressEnabled, s.progressRemaining, s.returnEnabled, s.returnAfterDays, s.appointmentsEnabled, s.quietStartHour, s.quietEndHour, s.maxPerWeek, session.userId],
    );
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'notifications.settings_updated', null, null, s);
    return { settings: s };
  });
}

// ---------- Suscripciones del cliente ----------
type CardRef = { businessId: string; cardId: string };
const b64url = /^[A-Za-z0-9_-]+=*$/;
export const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(80).max(100).regex(b64url), auth: z.string().min(16).max(32).regex(b64url) }),
  categories: z.object({ rewards: z.boolean(), reminders: z.boolean(), promotions: z.boolean() }).strict(),
  platform: z.enum(['ios', 'android', 'desktop', 'otro']).default('otro'),
}).strict();
const prefsSchema = z.object({ endpoint: z.string().url().max(1000), categories: z.object({ rewards: z.boolean(), reminders: z.boolean(), promotions: z.boolean() }).strict() }).strict();
const endpointSchema = z.object({ endpoint: z.string().url().max(1000) }).strict();

export async function subscribe(ref: CardRef, raw: unknown) {
  const input = subscribeSchema.parse(raw);
  if (!pushConfig()) throw new AppError(409, 'push_disabled', 'Las notificaciones aún no están disponibles en este servicio.');
  if (!isAllowedPushEndpoint(input.endpoint, extraHosts())) throw new AppError(422, 'push_endpoint', 'Este navegador entregó una dirección de notificaciones que no reconocemos.');
  const c = input.categories;
  if (!c.rewards && !c.reminders && !c.promotions) throw new AppError(422, 'no_categories', 'Elige al menos un tipo de aviso o desactiva las notificaciones.');
  return withTenant(ref.businessId, async (tx) => {
    const card = (await tx.query("SELECT status FROM cards WHERE id = $1", [ref.cardId])).rows[0];
    if (!card || card.status !== 'active') throw notFound('Tarjeta');
    // Un mismo dispositivo (endpoint) pertenece a una sola tarjeta del negocio: si cambia de tarjeta, se reasigna.
    const r = await tx.query(
      `INSERT INTO push_subscriptions (business_id, card_id, endpoint, p256dh, auth, cat_rewards, cat_reminders, cat_promotions, platform, consented_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (business_id, endpoint) DO UPDATE SET card_id = EXCLUDED.card_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
         cat_rewards = EXCLUDED.cat_rewards, cat_reminders = EXCLUDED.cat_reminders, cat_promotions = EXCLUDED.cat_promotions, platform = EXCLUDED.platform,
         consented_at = now(), disabled_at = NULL, disabled_reason = NULL, failures = 0
       RETURNING id`,
      [ref.businessId, ref.cardId, input.endpoint, input.keys.p256dh, input.keys.auth, c.rewards, c.reminders, c.promotions, input.platform],
    );
    // La auditoría registra categorías y plataforma; nunca el endpoint ni las llaves.
    await audit(tx, ref.businessId, { type: 'customer', id: ref.cardId }, 'push.subscribed', 'push_subscription', r.rows[0].id, { categories: c, platform: input.platform });
    return { subscribed: true, categories: c };
  });
}

export async function updatePreferences(ref: CardRef, raw: unknown) {
  const input = prefsSchema.parse(raw);
  const c = input.categories;
  if (!c.rewards && !c.reminders && !c.promotions) return unsubscribe(ref, { endpoint: input.endpoint });
  return withTenant(ref.businessId, async (tx) => {
    const r = await tx.query(
      'UPDATE push_subscriptions SET cat_rewards = $3, cat_reminders = $4, cat_promotions = $5 WHERE card_id = $1 AND endpoint = $2 AND disabled_at IS NULL RETURNING id',
      [ref.cardId, input.endpoint, c.rewards, c.reminders, c.promotions],
    );
    if (!r.rowCount) throw notFound('Suscripción');
    await audit(tx, ref.businessId, { type: 'customer', id: ref.cardId }, 'push.preferences_updated', 'push_subscription', r.rows[0].id, { categories: c });
    return { subscribed: true, categories: c };
  });
}

/** Desactiva este dispositivo, o todos los de la tarjeta si no se indica endpoint ("Desactivar todas"). */
export async function unsubscribe(ref: CardRef, raw: unknown) {
  const body = (raw ?? {}) as { endpoint?: unknown };
  const endpoint = body.endpoint === undefined ? null : endpointSchema.parse(raw).endpoint;
  return withTenant(ref.businessId, async (tx) => {
    const r = await tx.query(
      `UPDATE push_subscriptions SET disabled_at = now(), disabled_reason = 'unsubscribed' WHERE card_id = $1 AND disabled_at IS NULL AND ($2::text IS NULL OR endpoint = $2)`,
      [ref.cardId, endpoint],
    );
    await audit(tx, ref.businessId, { type: 'customer', id: ref.cardId }, 'push.unsubscribed', null, null, { devices: r.rowCount, all: endpoint === null });
    return { subscribed: false, devices: r.rowCount ?? 0 };
  });
}

export async function subscriptionStatus(ref: CardRef, raw: unknown) {
  const { endpoint } = endpointSchema.parse(raw);
  return withTenant(ref.businessId, async (tx) => {
    const r = (await tx.query('SELECT cat_rewards, cat_reminders, cat_promotions FROM push_subscriptions WHERE card_id = $1 AND endpoint = $2 AND disabled_at IS NULL', [ref.cardId, endpoint])).rows[0];
    const others = (await tx.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE card_id = $1 AND disabled_at IS NULL AND endpoint <> $2', [ref.cardId, endpoint])).rows[0].n as number;
    return { subscribed: !!r, categories: r ? { rewards: r.cat_rewards, reminders: r.cat_reminders, promotions: r.cat_promotions } : null, otherDevices: others };
  });
}

// ---------- Encolado ----------
async function businessInfo(tx: Tx) {
  const b = (await tx.query("SELECT id, name, slug FROM businesses WHERE id = current_business_id()")).rows[0];
  return { id: b.id as string, name: b.name as string, slug: b.slug as string };
}
const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

async function hasSubscriber(tx: Tx, cardId: string, category: Category) {
  return !!(await tx.query(`SELECT 1 FROM push_subscriptions WHERE card_id = $1 AND disabled_at IS NULL AND ${catColumn[category]}`, [cardId])).rowCount;
}

async function enqueue(tx: Tx, n: { businessId: string; cardId: string | null; category: Category; template: Template; dedupeKey: string; title: string; body: string; url: string; expiresHours: number; scheduledAt?: Date; createdBy?: string | null }) {
  const r = await tx.query(
    `INSERT INTO notification_outbox (business_id, card_id, category, template, dedupe_key, title, body, url, scheduled_at, expires_at, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, now()), coalesce($9, now()) + make_interval(hours => $10), $11)
     ON CONFLICT (business_id, dedupe_key) DO NOTHING RETURNING id`,
    [n.businessId, n.cardId, n.category, n.template, n.dedupeKey, clip(n.title, 60), clip(n.body, 180), n.url, n.scheduledAt ?? null, n.expiresHours, n.createdBy ?? null],
  );
  return r.rows[0]?.id as string | undefined;
}

/**
 * Se llama dentro de la transacción de la compra o el canje (tarjeta ya bloqueada). Solo encola si la tarjeta tiene
 * al menos un dispositivo suscrito a esa categoría: así no se generan filas para quien no quiere avisos.
 */
export async function enqueueAfterStamps(tx: Tx, businessId: string, cardId: string, rule: { stampsRequired: number; rewardDescription: string }, unlocked: { id: string } | null) {
  if (!pushConfig()) return [] as string[];
  const s = await loadSettings(tx);
  const out: string[] = [];
  const b = await businessInfo(tx);
  const url = `/n/${b.slug}`;
  if (unlocked && s.rewardsEnabled && (await hasSubscriber(tx, cardId, 'rewards'))) {
    const id = await enqueue(tx, { businessId, cardId, category: 'rewards', template: 'reward_ready', dedupeKey: `reward:${unlocked.id}`, title: clip(`${b.name}: recompensa lista`, 60), body: clip(`Ya tienes tu recompensa: ${rule.rewardDescription}. Muestra tu tarjeta en tu próxima visita.`, 180), url, expiresHours: 72 });
    if (id) out.push(id);
    return out;
  }
  if (!unlocked && s.progressEnabled) {
    const card = (await tx.query('SELECT stamp_balance, cycle FROM cards WHERE id = $1', [cardId])).rows[0];
    const remaining = rule.stampsRequired - card.stamp_balance;
    if (remaining >= 1 && remaining === s.progressRemaining && (await hasSubscriber(tx, cardId, 'reminders'))) {
      const word = remaining === 1 ? 'visita' : 'visitas';
      const id = await enqueue(tx, { businessId, cardId, category: 'reminders', template: 'progress', dedupeKey: `progress:${cardId}:${card.cycle}:${remaining}`, title: clip(`${b.name}: casi lo logras`, 60), body: clip(`Te ${remaining === 1 ? 'falta' : 'faltan'} ${remaining} ${word} para tu recompensa: ${rule.rewardDescription}.`, 180), url, expiresHours: 48 });
      if (id) out.push(id);
    }
  }
  return out;
}

/** Promoción autorizada por el dueño: solo a quien eligió "Promociones". Máximo PROMOTIONS_PER_30_DAYS por negocio. */
export const promotionSchema = z.object({ title: z.string().trim().min(3).max(60), body: z.string().trim().min(5).max(160) }).strict();
export async function createPromotion(session: StaffSession, raw: unknown) {
  if (!pushConfig()) throw new AppError(409, 'push_disabled', 'Las notificaciones aún no están configuradas en este servicio.');
  const input = promotionSchema.parse(raw);
  return withTenant(session.businessId, async (tx) => {
    // Serializa las promociones del negocio para que dos envíos simultáneos no rebasen el límite.
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`promo:${session.businessId}`]);
    const used = (await tx.query("SELECT count(*)::int AS n FROM notification_outbox WHERE template = 'promotion' AND created_at > now() - interval '30 days' AND status <> 'skipped'")).rows[0].n as number;
    if (used >= PROMOTIONS_PER_30_DAYS) throw new AppError(429, 'promotion_limit', `Ya enviaste ${PROMOTIONS_PER_30_DAYS} promociones en los últimos 30 días. Así evitamos que tus clientes desactiven los avisos.`);
    const audience = (await tx.query("SELECT count(DISTINCT card_id)::int AS n FROM push_subscriptions s JOIN cards c ON c.id = s.card_id WHERE s.disabled_at IS NULL AND s.cat_promotions AND c.status = 'active'")).rows[0].n as number;
    if (!audience) throw new AppError(409, 'no_audience', 'Todavía ningún cliente aceptó recibir promociones. Nadie recibiría este aviso.');
    const b = await businessInfo(tx);
    const id = await enqueue(tx, { businessId: session.businessId, cardId: null, category: 'promotions', template: 'promotion', dedupeKey: `promotion:${Date.now()}:${session.userId}`, title: clip(`${b.name}: ${input.title}`, 60), body: input.body, url: `/n/${b.slug}`, expiresHours: 48, createdBy: session.userId });
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'notifications.promotion_created', 'notification', id ?? null, { audience });
    return { notificationId: id, audience };
  });
}

// ---------- Citas (preparación; sin datos clínicos) ----------
export const appointmentSchema = z.object({ cardCode: z.string().trim().toUpperCase().regex(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/), startsAt: z.string().datetime({ offset: true }) }).strict();
export async function createAppointment(session: StaffSession, raw: unknown) {
  const input = appointmentSchema.parse(raw);
  const starts = new Date(input.startsAt);
  if (starts.getTime() < Date.now() + 10 * 60_000 || starts.getTime() > Date.now() + 180 * 86400_000) throw new AppError(422, 'validation', 'La cita debe ser futura (máximo 6 meses).');
  return withTenant(session.businessId, async (tx) => {
    const card = (await tx.query("SELECT id FROM cards WHERE public_code = $1 AND status = 'active'", [input.cardCode])).rows[0];
    if (!card) throw notFound('Tarjeta');
    const r = await tx.query("INSERT INTO appointments (business_id, card_id, starts_at, source, created_by) VALUES ($1,$2,$3,'manual',$4) RETURNING id", [session.businessId, card.id, starts, session.userId]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'appointment.created', 'appointment', r.rows[0].id, { source: 'manual' });
    return { appointmentId: r.rows[0].id as string, startsAt: starts.toISOString() };
  });
}
export async function cancelAppointment(session: StaffSession, id: string) {
  return withTenant(session.businessId, async (tx) => {
    const r = await tx.query("UPDATE appointments SET status = 'cancelled' WHERE id = $1 AND status = 'confirmed' RETURNING id", [id]);
    if (!r.rowCount) throw notFound('Cita');
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'appointment.cancelled', 'appointment', id);
    return { cancelled: true };
  });
}

/** Recordatorios programados de un negocio: regreso (una vez por ausencia) y citas confirmadas (20–28 h antes). */
export async function scheduleDue(tx: Tx, businessId: string) {
  const s = await loadSettings(tx);
  const b = await businessInfo(tx);
  let queued = 0;
  if (s.returnEnabled) {
    const rows = (await tx.query(
      `SELECT c.id, extract(epoch FROM c.last_visit_at)::bigint AS lv FROM cards c
        WHERE c.status = 'active' AND c.last_visit_at < now() - make_interval(days => $1)
          AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.card_id = c.id AND s.disabled_at IS NULL AND s.cat_reminders)
          AND NOT EXISTS (SELECT 1 FROM notification_outbox o WHERE o.card_id = c.id AND o.dedupe_key = 'return:' || c.id || ':' || extract(epoch FROM c.last_visit_at)::bigint)
        LIMIT 500`, [s.returnAfterDays],
    )).rows;
    for (const r of rows) {
      if (await enqueue(tx, { businessId, cardId: r.id, category: 'reminders', template: 'return', dedupeKey: `return:${r.id}:${r.lv}`, title: clip(`${b.name} te extraña`, 60), body: 'Tu tarjeta sigue guardando tus visitas. Cuando vuelvas, muéstrala en caja.', url: `/n/${b.slug}`, expiresHours: 72 })) queued++;
    }
  }
  if (s.appointmentsEnabled) {
    const rows = (await tx.query(
      `SELECT a.id, a.card_id, a.starts_at FROM appointments a JOIN cards c ON c.id = a.card_id
        WHERE a.status = 'confirmed' AND a.reminder_sent_at IS NULL AND c.status = 'active'
          AND a.starts_at BETWEEN now() + interval '20 hours' AND now() + interval '28 hours'
          AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.card_id = a.card_id AND s.disabled_at IS NULL AND s.cat_reminders)
        LIMIT 500`,
    )).rows;
    for (const r of rows) {
      const hour = new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(r.starts_at));
      // Recordatorio genérico: solo hora y negocio. Nunca motivo, servicio ni datos de salud.
      if (await enqueue(tx, { businessId, cardId: r.card_id, category: 'reminders', template: 'appointment', dedupeKey: `appt:${r.id}`, title: clip(`${b.name}: tu cita es mañana`, 60), body: `Te esperamos mañana a las ${hour}.`, url: `/n/${b.slug}`, expiresHours: 20 })) queued++;
      await tx.query('UPDATE appointments SET reminder_sent_at = now() WHERE id = $1', [r.id]);
    }
  }
  return queued;
}

// ---------- Envío ----------
function mxHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' }).format(d));
}
export function inQuietHours(hour: number, start: number, end: number) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
/** Siguiente momento fuera de horas de silencio (en punto, hora del centro de México). */
function quietEnd(now: Date, end: number) {
  const h = mxHour(now);
  const hoursAhead = ((end - h) + 24) % 24 || 24;
  const t = new Date(now.getTime() + hoursAhead * 3600_000);
  t.setUTCMinutes(0, 0, 0);
  return t;
}

type Claimed = { id: string; card_id: string | null; category: Category; template: Template; title: string; body: string; url: string; attempts: number; expired: boolean };

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}

/**
 * Envía los avisos pendientes de un negocio. El reclamo usa FOR UPDATE SKIP LOCKED para que dos ejecuciones
 * simultáneas no envíen el mismo aviso. Las llamadas de red ocurren FUERA de la transacción.
 */
export async function dispatchBusiness(businessId: string, opts: { cardId?: string; limit?: number; budgetMs?: number; now?: Date } = {}) {
  const v = pushConfig();
  const result = { sent: 0, failed: 0, skipped: 0, postponed: 0, expired: 0 };
  if (!v) return result;
  const started = Date.now();
  const now = opts.now ?? new Date();
  const claimed = await withTenant(businessId, async (tx) => {
    const s = await loadSettings(tx);
    const rows = (await tx.query(
      `SELECT id, card_id, category, template, title, body, url, attempts, expires_at <= now() AS expired FROM notification_outbox
        WHERE status = 'queued' AND scheduled_at <= now() AND ($1::uuid IS NULL OR card_id = $1)
        ORDER BY scheduled_at LIMIT $2 FOR UPDATE SKIP LOCKED`, [opts.cardId ?? null, opts.limit ?? 50],
    )).rows as Claimed[];
    const ready: Claimed[] = [];
    const quiet = inQuietHours(mxHour(now), s.quietStartHour, s.quietEndHour);
    for (const n of rows) {
      if (n.expired) { await tx.query("UPDATE notification_outbox SET status = 'expired' WHERE id = $1", [n.id]); result.expired++; continue; }
      // Horas de silencio: recordatorios y promociones esperan; "recompensa lista" también, salvo que caduque antes.
      if (quiet) { await tx.query('UPDATE notification_outbox SET scheduled_at = $2 WHERE id = $1', [n.id, quietEnd(now, s.quietEndHour)]); result.postponed++; continue; }
      if (n.card_id && n.category !== 'rewards') {
        const week = (await tx.query("SELECT count(*)::int AS n FROM notification_outbox WHERE card_id = $1 AND category <> 'rewards' AND status IN ('sent','partial') AND sent_at > now() - interval '7 days'", [n.card_id])).rows[0].n as number;
        if (week >= s.maxPerWeek) { await tx.query("UPDATE notification_outbox SET status = 'skipped', skip_reason = 'weekly_limit' WHERE id = $1", [n.id]); result.skipped++; continue; }
      }
      await tx.query("UPDATE notification_outbox SET status = 'sending', attempts = attempts + 1 WHERE id = $1", [n.id]);
      ready.push(n);
    }
    const slug = (await businessInfo(tx)).slug;
    return { ready, slug };
  });

  for (const n of claimed.ready) {
    if (opts.budgetMs && Date.now() - started > opts.budgetMs) {
      // Sin tiempo: vuelve a la cola para la siguiente ejecución.
      await withTenant(businessId, (tx) => tx.query("UPDATE notification_outbox SET status = 'queued', attempts = greatest(0, attempts - 1) WHERE id = $1", [n.id]));
      continue;
    }
    const subs = await withTenant(businessId, async (tx) => (await tx.query(
      `SELECT s.id, s.endpoint, s.p256dh, s.auth FROM push_subscriptions s JOIN cards c ON c.id = s.card_id
        WHERE s.disabled_at IS NULL AND c.status = 'active' AND ${catColumn[n.category]} AND ($1::uuid IS NULL OR s.card_id = $1) LIMIT 5000`, [n.card_id],
    )).rows as { id: string; endpoint: string; p256dh: string; auth: string }[]);
    if (!subs.length) {
      await withTenant(businessId, (tx) => tx.query("UPDATE notification_outbox SET status = 'skipped', skip_reason = 'no_subscribers' WHERE id = $1", [n.id]));
      result.skipped++;
      continue;
    }
    const payload = { title: n.title, body: n.body, url: n.url, tag: `${n.template}`, icon: `/api/pwa/${claimed.slug}/icon/192.png` };
    const ttl = n.template === 'appointment' ? 12 * 3600 : 24 * 3600;
    const results = await mapLimit(subs, 8, async (sub) => {
      if (!isAllowedPushEndpoint(sub.endpoint, extraHosts())) return { sub, r: { ok: false as const, status: 0, gone: true, retryable: false, error: 'endpoint no permitido' } };
      return { sub, r: await sendPush(sub, payload, v, { ttlSeconds: ttl, urgency: n.category === 'rewards' ? 'normal' : 'low', topic: n.template, fetchImpl: fetchOverride }) };
    });
    const ok = results.filter((x) => x.r.ok).length;
    const bad = results.length - ok;
    const retryable = results.some((x) => !x.r.ok && x.r.retryable);
    await withTenant(businessId, async (tx) => {
      for (const { sub, r } of results) {
        if (r.ok) await tx.query('UPDATE push_subscriptions SET last_success_at = now(), failures = 0 WHERE id = $1', [sub.id]);
        else if (r.gone) await tx.query("UPDATE push_subscriptions SET disabled_at = now(), disabled_reason = 'expired' WHERE id = $1", [sub.id]);
        else await tx.query("UPDATE push_subscriptions SET failures = failures + 1, disabled_at = CASE WHEN failures + 1 >= 10 THEN now() END, disabled_reason = CASE WHEN failures + 1 >= 10 THEN 'invalid' END WHERE id = $1", [sub.id]);
      }
      const lastError = results.find((x) => !x.r.ok)?.r;
      if (ok === 0 && retryable && n.attempts + 1 < MAX_ATTEMPTS) {
        await tx.query("UPDATE notification_outbox SET status = 'queued', scheduled_at = now() + make_interval(mins => $2), last_error = $3 WHERE id = $1", [n.id, 5 * (n.attempts + 1), lastError && !lastError.ok ? lastError.error.slice(0, 200) : null]);
      } else {
        const status = ok === 0 ? 'failed' : bad === 0 ? 'sent' : 'partial';
        await tx.query('UPDATE notification_outbox SET status = $2, sent_at = CASE WHEN $3 > 0 THEN now() END, devices_sent = $3, devices_failed = $4, last_error = $5 WHERE id = $1',
          [n.id, status, ok, bad, lastError && !lastError.ok ? lastError.error.slice(0, 200) : null]);
      }
    });
    result.sent += ok;
    result.failed += bad;
  }
  return result;
}

/** Tarea programada: recorre negocios con avisos pendientes o recordatorios activos. */
export async function runNotificationJob(opts: { budgetMs?: number } = {}) {
  const started = Date.now();
  const budget = opts.budgetMs ?? 50_000;
  const ids = (await getPool().query('SELECT business_id FROM notification_due_businesses(500)')).rows.map((r) => r.business_id as string);
  const summary = { businesses: ids.length, processed: 0, queued: 0, sent: 0, failed: 0, skipped: 0, postponed: 0, expired: 0, outOfTime: false };
  for (const id of ids) {
    if (Date.now() - started > budget) { summary.outOfTime = true; break; }
    summary.queued += await withTenant(id, (tx) => scheduleDue(tx, id));
    const r = await dispatchBusiness(id, { budgetMs: Math.max(1000, budget - (Date.now() - started)), limit: 100 });
    summary.sent += r.sent; summary.failed += r.failed; summary.skipped += r.skipped; summary.postponed += r.postponed; summary.expired += r.expired;
    summary.processed++;
  }
  return summary;
}

// ---------- Resumen para el dueño ----------
export async function communicationOverview(session: StaffSession) {
  return withTenant(session.businessId, async (tx) => {
    const settings = await loadSettings(tx);
    const subs = (await tx.query(
      `SELECT count(DISTINCT card_id)::int AS cards, count(*)::int AS devices,
              count(DISTINCT card_id) FILTER (WHERE cat_rewards)::int AS rewards,
              count(DISTINCT card_id) FILTER (WHERE cat_reminders)::int AS reminders,
              count(DISTINCT card_id) FILTER (WHERE cat_promotions)::int AS promotions
         FROM push_subscriptions WHERE disabled_at IS NULL`,
    )).rows[0];
    const optOuts = (await tx.query("SELECT count(*)::int AS n FROM push_subscriptions WHERE disabled_reason = 'unsubscribed' AND disabled_at > now() - interval '30 days'")).rows[0].n as number;
    const totals = (await tx.query(
      `SELECT template, count(*)::int AS total, count(*) FILTER (WHERE status IN ('sent','partial'))::int AS delivered,
              coalesce(sum(devices_sent),0)::int AS devices
         FROM notification_outbox WHERE created_at > now() - interval '30 days' GROUP BY template`,
    )).rows;
    const promotions = (await tx.query(
      `SELECT id, title, body, status, devices_sent, devices_failed, created_at, sent_at FROM notification_outbox
        WHERE template = 'promotion' ORDER BY created_at DESC LIMIT 5`,
    )).rows.map((r) => ({ id: r.id, title: r.title, body: r.body, status: r.status, devicesSent: r.devices_sent, devicesFailed: r.devices_failed, createdAt: r.created_at, sentAt: r.sent_at }));
    const promoUsed = (await tx.query("SELECT count(*)::int AS n FROM notification_outbox WHERE template = 'promotion' AND created_at > now() - interval '30 days' AND status <> 'skipped'")).rows[0].n as number;
    const appointments = (await tx.query(
      `SELECT a.id, a.starts_at, a.reminder_sent_at, c.public_code, cu.display_name FROM appointments a
         JOIN cards c ON c.id = a.card_id JOIN customers cu ON cu.id = c.customer_id
        WHERE a.status = 'confirmed' AND a.starts_at > now() ORDER BY a.starts_at LIMIT 20`,
    )).rows.map((r) => ({ id: r.id, startsAt: r.starts_at, reminderSent: !!r.reminder_sent_at, cardCode: r.public_code, customerName: r.display_name }));
    const cards = (await tx.query("SELECT count(*)::int AS n FROM cards WHERE status = 'active'")).rows[0].n as number;
    return {
      pushConfigured: !!pushConfig(), settings, activeCards: cards,
      subscribers: { cards: subs.cards, devices: subs.devices, rewards: subs.rewards, reminders: subs.reminders, promotions: subs.promotions, optOutsLast30Days: optOuts },
      last30Days: Object.fromEntries(totals.map((t) => [t.template, { total: t.total, delivered: t.delivered, devices: t.devices }])),
      promotions, promotionsLimit: { used: promoUsed, max: PROMOTIONS_PER_30_DAYS }, appointments,
    };
  });
}
