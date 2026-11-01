// V0.4.4 · Brand Activation Draft. Transferencia segura de un diseño de tarjeta entre el proyecto público y el Control Center
// (dos orígenes distintos, misma base de datos). El borrador es DATOS DE DISEÑO, no un permiso:
//   - se crea sin sesión (solo guarda un diseño; limitado por tasa, tamaño y cantidad);
//   - la referencia son 32 bytes aleatorios; en BD solo vive su sha256;
//   - leerlo y consumirlo exige sesión de administrador con 2FA (rutas /api/admin);
//   - expira (24 h) y se consume una sola vez, dentro de la misma transacción que crea el negocio.
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getPool, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { sha256 } from '../security';
import { rateLimit } from '../ratelimit';
import { sanitizeFit } from '../../src/lib/logoFit';
import { logoBytesMatch } from '../image-check';
import { verticals } from '../validation';

export const DRAFT_TTL_HOURS = 24;
const MAX_LIVE_DRAFTS = 2000;
const REF_RE = /^[A-Za-z0-9_-]{43}$/;

const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const logo = z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).max(90000).refine(logoBytesMatch, 'Imagen no válida.').nullable();

export const draftSchema = z.object({
  name: z.string().trim().min(2).max(60),
  logoDataUrl: logo.default(null),
  logoOriginalDataUrl: logo.default(null),
  logoFit: z.unknown().transform((v) => (v == null ? null : sanitizeFit(v))).default(null),
  primaryColor: color,
  accentColor: color,
  cardFinish: z.enum(['signature', 'silver', 'black']).default('silver'),
  stampsRequired: z.number().int().min(3).max(15),
  rewardDescription: z.string().trim().min(3).max(80),
  vertical: z.enum(verticals).optional(),
}).strict();
export type ActivationDraft = z.infer<typeof draftSchema>;

const hashRef = (ref: string) => sha256(ref).toString('hex');
export const isDraftRef = (ref: unknown): ref is string => typeof ref === 'string' && REF_RE.test(ref);

/** Crea un borrador. Sin sesión: se limita por IP y por total de borradores vivos. */
export async function createDraft(raw: unknown, ip: string) {
  await rateLimit(`draft:${ip}`, 10, 60 * 60_000);
  const data = draftSchema.parse(raw);
  const pool = getPool();
  // Limpieza de vencidos (barata y acotada) y tope de almacenamiento.
  await pool.query("DELETE FROM activation_drafts WHERE expires_at < now() - interval '1 day' OR (consumed_at IS NOT NULL AND consumed_at < now() - interval '30 days')");
  const live = Number((await pool.query('SELECT count(*)::int n FROM activation_drafts WHERE expires_at > now() AND consumed_at IS NULL')).rows[0].n);
  if (live >= MAX_LIVE_DRAFTS) throw new AppError(429, 'drafts_full', 'No es posible preparar la activación en este momento. Intenta más tarde.');
  const ref = randomBytes(32).toString('base64url');
  const row = (await pool.query(
    `INSERT INTO activation_drafts (ref_hash, data, expires_at) VALUES ($1, $2::jsonb, now() + make_interval(hours => $3)) RETURNING expires_at`,
    [hashRef(ref), JSON.stringify(data), DRAFT_TTL_HOURS],
  )).rows[0];
  return { ref, expiresAt: row.expires_at as Date };
}

export type DraftState = 'ok' | 'expired' | 'consumed';

/** Lectura para el administrador (ya autenticado con 2FA). 404 si no existe, 410 si venció o ya se usó. */
export async function readDraft(ref: unknown, adminId: string) {
  if (!isDraftRef(ref)) throw notFound('Borrador');
  await rateLimit(`draft-read:${adminId}`, 40, 10 * 60_000);
  const r = (await getPool().query('SELECT data, expires_at, consumed_at, consumed_business FROM activation_drafts WHERE ref_hash = $1', [hashRef(ref)])).rows[0];
  if (!r) throw notFound('Borrador');
  if (r.consumed_at) throw new AppError(410, 'draft_consumed', 'Este diseño ya se usó para crear un negocio.');
  if (new Date(r.expires_at) <= new Date()) throw new AppError(410, 'draft_expired', 'Este diseño venció. Vuelve a prepararlo desde la página pública.');
  return { draft: draftSchema.parse(r.data) as ActivationDraft, expiresAt: r.expires_at as Date };
}

/**
 * Bloquea el borrador (FOR UPDATE) al INICIO de la transacción de alta: dos solicitudes simultáneas (doble clic) se serializan
 * y la segunda ve el borrador ya consumido antes de insertar nada. Falla con 404/409/410 si no se puede usar.
 */
export async function lockDraft(tx: Tx, ref: unknown): Promise<string> {
  if (!isDraftRef(ref)) throw new AppError(422, 'validation', 'Referencia de diseño inválida.');
  const e = (await tx.query('SELECT id, consumed_at, expires_at FROM activation_drafts WHERE ref_hash = $1 FOR UPDATE', [hashRef(ref)])).rows[0];
  if (!e) throw notFound('Borrador');
  if (e.consumed_at) throw new AppError(409, 'draft_consumed', 'Este diseño ya se usó para crear un negocio.');
  if (new Date(e.expires_at) <= new Date()) throw new AppError(410, 'draft_expired', 'Este diseño venció.');
  return e.id as string;
}

/** Marca el borrador (ya bloqueado) como consumido por el negocio recién creado. */
export async function consumeDraft(tx: Tx, draftId: string, businessId: string) {
  await tx.query('UPDATE activation_drafts SET consumed_at = now(), consumed_business = $2 WHERE id = $1 AND consumed_at IS NULL', [draftId, businessId]);
}
