// V0.3 · API del VLUX Control Center (/api/admin). Separada del personal de los negocios:
// cookie propia (vlx_admin, path /api/admin, SameSite=Strict), segundo factor obligatorio y bitácora global.
// Si CONTROL_CENTER_ENABLED no está activo en el despliegue, toda la ruta responde 404.
import { readDraft } from './services/drafts';
import { accessLinks } from './access-links';
import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config';
import { AppError } from './errors';
import { rateLimit } from './ratelimit';
import { uuidSchema } from './validation';
import { getPool, runWithScope } from './db';
import {
  acceptAdminInvite, platformAudit, adminLogin, adminLogout, bootstrapFirstAdmin, enrollConfirm, enrollStart, getAdminSession, inviteAdmin,
  listAdmins, listAdminSessions, needsBootstrap, requireMfa, revokeAdminSession, setAdminDisabled, verifySecondFactor, type AdminSession,
} from './services/platform-auth';
import {
  businessDetail, createBusinessFromWizard, listBusinesses, listPlans, overview, platformAuditLog, setBusinessStatus,
  updateBusiness, updatePlan, updateSubscription,
} from './services/platform';
import { archiveBusiness, declareSynthetic, deleteBusiness, deletionPreview, exportBusiness, listDeletions, restoreBusiness } from './services/lifecycle';
import { emailState, sendInvitationEmail } from './services/email-invitations';
import { inviteSchema, inviteStaff, recordInvitationShare, resendInvitation, revokeInvitation, shareMethods } from './services/invitations';
import { adminIssueStaffReset } from './services/operations';
import { z } from 'zod';

type AdminEnv = { Variables: { admin: AdminSession } };
export const ADMIN_COOKIE = 'vlx_admin';

type Helpers = { clientIp: (c: Context) => string; publicBaseUrl: (c: Context) => string; appLinkBase: (c: Context) => string; jsonBody: (c: Context) => Promise<unknown> };

function setAdminCookie(c: Context, token: string) {
  setCookie(c, ADMIN_COOKIE, token, { httpOnly: true, secure: config.isProduction, sameSite: 'Strict', path: '/api/admin', maxAge: config.adminSessionHours * 3600 });
}

export function buildAdminRoutes({ clientIp, publicBaseUrl, appLinkBase, jsonBody }: Helpers) {
  const admin = new Hono<AdminEnv>();

  admin.use('*', async (c, next) => {
    if (!config.controlCenterEnabled) return c.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404);
    c.header('X-Robots-Tag', 'noindex');
    await next();
  });

  const ua = (c: Context) => c.req.header('user-agent');
  const session = (c: Context) => getAdminSession(getCookie(c, ADMIN_COOKIE));
  const requireAdmin = async (c: Context<AdminEnv>, next: Next) => {
    c.set('admin', requireMfa(await session(c)));
    if (c.req.method !== 'GET') await rateLimit(`admin-write:${c.get('admin').adminId}`, 120, 60_000);
    // Único punto donde nace el alcance «platform»: solo con sesión de administrador completa (2FA). Todas las transacciones
    // de esta solicitud lo declaran a PostgreSQL (migración 0016); las rutas sin sesión completa NO lo reciben.
    await runWithScope('platform', () => next());
  };
  const inviteLink = (c: Context, token: string) => `${appLinkBase(c)}/invitacion#${token}`;

  // ---------- Sin sesión completa ----------
  admin.get('/bootstrap', async (c) => c.json({ needsBootstrap: await needsBootstrap() }));
  admin.post('/bootstrap', async (c) => {
    await rateLimit(`admin-bootstrap:${clientIp(c)}`, 5, 15 * 60_000);
    return c.json(await bootstrapFirstAdmin(await jsonBody(c)), 201);
  });

  admin.post('/auth/login', async (c) => {
    await rateLimit(`admin-login-ip:${clientIp(c)}`, 10, 15 * 60_000);
    const r = await adminLogin(await jsonBody(c), ua(c));
    setAdminCookie(c, r.token);
    return c.json({ next: r.next });
  });

  admin.post('/auth/totp', async (c) => {
    await rateLimit(`admin-totp-ip:${clientIp(c)}`, 10, 15 * 60_000);
    const s = await session(c);
    if (!s) throw new AppError(401, 'unauthorized', 'Tu sesión venció. Vuelve a iniciar sesión.');
    await rateLimit(`admin-totp:${s.adminId}`, 10, 15 * 60_000); // además del límite por IP
    setAdminCookie(c, await verifySecondFactor(s, await jsonBody(c), ua(c)));
    return c.json({ ok: true });
  });

  admin.post('/auth/enroll/start', async (c) => {
    const s = await session(c);
    if (!s) throw new AppError(401, 'unauthorized', 'Tu sesión venció. Vuelve a iniciar sesión.');
    return c.json(await enrollStart(s));
  });

  admin.post('/auth/enroll/confirm', async (c) => {
    await rateLimit(`admin-totp-ip:${clientIp(c)}`, 10, 15 * 60_000);
    const s = await session(c);
    if (!s) throw new AppError(401, 'unauthorized', 'Tu sesión venció. Vuelve a iniciar sesión.');
    const r = await enrollConfirm(s, await jsonBody(c), ua(c));
    setAdminCookie(c, r.token);
    return c.json({ recoveryCodes: r.recoveryCodes });
  });

  admin.get('/auth/me', async (c) => {
    const s = await session(c);
    return c.json({ admin: s ? { email: s.email, displayName: s.displayName, mfaVerified: s.mfaVerified, totpEnabled: s.totpEnabled, sessionId: s.sessionId } : null });
  });

  admin.post('/auth/logout', async (c) => {
    await adminLogout(getCookie(c, ADMIN_COOKIE));
    deleteCookie(c, ADMIN_COOKIE, { path: '/api/admin' });
    return c.json({ ok: true });
  });

  admin.post('/admins/accept', async (c) => {
    await rateLimit(`admin-accept:${clientIp(c)}`, 10, 15 * 60_000);
    return c.json(await acceptAdminInvite(await jsonBody(c)));
  });

  // ---------- Con sesión y segundo factor ----------
  const p = new Hono<AdminEnv>();
  p.use('*', requireAdmin);

  p.get('/overview', async (c) => c.json(await overview()));
  p.get('/businesses', async (c) => c.json({ businesses: await listBusinesses() }));
  p.post('/businesses', async (c) => {
    const r = await createBusinessFromWizard(c.get('admin'), await jsonBody(c));
    return c.json({ businessId: r.businessId, slug: r.slug, registrationUrl: `${appLinkBase(c)}/n/${r.slug}`, access: accessLinks(appLinkBase(c), r.slug),
      ownerInvitation: { invitationId: r.invitation.invitationId, link: inviteLink(c, r.invitation.token), expiresAt: r.invitation.expiresAt, delivery: 'manual' }, email: emailState() }, 201);
  });
  p.get('/activation-drafts/:ref', async (c) => c.json(await readDraft(c.req.param('ref'), c.get('admin').adminId)));
  p.get('/businesses/:id', async (c) => {
    const d = await businessDetail(uuidSchema.parse(c.req.param('id')));
    return c.json({ ...d, registrationUrl: `${appLinkBase(c)}/n/${d.slug}`, access: accessLinks(appLinkBase(c), d.slug) });
  });
  p.patch('/businesses/:id', async (c) => c.json(await updateBusiness(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));
  p.post('/businesses/:id/status', async (c) => c.json(await setBusinessStatus(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));
  // V0.4.5 · Ciclo de vida: archivar, restaurar, respaldo, datos sintéticos y eliminación definitiva.
  const bid = (c: Context) => uuidSchema.parse(c.req.param('id'));
  p.post('/businesses/:id/archive', async (c) => c.json(await archiveBusiness(c.get('admin'), bid(c), await jsonBody(c))));
  p.post('/businesses/:id/restore', async (c) => c.json(await restoreBusiness(c.get('admin'), bid(c), await jsonBody(c))));
  p.get('/businesses/:id/deletion-preview', async (c) => c.json(await deletionPreview(c.get('admin'), bid(c))));
  p.post('/businesses/:id/export', async (c) => {
    await rateLimit(`admin-export:${c.get('admin').adminId}`, 10, 15 * 60_000);
    const r = await exportBusiness(c.get('admin'), bid(c));
    c.header('Cache-Control', 'no-store');
    c.header('Content-Disposition', 'attachment; filename="vlux-respaldo-negocio.json"');
    c.header('X-Content-SHA256', r.sha256);
    return c.body(r.body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
  });
  p.post('/businesses/:id/declare-synthetic', async (c) => {
    await rateLimit(`admin-stepup:${c.get('admin').adminId}`, 5, 15 * 60_000);
    return c.json(await declareSynthetic(c.get('admin'), bid(c), await jsonBody(c)));
  });
  p.post('/businesses/:id/delete', async (c) => {
    await rateLimit(`admin-stepup:${c.get('admin').adminId}`, 5, 15 * 60_000);
    return c.json(await deleteBusiness(c.get('admin'), bid(c), await jsonBody(c)));
  });
  p.get('/deletions', async (c) => c.json({ deletions: await listDeletions() }));
  p.put('/businesses/:id/subscription', async (c) => c.json(await updateSubscription(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));

  const roleSchema = z.object({ role: z.enum(['OWNER', 'EMPLOYEE']), delivery: z.enum(['link', 'in_person']).default('link') });
  // V0.4.6 · Respuesta común: enlace de un solo uso (token en el fragmento #), y en modo presencial también el código corto.
  // El token y el código se muestran SOLO en esta respuesta; en BD viven sus hashes.
  const invitationOut = (c: Context, r: { invitationId: string; token: string; accessCode: string | null; delivery: string; expiresAt: Date }) => ({
    invitationId: r.invitationId, link: inviteLink(c, r.token), expiresAt: r.expiresAt, delivery: 'manual', mode: r.delivery,
    accessCode: r.accessCode, activateUrl: r.accessCode ? `${appLinkBase(c)}/activar` : null,
  });
  p.post('/businesses/:id/invitations', async (c) => {
    const id = uuidSchema.parse(c.req.param('id'));
    const body = await jsonBody(c);
    const input = inviteSchema.and(roleSchema).parse(body);
    const r = await inviteStaff({ businessId: id, email: input.email, displayName: input.displayName, role: input.role, by: { type: 'platform', id: c.get('admin').adminId }, delivery: input.delivery });
    return c.json({ ...invitationOut(c, r), email: emailState() }, 201);
  });
  p.post('/businesses/:id/invitations/:invId/resend', async (c) => {
    const body = (await jsonBody(c).catch(() => ({}))) as { delivery?: unknown };
    const delivery = body?.delivery === 'in_person' ? 'in_person' : 'link';
    const r = await resendInvitation(uuidSchema.parse(c.req.param('id')), uuidSchema.parse(c.req.param('invId')), { type: 'platform', id: c.get('admin').adminId }, undefined, delivery);
    return c.json(invitationOut(c, r));
  });
  // V0.4.6 · Cómo se compartió (solo el método, nunca el enlace). Abrir WhatsApp NO equivale a enviado.
  p.post('/businesses/:id/invitations/:invId/share', async (c) => {
    const body = (await jsonBody(c)) as { method?: unknown };
    const method = z.enum(shareMethods).parse(body?.method);
    await rateLimit(`admin-share:${c.get('admin').adminId}`, 120, 60 * 60_000);
    return c.json(await recordInvitationShare(uuidSchema.parse(c.req.param('id')), uuidSchema.parse(c.req.param('invId')), method, { type: 'platform', id: c.get('admin').adminId }));
  });
  // V0.4.6 · Restablecer contraseña de forma segura (dueño o empleado): enlace de un solo uso, nunca la contraseña.
  p.post('/businesses/:id/staff/:membershipId/reset-link', async (c) => {
    const a = c.get('admin');
    await rateLimit(`admin-reset:${a.adminId}`, 20, 60 * 60_000);
    const id = uuidSchema.parse(c.req.param('id'));
    const r = await adminIssueStaffReset(id, uuidSchema.parse(c.req.param('membershipId')));
    await platformAudit(getPool(), a.adminId, 'staff.reset_issued', { businessId: id, entityType: 'staff_membership', entityId: c.req.param('membershipId'), details: { role: r.role } });
    return c.json({ resetLink: `${appLinkBase(c)}/restablecer#${r.token}`, expiresInMinutes: r.expiresInMinutes, role: r.role, displayName: r.displayName, otherBusinesses: r.otherBusinesses });
  });
  // V0.4.5 · Envío por correo (después del commit), con límites por administrador, negocio e invitación.
  p.get('/email/status', (c) => c.json(emailState()));
  p.post('/businesses/:id/invitations/:invId/send-email', async (c) => {
    const a = c.get('admin');
    const id = uuidSchema.parse(c.req.param('id'));
    await rateLimit(`email-admin:${a.adminId}`, 30, 60 * 60_000);
    await rateLimit(`email-business:${id}`, 20, 24 * 60 * 60_000);
    const r = await sendInvitationEmail({ adminId: a.adminId, businessId: id, invitationId: uuidSchema.parse(c.req.param('invId')), linkBase: appLinkBase(c), assetBase: appLinkBase(c) });
    return c.json(r);
  });
  p.post('/businesses/:id/invitations/:invId/revoke', async (c) =>
    c.json(await revokeInvitation(uuidSchema.parse(c.req.param('id')), uuidSchema.parse(c.req.param('invId')), { type: 'platform', id: c.get('admin').adminId })));

  p.get('/plans', async (c) => c.json({ plans: await listPlans() }));
  p.put('/plans/:code', async (c) => c.json(await updatePlan(c.get('admin'), c.req.param('code'), await jsonBody(c))));
  p.get('/audit', async (c) => c.json({ events: await platformAuditLog(Math.max(1, Math.min(200, Number(c.req.query('limit')) || 50))) }));

  p.get('/admins', async (c) => c.json({ admins: await listAdmins() }));
  p.post('/admins/invite', async (c) => {
    const r = await inviteAdmin(c.get('admin'), await jsonBody(c));
    return c.json({ link: `${publicBaseUrl(c)}/vlux-admin/aceptar#${r.token}`, expiresInHours: r.expiresInHours, delivery: 'manual' }, 201);
  });
  p.patch('/admins/:adminId', async (c) => {
    const body = (await jsonBody(c)) as { disabled?: unknown };
    if (typeof body?.disabled !== 'boolean') throw new AppError(422, 'validation', 'Indica si la cuenta queda desactivada.');
    return c.json(await setAdminDisabled(c.get('admin'), uuidSchema.parse(c.req.param('adminId')), body.disabled));
  });
  p.get('/sessions', async (c) => c.json({ sessions: await listAdminSessions(), current: c.get('admin').sessionId }));
  p.post('/sessions/:sessionId/revoke', async (c) => c.json(await revokeAdminSession(c.get('admin'), uuidSchema.parse(c.req.param('sessionId')))));

  admin.route('/', p);
  return admin;
}
