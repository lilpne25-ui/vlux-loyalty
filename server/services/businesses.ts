// Alta de negocios (equipo VLUX) y lectura pública por slug.
import { z } from 'zod';
import { withTenant, withTx } from '../db';
import { AppError, notFound } from '../errors';
import { logoBytesMatch } from '../image-check';
import { hashPassword } from '../security';
import { createBusinessSchema } from '../validation';
import { audit } from './audit';
import { getPool } from '../db';

export type CreateBusinessInput = z.input<typeof createBusinessSchema>;

export async function createBusiness(raw: CreateBusinessInput) {
  const input = createBusinessSchema.parse(raw);
  const passwordHash = await hashPassword(input.owner.password);
  return withTx(async (tx) => {
    const dup = await tx.query('SELECT 1 FROM businesses WHERE slug = $1', [input.slug]);
    if (dup.rowCount) throw new AppError(409, 'slug_taken', 'Ese identificador de negocio ya existe.');
    const biz = (await tx.query(
      `INSERT INTO businesses (slug, name, city, vertical, primary_color, accent_color, review_url, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.slug, input.name, input.city, input.vertical, input.primaryColor, input.accentColor, input.reviewUrl, input.isDemo],
    )).rows[0].id as string;
    const existing = (await tx.query('SELECT id FROM staff_users WHERE email = $1', [input.owner.email])).rows[0];
    const userId = existing
      ? existing.id
      : (await tx.query('INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id', [input.owner.email, passwordHash, input.owner.displayName])).rows[0].id;
    await tx.query("INSERT INTO staff_memberships (business_id, user_id, role) VALUES ($1, $2, 'OWNER')", [biz, userId]);
    await tx.query("SELECT set_config('app.business_id', $1, true)", [biz]);
    const r = input.rules;
    await tx.query(
      `INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description, created_by)
       VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
      [biz, r.stampsRequired, r.stampMode, r.maxStampsPerPurchase, r.visitWindowMinutes, r.rewardDescription, userId],
    );
    // V0.3: todo negocio nace con registro comercial (piloto sin costo) para que el Control Center lo cuente.
    await tx.query(
      `INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, price_cents, currency)
       VALUES ($1, 'piloto', 'piloto', current_date, 0, 'MXN')`, [biz],
    );
    await audit(tx, biz, { type: 'platform', id: null }, 'business.created', 'business', biz, { slug: input.slug, ownerReused: !!existing });
    return { businessId: biz, ownerUserId: userId as string, slug: input.slug };
  });
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  city: string;
  vertical: string;
  primaryColor: string;
  accentColor: string;
  cardFinish: 'signature' | 'silver' | 'black';
  reviewUrl: string | null;
  isDemo: boolean;
  /** URL versionada del logotipo (o null). El logotipo se sirve aparte para no inflar el JSON que se consulta cada pocos segundos. */
  logoUrl: string | null;
  /** Ajuste del logotipo (autoajuste + cambios manuales); null = autoajuste en el cliente. */
  logoFit: unknown | null;
  program: { stampsRequired: number; stampMode: string; maxStampsPerPurchase: number; visitWindowMinutes: number; rewardDescription: string; ruleId: string; version: number };
}

export async function getBusinessBySlug(slug: string): Promise<PublicBusiness> {
  const b = (await getPool().query("SELECT id FROM businesses WHERE slug = $1 AND status = 'active'", [slug])).rows[0];
  if (!b) throw notFound('Negocio');
  return getBusinessById(b.id);
}

export async function getBusinessById(id: string): Promise<PublicBusiness> {
  return withTenant(id, async (tx) => {
    const row = (await tx.query(
      `SELECT b.id, b.slug, b.name, b.city, b.vertical, b.primary_color, b.accent_color, b.card_finish, b.review_url, b.is_demo,
              b.logo_hash AS logo_v, b.logo_fit,
              r.id AS rule_id, r.version, r.stamps_required, r.stamp_mode, r.max_stamps_per_purchase, r.visit_window_minutes, r.reward_description
         FROM businesses b JOIN reward_rules r ON r.business_id = b.id AND r.active
        WHERE b.id = $1`,
      [id],
    )).rows[0];
    if (!row) throw notFound('Negocio');
    return {
      id: row.id, slug: row.slug, name: row.name, city: row.city, vertical: row.vertical,
      primaryColor: row.primary_color, accentColor: row.accent_color, cardFinish: row.card_finish, reviewUrl: row.review_url, isDemo: row.is_demo,
      logoFit: row.logo_fit ?? null,
      logoUrl: row.logo_v ? `/api/public/businesses/${row.slug}/logo?v=${row.logo_v}` : null,
      program: {
        ruleId: row.rule_id, version: row.version, stampsRequired: row.stamps_required, stampMode: row.stamp_mode,
        maxStampsPerPurchase: row.max_stamps_per_purchase, visitWindowMinutes: row.visit_window_minutes, rewardDescription: row.reward_description,
      },
    };
  });
}

/** Logotipo del negocio activo (data URL validada al guardarla: solo PNG, JPEG o WebP; nunca SVG). */
export async function getBusinessLogo(slug: string): Promise<{ mime: string; bytes: Buffer; version: string } | null> {
  const b = (await getPool().query("SELECT id FROM businesses WHERE slug = $1 AND status = 'active'", [slug])).rows[0];
  if (!b) return null;
  return withTenant(b.id, async (tx) => {
    const row = (await tx.query('SELECT logo_data_url, logo_hash AS v FROM businesses WHERE id = $1', [b.id])).rows[0];
    const m = row?.logo_data_url ? /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row.logo_data_url) : null;
    if (row?.logo_data_url && !logoBytesMatch(row.logo_data_url)) return null; // bytes que no corresponden al tipo declarado
    return m ? { mime: m[1], bytes: Buffer.from(m[2], 'base64'), version: row.v } : null;
  });
}
