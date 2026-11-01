// V0.3 · Autenticación de administradores de VLUX (Control Center).
// Identidad separada del personal de los negocios: tabla propia, cookie propia (ruta /api/admin) y
// segundo factor TOTP obligatorio. Las sesiones viven en BD (solo el hash) y se pueden revocar.
import { randomInt, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config';
import { getPool, withTx, type Tx } from '../db';
import { AppError, unauthorized } from '../errors';
import { CODE_ALPHABET, DUMMY_PASSWORD_HASH, hashPassword, newToken, sha256, verifyPassword } from '../security';
import { decryptSecret, encryptSecret, newTotpSecret, otpauthUri, verifyTotp } from '../totp';
import { emailSchema, passwordSchema } from '../validation';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const PRE_AUTH_MINUTES = 10;
const RECOVERY_CODES = 8;

export interface AdminSession { sessionId: string; adminId: string; email: string; displayName: string; mfaVerified: boolean; totpEnabled: boolean }

const adminPasswordSchema = passwordSchema.pipe(z.string().min(12, 'La contraseña de administrador debe tener al menos 12 caracteres.'));
export const bootstrapSchema = z.object({ setupToken: z.string().min(1).max(500), email: emailSchema, displayName: z.string().trim().min(2).max(60), password: adminPasswordSchema });
export const adminLoginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });
export const adminInviteSchema = z.object({ email: emailSchema, displayName: z.string().trim().min(2).max(60) });
export const acceptAdminInviteSchema = z.object({ token: z.string().min(20).max(100), password: adminPasswordSchema });

const invalid = () => new AppError(401, 'invalid_credentials', 'Correo o contraseña incorrectos.');

/** Bitácora global de la plataforma. Nunca recibe contraseñas, tokens ni códigos. */
export async function platformAudit(q: Tx | ReturnType<typeof getPool>, adminId: string | null, action: string, opts: { businessId?: string | null; entityType?: string; entityId?: string | null; details?: Record<string, unknown> } = {}) {
  await q.query(
    'INSERT INTO platform_audit_events (admin_id, action, business_id, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6)',
    [adminId, action, opts.businessId ?? null, opts.entityType ?? null, opts.entityId ?? null, JSON.stringify(opts.details ?? {})],
  );
}

// ---------- Primer administrador ----------
export async function needsBootstrap() {
  return (await getPool().query('SELECT count(*)::int AS n FROM platform_admins')).rows[0].n === 0;
}

/** Crea el primer administrador. Requiere el token de instalación (PLATFORM_ADMIN_TOKEN) y solo funciona una vez. */
export async function bootstrapFirstAdmin(raw: unknown) {
  const input = bootstrapSchema.parse(raw);
  const expected = config.platformAdminToken;
  const got = input.setupToken;
  if (expected.length < 32 || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) {
    throw new AppError(401, 'invalid_setup_token', 'El código de instalación no es correcto.');
  }
  const hash = await hashPassword(input.password);
  return withTx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['vlux-admin-bootstrap']);
    const n = (await tx.query('SELECT count(*)::int AS n FROM platform_admins')).rows[0].n;
    if (n > 0) throw new AppError(409, 'already_bootstrapped', 'El Control Center ya tiene administradores. Pide una invitación.');
    const id = (await tx.query('INSERT INTO platform_admins (email, display_name, password_hash) VALUES ($1, $2, $3) RETURNING id', [input.email, input.displayName, hash])).rows[0].id as string;
    await platformAudit(tx, id, 'admin.bootstrap', { entityType: 'platform_admin', entityId: id });
    return { adminId: id };
  });
}

// ---------- Inicio de sesión ----------
async function createSession(tx: Tx, adminId: string, mfaVerified: boolean, userAgent: string | undefined) {
  const token = newToken();
  const minutes = mfaVerified ? config.adminSessionHours * 60 : PRE_AUTH_MINUTES;
  await tx.query(
    `INSERT INTO platform_admin_sessions (token_hash, admin_id, mfa_verified, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [sha256(token), adminId, mfaVerified, (userAgent || '').slice(0, 200) || null, minutes],
  );
  return token;
}

/** Paso 1: correo y contraseña. Devuelve una sesión previa que SOLO sirve para el segundo factor. */
export async function adminLogin(raw: unknown, userAgent?: string) {
  const input = adminLoginSchema.parse(raw);
  const pool = getPool();
  const a = (await pool.query('SELECT id, password_hash, failed_logins, locked_until, disabled_at, totp_enabled_at FROM platform_admins WHERE email = $1', [input.email])).rows[0];
  const ok = await verifyPassword(input.password, a?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!a || a.disabled_at) { await platformAudit(pool, null, 'admin.login_failed', { details: { reason: 'unknown_or_disabled' } }); throw invalid(); }
  if (a.locked_until && new Date(a.locked_until) > new Date()) throw new AppError(429, 'rate_limited', 'Demasiados intentos. Espera un momento y vuelve a intentar.');
  if (!ok) {
    await pool.query(
      `UPDATE platform_admins SET failed_logins = failed_logins + 1,
         locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END WHERE id = $1`,
      [a.id, MAX_FAILED, LOCK_MINUTES],
    );
    await platformAudit(pool, a.id, 'admin.login_failed', { details: { reason: 'password' } });
    throw invalid();
  }
  const token = await withTx(async (tx) => {
    await tx.query('UPDATE platform_admins SET failed_logins = 0, locked_until = NULL WHERE id = $1', [a.id]);
    return createSession(tx, a.id, false, userAgent);
  });
  return { token, next: a.totp_enabled_at ? 'verify' as const : 'enroll' as const };
}

/** Resuelve la sesión; aplica caducidad absoluta e inactividad. */
export async function getAdminSession(token: string | undefined): Promise<AdminSession | null> {
  if (!token || token.length > 100) return null;
  const row = (await getPool().query(
    `UPDATE platform_admin_sessions s SET last_seen_at = now()
       FROM platform_admins a
      WHERE s.token_hash = $1 AND a.id = s.admin_id AND s.revoked_at IS NULL AND s.expires_at > now()
        AND s.last_seen_at > now() - make_interval(mins => $2) AND a.disabled_at IS NULL
      RETURNING s.id, s.admin_id, s.mfa_verified, a.email, a.display_name, a.totp_enabled_at`,
    [sha256(token), config.adminIdleMinutes],
  )).rows[0];
  if (!row) return null;
  return { sessionId: row.id, adminId: row.admin_id, email: row.email, displayName: row.display_name, mfaVerified: row.mfa_verified, totpEnabled: !!row.totp_enabled_at };
}

/** Paso 2: código TOTP (o de recuperación). Emite un token NUEVO y revoca la sesión previa. */
export async function verifySecondFactor(s: AdminSession, raw: unknown, userAgent?: string) {
  const { code } = codeSchema.parse(raw);
  if (s.mfaVerified) throw new AppError(409, 'already_verified', 'La sesión ya está verificada.');
  if (!s.totpEnabled) throw new AppError(409, 'enroll_required', 'Primero configura tu app de autenticación.');
  return withTx(async (tx) => {
    const a = (await tx.query('SELECT totp_secret_enc, totp_last_step, failed_logins FROM platform_admins WHERE id = $1 FOR UPDATE', [s.adminId])).rows[0];
    const clean = code.replace(/\s/g, '');
    let used: 'totp' | 'recovery' | null = null;
    if (/^\d{6}$/.test(clean)) {
      const step = verifyTotp(decryptSecret(a.totp_secret_enc), clean);
      if (step !== null && step > Number(a.totp_last_step)) {
        await tx.query('UPDATE platform_admins SET totp_last_step = $2 WHERE id = $1', [s.adminId, step]);
        used = 'totp';
      }
    } else {
      const norm = clean.toUpperCase().replace(/-/g, '');
      const r = await tx.query('UPDATE platform_admin_recovery_codes SET used_at = now() WHERE admin_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id', [s.adminId, sha256(`recovery:${norm}`)]);
      if (r.rowCount) used = 'recovery';
    }
    if (!used) {
      // Cuenta los fallos del segundo factor en el mismo contador del bloqueo.
      await tx.query(
        `UPDATE platform_admins SET failed_logins = failed_logins + 1,
           locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE locked_until END WHERE id = $1`,
        [s.adminId, MAX_FAILED, LOCK_MINUTES],
      );
      if (Number(a.failed_logins) + 1 >= MAX_FAILED) await tx.query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE id = $1', [s.sessionId]);
      await platformAudit(tx, s.adminId, 'admin.mfa_failed');
      return { ok: false as const };
    }
    await tx.query('UPDATE platform_admins SET failed_logins = 0 WHERE id = $1', [s.adminId]);
    await tx.query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE id = $1', [s.sessionId]);
    const token = await createSession(tx, s.adminId, true, userAgent);
    await platformAudit(tx, s.adminId, 'admin.login', { details: { factor: used } });
    return { ok: true as const, token };
  }).then((r) => {
    if (!r.ok) throw new AppError(401, 'invalid_code', 'El código no es correcto o ya se usó.');
    return r.token;
  });
}

// ---------- Alta del segundo factor ----------
export async function enrollStart(s: AdminSession) {
  if (s.totpEnabled) throw new AppError(409, 'already_enrolled', 'Tu segundo factor ya está configurado.');
  const secret = newTotpSecret();
  await getPool().query('UPDATE platform_admins SET totp_secret_enc = $2 WHERE id = $1 AND totp_enabled_at IS NULL', [s.adminId, encryptSecret(secret)]);
  return { secret, otpauthUri: otpauthUri(secret, s.email) };
}

const recoveryCode = () => Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export async function enrollConfirm(s: AdminSession, raw: unknown, userAgent?: string) {
  const { code } = codeSchema.parse(raw);
  if (s.totpEnabled) throw new AppError(409, 'already_enrolled', 'Tu segundo factor ya está configurado.');
  const r = await withTx(async (tx) => {
    const a = (await tx.query('SELECT totp_secret_enc FROM platform_admins WHERE id = $1 FOR UPDATE', [s.adminId])).rows[0];
    if (!a?.totp_secret_enc) throw new AppError(409, 'enroll_not_started', 'Primero genera el código QR.');
    const step = verifyTotp(decryptSecret(a.totp_secret_enc), code.replace(/\s/g, ''));
    if (step === null) return null;
    await tx.query('UPDATE platform_admins SET totp_enabled_at = now(), totp_last_step = $2 WHERE id = $1', [s.adminId, step]);
    const codes = Array.from({ length: RECOVERY_CODES }, recoveryCode);
    for (const c of codes) await tx.query('INSERT INTO platform_admin_recovery_codes (admin_id, code_hash) VALUES ($1, $2)', [s.adminId, sha256(`recovery:${c}`)]);
    await tx.query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE id = $1', [s.sessionId]);
    const token = await createSession(tx, s.adminId, true, userAgent);
    await platformAudit(tx, s.adminId, 'admin.mfa_enrolled');
    return { token, recoveryCodes: codes.map((c) => `${c.slice(0, 5)}-${c.slice(5)}`) };
  });
  if (!r) throw new AppError(401, 'invalid_code', 'El código no coincide. Revisa la hora de tu teléfono e intenta con el código nuevo.');
  return r;
}

// ---------- Sesiones ----------
export async function adminLogout(token: string | undefined) {
  if (!token) return;
  await getPool().query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
}

export async function listAdminSessions() {
  return (await getPool().query(
    `SELECT s.id, s.admin_id, a.email, a.display_name, s.user_agent, s.created_at, s.last_seen_at, s.expires_at
       FROM platform_admin_sessions s JOIN platform_admins a ON a.id = s.admin_id
      WHERE s.revoked_at IS NULL AND s.mfa_verified AND s.expires_at > now() AND s.last_seen_at > now() - make_interval(mins => $1)
      ORDER BY s.last_seen_at DESC`, [config.adminIdleMinutes],
  )).rows.map((r) => ({ id: r.id, adminId: r.admin_id, email: r.email, displayName: r.display_name, userAgent: r.user_agent, createdAt: r.created_at, lastSeenAt: r.last_seen_at, expiresAt: r.expires_at }));
}

export async function revokeAdminSession(s: AdminSession, sessionId: string) {
  const r = await getPool().query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING admin_id', [sessionId]);
  if (!r.rowCount) throw new AppError(404, 'not_found', 'Esa sesión no existe o ya estaba cerrada.');
  await platformAudit(getPool(), s.adminId, 'admin.session_revoked', { entityType: 'platform_admin_session', entityId: sessionId, details: { ownSession: sessionId === s.sessionId } });
  return { ok: true };
}

// ---------- Otros administradores ----------
export async function listAdmins() {
  return (await getPool().query('SELECT id, email, display_name, totp_enabled_at, disabled_at, created_at FROM platform_admins ORDER BY created_at')).rows
    .map((r) => ({ id: r.id, email: r.email, displayName: r.display_name, mfaEnabled: !!r.totp_enabled_at, disabled: !!r.disabled_at, createdAt: r.created_at }));
}

export async function inviteAdmin(s: AdminSession, raw: unknown) {
  const input = adminInviteSchema.parse(raw);
  const token = newToken();
  await withTx(async (tx) => {
    if ((await tx.query('SELECT 1 FROM platform_admins WHERE email = $1', [input.email])).rowCount) throw new AppError(409, 'email_taken', 'Ese correo ya es administrador.');
    await tx.query('UPDATE platform_admin_invitations SET revoked_at = now() WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [input.email]);
    const id = (await tx.query(
      `INSERT INTO platform_admin_invitations (token_hash, email, display_name, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, now() + make_interval(hours => 24)) RETURNING id`,
      [sha256(token), input.email, input.displayName, s.adminId],
    )).rows[0].id;
    await platformAudit(tx, s.adminId, 'admin.invited', { entityType: 'platform_admin_invitation', entityId: id });
  });
  return { token, expiresInHours: 24 };
}

export async function acceptAdminInvite(raw: unknown) {
  const input = acceptAdminInviteSchema.parse(raw);
  const hash = await hashPassword(input.password);
  return withTx(async (tx) => {
    const inv = (await tx.query(
      `UPDATE platform_admin_invitations SET accepted_at = now()
        WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()
        RETURNING id, email, display_name, invited_by`, [sha256(input.token)],
    )).rows[0];
    if (!inv) throw new AppError(404, 'invalid_invitation', 'La invitación no es válida, ya se usó o venció.');
    if ((await tx.query('SELECT 1 FROM platform_admins WHERE email = $1', [inv.email])).rowCount) throw new AppError(409, 'email_taken', 'Ese correo ya es administrador.');
    const id = (await tx.query('INSERT INTO platform_admins (email, display_name, password_hash, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [inv.email, inv.display_name, hash, inv.invited_by])).rows[0].id;
    await platformAudit(tx, id, 'admin.invitation_accepted', { entityType: 'platform_admin', entityId: id });
    return { email: inv.email as string };
  });
}

export async function setAdminDisabled(s: AdminSession, adminId: string, disabled: boolean) {
  if (adminId === s.adminId) throw new AppError(422, 'cannot_disable_self', 'No puedes desactivar tu propia cuenta.');
  return withTx(async (tx) => {
    const r = await tx.query('UPDATE platform_admins SET disabled_at = CASE WHEN $2 THEN now() ELSE NULL END WHERE id = $1 RETURNING id', [adminId, disabled]);
    if (!r.rowCount) throw new AppError(404, 'not_found', 'Administrador no encontrado.');
    if (disabled) await tx.query('UPDATE platform_admin_sessions SET revoked_at = now() WHERE admin_id = $1 AND revoked_at IS NULL', [adminId]);
    await platformAudit(tx, s.adminId, disabled ? 'admin.disabled' : 'admin.enabled', { entityType: 'platform_admin', entityId: adminId });
    return { ok: true };
  });
}

export const requireMfa = (s: AdminSession | null) => {
  if (!s) throw unauthorized();
  if (!s.mfaVerified) throw new AppError(403, 'mfa_required', 'Completa el segundo factor para continuar.');
  return s;
};
