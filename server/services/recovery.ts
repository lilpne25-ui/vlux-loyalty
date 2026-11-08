// 1.0.x · Recuperación de acceso del cliente y WhatsApp público del negocio (migración 0017).
//
// Flujo: el cliente escribe el WhatsApp o correo con el que se registró → se guarda una SOLICITUD para el negocio
// (nunca se le dice si su tarjeta existe) → el dueño la ve en su panel y decide: generar un enlace nuevo (revoca el
// anterior) y enviarlo él mismo por WhatsApp/correo, atenderlo en persona o descartarla. Todo queda en la bitácora.
//
// Compatibilidad: si 0017 no está aplicada (o se revierte con la app encendida), estas rutas responden 503
// «recovery_unavailable» o available:false y el resto de la app sigue igual. La detección se recuerda 60 s como máximo y
// cualquier error 42P01/42703 (tabla o columna inexistente) la invalida al momento.
//
// Seguridad del enlace: rotar el token y cerrar la solicitud ocurren en UNA transacción (todo o nada). El enlace solo se
// entrega al contacto REGISTRADO del cliente o en persona; nunca al contacto que escribió quien lo pidió, salvo que sea
// el mismo. Si el contacto no coincide, el dueño debe confirmar que verificó la identidad en persona.
//
// Retención: ver db/migrations/0017_recovery_support.up.sql (30 días abiertas, 7 días tras generar el enlace,
// enmascarado al cerrar, borrado a los 90 días). retentionSweep() la aplica a todos los negocios.
import { z } from 'zod';
import { runWithScope, withTenant, withTx, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { sha256 } from '../security';
import { normalizeContact } from '../validation';
import { audit } from './audit';
import { getBusinessBySlug } from './businesses';
import type { StaffSession } from './auth';
import { rotateCardLinkTx } from './operations';

/** Máximo de solicitudes abiertas por negocio: por encima se responde igual pero no se guarda (frena el abuso). */
export const MAX_OPEN_REQUESTS = 200;
/** Tras generar el enlace, el contacto se conserva a lo más estos días (para reenviarlo) y luego se enmascara. */
export const LINK_ISSUED_RETENTION_DAYS = 7;
/** Protección contra doble toque: no se genera otro enlace para la misma solicitud antes de estos segundos. */
export const RELINK_GUARD_SECONDS = 15;
/** Vigencia de la detección positiva de 0017 (una reversa se nota a más tardar en este tiempo, o al primer error). */
const READY_TTL_MS = 60_000;

let readyUntil = 0;
/** ¿Está aplicada 0017? El «sí» se recuerda 60 s; el «no» nunca (la migración puede aplicarse con la app encendida). */
export async function recoverySchemaReady(tx?: Tx): Promise<boolean> {
  if (!tx && Date.now() < readyUntil) return true;
  const sql = `SELECT to_regclass('public.recovery_requests') IS NOT NULL
                  AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.businesses'::regclass AND attname = 'contact_whatsapp' AND NOT attisdropped) AS ok`;
  const r = tx ? await tx.query(sql) : await withTx((t) => t.query(sql));
  const ok = !!r.rows[0]?.ok;
  readyUntil = ok ? Date.now() + READY_TTL_MS : 0;
  return ok;
}
/** Olvida la detección (pruebas, o tras un error de esquema). */
export function resetRecoverySchemaCache() { readyUntil = 0; }

const unavailable = () => new AppError(503, 'recovery_unavailable', 'La recuperación en línea aún no está activa en este negocio. Pídela en caja: el personal puede darte un enlace nuevo.');

/** 42P01 = tabla inexistente, 42703 = columna inexistente, 42883 = función inexistente: 0017 no está (o se revirtió). */
export function isSchemaMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === '42P01' || code === '42703' || code === '42883';
}
/** Ejecuta una operación de recuperación; si 0017 desapareció, invalida la caché y responde 503 controlado. */
async function guarded<T>(fn: () => Promise<T>, onMissing?: () => T): Promise<T> {
  try { return await fn(); } catch (e) {
    if (!isSchemaMissing(e)) throw e;
    resetRecoverySchemaCache();
    if (onMissing) return onMissing();
    throw unavailable();
  }
}

/** Contacto enmascarado (misma regla que recovery_mask() en SQL): a***@g***.com, ******4567. */
export function maskContact(contact: string, type: 'whatsapp' | 'email'): string {
  if (type === 'email') {
    const [user, domain = ''] = contact.split('@');
    const tld = /\.[^.]*$/.exec(domain)?.[0] ?? '';
    return `${user.slice(0, 1)}***@${domain.slice(0, 1)}***${tld}`;
  }
  return `******${contact.slice(-4)}`;
}
/** Valor aleatorio para contact_hash al cerrar: ya no se puede re-identificar comparando hashes. */
const RANDOM_HASH_SQL = "sha256(convert_to(gen_random_uuid()::text, 'UTF8'))";
const contactHash = (businessId: string, type: string, contact: string) => sha256(`${businessId}|${type}|${contact}`);

export const recoveryRequestSchema = z.object({
  contact: z.string().trim().min(3, 'Escribe tu WhatsApp o correo.').max(120),
  name: z.string().trim().max(40).optional().default(''),
});

export const businessWhatsappSchema = z.object({ whatsapp: z.string().trim().max(20).nullable() });

export const closeRecoverySchema = z.object({ resolution: z.enum(['link_sent', 'in_person', 'not_customer', 'spam']) });

export const issueRecoveryLinkSchema = z.object({ cardId: z.string().uuid().optional(), identityVerified: z.boolean().optional().default(false) });

/** Vence (enmascara) las abiertas caducadas del negocio actual. Barato; corre en cada escritura y lectura de la bandeja. */
async function expireTenant(tx: Tx): Promise<number> {
  const r = await tx.query(
    `UPDATE recovery_requests SET status = 'expired', resolution = coalesce(resolution, 'expired'), resolved_at = coalesce(resolved_at, now()),
            contact = recovery_mask(contact, contact_type), name_hint = NULL, contact_hash = ${RANDOM_HASH_SQL}
      WHERE status IN ('pending','link_issued') AND expires_at < now()`,
  );
  return r.rowCount ?? 0;
}

/** Reintenta una vez ante interbloqueo (40P01) o serialización (40001): la transacción completa se repite. */
async function retryDeadlock<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      if (i < 2 && (code === '40P01' || code === '40001')) continue;
      throw e;
    }
  }
}

let lastSweep = 0;
/**
 * Barrido de retención de TODOS los negocios (vence y borra). Lo llama la tarea programada; la app además lo dispara
 * como máximo cada 10 min cuando hay actividad de recuperación, para no depender solo del programador.
 */
export async function retentionSweep(opts: { force?: boolean; limit?: number } = {}): Promise<{ expired: number; deleted: number } | null> {
  if (!opts.force && Date.now() - lastSweep < 10 * 60_000) return null;
  lastSweep = Date.now();
  if (!(await recoverySchemaReady())) return null;
  return guarded(async () => {
    // Siempre ESPERADO (nunca en segundo plano: en Vercel la instancia puede congelarse con la transacción abierta) y
    // acotado: máximo 3 s y sin quedar «idle in transaction».
    const r = await runWithScope('worker', () => withTx(async (tx) => {
      await tx.query("SET LOCAL statement_timeout = '3s'; SET LOCAL idle_in_transaction_session_timeout = '5s'; SET LOCAL lock_timeout = '1s'");
      return tx.query('SELECT recovery_retention_sweep($1) AS j', [opts.limit ?? 2000]);
    }));
    return r.rows[0].j as { expired: number; deleted: number };
  }, () => null);
}
/** Barrido oportunista desde una ruta real (no demo): esperado, pequeño y sin romper la respuesta si falla. */
const opportunisticSweep = async () => { await retentionSweep({ limit: 200 }).catch((e) => { console.error('[recovery] barrido de retención falló', (e as Error).message); return null; }); };

/** Datos públicos de ayuda del negocio (para la vista del cliente). Nunca falla por falta de 0017. */
export async function publicHelp(slug: string): Promise<{ recovery: boolean; businessWhatsapp: string | null }> {
  const biz = await getBusinessBySlug(slug);
  const off = (): { recovery: boolean; businessWhatsapp: string | null } => ({ recovery: false, businessWhatsapp: null });
  if (!(await recoverySchemaReady())) return off();
  return guarded(async (): Promise<{ recovery: boolean; businessWhatsapp: string | null }> => {
    const r = await withTenant(biz.id, (tx) => tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [biz.id]));
    return { recovery: true, businessWhatsapp: r.rows[0]?.contact_whatsapp ?? null };
  }, off);
}

/**
 * El cliente pide recuperar su acceso. Respuesta IDÉNTICA exista o no la tarjeta (no se puede usar para averiguar
 * quién es cliente). Repetir la solicitud no crea filas nuevas: suma al contador de la abierta.
 */
export async function requestRecovery(slug: string, raw: unknown): Promise<{ ok: true; queued: boolean; businessWhatsapp: string | null }> {
  const biz = await getBusinessBySlug(slug);
  const input = recoveryRequestSchema.parse(raw);
  const c = normalizeContact(input.contact);
  if (c.error) throw new AppError(422, 'invalid_contact', c.error);
  if (!c.contact || !c.type) throw new AppError(422, 'invalid_contact', 'Escribe tu WhatsApp o correo.');
  if (!(await recoverySchemaReady())) throw unavailable();
  const name = input.name.replace(/\s+/g, ' ') || null;
  const hash = contactHash(biz.id, c.type, c.contact);
  const out = await guarded(() => retryDeadlock(() => withTenant(biz.id, async (tx) => {
    // Serializa las solicitudes del mismo negocio (ANTES de tocar filas, para no interbloquear): el tope de abiertas
    // se respeta aun con llamadas simultáneas.
    await tx.query("SELECT pg_advisory_xact_lock(hashtextextended('recovery:' || $1, 0))", [biz.id]);
    await expireTenant(tx);
    let queued = true;
    const open = (await tx.query("SELECT count(*)::int AS n FROM recovery_requests WHERE status = 'pending'")).rows[0].n as number;
    const already = (await tx.query("SELECT id FROM recovery_requests WHERE contact_hash = $1 AND status = 'pending'", [hash])).rows[0];
    if (!already && open >= MAX_OPEN_REQUESTS) {
      await audit(tx, biz.id, { type: 'customer', id: null }, 'recovery.dropped', null, null, { reason: 'inbox_full' });
      queued = false;
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
                       expires_at = now() + interval '30 days',
                       name_hint = coalesce(EXCLUDED.name_hint, recovery_requests.name_hint),
                       matched_card_id = coalesce(EXCLUDED.matched_card_id, recovery_requests.matched_card_id)
         RETURNING id, request_count`,
        [biz.id, c.contact, c.type, hash, name, card?.id ?? null],
      )).rows[0];
      await audit(tx, biz.id, { type: 'customer', id: null }, 'recovery.requested', 'recovery_request', row.id, { matched: !!card, repeat: row.request_count > 1, contactType: c.type });
    }
    const w = (await tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [biz.id])).rows[0];
    // queued=false solo dice que la BANDEJA DEL NEGOCIO está llena (no revela si el contacto es cliente).
    return { ok: true as const, queued, businessWhatsapp: w?.contact_whatsapp ?? null };
  })));
  await opportunisticSweep();
  return out;
}

export interface RecoveryItem {
  id: string; status: string; resolution: string | null; contact: string; contactType: 'whatsapp' | 'email'; nameHint: string | null;
  requestCount: number; createdAt: string; lastRequestedAt: string; resolvedAt: string | null; expiresAt: string;
  match: { cardId: string; publicCode: string; customerName: string; contactMatches: boolean; hasRegisteredContact: boolean } | null;
}

/** Bandeja del dueño: abiertas primero. Nunca devuelve en claro un contacto vencido (se vence aquí mismo si hace falta). */
export async function listRecovery(session: StaffSession): Promise<{ available: boolean; pending: number; dropped24h: number; businessWhatsapp: string | null; requests: RecoveryItem[] }> {
  const off = () => ({ available: false, pending: 0, dropped24h: 0, businessWhatsapp: null, requests: [] });
  if (!(await recoverySchemaReady())) return off();
  const out = await guarded(() => withTenant(session.businessId, async (tx) => {
    if (!session.demo) await expireTenant(tx);
    const rows = (await tx.query(
      `SELECT r.*, c.public_code, cu.display_name, cu.contact IS NOT NULL AS has_contact,
              (cu.contact = r.contact AND cu.contact_type = r.contact_type) AS contact_matches
         FROM recovery_requests r
         LEFT JOIN cards c ON c.id = r.matched_card_id
         LEFT JOIN customers cu ON cu.id = c.customer_id
        ORDER BY (r.status = 'pending') DESC, r.last_requested_at DESC LIMIT 100`,
    )).rows;
    const dropped = (await tx.query("SELECT count(*)::int AS n FROM audit_events WHERE business_id = $1 AND action = 'recovery.dropped' AND created_at > now() - interval '24 hours'", [session.businessId])).rows[0].n as number;
    const w = (await tx.query('SELECT contact_whatsapp FROM businesses WHERE id = $1', [session.businessId])).rows[0];
    const now = Date.now();
    return {
      available: true,
      pending: rows.filter((r) => r.status === 'pending').length,
      dropped24h: dropped,
      businessWhatsapp: w?.contact_whatsapp ?? null,
      requests: rows.map((r) => {
        // Defensa extra (demo o carrera): si ya venció, nunca sale en claro aunque la fila aún no se haya escrito.
        const lapsed = (r.status === 'pending' || r.status === 'link_issued') && r.expires_at.getTime() < now;
        return {
          id: r.id, status: lapsed ? 'expired' : r.status, resolution: lapsed ? 'expired' : r.resolution,
          contact: lapsed ? maskContact(r.contact, r.contact_type) : r.contact, contactType: r.contact_type, nameHint: lapsed ? null : r.name_hint,
          requestCount: r.request_count, createdAt: r.created_at.toISOString(), lastRequestedAt: r.last_requested_at.toISOString(),
          resolvedAt: r.resolved_at?.toISOString() ?? null, expiresAt: r.expires_at.toISOString(),
          match: r.matched_card_id ? { cardId: r.matched_card_id, publicCode: r.public_code, customerName: r.display_name, contactMatches: !!r.contact_matches, hasRegisteredContact: !!r.has_contact } : null,
        };
      }),
    };
  }), off);
  if (!session.demo) await opportunisticSweep();
  return out;
}

/**
 * El dueño genera un enlace nuevo para la tarjeta de la solicitud (o para la que eligió a mano).
 * TODO en una transacción: bloquea tarjeta y solicitud, revoca los enlaces anteriores, crea el nuevo, marca la
 * solicitud y deja la bitácora. Si cualquier paso falla, no cambia nada (el enlace anterior sigue funcionando).
 * El enlace se entrega al contacto REGISTRADO del cliente (deliverTo) o en persona; nunca al contacto de la solicitud
 * si no coincide. Con contacto distinto exige identityVerified (el dueño confirmó la identidad en persona).
 */
export async function issueRecoveryLink(session: StaffSession, requestId: string, raw: unknown) {
  if (!(await recoverySchemaReady())) throw unavailable();
  const { cardId, identityVerified } = issueRecoveryLinkSchema.parse(raw ?? {});
  return guarded(() => retryDeadlock(() => withTenant(session.businessId, async (tx) => {
    // 1) Lectura sin bloqueo para saber qué tarjeta bloquear primero (mismo orden que la anonimización: tarjeta → solicitud).
    const peek = (await tx.query('SELECT matched_card_id FROM recovery_requests WHERE id = $1', [requestId])).rows[0];
    if (!peek) throw notFound('Solicitud');
    const target: string | null = cardId ?? peek.matched_card_id;
    if (!target) throw new AppError(422, 'card_required', 'Elige la tarjeta del cliente antes de generar el enlace.');
    const card = (await tx.query(
      `SELECT c.id, c.public_code, cu.display_name, cu.contact AS reg_contact, cu.contact_type AS reg_type
         FROM cards c JOIN customers cu ON cu.id = c.customer_id
        WHERE c.id = $1 AND c.status = 'active' AND cu.anonymized_at IS NULL FOR UPDATE OF c`,
      [target],
    )).rows[0];
    if (!card) throw notFound('Tarjeta');
    // 2) Solicitud bloqueada y revalidada (otra llamada pudo cerrarla o generar enlace mientras tanto).
    const req = (await tx.query(
      `SELECT id, status, matched_card_id, contact, contact_type, expires_at < now() AS lapsed,
              (status = 'link_issued' AND resolved_at > clock_timestamp() - make_interval(secs => $2)) AS just_issued
         FROM recovery_requests WHERE id = $1 FOR UPDATE`,
      [requestId, RELINK_GUARD_SECONDS],
    )).rows[0];
    if (!req) throw notFound('Solicitud');
    if ((req.status !== 'pending' && req.status !== 'link_issued') || req.lapsed) throw new AppError(409, 'recovery_closed', 'Esta solicitud ya está cerrada o venció.');
    if (req.just_issued) throw new AppError(409, 'recovery_link_recent', 'Acabas de generar un enlace para esta solicitud. Usa ese enlace o espera unos segundos.');
    const contactMatches = card.reg_contact === req.contact && card.reg_type === req.contact_type;
    if (!contactMatches && !identityVerified) {
      throw new AppError(409, 'identity_check_required', 'El contacto de la solicitud no coincide con el registrado. Confirma la identidad del cliente en persona antes de generar el enlace.');
    }
    // 3) Rotación + cierre, en la misma transacción.
    const token = await rotateCardLinkTx(tx, session, target);
    await tx.query(
      `UPDATE recovery_requests SET status = 'link_issued', matched_card_id = $2, resolved_by = $3, resolved_at = now(),
              expires_at = LEAST(expires_at, now() + make_interval(days => $4))
        WHERE id = $1 AND status IN ('pending','link_issued')`,
      [requestId, target, session.userId, LINK_ISSUED_RETENTION_DAYS],
    );
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'recovery.link_issued', 'recovery_request', requestId,
      { cardId: target, manualCard: !!cardId && cardId !== req.matched_card_id, contactMatches, identityVerified: !contactMatches });
    const deliverTo = card.reg_contact ? { contact: card.reg_contact as string, contactType: card.reg_type as 'whatsapp' | 'email' } : null;
    return {
      token,
      card: { cardId: target, publicCode: card.public_code as string, customerName: card.display_name as string, contactMatches },
      // Solo el contacto REGISTRADO del cliente. Sin contacto registrado: entrega en persona (QR).
      deliverTo,
    };
  })));
}

/** Cierra la solicitud: enlace enviado, atendida en persona, no es cliente o abuso. Al cerrar se enmascara. */
export async function closeRecovery(session: StaffSession, requestId: string, raw: unknown) {
  if (!(await recoverySchemaReady())) throw unavailable();
  const { resolution } = closeRecoverySchema.parse(raw);
  const status = resolution === 'link_sent' || resolution === 'in_person' ? 'resolved' : 'dismissed';
  return guarded(() => withTenant(session.businessId, async (tx) => {
    const r = (await tx.query('SELECT status FROM recovery_requests WHERE id = $1 FOR UPDATE', [requestId])).rows[0];
    if (!r) throw notFound('Solicitud');
    if (r.status !== 'pending' && r.status !== 'link_issued') throw new AppError(409, 'recovery_closed', 'Esta solicitud ya está cerrada.');
    await tx.query(
      `UPDATE recovery_requests SET status = $2, resolution = $3, resolved_by = $4, resolved_at = now(),
              contact = recovery_mask(contact, contact_type), name_hint = NULL, contact_hash = ${RANDOM_HASH_SQL}
        WHERE id = $1`,
      [requestId, status, resolution, session.userId],
    );
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'recovery.closed', 'recovery_request', requestId, { resolution });
    return { ok: true, status };
  }));
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
  return guarded(() => withTenant(session.businessId, async (tx) => {
    await tx.query('UPDATE businesses SET contact_whatsapp = $2 WHERE id = $1', [session.businessId, value]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'business.contact_updated', 'business', session.businessId, { whatsapp: value ? 'set' : 'cleared' });
    return { businessWhatsapp: value };
  }));
}

/**
 * Al anonimizar un cliente: TODAS sus solicitudes (vinculadas a sus tarjetas, o con su contacto aunque no se hayan
 * vinculado) quedan enmascaradas, sin nombre, con hash aleatorio y cerradas si seguían abiertas.
 * Corre dentro de la transacción de anonimización bajo un SAVEPOINT: si 0017 no existe o se revirtió, no hace nada y
 * NUNCA aborta la anonimización. Devuelve cuántas solicitudes redactó (o null sin 0017).
 */
export async function redactRecoveryForCustomer(tx: Tx, businessId: string, customerId: string, contact: { contact: string | null; type: string | null }): Promise<number | null> {
  await tx.query('SAVEPOINT recovery_redact');
  try {
    if (!(await recoverySchemaReady(tx))) { await tx.query('RELEASE SAVEPOINT recovery_redact'); return null; }
    const hash = contact.contact && contact.type ? contactHash(businessId, contact.type, contact.contact) : null;
    const r = await tx.query(
      `UPDATE recovery_requests r
          SET contact = recovery_mask(r.contact, r.contact_type), name_hint = NULL, contact_hash = ${RANDOM_HASH_SQL},
              status = CASE WHEN r.status IN ('pending','link_issued') THEN 'dismissed' ELSE r.status END,
              resolution = CASE WHEN r.status IN ('pending','link_issued') THEN 'not_customer' ELSE r.resolution END,
              resolved_at = coalesce(r.resolved_at, now())
        WHERE r.matched_card_id IN (SELECT id FROM cards WHERE customer_id = $1)
           OR (r.matched_card_id IS NULL AND (r.contact_hash = $2 OR (r.contact = $3 AND r.contact_type = $4))
               -- Si OTRO cliente activo comparte ese contacto, su solicitud no se toca (customers.contact no es único).
               AND NOT EXISTS (SELECT 1 FROM customers o WHERE o.id <> $1 AND o.anonymized_at IS NULL AND o.contact = $3 AND o.contact_type = $4))`,
      [customerId, hash, contact.contact, contact.type],
    );
    await tx.query('RELEASE SAVEPOINT recovery_redact');
    return r.rowCount ?? 0;
  } catch (e) {
    // Esquema ausente o permisos incompletos (p. ej. restauración con un grants.sql anterior a 0017): la anonimización
    // del cliente (derecho ARCO) nunca debe fallar por la tabla de recuperación. Se registra y se sigue.
    const code = (e as { code?: string } | null)?.code;
    if (!isSchemaMissing(e) && code !== '42501') throw e;
    await tx.query('ROLLBACK TO SAVEPOINT recovery_redact');
    if (code === '42501') {
      // Queda constancia en la bitácora del negocio: las solicitudes de este cliente NO se pudieron redactar.
      console.error('[recovery] sin permisos sobre recovery_requests: revisa ops/grants.sql (0017)');
      await audit(tx, businessId, { type: 'system', id: null }, 'recovery.redact_failed', 'customer', customerId, { reason: 'permission_denied' });
    }
    resetRecoverySchemaCache();
    return null;
  }
}
