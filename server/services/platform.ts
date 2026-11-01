// V0.3 · Operaciones de VLUX sobre toda la plataforma (Control Center).
// Reglas: los datos de cada negocio se leen con withTenant (RLS); las métricas globales salen de funciones
// SECURITY DEFINER que solo devuelven conteos. Toda escritura queda en la bitácora del negocio y en la global.
import { z } from 'zod';
import { config } from '../config';
import { getPool, withTenant, withTx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from './audit';
import { getBusinessById } from './businesses';
import { createInvitation, listInvitations } from './invitations';
import { platformAudit, type AdminSession } from './platform-auth';
import { GoogleWalletProvider } from '../wallet/google';
import { AppleWalletProvider } from '../wallet/apple';
import { emailSchema, rulesSchema, slugSchema, verticals } from '../validation';

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Usa colores en formato #RRGGBB.');
const logoSchema = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, 'El logotipo debe ser PNG, JPG o WebP.').max(90000, 'El logotipo es demasiado grande (máximo ~64 KB).').refine(logoBytesMatch, 'El archivo no es una imagen válida del tipo indicado.').nullable();
export const cardFinishes = ['signature', 'silver', 'black'] as const;
/** Comprueba que los bytes decodificados correspondan al tipo declarado (no basta el prefijo data: del navegador). */
export function logoBytesMatch(dataUrl: string): boolean {
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return false;
  const b = Buffer.from(m[2], 'base64');
  if (b.length < 32) return false;
  if (m[1] === 'png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (m[1] === 'jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}
const reviewUrl = z.string().trim().regex(/^https:\/\/\S+$/, 'El enlace de reseñas debe empezar con https://').max(500).nullable();
export const planCodes = ['piloto', 'inicio', 'crecimiento'] as const;
export const commercialStatuses = ['piloto', 'activo', 'vencido', 'suspendido', 'cancelado'] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD).');

export const wizardSchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: slugSchema.optional(),
  vertical: z.enum(verticals),
  city: z.string().trim().max(80).default(''),
  ownerName: z.string().trim().min(2).max(60),
  ownerEmail: emailSchema,
  logoDataUrl: logoSchema.default(null),
  primaryColor: color,
  accentColor: color,
  cardFinish: z.enum(cardFinishes).default('signature'),
  rules: rulesSchema,
  reviewUrl: reviewUrl.default(null),
  plan: z.enum(planCodes),
  priceCents: z.number().int().min(0).max(100_000_000).optional(),
  pilotDays: z.number().int().min(1).max(180).default(30),
  isDemo: z.boolean().default(false),
});

export const businessEditSchema = z.object({
  name: z.string().trim().min(2).max(60),
  vertical: z.enum(verticals),
  city: z.string().trim().max(80),
  primaryColor: color,
  accentColor: color,
  cardFinish: z.enum(cardFinishes).default('signature'),
  reviewUrl,
  logoDataUrl: logoSchema,
});

export const statusChangeSchema = z.object({
  status: z.enum(['active', 'suspended']),
  reason: z.string().trim().min(3, 'Escribe el motivo.').max(300),
  confirm: z.literal(true, { message: 'Confirma la operación.' }),
});

export const subscriptionSchema = z.object({
  plan: z.enum(planCodes),
  commercialStatus: z.enum(commercialStatuses),
  startDate: dateStr,
  pilotEndDate: dateStr.nullable(),
  renewalDate: dateStr.nullable(),
  priceCents: z.number().int().min(0).max(100_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  notes: z.string().max(2000).default(''),
});

export const planSchema = z.object({ name: z.string().trim().min(2).max(40), priceCents: z.number().int().min(0).max(100_000_000), currency: z.string().regex(/^[A-Z]{3}$/) });

/** Identificador de URL a partir del nombre: sin acentos, minúsculas y guiones. */
export function slugify(name: string) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 34);
  return base.length >= 3 ? base : `negocio-${base}`.replace(/-+$/, '');
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ---------- Asistente: alta atómica ----------
export async function createBusinessFromWizard(admin: AdminSession, raw: unknown) {
  const input = wizardSchema.parse(raw);
  const plan = (await getPool().query('SELECT code, price_cents, currency FROM plans WHERE code = $1', [input.plan])).rows[0];
  if (!plan) throw new AppError(422, 'validation', 'Plan inválido.');
  const result = await withTx(async (tx) => {
    // Identificador único: el sugerido o el derivado del nombre, con sufijo si ya existe.
    const base = input.slug ?? slugify(input.name);
    let slug = base;
    for (let i = 2; (await tx.query('SELECT 1 FROM businesses WHERE slug = $1', [slug])).rowCount; i++) {
      if (input.slug) throw new AppError(409, 'slug_taken', 'Ese identificador de negocio ya existe.');
      slug = `${base.slice(0, 36)}-${i}`;
    }
    const biz = (await tx.query(
      `INSERT INTO businesses (slug, name, city, vertical, primary_color, accent_color, review_url, is_demo, logo_data_url, card_finish)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [slug, input.name, input.city, input.vertical, input.primaryColor, input.accentColor, input.reviewUrl, input.isDemo, input.logoDataUrl, input.cardFinish],
    )).rows[0].id as string;
    await tx.query("SELECT set_config('app.business_id', $1, true)", [biz]);
    const r = input.rules;
    await tx.query(
      `INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description)
       VALUES ($1, 1, $2, $3, $4, $5, $6)`,
      [biz, r.stampsRequired, r.stampMode, r.maxStampsPerPurchase, r.visitWindowMinutes, r.rewardDescription],
    );
    const today = new Date();
    const pilotEnd = input.plan === 'piloto' ? isoDate(new Date(today.getTime() + input.pilotDays * 86400_000)) : null;
    await tx.query(
      `INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, pilot_end_date, renewal_date, price_cents, currency, notes, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)`,
      [biz, input.plan, input.plan === 'piloto' ? 'piloto' : 'activo', isoDate(today), pilotEnd, input.plan === 'piloto' ? null : isoDate(new Date(today.getTime() + 30 * 86400_000)),
        input.priceCents ?? plan.price_cents, plan.currency, admin.adminId],
    );
    const inv = await createInvitation(tx, { businessId: biz, email: input.ownerEmail, displayName: input.ownerName, role: 'OWNER', by: { type: 'platform', id: admin.adminId } });
    await audit(tx, biz, { type: 'platform', id: null }, 'business.created', 'business', biz, { slug, plan: input.plan, via: 'control_center' });
    await platformAudit(tx, admin.adminId, 'business.created', { businessId: biz, entityType: 'business', entityId: biz, details: { slug, plan: input.plan, isDemo: input.isDemo } });
    return { businessId: biz, slug, invitation: inv };
  });
  return result;
}

// ---------- Lecturas ----------
type Stats = { customers: number; cards: number; purchases: number; stamps: number; rewardsRedeemed: number; lastActivity: Date | null };
async function statsByBusiness(): Promise<Map<string, Stats>> {
  const rows = (await getPool().query('SELECT * FROM platform_business_stats()')).rows;
  return new Map(rows.map((r) => [r.business_id, { customers: Number(r.customers), cards: Number(r.cards), purchases: Number(r.purchases), stamps: Number(r.stamps), rewardsRedeemed: Number(r.rewards_redeemed), lastActivity: r.last_activity }]));
}

export async function listBusinesses() {
  const [rows, stats] = await Promise.all([
    getPool().query(
      `SELECT b.id, b.slug, b.name, b.vertical, b.city, b.status, b.is_demo, b.created_at,
              s.plan_code, s.commercial_status, s.price_cents, s.currency,
              (SELECT string_agg(u.display_name, ', ' ORDER BY m.created_at) FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id
                WHERE m.business_id = b.id AND m.role = 'OWNER' AND m.active) AS owners,
              (SELECT i.display_name FROM staff_invitations i WHERE i.business_id = b.id AND i.role = 'OWNER' AND i.accepted_at IS NULL
                 AND i.revoked_at IS NULL ORDER BY i.created_at DESC LIMIT 1) AS pending_owner
         FROM businesses b LEFT JOIN business_subscriptions s ON s.business_id = b.id ORDER BY b.created_at DESC`,
    ),
    statsByBusiness(),
  ]);
  return rows.rows.map((r) => {
    const st = stats.get(r.id);
    return {
      id: r.id, slug: r.slug, name: r.name, vertical: r.vertical, city: r.city, status: r.status, isDemo: r.is_demo, createdAt: r.created_at,
      owner: r.owners || (r.pending_owner ? `${r.pending_owner} (invitación pendiente)` : null),
      plan: r.plan_code, commercialStatus: r.commercial_status, priceCents: r.price_cents, currency: r.currency,
      customers: st?.customers ?? 0, lastActivity: st?.lastActivity ?? null,
    };
  });
}

export async function overview() {
  const t0 = Date.now();
  const [list, stats, recent, platformRecent] = await Promise.all([
    listBusinesses(),
    statsByBusiness(),
    getPool().query('SELECT a.business_id, a.action, a.actor_type, a.created_at, b.name, b.is_demo FROM platform_recent_activity(15) a JOIN businesses b ON b.id = a.business_id'),
    getPool().query(`SELECT e.action, e.created_at, e.business_id, b.name, a.display_name FROM platform_audit_events e
                       LEFT JOIN businesses b ON b.id = e.business_id LEFT JOIN platform_admins a ON a.id = e.admin_id
                      ORDER BY e.created_at DESC LIMIT 10`),
  ]);
  const dbMs = Date.now() - t0;
  const bucket = (demo: boolean) => {
    const bs = list.filter((b) => b.isDemo === demo);
    const sum = (k: keyof Stats) => bs.reduce((acc, b) => acc + Number(stats.get(b.id)?.[k] ?? 0), 0);
    return {
      businesses: bs.length,
      active: bs.filter((b) => b.status === 'active' && b.commercialStatus === 'activo').length,
      pilot: bs.filter((b) => b.status === 'active' && b.commercialStatus === 'piloto').length,
      suspended: bs.filter((b) => b.status === 'suspended').length,
      customers: sum('customers'), cards: sum('cards'), purchases: sum('purchases'), stamps: sum('stamps'), rewardsRedeemed: sum('rewardsRedeemed'),
    };
  };
  return {
    real: bucket(false),
    demo: bucket(true),
    activity: recent.rows.map((r) => ({ businessId: r.business_id, businessName: r.name, isDemo: r.is_demo, action: r.action, actorType: r.actor_type, at: r.created_at })),
    platformActivity: platformRecent.rows.map((r) => ({ action: r.action, at: r.created_at, businessId: r.business_id, businessName: r.name, adminName: r.display_name })),
    infrastructure: {
      environment: process.env.VERCEL_ENV || (config.isProduction ? 'production' : 'development'),
      region: process.env.VERCEL_REGION || 'local',
      node: process.version,
      database: { ok: true, latencyMs: dbMs, schema: 'V0.3 (0006_control_center)' },
      emailProvider: 'no configurado (las invitaciones se entregan por enlace)',
      wallet: {
        google: walletLabel(GoogleWalletProvider.fromEnv().status()),
        apple: new AppleWalletProvider().status().state === 'configured' ? 'configurado' : 'no disponible (sin certificados de Apple)',
      },
    },
  };
}

function walletLabel(st: ReturnType<GoogleWalletProvider['status']>) {
  // "Configurado" solo significa que hay credenciales; funcionar requiere la prueba K con Google.
  return st.state === 'configured' ? `credenciales cargadas (modo ${st.mode}); sin verificar con Google` : 'no configurado';
}

export async function businessDetail(id: string) {
  const b = (await getPool().query(
    `SELECT b.id, b.slug, b.status, b.suspended_reason, b.logo_data_url, b.created_at, b.updated_at, b.is_demo,
            s.plan_code, s.commercial_status, s.start_date, s.pilot_end_date, s.renewal_date, s.price_cents, s.currency, s.notes, s.updated_at AS sub_updated
       FROM businesses b LEFT JOIN business_subscriptions s ON s.business_id = b.id WHERE b.id = $1`, [id],
  )).rows[0];
  if (!b) throw notFound('Negocio');
  const [pub, staff, invitations, stats, auditRows] = await Promise.all([
    getBusinessById(id),
    getPool().query(
      `SELECT m.id, m.role, m.active, u.email, u.display_name, m.created_at,
              (SELECT max(s.created_at) FROM staff_sessions s WHERE s.membership_id = m.id) AS last_login
         FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id WHERE m.business_id = $1 ORDER BY m.role, u.display_name`, [id]),
    listInvitations(id),
    statsByBusiness(),
    withTenant(id, async (tx) => (await tx.query('SELECT action, actor_type, created_at FROM audit_events ORDER BY created_at DESC LIMIT 20')).rows),
  ]);
  const d = (v: Date | string | null) => (v ? (v instanceof Date ? isoDate(v) : String(v).slice(0, 10)) : null);
  return {
    ...pub,
    status: b.status, suspendedReason: b.suspended_reason, logoDataUrl: b.logo_data_url, createdAt: b.created_at,
    subscription: b.plan_code ? {
      plan: b.plan_code, commercialStatus: b.commercial_status, startDate: d(b.start_date), pilotEndDate: d(b.pilot_end_date),
      renewalDate: d(b.renewal_date), priceCents: b.price_cents, currency: b.currency, notes: b.notes, updatedAt: b.sub_updated,
    } : null,
    staff: staff.rows.map((r) => ({ membershipId: r.id, role: r.role, active: r.active, email: r.email, displayName: r.display_name, createdAt: r.created_at, lastLogin: r.last_login })),
    invitations,
    stats: stats.get(id) ?? null,
    audit: auditRows.map((r) => ({ action: r.action, actorType: r.actor_type, at: r.created_at })),
  };
}

// ---------- Escrituras ----------
export async function updateBusiness(admin: AdminSession, id: string, raw: unknown) {
  const input = businessEditSchema.parse(raw);
  return withTenant(id, async (tx) => {
    const r = await tx.query(
      `UPDATE businesses SET name = $2, vertical = $3, city = $4, primary_color = $5, accent_color = $6, review_url = $7, logo_data_url = $8, card_finish = $9
        WHERE id = $1 RETURNING id`,
      [id, input.name, input.vertical, input.city, input.primaryColor, input.accentColor, input.reviewUrl, input.logoDataUrl, input.cardFinish],
    );
    if (!r.rowCount) throw notFound('Negocio');
    await audit(tx, id, { type: 'platform', id: null }, 'business.updated', 'business', id);
    await platformAudit(tx, admin.adminId, 'business.updated', { businessId: id, entityType: 'business', entityId: id });
    return { ok: true };
  });
}

/** Suspender o reactivar el servicio. Suspender revoca las sesiones del personal; los datos no se tocan. */
export async function setBusinessStatus(admin: AdminSession, id: string, raw: unknown) {
  const input = statusChangeSchema.parse(raw);
  return withTenant(id, async (tx) => {
    const cur = (await tx.query('SELECT status FROM businesses WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw notFound('Negocio');
    if (cur.status === input.status) throw new AppError(409, 'no_change', input.status === 'active' ? 'El negocio ya está activo.' : 'El negocio ya está suspendido.');
    await tx.query('UPDATE businesses SET status = $2, suspended_reason = $3 WHERE id = $1', [id, input.status, input.status === 'suspended' ? input.reason : null]);
    let sessionsRevoked = 0;
    if (input.status === 'suspended') sessionsRevoked = (await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE business_id = $1 AND revoked_at IS NULL', [id])).rowCount ?? 0;
    const action = input.status === 'suspended' ? 'business.suspended' : 'business.reactivated';
    await audit(tx, id, { type: 'platform', id: null }, action, 'business', id, { reason: input.reason });
    await platformAudit(tx, admin.adminId, action, { businessId: id, entityType: 'business', entityId: id, details: { reason: input.reason, sessionsRevoked } });
    return { status: input.status, sessionsRevoked };
  });
}

export async function updateSubscription(admin: AdminSession, id: string, raw: unknown) {
  const s = subscriptionSchema.parse(raw);
  return withTx(async (tx) => {
    if (!(await tx.query('SELECT 1 FROM businesses WHERE id = $1', [id])).rowCount) throw notFound('Negocio');
    // Solo registro comercial: cambiar a "suspendido" o "vencido" NO apaga el servicio (no hay política aprobada).
    await tx.query(
      `INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, pilot_end_date, renewal_date, price_cents, currency, notes, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (business_id) DO UPDATE SET plan_code = EXCLUDED.plan_code, commercial_status = EXCLUDED.commercial_status, start_date = EXCLUDED.start_date,
         pilot_end_date = EXCLUDED.pilot_end_date, renewal_date = EXCLUDED.renewal_date, price_cents = EXCLUDED.price_cents, currency = EXCLUDED.currency,
         notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by`,
      [id, s.plan, s.commercialStatus, s.startDate, s.pilotEndDate, s.renewalDate, s.priceCents, s.currency, s.notes, admin.adminId],
    );
    await platformAudit(tx, admin.adminId, 'subscription.updated', { businessId: id, entityType: 'business', entityId: id, details: { plan: s.plan, commercialStatus: s.commercialStatus, priceCents: s.priceCents, currency: s.currency } });
    return { ok: true };
  });
}

export async function listPlans() {
  return (await getPool().query("SELECT code, name, price_cents, currency, updated_at FROM plans ORDER BY array_position(ARRAY['piloto','inicio','crecimiento'], code)")).rows
    .map((r) => ({ code: r.code, name: r.name, priceCents: r.price_cents, currency: r.currency, updatedAt: r.updated_at }));
}

export async function updatePlan(admin: AdminSession, code: string, raw: unknown) {
  const p = planSchema.parse(raw);
  const r = await getPool().query('UPDATE plans SET name = $2, price_cents = $3, currency = $4, updated_at = now() WHERE code = $1 RETURNING code', [code, p.name, p.priceCents, p.currency]);
  if (!r.rowCount) throw notFound('Plan');
  await platformAudit(getPool(), admin.adminId, 'plan.updated', { details: { code, priceCents: p.priceCents, currency: p.currency } });
  return { ok: true };
}

export async function platformAuditLog(limit: number) {
  return (await getPool().query(
    `SELECT e.id, e.action, e.created_at, e.entity_type, e.details, b.name AS business_name, a.display_name AS admin_name
       FROM platform_audit_events e LEFT JOIN businesses b ON b.id = e.business_id LEFT JOIN platform_admins a ON a.id = e.admin_id
      ORDER BY e.created_at DESC LIMIT $1`, [limit],
  )).rows.map((r) => ({ id: Number(r.id), action: r.action, at: r.created_at, entityType: r.entity_type, details: r.details, businessName: r.business_name, adminName: r.admin_name }));
}
