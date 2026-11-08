// 1.0.x · Recuperación de acceso del cliente y WhatsApp público del negocio (migración 0017).
//
// Flujo: el cliente escribe el WhatsApp o correo con el que se registró → se guarda una SOLICITUD para el negocio
// (nunca se le dice si su tarjeta existe) → el dueño la ve en su panel y decide: generar un enlace nuevo (revoca el
// anterior) y enviarlo él mismo por WhatsApp/correo, atenderlo en persona o descartarla. Todo queda en la bitácora.
//
// Compatibilidad: si 0017 aún no está aplicada, la API responde 503 «recovery_unavailable» en estas rutas y el resto
// de la app sigue igual (ninguna consulta existente toca la tabla ni la columna nuevas).
import { z } from 'zod';
import { withTenant, withTx, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { sha256 } from '../security';
import { normalizeContact } from '../validation';
import { audit } from './audit';
import { getBusinessBySlug } from './businesses';
import type { StaffSession } from './auth';
import { reissueCardLink } from './operations';

/** Máximo de solicitudes abiertas por negocio: por encima se responde igual pero no se guarda (frena el abuso). */
export const MAX_OPEN_REQUESTS = 200;

let ready = false;
/** ¿Está aplicada 0017? Se recuerda solo el «sí» (la migración puede aplicarse con la app encendida). */
export async function recoverySchemaReady(tx?: Tx): Promise<boolean> {
  if (ready) return true;
  const sql = `SELECT to_regclass('public.recovery_requests') IS NOT NULL
                  AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.businesses'::regclass AND attname = 'contact_whatsapp' AND NOT attisdropped) AS ok`;
  const r = tx ? await tx.query(sql) : await withTx((t) => t.query(sql));
  ready = !!r.rows[0]?.ok;
  return ready;
}
/** Solo pruebas: olvida el resultado guardado. */
export function resetRecoverySchemaCache() { ready = false; }

const unavailable = () => new AppError(503, 'recovery_unavailable', 'La recuperación en línea aún no está activa en este negocio. Pídela en caja: el personal puede darte un enlace nuevo.');

/** Contacto enmascarado para solicitudes vencidas: conserva lo mínimo para reconocerla en el historial. */
export function maskContact(contact: string, type: 'whatsapp' | 'email'): string {
  if (type === 'email') {
    const [user, domain = ''] = contact.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `******${contact.slice(-4)}`;
}

export const recoveryRequestSchema = z.object({
  contact: z.string().trim().min(3, 'Escribe tu WhatsApp o correo.').max(120),
  name: z.string().trim().max(40).optional().default(''),
});

export const businessWhatsappSchema = z.object({ whatsapp: z.string().trim().max(20).nullable() });

export const closeRecoverySchema = z.object({ resolution: z.enum(['link_sent', 'in_person', 'not_customer', 'spam']) });

export const issueRecoveryLinkSchema = z.object({ cardId: z.string().uuid().optional() });

/** Datos públicos de ayuda del negocio (para la vista del cliente). Nunca falla por falta de 0017. */
export async function publicHelp(slug: string): Promise<{ recovery: boolean; businessWhatsapp: string | null }> {
  const biz = await getBusinessBySlug(slug);
  if (!(await recoverySchemaReady())) return { recovery: false, businessWhatsapp: null };
  const r = await withTenant(biz.id, (tx) => tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [biz.id]));
  return { recovery: true, businessWhatsapp: r.rows[0]?.contact_whatsapp ?? null };
}

/**
 * El cliente pide recuperar su acceso. Respuesta IDÉNTICA exista o no la tarjeta (no se puede usar para averiguar
 * quién es cliente). Repetir la solicitud no crea filas nuevas: suma al contador de la abierta.
 */
export async function requestRecovery(slug: string, raw: unknown): Promise<{ ok: true; businessWhatsapp: string | null }> {
  const biz = await getBusinessBySlug(slug);
  const input = recoveryRequestSchema.parse(raw);
  const c = normalizeContact(input.contact);
  if (c.error) throw new AppError(422, 'invalid_contact', c.error);
  if (!c.contact || !c.type) throw new AppError(422, 'invalid_contact', 'Escribe tu WhatsApp o correo.');
  if (!(await recoverySchemaReady())) throw unavailable();
  const name = input.name.replace(/\s+/g, ' ') || null;
  const hash = sha256(`${biz.id}|${c.type}|${c.contact}`);
  return withTenant(biz.id, async (tx) => {
    const open = (await tx.query("SELECT count(*)::int AS n FROM recovery_requests WHERE status = 'pending'")).rows[0].n as number;
    const already = (await tx.query("SELECT id FROM recovery_requests WHERE contact_hash = $1 AND status = 'pending'", [hash])).rows[0];
    if (!already && open >= MAX_OPEN_REQUESTS) {
      await audit(tx, biz.id, { type: 'customer', id: null }, 'recovery.dropped', null, null, { reason: 'inbox_full' });
    } else {
      const card = (await tx.query(
        `SELECT c.id FROM customers cu JOIN cards c ON c.customer_id = cu.id
          WHERE cu.contact = $1 AND cu.contact_type = $2 AND cu.anonymized_at IS NULL AND c.status = 'active'
          ORDER BY c.last_purchase_at DESC NULLS LAST, c.created_at DESC LIMIT 1`,
        [c.contact, c.type],
      )).rows[0];
      const row = (await tx.query(
        `INSERT INTO recovery_requests (business_id, contact, contact_type, contact_hash, name_hint, matched_card_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (business_id, contact_hash) WHERE status = 'pending'
         DO UPDATE SET request_count = LEAST(recovery_requests.request_count + 1, 1000), last_requested_at = now(),
                       name_hint = coalesce(EXCLUDED.name_hint, recovery_requests.name_hint),
                       matched_card_id = coalesce(EXCLUDED.matched_card_id, recovery_requests.matched_card_id)
         RETURNING id, request_count`,
        [biz.id, c.contact, c.type, hash, name, card?.id ?? null],
      )).rows[0];
      await audit(tx, biz.id, { type: 'customer', id: null }, 'recovery.requested', 'recovery_request', row.id, { matched: !!card, repeat: row.request_count > 1, contactType: c.type });
    }
    const w = (await tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [biz.id])).rows[0];
    return { ok: true as const, businessWhatsapp: w?.contact_whatsapp ?? null };
  });
}

export interface RecoveryItem {
  id: string; status: string; resolution: string | null; contact: string; contactType: 'whatsapp' | 'email'; nameHint: string | null;
  requestCount: number; createdAt: string; lastRequestedAt: string; resolvedAt: string | null;
  match: { cardId: string; publicCode: string; customerName: string; contactMatches: boolean } | null;
}

/** Bandeja del dueño: abiertas primero. Las vencidas (30 días) se enmascaran aquí mismo, sin tarea programada. */
export async function listRecovery(session: StaffSession): Promise<{ available: boolean; pending: number; businessWhatsapp: string | null; requests: RecoveryItem[] }> {
  if (!(await recoverySchemaReady())) return { available: false, pending: 0, businessWhatsapp: null, requests: [] };
  return withTenant(session.businessId, async (tx) => {
    const expired = (await tx.query("SELECT id, contact, contact_type FROM recovery_requests WHERE expires_at < now() AND status <> 'expired' LIMIT 500")).rows;
    for (const e of expired) {
      await tx.query("UPDATE recovery_requests SET status = 'expired', resolution = coalesce(resolution, 'expired'), contact = $2, name_hint = NULL WHERE id = $1",
        [e.id, maskContact(e.contact, e.contact_type)]);
    }
    const rows = (await tx.query(
      `SELECT r.*, c.public_code, cu.display_name, (cu.contact = r.contact AND cu.contact_type = r.contact_type) AS contact_matches
         FROM recovery_requests r
         LEFT JOIN cards c ON c.id = r.matched_card_id
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ORDER BY (r.status = 'pending') DESC, r.last_requested_at DESC LIMIT 100`,
    )).rows;
    const w = (await tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [session.businessId])).rows[0];
    return {
      available: true,
      pending: rows.filter((r) => r.status === 'pending').length,
      businessWhatsapp: w?.contact_whatsapp ?? null,
      requests: rows.map((r) => ({
        id: r.id, status: r.status, resolution: r.resolution, contact: r.contact, contactType: r.contact_type, nameHint: r.name_hint,
        requestCount: r.request_count, createdAt: r.created_at.toISOString(), lastRequestedAt: r.last_requested_at.toISOString(), resolvedAt: r.resolved_at?.toISOString() ?? null,
        match: r.matched_card_id ? { cardId: r.matched_card_id, publicCode: r.public_code, customerName: r.display_name, contactMatches: !!r.contact_matches } : null,
      })),
    };
  });
}

/**
 * El dueño genera un enlace nuevo para la tarjeta de la solicitud (o para la que eligió a mano). Revoca los enlaces
 * anteriores de esa tarjeta. El token se devuelve UNA vez y nunca se guarda en la solicitud.
 */
export async function issueRecoveryLink(session: StaffSession, requestId: string, raw: unknown) {
  if (!(await recoverySchemaReady())) throw unavailable();
  const { cardId } = issueRecoveryLinkSchema.parse(raw ?? {});
  const req = await withTenant(session.businessId, async (tx) => (await tx.query('SELECT id, status, matched_card_id, contact, contact_type FROM recovery_requests WHERE id = $1', [requestId])).rows[0]);
  if (!req) throw notFound('Solicitud');
  if (req.status !== 'pending' && req.status !== 'link_issued') throw new AppError(409, 'recovery_closed', 'Esta solicitud ya está cerrada.');
  const target: string | null = cardId ?? req.matched_card_id;
  if (!target) throw new AppError(422, 'card_required', 'Elige la tarjeta del cliente antes de generar el enlace.');
  const card = await withTenant(session.businessId, async (tx) => (await tx.query(
    `SELECT c.id, c.public_code, cu.display_name, (cu.contact = $2 AND cu.contact_type = $3) AS contact_matches
       FROM cards c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1 AND c.status = 'active'`,
    [target, req.contact, req.contact_type],
  )).rows[0]);
  if (!card) throw notFound('Tarjeta');
  const { token } = await reissueCardLink(session, target);
  await withTenant(session.businessId, async (tx) => {
    await tx.query("UPDATE recovery_requests SET status = 'link_issued', matched_card_id = $2, resolved_by = $3, resolved_at = now() WHERE id = $1", [requestId, target, session.userId]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'recovery.link_issued', 'recovery_request', requestId,
      { cardId: target, manualCard: !!cardId && cardId !== req.matched_card_id, contactMatches: !!card.contact_matches });
  });
  return {
    token,
    card: { cardId: target, publicCode: card.public_code as string, customerName: card.display_name as string, contactMatches: !!card.contact_matches },
    contact: req.contact as string, contactType: req.contact_type as 'whatsapp' | 'email',
  };
}

/** Cierra la solicitud: enlace enviado, atendida en persona, no es cliente o abuso. */
export async function closeRecovery(session: StaffSession, requestId: string, raw: unknown) {
  if (!(await recoverySchemaReady())) throw unavailable();
  const { resolution } = closeRecoverySchema.parse(raw);
  const status = resolution === 'link_sent' || resolution === 'in_person' ? 'resolved' : 'dismissed';
  return withTenant(session.businessId, async (tx) => {
    const r = (await tx.query('SELECT status FROM recovery_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    if (!r) throw notFound('Solicitud');
    if (r.status !== 'pending' && r.status !== 'link_issued') throw new AppError(409, 'recovery_closed', 'Esta solicitud ya está cerrada.');
    await tx.query('UPDATE recovery_requests SET status = $2, resolution = $3, resolved_by = $4, resolved_at = now() WHERE id = $1', [requestId, status, resolution, session.userId]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'recovery.closed', 'recovery_request', requestId, { resolution });
    return { ok: true, status };
  });
}

/** WhatsApp público del negocio (10 dígitos) o null para quitarlo. */
export async function setBusinessWhatsapp(session: StaffSession, raw: unknown) {
  if (!(await recoverySchemaReady())) throw unavailable();
  const { whatsapp } = businessWhatsappSchema.parse(raw);
  let value: string | null = null;
  if (whatsapp) {
    const c = normalizeContact(whatsapp);
    if (c.type !== 'whatsapp' || !c.contact) throw new AppError(422, 'invalid_contact', 'El WhatsApp debe tener 10 dígitos.');
    value = c.contact;
  }
  return withTenant(session.businessId, async (tx) => {
    await tx.query('UPDATE businesses SET contact_whatsapp = $2 WHERE id = $1', [session.businessId, value]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'business.contact_updated', 'business', session.businessId, { whatsapp: value ? 'set' : 'cleared' });
    return { businessWhatsapp: value };
  });
}

/** Al anonimizar un cliente: sus solicitudes quedan enmascaradas y cerradas. Sin 0017 no hace nada. */
export async function redactRecoveryForCustomer(tx: Tx, customerId: string) {
  if (!(await recoverySchemaReady(tx))) return;
  const rows = (await tx.query('SELECT r.id, r.contact, r.contact_type, r.status FROM recovery_requests r JOIN cards c ON c.id = r.matched_card_id WHERE c.customer_id = $1', [customerId])).rows;
  for (const r of rows) {
    const open = r.status === 'pending' || r.status === 'link_issued';
    await tx.query(`UPDATE recovery_requests SET contact = $2, name_hint = NULL${open ? ", status = 'dismissed', resolution = 'not_customer', resolved_at = now()" : ''} WHERE id = $1`,
      [r.id, maskContact(r.contact, r.contact_type)]);
  }
}
