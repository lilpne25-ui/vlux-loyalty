// Sesiones de personal (dueño y empleado). Token opaco en cookie HttpOnly; en BD solo el hash.
import { config } from '../config';
import { getPool, withTenant, withTx } from '../db';
import { AppError } from '../errors';
import { DUMMY_PASSWORD_HASH, newToken, sha256, verifyPassword } from '../security';
import { audit } from './audit';

export type Role = 'OWNER' | 'EMPLOYEE';
export interface StaffSession { sessionId: string; userId: string; email: string; displayName: string; businessId: string; businessSlug: string; businessName: string; role: Role; }

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const invalid = () => new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.');

export async function login(email: string, password: string, businessSlug?: string): Promise<{ token: string; session: StaffSession; businesses: { slug: string; name: string; role: Role }[] }> {
  const pool = getPool();
  const user = (await pool.query('SELECT id, email, display_name, password_hash, failed_logins, locked_until, disabled_at FROM staff_users WHERE email = $1', [email])).rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || user.disabled_at) throw invalid();
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(429, 'account_locked', `Demasiados intentos fallidos. Intenta de nuevo en unos minutos.`);
  }
  if (!ok) {
    await pool.query(
      `UPDATE staff_users SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END
       WHERE id = $1`,
      [user.id, MAX_FAILED, LOCK_MINUTES],
    );
    throw invalid();
  }
  const memberships = (await pool.query(
    `SELECT m.id, m.role, b.id AS business_id, b.slug, b.name FROM staff_memberships m JOIN businesses b ON b.id = m.business_id
      WHERE m.user_id = $1 AND m.active AND b.status = 'active' ORDER BY m.created_at`,
    [user.id],
  )).rows;
  if (!memberships.length) throw new AppError(403, 'no_business', 'Tu usuario no tiene un negocio activo.');
  const m = businessSlug ? memberships.find((x) => x.slug === businessSlug) : memberships[0];
  if (!m) throw new AppError(403, 'forbidden', 'No perteneces a ese negocio.');

  const token = newToken();
  const sessionId = await withTx(async (tx) => {
    await tx.query('UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    const s = (await tx.query(
      `INSERT INTO staff_sessions (token_hash, user_id, membership_id, business_id, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING id`,
      [sha256(token), user.id, m.id, m.business_id, config.staffSessionHours],
    )).rows[0].id as string;
    return s;
  });
  await withTenant(m.business_id, (tx) => audit(tx, m.business_id, { type: 'staff', id: user.id }, 'staff.login', 'staff_user', user.id, { role: m.role }));
  return {
    token,
    session: { sessionId, userId: user.id, email: user.email, displayName: user.display_name, businessId: m.business_id, businessSlug: m.slug, businessName: m.name, role: m.role },
    businesses: memberships.map((x) => ({ slug: x.slug, name: x.name, role: x.role })),
  };
}

/** Resuelve la sesión y revalida en cada solicitud que la membresía siga activa (revocación inmediata). */
export async function getStaffSession(token: string | undefined): Promise<StaffSession | null> {
  if (!token || token.length > 100) return null;
  const row = (await getPool().query(
    `SELECT s.id, s.user_id, u.email, u.display_name, s.business_id, b.slug, b.name, m.role
       FROM staff_sessions s
       JOIN staff_users u ON u.id = s.user_id
       JOIN staff_memberships m ON m.id = s.membership_id
       JOIN businesses b ON b.id = s.business_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.disabled_at IS NULL AND m.active AND b.status = 'active'`,
    [sha256(token)],
  )).rows[0];
  if (!row) return null;
  return { sessionId: row.id, userId: row.user_id, email: row.email, displayName: row.display_name, businessId: row.business_id, businessSlug: row.slug, businessName: row.name, role: row.role };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await getPool().query('UPDATE staff_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
}
