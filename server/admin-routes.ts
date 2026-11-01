// V0.3 · API del VLUX Control Center (/api/admin). Separada del personal de los negocios:
// cookie propia (vlx_admin, path /api/admin, SameSite=Strict), segundo factor obligatorio y bitácora global.
// Si CONTROL_CENTER_ENABLED no está activo en el despliegue, toda la ruta responde 404.
import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { config } from './config';
import { AppError } from './errors';
import { rateLimit } from './ratelimit';
import { uuidSchema } from './validation';
import {
  acceptAdminInvite, adminLogin, adminLogout, bootstrapFirstAdmin, enrollConfirm, enrollStart, getAdminSession, inviteAdmin,
  listAdmins, listAdminSessions, needsBootstrap, requireMfa, revokeAdminSession, setAdminDisabled, verifySecondFactor, type AdminSession,
} from './services/platform-auth';
import {
  businessDetail, createBusinessFromWizard, listBusinesses, listPlans, overview, platformAuditLog, setBusinessStatus,
  updateBusiness, updatePlan, updateSubscription,
} from './services/platform';
import { inviteSchema, inviteStaff, resendInvitation, revokeInvitation } from './services/invitations';
import { z } from 'zod';

type AdminEnv = { Variables: { admin: AdminSession } };
export const ADMIN_COOKIE = 'vlx_admin';

type Helpers = { clientIp: (c: Context) => string; publicBaseUrl: (c: Context) => string; jsonBody: (c: Context) => Promise<unknown> };

function setAdminCookie(c: Context, token: string) {
  setCookie(c, ADMIN_COOKIE, token, { httpOnly: true, secure: config.isProduction, sameSite: 'Strict', path: '/api/admin', maxAge: config.adminSessionHours * 3600 });
}

export function buildAdminRoutes({ clientIp, publicBaseUrl, jsonBody }: Helpers) {
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
    await next();
  };
  const inviteLink = (c: Context, token: string) => `${publicBaseUrl(c)}/invitacion#${token}`;

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
    return c.json({ businessId: r.businessId, slug: r.slug, registrationUrl: `${publicBaseUrl(c)}/n/${r.slug}`,
      ownerInvitation: { link: inviteLink(c, r.invitation.token), expiresAt: r.invitation.expiresAt, delivery: 'manual' } }, 201);
  });
  p.get('/businesses/:id', async (c) => {
    const d = await businessDetail(uuidSchema.parse(c.req.param('id')));
    return c.json({ ...d, registrationUrl: `${publicBaseUrl(c)}/n/${d.slug}` });
  });
  p.patch('/businesses/:id', async (c) => c.json(await updateBusiness(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));
  p.post('/businesses/:id/status', async (c) => c.json(await setBusinessStatus(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));
  p.put('/businesses/:id/subscription', async (c) => c.json(await updateSubscription(c.get('admin'), uuidSchema.parse(c.req.param('id')), await jsonBody(c))));

  const roleSchema = z.object({ role: z.enum(['OWNER', 'EMPLOYEE']) });
  p.post('/businesses/:id/invitations', async (c) => {
    const id = uuidSchema.parse(c.req.param('id'));
    const body = await jsonBody(c);
    const input = inviteSchema.and(roleSchema).parse(body);
    const r = await inviteStaff({ businessId: id, email: input.email, displayName: input.displayName, role: input.role, by: { type: 'platform', id: c.get('admin').adminId } });
    return c.json({ invitationId: r.invitationId, link: inviteLink(c, r.token), expiresAt: r.expiresAt, delivery: 'manual' }, 201);
  });
  p.post('/businesses/:id/invitations/:invId/resend', async (c) => {
    const r = await resendInvitation(uuidSchema.parse(c.req.param('id')), uuidSchema.parse(c.req.param('invId')), { type: 'platform', id: c.get('admin').adminId });
    return c.json({ invitationId: r.invitationId, link: inviteLink(c, r.token), expiresAt: r.expiresAt, delivery: 'manual' });
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
