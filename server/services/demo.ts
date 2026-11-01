// V0.4.2 · Acceso de demostración (dueño y caja) sin contraseñas publicadas.
// Solo existe si DEMO_ACCESS=1 (proyecto público de demostración) y solo abre sesiones sobre el negocio
// sintético marcado is_demo, con cuentas reservadas (@demo.vlux.invalid) cuya contraseña nadie conoce.
// Sesión corta (2 h). Las sesiones de demostración no pueden cambiar contraseña, invitar personal ni editar el programa.
import { z } from 'zod';
import { config } from '../config';
import { getPool, withTenant, withTx } from '../db';
import { AppError } from '../errors';
import { audit } from './audit';
import { createStaffSession, DEMO_EMAIL_DOMAIN } from './auth';

export const DEMO_SESSION_HOURS = 2;
const demoRoleSchema = z.object({ role: z.enum(['OWNER', 'EMPLOYEE']) });

export function demoStatus() {
  return { enabled: config.demoAccess, slug: config.demoAccess ? config.demoBusinessSlug : null };
}

export async function startDemoSession(raw: unknown) {
  if (!config.demoAccess) throw new AppError(404, 'not_found', 'Ruta no encontrada.');
  const { role } = demoRoleSchema.parse(raw);
  const email = `${role === 'OWNER' ? 'dueno' : 'caja'}@${DEMO_EMAIL_DOMAIN}`;
  const row = (await getPool().query(
    `SELECT u.id AS user_id, m.id AS membership_id, b.id AS business_id, b.slug
       FROM businesses b JOIN staff_memberships m ON m.business_id = b.id AND m.active AND m.role = $3
       JOIN staff_users u ON u.id = m.user_id AND u.disabled_at IS NULL AND u.email = $2
      WHERE b.slug = $1 AND b.is_demo AND b.status = 'active'`,
    [config.demoBusinessSlug, email, role],
  )).rows[0];
  if (!row) throw new AppError(404, 'demo_unavailable', 'La demostración no está disponible por ahora.');
  const { token } = await withTx((tx) => createStaffSession(tx, row.user_id, row.membership_id, row.business_id, DEMO_SESSION_HOURS));
  await withTenant(row.business_id, (tx) => audit(tx, row.business_id, { type: 'system', id: null }, 'demo.session', 'staff_user', row.user_id, { role }));
  return { token, slug: row.slug as string, landing: role === 'OWNER' ? '/panel' : '/caja' };
}
