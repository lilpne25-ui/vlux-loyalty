// V0.2.1 · funciones operativas mínimas para el piloto (reducen llamadas de soporte a VLUX):
//  - cambio de contraseña del personal y contraseña temporal con cambio obligatorio,
//  - enlace de restablecimiento de un solo uso (60 min) emitido por el dueño o por la plataforma,
//  - reemisión del enlace personal de una tarjeta (revoca los anteriores),
//  - anulación auditada de una compra registrada por error.
import { z } from 'zod';
import { getPool, withTenant, withTx } from '../db';
import { AppError, notFound } from '../errors';
import { hashPassword, newToken, sha256, verifyPassword } from '../security';
import { passwordSchema } from '../validation';
import { audit } from './audit';
import type { StaffSession } from './auth';

const RESET_MINUTES = 60;

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema });
export const resetWithTokenSchema = z.object({ token: z.string().min(30).max(100), newPassword: passwordSchema });
export const voidPurchaseSchema = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo (mínimo 3 caracteres).').max(200) });

/** El usuario cambia su propia contraseña. Revoca sus demás sesiones. */
export async function changePassword(session: StaffSession, raw: unknown) {
  const input = changePasswordSchema.parse(raw);
  const u = (await getPool().query('SELECT password_hash FROM staff_users WHERE id = $1', [session.userId])).rows[0];
  if (!u || !(await verifyPassword(input.currentPassword, u.password_hash))) throw new AppError(401, 'invalid_credentials', 'La contraseña actual no es correcta.');
  if (input.currentPassword === input.newPassword) throw new AppError(422, 'validation', 'La nueva contraseña debe ser distinta.');
  const hash = await hashPassword(input.newPassword);
  await withTx(async (tx) => {
    await tx.query('UPDATE staff_users SET password_hash = $2, must_change_password = false, failed_logins = 0, locked_until = NULL WHERE id = $1', [session.userId, hash]);
    await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [session.userId, session.sessionId]);
  });
  await withTenant(session.businessId, (tx) => audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'staff.password_changed', 'staff_user', session.userId));
  return { ok: true };
}

/** Crea un enlace de un solo uso para fijar una contraseña nueva. Devuelve el token en claro UNA vez. */
async function issueResetToken(userId: string) {
  const token = newToken();
  await withTx(async (tx) => {
    // Solo un enlace vigente por usuario.
    await tx.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    await tx.query(`INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`, [userId, sha256(token), RESET_MINUTES]);
  });
  return { token, expiresInMinutes: RESET_MINUTES };
}

/** El dueño emite un enlace de restablecimiento para un empleado de SU negocio. */
export async function ownerIssueEmployeeReset(session: StaffSession, membershipId: string) {
  const m = (await getPool().query('SELECT user_id, role FROM staff_memberships WHERE id = $1 AND business_id = $2', [membershipId, session.businessId])).rows[0];
  if (!m) throw notFound('Empleado');
  if (m.role === 'OWNER') throw new AppError(422, 'cannot_change_owner', 'La contraseña del dueño se cambia desde su propia cuenta.');
  const r = await issueResetToken(m.user_id);
  await withTenant(session.businessId, (tx) => audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'staff.reset_issued', 'staff_membership', membershipId));
  return r;
}

/** Plataforma (equipo VLUX): enlace de restablecimiento para el dueño que olvidó su contraseña. */
export async function platformIssueReset(email: string) {
  const u = (await getPool().query('SELECT id FROM staff_users WHERE email = $1 AND disabled_at IS NULL', [email.trim().toLowerCase()])).rows[0];
  if (!u) throw notFound('Usuario');
  return issueResetToken(u.id);
}

/** Canjea el enlace: fija la contraseña, revoca todas las sesiones y desbloquea la cuenta. */
export async function resetPasswordWithToken(raw: unknown) {
  const input = resetWithTokenSchema.parse(raw);
  const hash = await hashPassword(input.newPassword);
  const ok = await withTx(async (tx) => {
    const t = (await tx.query('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() FOR UPDATE', [sha256(input.token)])).rows[0];
    if (!t) return null;
    await tx.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [t.id]);
    await tx.query('UPDATE staff_users SET password_hash = $2, must_change_password = false, failed_logins = 0, locked_until = NULL WHERE id = $1', [t.user_id, hash]);
    await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [t.user_id]);
    const businesses = (await tx.query('SELECT business_id FROM staff_memberships WHERE user_id = $1', [t.user_id])).rows;
    return businesses.map((r) => ({ b: r.business_id as string, u: t.user_id as string }));
  });
  if (!ok) throw new AppError(400, 'invalid_reset_link', 'El enlace no es válido o ya venció. Pide uno nuevo.');
  for (const { b, u } of ok) await withTenant(b, (tx) => audit(tx, b, { type: 'staff', id: u }, 'staff.password_reset', 'staff_user', u));
  return { ok: true };
}

/** Reemite el enlace personal de una tarjeta (cliente cambió de teléfono o lo perdió). Revoca los anteriores. */
export async function reissueCardLink(session: StaffSession, cardId: string) {
  const token = newToken();
  await withTenant(session.businessId, async (tx) => {
    const card = (await tx.query("SELECT id FROM cards WHERE id = $1 AND status = 'active' FOR UPDATE", [cardId])).rows[0];
    if (!card) throw notFound('Tarjeta');
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'card.link_reissued', 'card', cardId);
  });
  await withTx(async (tx) => {
    await tx.query('UPDATE card_access_tokens SET revoked_at = now() WHERE card_id = $1 AND business_id = $2 AND revoked_at IS NULL', [cardId, session.businessId]);
    await tx.query('INSERT INTO card_access_tokens (token_hash, card_id, business_id) VALUES ($1, $2, $3)', [sha256(token), cardId, session.businessId]);
  });
  return { token };
}

/**
 * Anula una compra registrada por error (solo dueño). No borra nada: marca la compra y agrega un
 * movimiento negativo al libro mayor. Si esos sellos ya se usaron en un canje, se rechaza.
 * Si la recompensa disponible dependía de esos sellos, la recompensa se invalida.
 */
export async function voidPurchase(session: StaffSession, purchaseId: string, raw: unknown) {
  const { reason } = voidPurchaseSchema.parse(raw);
  return withTenant(session.businessId, async (tx) => {
    const p = (await tx.query('SELECT id, card_id, stamps_awarded, voided_at FROM purchases WHERE id = $1', [purchaseId])).rows[0];
    if (!p) throw notFound('Compra');
    const card = (await tx.query('SELECT id, stamp_balance FROM cards WHERE id = $1 FOR UPDATE', [p.card_id])).rows[0];
    const fresh = (await tx.query('SELECT voided_at FROM purchases WHERE id = $1 FOR UPDATE', [purchaseId])).rows[0];
    if (fresh.voided_at) throw new AppError(409, 'already_voided', 'Esta compra ya estaba anulada.');
    if (p.stamps_awarded > card.stamp_balance) {
      throw new AppError(409, 'stamps_already_used', 'Los sellos de esta compra ya se usaron en un canje; no se puede anular.');
    }
    const balance = card.stamp_balance - p.stamps_awarded;
    await tx.query('UPDATE purchases SET voided_at = now(), voided_by = $2, void_reason = $3 WHERE id = $1', [purchaseId, session.userId, reason]);
    if (p.stamps_awarded > 0) {
      await tx.query("INSERT INTO stamp_events (business_id, card_id, delta, reason, purchase_id, balance_after, staff_user_id) VALUES ($1, $2, $3, 'void', $4, $5, $6)",
        [session.businessId, card.id, -p.stamps_awarded, purchaseId, balance, session.userId]);
      await tx.query('UPDATE cards SET stamp_balance = $2 WHERE id = $1', [card.id, balance]);
    }
    const reward = (await tx.query("SELECT id, stamps_cost FROM rewards WHERE card_id = $1 AND status = 'available' FOR UPDATE", [card.id])).rows[0];
    let rewardVoided = false;
    if (reward && balance < reward.stamps_cost) {
      await tx.query("UPDATE rewards SET status = 'void' WHERE id = $1", [reward.id]);
      rewardVoided = true;
    }
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'purchase.voided', 'purchase', purchaseId, { stamps: p.stamps_awarded, rewardVoided, reason });
    return { purchaseId, stampsRemoved: p.stamps_awarded, balance, rewardVoided };
  });
}
