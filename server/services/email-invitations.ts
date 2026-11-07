// V0.4.5 · Envío de invitaciones por correo con buzón de salida (outbox) posterior al commit.
// Orden garantizado: 1) la invitación y su fila de outbox se guardan en la MISMA transacción (createInvitation);
// 2) al pedir el envío se marca "requested" y se confirma; 3) recién entonces se llama al proveedor; 4) se registra el
// resultado. Si el proceso muere entre 3 y 4, el reintento usa la misma llave de idempotencia del intento.
import { getPool, runWithScope, withTenant, withTx, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { decryptSecret, encryptSecret } from '../totp';
import { emailConfigFromEnv, verifyWebhookSignature } from '../email/provider';
import { invitationEmail } from '../email/templates';
import { audit } from './audit';
import { platformAudit } from './platform-auth';

/** Máximo de mensajes aceptados por el proveedor para una misma invitación (anti-abuso). */
export const MAX_SENDS_PER_INVITATION = 3;
/** Espera mínima entre dos solicitudes de envío de la misma invitación. */
export const RESEND_COOLDOWN_SECONDS = 60;

export type EmailStatus = 'pending' | 'requested' | 'accepted' | 'delivered' | 'failed' | 'bounced' | 'complained' | 'not_configured';

/** Dentro de la transacción de la invitación: guarda el token cifrado para poder enviarlo/reintentar después. */
export async function attachOutbox(tx: Tx, p: { invitationId: string; businessId: string; email: string; token: string }) {
  await tx.query(
    `INSERT INTO email_outbox (business_id, invitation_id, to_email, link_enc) VALUES ($1, $2, $3, $4)`,
    [p.businessId, p.invitationId, p.email, encryptSecret(p.token)],
  );
}

/** Deja de guardar el token cuando la invitación ya no se puede usar (aceptada, revocada o reemplazada). */
export async function forgetToken(q: Tx | ReturnType<typeof getPool>, where: { invitationId?: string; businessId?: string; email?: string }) {
  if (where.invitationId) await q.query('UPDATE email_outbox SET link_enc = NULL WHERE invitation_id = $1 AND link_enc IS NOT NULL', [where.invitationId]);
  else await q.query(
    `UPDATE email_outbox o SET link_enc = NULL FROM staff_invitations i
      WHERE o.invitation_id = i.id AND i.business_id = $1 AND i.email = $2 AND o.link_enc IS NOT NULL AND (i.revoked_at IS NOT NULL OR i.accepted_at IS NOT NULL)`,
    [where.businessId, where.email],
  );
}

export function emailState() {
  const cfg = emailConfigFromEnv();
  return { state: cfg.state, from: cfg.from, webhook: !!cfg.webhookSecret, provider: cfg.provider?.name ?? null };
}

export async function sendInvitationEmail(p: { adminId: string; businessId: string; invitationId: string; linkBase: string; assetBase: string }) {
  const cfg = emailConfigFromEnv();
  // 1) Reserva del envío (transacción corta y confirmada antes de hablar con el proveedor).
  const job = await withTenant(p.businessId, async (tx) => {
    const r = (await tx.query(
      `SELECT o.id, o.status, o.link_enc, o.attempts, o.sends_accepted, o.requested_at, o.to_email,
              i.display_name, i.role, i.expires_at, i.accepted_at, i.revoked_at, b.name AS business_name, b.status AS business_status
         FROM email_outbox o JOIN staff_invitations i ON i.id = o.invitation_id JOIN businesses b ON b.id = i.business_id
        WHERE o.invitation_id = $1 AND i.business_id = $2 FOR UPDATE OF o`, [p.invitationId, p.businessId],
    )).rows[0];
    if (!r) throw notFound('Invitación');
    if (r.accepted_at) throw new AppError(409, 'already_accepted', 'Esa invitación ya se aceptó.');
    if (r.revoked_at) throw new AppError(409, 'invitation_revoked', 'Esa invitación fue revocada o reemplazada. Genera una nueva.');
    if (new Date(r.expires_at) <= new Date()) throw new AppError(410, 'invitation_expired', 'La invitación venció. Genera un nuevo enlace y envíalo.');
    if (r.business_status === 'archived') throw new AppError(409, 'archived', 'El negocio está archivado.');
    if (!r.link_enc) throw new AppError(409, 'link_unavailable', 'Este enlace ya no se puede reenviar. Genera un nuevo enlace.');
    if (r.sends_accepted >= MAX_SENDS_PER_INVITATION) throw new AppError(429, 'send_limit', `Ya se enviaron ${MAX_SENDS_PER_INVITATION} correos para esta invitación. Comparte el enlace por otro medio o genera uno nuevo.`);
    if (r.status === 'requested' && r.requested_at && Date.now() - new Date(r.requested_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      throw new AppError(409, 'send_in_progress', 'Ya se está enviando este correo. Espera un momento.');
    }
    if (['accepted', 'delivered'].includes(r.status) && r.requested_at && Date.now() - new Date(r.requested_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
      throw new AppError(429, 'cooldown', 'Acabas de enviar este correo. Espera un minuto antes de reenviarlo.');
    }
    const attempt = r.attempts + 1;
    await tx.query(`UPDATE email_outbox SET status = 'requested', attempts = $2, requested_at = now(), provider = $3, last_error = NULL WHERE id = $1`, [r.id, attempt, cfg.provider?.name ?? null]);
    await tx.query(`INSERT INTO email_events (outbox_id, business_id, kind) VALUES ($1, $2, 'requested')`, [r.id, p.businessId]);
    return { ...r, attempt, token: decryptSecret(r.link_enc) as string };
  });

  const finish = async (status: EmailStatus, extra: { messageId?: string; error?: string } = {}) => {
    await withTenant(p.businessId, async (tx) => {
      await tx.query(
        `UPDATE email_outbox SET status = $2, provider_message_id = coalesce($3, provider_message_id), last_error = $4,
           accepted_at = CASE WHEN $2 = 'accepted' THEN now() ELSE accepted_at END,
           failed_at = CASE WHEN $2 = 'failed' THEN now() ELSE failed_at END,
           sends_accepted = sends_accepted + CASE WHEN $2 = 'accepted' THEN 1 ELSE 0 END
         WHERE id = $1`, [job.id, status, extra.messageId ?? null, extra.error?.slice(0, 300) ?? null],
      );
      await tx.query('INSERT INTO email_events (outbox_id, business_id, kind, detail) VALUES ($1, $2, $3, $4)', [job.id, p.businessId, status, extra.error?.slice(0, 300) ?? null]);
      await platformAudit(tx, p.adminId, `invitation.email_${status}`, { businessId: p.businessId, entityType: 'staff_invitation', entityId: p.invitationId, details: { attempt: job.attempt, provider: cfg.provider?.name ?? 'none' } });
    });
    await withTenant(p.businessId, (tx) => audit(tx, p.businessId, { type: 'platform', id: null }, `invitation.email_${status}`, 'staff_invitation', p.invitationId, { attempt: job.attempt }));
    return { status, attempt: job.attempt, provider: cfg.provider?.name ?? null, messageId: extra.messageId ?? null, error: extra.error ?? null };
  };

  if (!cfg.provider) return finish('not_configured', { error: 'Proveedor de correo no configurado.' });
  const mail = invitationEmail({
    businessName: job.business_name, inviteeName: job.display_name, role: job.role, link: `${p.linkBase}/invitacion#${job.token}`,
    expiresAt: new Date(job.expires_at), assetBase: p.assetBase, supportEmail: process.env.EMAIL_SUPPORT || process.env.EMAIL_REPLY_TO || null,
  });
  const res = await cfg.provider.send({ to: job.to_email, ...mail, idempotencyKey: `vlux-inv-${job.id}-${job.attempt}`, tags: { kind: 'staff_invitation', role: job.role } });
  return res.ok ? finish('accepted', { messageId: res.messageId }) : finish('failed', { error: res.error });
}

// ---------- Webhook del proveedor (Resend / Svix) ----------
const EVENT_MAP: Record<string, { kind: string; status?: EmailStatus }> = {
  'email.sent': { kind: 'accepted' },
  'email.delivered': { kind: 'delivered', status: 'delivered' },
  'email.bounced': { kind: 'bounced', status: 'bounced' },
  'email.complained': { kind: 'complained', status: 'complained' },
  'email.failed': { kind: 'failed', status: 'failed' },
  'email.suppressed': { kind: 'failed', status: 'failed' },
  'email.delivery_delayed': { kind: 'delayed' },
  'email.opened': { kind: 'opened' },
};

export async function handleEmailWebhook(headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, rawBody: string) {
  const cfg = emailConfigFromEnv();
  if (!cfg.webhookSecret) throw new AppError(404, 'not_found', 'Ruta no encontrada.');
  if (!verifyWebhookSignature(cfg.webhookSecret, headers, rawBody)) throw new AppError(401, 'invalid_signature', 'Firma inválida.');
  let evt: { type?: string; data?: { email_id?: string } };
  try { evt = JSON.parse(rawBody); } catch { throw new AppError(422, 'validation', 'Cuerpo inválido.'); }
  const map = EVENT_MAP[evt.type ?? ''] ?? { kind: 'other' };
  const msgId = evt.data?.email_id;
  if (!msgId) return { ok: true, matched: false };
  // 1) Localizar la salida por el id que asignó el proveedor (no hay negocio todavía): alcance webhook, solo lectura.
  const found = (await runWithScope('webhook', () => withTx((tx) => tx.query('SELECT id, business_id FROM email_outbox WHERE provider_message_id = $1', [msgId])))).rows[0];
  if (!found) return { ok: true, matched: false };
  // 2) Todo lo demás ocurre dentro del negocio dueño de esa salida.
  return withTenant(found.business_id as string, async (tx) => {
    const o = (await tx.query('SELECT id, business_id, status FROM email_outbox WHERE id = $1 FOR UPDATE', [found.id])).rows[0];
    if (!o) return { ok: true, matched: false };
    const ins = await tx.query('INSERT INTO email_events (outbox_id, business_id, event_key, kind, detail) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (event_key) DO NOTHING RETURNING id',
      [o.id, o.business_id, headers.id, map.kind, String(evt.type).slice(0, 60)]);
    if (!ins.rowCount) return { ok: true, matched: true, duplicate: true };
    // Un "entregado" no borra un rebote/queja posterior; un rebote siempre prevalece.
    if (map.status && !(map.status === 'delivered' && ['bounced', 'complained'].includes(o.status))) {
      await tx.query(`UPDATE email_outbox SET status = $2, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END WHERE id = $1`, [o.id, map.status]);
    }
    return { ok: true, matched: true };
  });
}
