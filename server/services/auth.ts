// Sesiones de personal (dueño y empleado). Token opaco en cookie HttpOnly; en BD solo el hash.
import { config } from '../config';
import { getPool, withTenant, withTx } from '../db';
import { AppError } from '../errors';
import { DUMMY_PASSWORD_HASH, newToken, sha256, verifyPassword } from '../security';
import { audit } from './audit';

export type Role = 'OWNER' | 'EMPLOYEE';
export interface StaffSession { sessionId: string; userId: string; email: string; displayName: string; businessId: string; businessSlug: string; businessName: string; role: Role; mustChangePassword: boolean; demo?: boolean; }

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const invalid = () => new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.');

export type BusinessChoice = { slug: string; name: string; role: Role };
export type LoginResult =
  | { kind: 'session'; token: string; session: StaffSession; businesses: BusinessChoice[] }
  | { kind: 'choose'; businesses: BusinessChoice[] };

/** Crea la sesión del personal para una membresía concreta (dentro de una transacción). */
export const DEMO_EMAIL_DOMAIN = 'demo.vlux.invalid';

export async function createStaffSession(tx: import('../db').Tx, userId: string, membershipId: string, businessId: string, hours = config.staffSessionHours) {
  const token = newToken();
  const id = (await tx.query(
    `INSERT INTO staff_sessions (token_hash, user_id, membership_id, business_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5)) RETURNING id`,
    [sha256(token), userId, membershipId, businessId, hours],
  )).rows[0].id as string;
  return { token, sessionId: id };
}

/** Si el usuario tiene varios negocios y no eligió uno, devuelve la lista (V0.3: nunca se elige el primero en silencio). */
export async function login(email: string, password: string, businessSlug?: string): Promise<LoginResult> {
  const pool = getPool();
  const user = (await pool.query('SELECT id, email, display_name, password_hash, failed_logins, locked_until, disabled_at, must_change_password FROM staff_users WHERE email = $1', [email])).rows[0];
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!user || user.disabled_at) throw invalid();
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    // Mismo código y mensaje que el límite por IP: no revela si el correo existe.
    throw new AppError(429, 'rate_limited', 'Demasiados intentos. Espera un momento y vuelve a intentar.');
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
  const choices: BusinessChoice[] = memberships.map((x) => ({ slug: x.slug, name: x.name, role: x.role }));
  if (!businessSlug && memberships.length > 1) {
    await pool.query('UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    return { kind: 'choose', businesses: choices };
  }
  const m = businessSlug ? memberships.find((x) => x.slug === businessSlug) : memberships[0];
  if (!m) throw new AppError(403, 'forbidden', 'No perteneces a ese negocio.');

  const { token, sessionId } = await withTx(async (tx) => {
    await tx.query('UPDATE staff_users SET failed_logins = 0, locked_until = NULL WHERE id = $1', [user.id]);
    return createStaffSession(tx, user.id, m.id, m.business_id);
  });
  await withTenant(m.business_id, (tx) => audit(tx, m.business_id, { type: 'staff', id: user.id }, 'staff.login', 'staff_user', user.id, { role: m.role }));
  return {
    kind: 'session',
    token,
    session: { sessionId, userId: user.id, email: user.email, displayName: user.display_name, businessId: m.business_id, businessSlug: m.slug, businessName: m.name, role: m.role, mustChangePassword: !!user.must_change_password },
    businesses: choices,
  };
}

/** Negocios activos del usuario (para el selector dentro de la sesión). */
export async function listMyBusinesses(userId: string): Promise<BusinessChoice[]> {
  return (await getPool().query(
    `SELECT b.slug, b.name, m.role FROM staff_memberships m JOIN businesses b ON b.id = m.business_id
      WHERE m.user_id = $1 AND m.active AND b.status = 'active' ORDER BY b.name`, [userId],
  )).rows.map((r) => ({ slug: r.slug, name: r.name, role: r.role }));
}

/** Cambia de negocio sin volver a pedir contraseña: nueva sesión para esa membresía y se revoca la actual. */
export async function switchBusiness(s: StaffSession, slug: string) {
  const m = (await getPool().query(
    `SELECT m.id, m.business_id FROM staff_memberships m JOIN businesses b ON b.id = m.business_id
      WHERE m.user_id = $1 AND b.slug = $2 AND m.active AND b.status = 'active'`, [s.userId, slug],
  )).rows[0];
  if (!m) throw new AppError(403, 'forbidden', 'No perteneces a ese negocio.');
  const r = await withTx(async (tx) => {
    await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE id = $1', [s.sessionId]);
    return createStaffSession(tx, s.userId, m.id, m.business_id);
  });
  await withTenant(m.business_id, (tx) => audit(tx, m.business_id, { type: 'staff', id: s.userId }, 'staff.switched_business', 'staff_user', s.userId));
  return r.token;
}

/** Resuelve la sesión y revalida en cada solicitud que la membresía siga activa (revocación inmediata). */
export async function getStaffSession(token: string | undefined): Promise<StaffSession | null> {
  if (!token || token.length > 100) return null;
  const row = (await getPool().query(
    `SELECT s.id, s.user_id, u.email, u.display_name, u.must_change_password, s.business_id, b.slug, b.name, m.role, (b.is_demo AND u.email LIKE '%@' || $2) AS demo
       FROM staff_sessions s
       JOIN staff_users u ON u.id = s.user_id
       JOIN staff_memberships m ON m.id = s.membership_id
       JOIN businesses b ON b.id = s.business_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.disabled_at IS NULL AND m.active AND b.status = 'active'`,
    [sha256(token), DEMO_EMAIL_DOMAIN],
  )).rows[0];
  if (!row) return null;
  return { sessionId: row.id, userId: row.user_id, email: row.email, displayName: row.display_name, businessId: row.business_id, businessSlug: row.slug, businessName: row.name, role: row.role, mustChangePassword: !!row.must_change_password, demo: !!row.demo };
}

export async function logout(token: string | undefined) {
  if (!token) return;
  await getPool().query('UPDATE staff_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
}
