// 1.0.x · «Reportar problema» del personal: deja un evento en la bitácora del negocio con el contexto que manda
// la pantalla (vista, dispositivo, versión) y una referencia corta que también viaja en el WhatsApp a soporte VLUX.
// No usa servicios externos: el mensaje lo abre el teléfono del dueño con wa.me. No requiere migración.
import { z } from 'zod';
import { withTenant } from '../db';
import { audit } from './audit';
import type { StaffSession } from './auth';

export const SUPPORT_REF_RE = /^VLX-[2-9A-HJKMNP-Z]{6}$/;

const text = (max: number) => z.string().trim().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ''));
export const supportReportSchema = z.object({
  ref: z.string().regex(SUPPORT_REF_RE, 'Referencia inválida.'),
  view: text(60),
  description: text(1000).optional().default(''),
  device: text(160).optional().default(''),
  appVersion: text(40).optional().default(''),
  channel: z.enum(['whatsapp', 'copy']).default('whatsapp'),
});

export async function recordSupportReport(session: StaffSession, raw: unknown) {
  const input = supportReportSchema.parse(raw);
  // Las sesiones de demostración no escriben en la bitácora: se responde igual para no romper la experiencia.
  if (session.demo) return { ok: true, ref: input.ref, recorded: false };
  await withTenant(session.businessId, (tx) => audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'support.reported', null, null, {
    ref: input.ref, view: input.view, description: input.description, device: input.device, appVersion: input.appVersion, role: session.role, channel: input.channel,
  }));
  return { ok: true, ref: input.ref, recorded: true };
}
