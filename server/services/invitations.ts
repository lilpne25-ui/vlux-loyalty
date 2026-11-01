// V0.3 · Invitaciones de personal (dueños y empleados) de un solo uso.
// El token solo existe en el enlace (fragmento #, no viaja en logs); en BD vive su hash.
// Si el correo ya tiene cuenta, se vincula SOLO si la persona prueba que es suya con su contraseña actual:
// nunca se sobrescribe una contraseña existente.
import { z } from 'zod';
import { config } from '../config';
import { getPool, withTenant, withTx, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { DUMMY_PASSWORD_HASH, hashPassword, newToken, sha256, verifyPassword } from '../security';
import { emailSchema, passwordSchema } from '../validation';
import { audit } from './audit';
import { createStaffSession, type Role } from './auth';
import { platformAudit } from './platform-auth';

const MAX_ATTEMPTS = 5;

export const inviteSchema = z.object({ email: emailSchema, displayName: z.string().trim().min(2).max(60) });
export const acceptSchema = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(1).max(200),
  displayName: z.string().trim().min(2).max(60).optional(),
});

export type Inviter = { type: 'platform' | 'staff'; id: string };
export type InvitationStatus = 'pendiente' | 'aceptada' | 'revocada' | 'vencida';

const statusOf = (r: { accepted_at: Date | null; revoked_at: Date | null; expires_at: Date }): InvitationStatus =>
  r.accepted_at ? 'aceptada' : r.revoked_at ? 'revocada' : new Date(r.expires_at) <= new Date() ? 'vencida' : 'pendiente';

/** Crea una invitación (dentro de la transacción del llamador). Revoca la invitación abierta anterior del mismo correo. */
export async function createInvitation(tx: Tx, p: { businessId: string; email: string; displayName: string; role: Role; by: Inviter }) {
  const member = (await tx.query(
    `SELECT m.active FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id WHERE m.business_id = $1 AND u.email = $2`,
    [p.businessId, p.email],
  )).rows[0];
  if (member?.active) throw new AppError(409, 'already_member', 'Esa persona ya tiene acceso a este negocio.');
  await tx.query('UPDATE staff_invitations SET revoked_at = now() WHERE business_id = $1 AND email = $2 AND accepted_at IS NULL AND revoked_at IS NULL', [p.businessId, p.email]);
  const token = newToken();
  const id = (await tx.query(
    `INSERT INTO staff_invitations (token_hash, business_id, email, display_name, role, invited_by_type, invited_by_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now() + make_interval(hours => $8)) RETURNING id, expires_at`,
    [sha256(token), p.businessId, p.email, p.displayName, p.role, p.by.type, p.by.id, config.invitationHours],
  )).rows[0];
  return { token, invitationId: id.id as string, expiresAt: id.expires_at as Date };
}

async function auditInvitation(businessId: string, by: Inviter, action: string, invitationId: string, details: Record<string, unknown> = {}) {
  await withTenant(businessId, (tx) => audit(tx, businessId, by.type === 'platform' ? { type: 'platform', id: null } : { type: 'staff', id: by.id }, action, 'staff_invitation', invitationId, details));
  if (by.type === 'platform') await platformAudit(getPool(), by.id, action, { businessId, entityType: 'staff_invitation', entityId: invitationId, details });
}

export async function inviteStaff(p: { businessId: string; email: string; displayName: string; role: Role; by: Inviter }) {
  const r = await withTx((tx) => createInvitation(tx, p));
  await auditInvitation(p.businessId, p.by, 'invitation.created', r.invitationId, { role: p.role });
  return r;
}

export async function listInvitations(businessId: string, role?: Role) {
  const rows = (await getPool().query(
    `SELECT id, email, display_name, role, expires_at, accepted_at, revoked_at, created_at, invited_by_type
       FROM staff_invitations WHERE business_id = $1 AND ($2::text IS NULL OR role = $2) ORDER BY created_at DESC LIMIT 50`,
    [businessId, role ?? null],
  )).rows;
  return rows.map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, role: r.role, status: statusOf(r), expiresAt: r.expires_at, acceptedAt: r.accepted_at, createdAt: r.created_at, invitedBy: r.invited_by_type }));
}

export async function revokeInvitation(businessId: string, invitationId: string, by: Inviter, role?: Role) {
  const r = await getPool().query(
    `UPDATE staff_invitations SET revoked_at = now()
      WHERE id = $1 AND business_id = $2 AND ($3::text IS NULL OR role = $3) AND accepted_at IS NULL AND revoked_at IS NULL RETURNING id`,
    [invitationId, businessId, role ?? null],
  );
  if (!r.rowCount) throw new AppError(404, 'not_found', 'La invitación no existe o ya no está pendiente.');
  await auditInvitation(businessId, by, 'invitation.revoked', invitationId);
  return { ok: true };
}

/** Reenvío = nueva invitación con los mismos datos (la anterior queda revocada). Sirve también para vencidas. */
export async function resendInvitation(businessId: string, invitationId: string, by: Inviter, role?: Role) {
  const old = (await getPool().query(
    'SELECT email, display_name, role, accepted_at FROM staff_invitations WHERE id = $1 AND business_id = $2 AND ($3::text IS NULL OR role = $3)',
    [invitationId, businessId, role ?? null],
  )).rows[0];
  if (!old) throw notFound('Invitación');
  if (old.accepted_at) throw new AppError(409, 'already_accepted', 'Esa invitación ya se aceptó.');
  const r = await withTx((tx) => createInvitation(tx, { businessId, email: old.email, displayName: old.display_name, role: old.role, by }));
  await auditInvitation(businessId, by, 'invitation.resent', r.invitationId, { previous: invitationId });
  return r;
}

// ---------- Lado de quien recibe la invitación ----------
async function findByToken(token: string) {
  return (await getPool().query(
    `SELECT i.id, i.business_id, i.email, i.display_name, i.role, i.expires_at, i.accepted_at, i.revoked_at, i.failed_attempts,
            b.name AS business_name, b.slug, b.status AS business_status,
            (SELECT id FROM staff_users u WHERE u.email = i.email) AS user_id
       FROM staff_invitations i JOIN businesses b ON b.id = i.business_id WHERE i.token_hash = $1`,
    [sha256(token)],
  )).rows[0];
}

const invalidInvite = () => new AppError(404, 'invalid_invitation', 'Esta invitación no es válida. Pide una nueva a quien te invitó.');

function checkUsable(inv: Awaited<ReturnType<typeof findByToken>>) {
  if (!inv || inv.revoked_at) throw invalidInvite();
  if (inv.accepted_at) throw new AppError(409, 'invitation_used', 'Esta invitación ya se usó. Entra con tu correo y contraseña.');
  if (new Date(inv.expires_at) <= new Date()) throw new AppError(410, 'invitation_expired', 'Esta invitación venció. Pide que te la reenvíen.');
  if (inv.business_status !== 'active') throw new AppError(403, 'business_suspended', 'El servicio de este negocio está suspendido. Contacta a VLUX.');
}

export async function inspectInvitation(token: string) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw invalidInvite();
  const inv = await findByToken(token);
  checkUsable(inv);
  return { businessName: inv.business_name, role: inv.role as Role, email: inv.email as string, displayName: inv.display_name as string, accountExists: !!inv.user_id, expiresAt: inv.expires_at };
}

/** Acepta la invitación y deja la sesión iniciada en ese negocio. */
export async function acceptInvitation(raw: unknown) {
  const input = acceptSchema.parse(raw);
  const inv = await findByToken(input.token);
  checkUsable(inv);
  if (inv.failed_attempts >= MAX_ATTEMPTS) throw invalidInvite();

  let newHash: string | null = null;
  if (inv.user_id) {
    const u = (await getPool().query('SELECT password_hash, disabled_at FROM staff_users WHERE id = $1', [inv.user_id])).rows[0];
    const ok = await verifyPassword(input.password, u?.password_hash ?? DUMMY_PASSWORD_HASH);
    if (!ok || u.disabled_at) {
      const r = (await getPool().query(
        `UPDATE staff_invitations SET failed_attempts = failed_attempts + 1,
           revoked_at = CASE WHEN failed_attempts + 1 >= $2 THEN now() ELSE revoked_at END
         WHERE id = $1 RETURNING failed_attempts`, [inv.id, MAX_ATTEMPTS],
      )).rows[0];
      await withTenant(inv.business_id, (tx) => audit(tx, inv.business_id, { type: 'system', id: null }, 'invitation.failed_attempt', 'staff_invitation', inv.id, { attempts: r.failed_attempts }));
      throw new AppError(401, 'invalid_credentials', r.failed_attempts >= MAX_ATTEMPTS
        ? 'Demasiados intentos. La invitación se canceló; pide una nueva.'
        : 'Ese correo ya tiene cuenta en VLUX. Escribe tu contraseña actual para vincular este negocio.');
    }
  } else {
    newHash = await hashPassword(passwordSchema.parse(input.password));
  }

  const result = await withTx(async (tx) => {
    // Marca la invitación como usada de forma atómica: solo una aceptación gana.
    const claimed = await tx.query(
      `UPDATE staff_invitations SET accepted_at = now()
        WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now() RETURNING id`, [inv.id],
    );
    if (!claimed.rowCount) throw new AppError(409, 'invitation_used', 'Esta invitación ya se usó.');
    let userId = inv.user_id as string | null;
    if (!userId) {
      const dup = (await tx.query('SELECT id FROM staff_users WHERE email = $1', [inv.email])).rows[0];
      if (dup) throw new AppError(409, 'retry', 'Se creó una cuenta con ese correo mientras tanto. Vuelve a abrir la invitación.');
      userId = (await tx.query('INSERT INTO staff_users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id',
        [inv.email, newHash, input.displayName || inv.display_name])).rows[0].id as string;
    }
    const existing = (await tx.query('SELECT id FROM staff_memberships WHERE business_id = $1 AND user_id = $2', [inv.business_id, userId])).rows[0];
    let membershipId: string;
    if (existing) {
      await tx.query('UPDATE staff_memberships SET active = true, role = $2 WHERE id = $1', [existing.id, inv.role]);
      membershipId = existing.id;
    } else {
      membershipId = (await tx.query('INSERT INTO staff_memberships (business_id, user_id, role) VALUES ($1, $2, $3) RETURNING id', [inv.business_id, userId, inv.role])).rows[0].id;
    }
    await tx.query('UPDATE staff_invitations SET accepted_user_id = $2 WHERE id = $1', [inv.id, userId]);
    const session = await createStaffSession(tx, userId, membershipId, inv.business_id);
    return { userId, membershipId, token: session.token, linkedExisting: !!inv.user_id };
  });
  await withTenant(inv.business_id, (tx) => audit(tx, inv.business_id, { type: 'staff', id: result.userId }, 'invitation.accepted', 'staff_invitation', inv.id, { role: inv.role, linkedExisting: result.linkedExisting }));
  return { token: result.token, role: inv.role as Role, businessSlug: inv.slug as string, linkedExisting: result.linkedExisting };
}
