// Utilidades de pruebas V0.4.5: administrador con 2FA creado directamente en la base de pruebas.
import assert from 'node:assert/strict';
import pg from 'pg';
import { resetRateLimits } from '../../server/ratelimit';
import { hashPassword } from '../../server/security';
import { currentStep, encryptSecret, newTotpSecret, totpAt } from '../../server/totp';
import { Device } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
export const closeAdminHelpers = () => db.end();

/** Código TOTP fresco: se reinicia el último paso usado (solo en pruebas) para no esperar 30 s entre operaciones. */
export async function freshCode(email: string, s: string) {
  await db.query('UPDATE platform_admins SET totp_last_step = 0, mfa_failures = 0, locked_until = NULL WHERE email = $1', [email]);
  return totpAt(s, currentStep());
}

/** Crea un administrador con 2FA directamente en BD y abre su sesión verificada. */
export async function adminWithMfa(email: string, password: string) {
  const sec = newTotpSecret();
  await db.query(
    `INSERT INTO platform_admins (email, display_name, password_hash, totp_secret_enc, totp_enabled_at) VALUES ($1, 'Admin Pruebas', $2, $3, now())
     ON CONFLICT (email) DO UPDATE SET totp_secret_enc = EXCLUDED.totp_secret_enc, password_hash = EXCLUDED.password_hash, disabled_at = NULL`,
    [email, await hashPassword(password), encryptSecret(sec)],
  );
  await resetRateLimits();
  const d = new Device('admin');
  const r = await d.post('/api/admin/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await db.query('UPDATE platform_admins SET totp_last_step = 0 WHERE email = $1', [email]);
  const v = await d.post('/api/admin/auth/totp', { code: totpAt(sec, currentStep()) });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  return { d, secret: sec };
}

