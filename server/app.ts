// API HTTP (Hono). Capas: validación de origen → sesión → rol → servicio (reglas + BD con RLS).
import { Hono, type Context, type Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { getConnInfo } from '@hono/node-server/conninfo';
import { ZodError } from 'zod';
import { timingSafeEqual } from 'node:crypto';
import { config } from './config';
import { AppError, forbidden, notFound, unauthorized } from './errors';
import { rateLimit } from './ratelimit';
import { loginSchema, reviewEventSchema, slugSchema, uuidSchema } from './validation';
import { getStaffSession, listMyBusinesses, login, logout, switchBusiness, type Role, type StaffSession } from './services/auth';
import { acceptInvitation, inspectInvitation, inviteSchema, inviteStaff, listInvitations, resendInvitation, revokeInvitation } from './services/invitations';
import { buildAdminRoutes } from './admin-routes';
import { createBusiness, getBusinessBySlug, getBusinessLogo } from './services/businesses';
import { changePassword, ownerIssueEmployeeReset, platformIssueReset, reissueCardLink, resetPasswordWithToken, voidPurchase } from './services/operations';
import { ensureSafeRole } from './db';
import { registerCustomer, resolveCardToken } from './services/customers';
import { issuePairCode, redeemPairCode } from './services/pairing';
import { accessLinks } from './access-links';
import { buildManifest, buildStaffManifest, renderIcon } from './pwa';
import { customerCardView } from './services/cards';
import { lookupCard, recordReviewEvent, redeemReward, registerPurchase, searchCards, staffCardView } from './services/loyalty';
import { activity, anonymizeCustomer, createEmployee, dashboard, exportCustomer, listCustomers, listStaff, setStaffActive, updateProgram } from './services/owner';

type Env = { Variables: { staff: StaffSession } };

const STAFF_COOKIE = 'vlx_staff';
const cardCookie = (slug: string) => `vlx_card_${slug}`;
const CARD_COOKIE_DAYS = 400; // máximo que permiten los navegadores
const iconCache = new Map<string, Uint8Array<ArrayBuffer>>(); // íconos PWA ya dibujados (por instancia)

function cookieOpts(maxAgeSeconds: number) {
  return { httpOnly: true, secure: config.isProduction, sameSite: 'Lax' as const, path: '/', maxAge: maxAgeSeconds };
}

function clientIp(c: Context) {
  // En Vercel la IP real llega en x-vercel-forwarded-for: Vercel la sobrescribe en su borde,
  // así que el cliente no puede falsificarla. Fuera de Vercel solo se confía en x-forwarded-for
  // con TRUST_PROXY=1 (proxy propio que la sobrescribe); si no, se usa el socket.
  if (config.onVercel) {
    const v = c.req.header('x-vercel-forwarded-for')?.split(',')[0]?.trim();
    if (v) return v;
  }
  if (config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (fwd) return fwd;
  }
  try {
    return getConnInfo(c).remote.address || 'desconocida';
  } catch {
    return 'desconocida';
  }
}

/** URL pública para enlaces personales y QR: PUBLIC_BASE_URL si existe; en Vercel, el dominio que atendió la solicitud. */
export function publicBaseUrl(c: Context) {
  if (config.publicBaseUrlExplicit) return config.publicBaseUrl;
  const host = c.req.header('host');
  if (config.onVercel && host && /^[a-z0-9.-]+$/i.test(host)) return `https://${host}`;
  return config.publicBaseUrl;
}

/** Origen para enlaces de negocio (cliente, caja, panel, invitaciones): PUBLIC_APP_URL si existe; si no, el mismo que publicBaseUrl. */
export function appLinkBase(c: Context) {
  return config.publicAppUrl || publicBaseUrl(c);
}

/** Protección CSRF: mutaciones solo con JSON y, si el navegador manda Origin, que sea el nuestro. */
async function csrfGuard(c: Context, next: Next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    const ct = c.req.header('content-type') || '';
    if (!ct.startsWith('application/json')) throw new AppError(400, 'bad_content_type', 'Solicitud inválida.');
    const origin = c.req.header('origin');
    if (origin) {
      const host = c.req.header('host');
      const allowed = [publicBaseUrl(c), host ? `http://${host}` : '', host ? `https://${host}` : ''];
      if (!allowed.includes(origin)) throw new AppError(403, 'bad_origin', 'Origen no permitido.');
    }
  }
  await next();
}

const requireStaff = (...roles: Role[]) => async (c: Context<Env>, next: Next) => {
  const s = await getStaffSession(getCookie(c, STAFF_COOKIE));
  if (!s) throw unauthorized();
  if (roles.length && !roles.includes(s.role)) throw forbidden();
  c.set('staff', s);
  await next();
};

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new AppError(400, 'bad_json', 'El cuerpo de la solicitud no es JSON válido.');
  }
}

/** Resuelve la tarjeta del cliente desde su cookie para ese negocio. */
async function customerCard(c: Context, slugRaw: string) {
  const slug = slugSchema.parse(slugRaw);
  const ref = await resolveCardToken(getCookie(c, cardCookie(slug)));
  if (!ref || ref.slug !== slug) return null;
  return ref;
}

export function buildApp() {
  const app = new Hono<Env>();

  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    referrerPolicy: 'no-referrer',
    permissionsPolicy: { camera: ['self'], microphone: [], geolocation: [] },
  }));

  app.onError((err, c) => {
    if (err instanceof AppError) {
      if (err.status === 429 && err.details?.retryAfterSeconds) c.header('Retry-After', String(err.details.retryAfterSeconds));
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
    }
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      return c.json({ error: { code: 'validation', message: issue?.message || 'Datos inválidos.', field: issue?.path.join('.') } }, 422);
    }
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '23505' && /idempotency/.test(String((err as { constraint?: string }).constraint))) {
      return c.json({ error: { code: 'idempotency_conflict', message: 'Esa operación ya se registró.' } }, 409);
    }
    if (pgCode === '22P02') return c.json({ error: { code: 'validation', message: 'Identificador inválido.' } }, 422);
    // No registrar la ruta completa (puede traer el token /t/...) ni err.detail (puede traer datos personales).
    const e = err as { code?: string; message?: string };
    console.error('[error]', c.req.method, c.req.routePath, e.code ?? '', e.message ?? String(err));
    return c.json({ error: { code: 'internal', message: 'Ocurrió un error inesperado. Intenta de nuevo.' } }, 500);
  });

  const api = new Hono<Env>();
  // 16 KB en general; el Control Center admite hasta 128 KB porque el alta/edición lleva el logotipo (máx. ~64 KB).
  const tooLarge = () => { throw new AppError(400, 'body_too_large', 'La solicitud es demasiado grande.'); };
  const smallBody = bodyLimit({ maxSize: 16 * 1024, onError: tooLarge });
  const adminBody = bodyLimit({ maxSize: 128 * 1024, onError: tooLarge });
  // Solo el alta y la edición de negocios llevan logotipo; el resto del Control Center (login, 2FA...) queda en 16 KB.
  const bigBody = (c: { req: { method: string; path: string } }) =>
    (c.req.method === 'POST' && c.req.path === '/api/admin/businesses') || (c.req.method === 'PATCH' && /^\/api\/admin\/businesses\/[0-9a-f-]{36}$/.test(c.req.path));
  api.use('*', (c, next) => (bigBody(c) ? adminBody(c, next) : smallBody(c, next)));
  api.use('*', csrfGuard);
  api.use('*', async (c, next) => { c.header('Cache-Control', 'private, no-store'); await next(); });

  api.get('/health', async (c) => {
    if (c.req.query('db') !== '1') return c.json({ ok: true });
    await ensureSafeRole();
    return c.json({ ok: true, db: true });
  });

  // ---------- Público ----------
  api.get('/public/businesses/:slug', async (c) => {
    const b = await getBusinessBySlug(slugSchema.parse(c.req.param('slug')));
    return c.json({ business: { slug: b.slug, name: b.name, city: b.city, vertical: b.vertical, primaryColor: b.primaryColor, accentColor: b.accentColor, cardFinish: b.cardFinish, isDemo: b.isDemo, logoUrl: b.logoUrl }, program: { stampsRequired: b.program.stampsRequired, stampMode: b.program.stampMode, maxStampsPerPurchase: b.program.maxStampsPerPurchase, rewardDescription: b.program.rewardDescription }, privacyNoticeVersion: config.privacyNoticeVersion });
  });

  // Accesos del negocio: qué dirección usa cada persona. Son direcciones derivadas del nombre público; no incluyen tokens ni credenciales.
  api.get('/public/businesses/:slug/access', async (c) => {
    const b = await getBusinessBySlug(slugSchema.parse(c.req.param('slug')));
    return c.json(accessLinks(appLinkBase(c), b.slug));
  });

  api.get('/public/businesses/:slug/logo', async (c) => {
    const logo = await getBusinessLogo(slugSchema.parse(c.req.param('slug')));
    if (!logo) throw notFound('Logotipo');
    // URL versionada (?v=hash): se puede guardar en caché; si el logotipo cambia, cambia la URL.
    c.header('Cache-Control', c.req.query('v') === logo.version ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    c.header('Content-Type', logo.mime);
    c.header('Content-Disposition', 'inline');
    return c.body(new Uint8Array(logo.bytes));
  });

  api.post('/public/businesses/:slug/register', async (c) => {
    const slug = slugSchema.parse(c.req.param('slug'));
    await rateLimit(`register:${clientIp(c)}`, 20, 60 * 60_000);
    const r = await registerCustomer(slug, await jsonBody(c));
    setCookie(c, cardCookie(slug), r.token, cookieOpts(CARD_COOKIE_DAYS * 86400));
    // El enlace personal permite abrir la tarjeta en otro teléfono. Se muestra una sola vez.
    return c.json({ publicCode: r.publicCode, personalLink: `${publicBaseUrl(c)}/t#${r.token}` }, 201);
  });

  // ---------- Cliente (cookie de su tarjeta) ----------
  api.get('/me/:slug/card', async (c) => {
    const ref = await customerCard(c, c.req.param('slug'));
    if (!ref) return c.json({ card: null });
    return c.json(await customerCardView(ref.businessId, ref.cardId));
  });

  api.post('/me/:slug/review-events', async (c) => {
    const ref = await customerCard(c, c.req.param('slug'));
    if (!ref) throw unauthorized();
    await rateLimit(`review:${ref.cardId}`, 10, 60 * 60_000);
    const { kind } = reviewEventSchema.parse(await jsonBody(c));
    await recordReviewEvent(ref.businessId, ref.cardId, kind);
    return c.json({ ok: true });
  });

  api.post('/me/:slug/forget-device', async (c) => {
    const slug = slugSchema.parse(c.req.param('slug'));
    deleteCookie(c, cardCookie(slug), { path: '/' });
    return c.json({ ok: true });
  });

  // ---------- PWA: vincular la app instalada (V0.2.2) ----------
  // Código de un solo uso generado desde el navegador donde ya está la tarjeta.
  api.post('/me/:slug/pair-code', async (c) => {
    const ref = await customerCard(c, c.req.param('slug'));
    if (!ref) throw unauthorized();
    await rateLimit(`paircode:${ref.cardId}`, 10, 60 * 60_000);
    return c.json(await issuePairCode(ref), 201);
  });

  // Canje del código desde la app instalada: crea un acceso nuevo y lo guarda en su cookie.
  api.post('/me/:slug/pair', async (c) => {
    const slug = slugSchema.parse(c.req.param('slug'));
    await rateLimit(`pair:${clientIp(c)}`, 10, 10 * 60_000);
    await rateLimit(`pair-biz:${slug}`, 300, 10 * 60_000);
    const b = await getBusinessBySlug(slug);
    const body = (await jsonBody(c)) as { code?: unknown };
    const { token } = await redeemPairCode(b.id, typeof body?.code === 'string' ? body.code : '');
    setCookie(c, cardCookie(slug), token, cookieOpts(CARD_COOKIE_DAYS * 86400));
    return c.json({ ok: true });
  });

  // Manifiesto e íconos por negocio: solo datos públicos del negocio (nunca tokens ni datos del cliente).
  api.get('/pwa/:slug/manifest.webmanifest', async (c) => {
    const b = await getBusinessBySlug(slugSchema.parse(c.req.param('slug')));
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
    c.header('Content-Type', 'application/manifest+json; charset=utf-8');
    return c.body(JSON.stringify(buildManifest(b)));
  });

  api.get('/pwa/:slug/staff/:app/manifest.webmanifest', async (c) => {
    const app = c.req.param('app');
    if (app !== 'panel' && app !== 'caja') throw new AppError(404, 'not_found', 'Ruta no encontrada.');
    const b = await getBusinessBySlug(slugSchema.parse(c.req.param('slug')));
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
    c.header('Content-Type', 'application/manifest+json; charset=utf-8');
    return c.body(JSON.stringify(buildStaffManifest(b, app)));
  });

  api.get('/pwa/:slug/icon/:file', async (c) => {
    const m = c.req.param('file').match(/^(192|512|180|maskable-512)\.png$/);
    if (!m) throw new AppError(404, 'not_found', 'Ruta no encontrada.');
    const b = await getBusinessBySlug(slugSchema.parse(c.req.param('slug')));
    const maskable = m[1].startsWith('maskable');
    const size = maskable ? 512 : Number(m[1]);
    // Dibujar un ícono cuesta CPU: se guarda en memoria y la CDN lo cachea (s-maxage).
    const key = `${b.slug}|${m[1]}|${b.name}|${b.primaryColor}|${b.accentColor}`;
    let png = iconCache.get(key);
    if (!png) {
      await rateLimit(`icon:${clientIp(c)}`, 60, 60_000);
      png = new Uint8Array(renderIcon({ size, maskable, name: b.name, primary: b.primaryColor, accent: b.accentColor }));
      if (iconCache.size >= 200) iconCache.delete(iconCache.keys().next().value as string);
      iconCache.set(key, png);
    }
    c.header('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    c.header('Content-Type', 'image/png');
    return c.body(png);
  });

  // Enlace personal en el fragmento (#): el token nunca viaja en la URL, así no queda en logs del
  // servidor, de Vercel ni en encabezados Referer. La página /t lo lee y lo envía aquí.
  api.post('/card-access', async (c) => {
    await rateLimit(`token:${clientIp(c)}`, 30, 60_000);
    const body = (await jsonBody(c)) as { token?: unknown };
    const token = typeof body?.token === 'string' ? body.token : '';
    const ref = await resolveCardToken(token);
    if (!ref) throw new AppError(404, 'invalid_link', 'Este enlace ya no es válido. Pide uno nuevo en el negocio.');
    setCookie(c, cardCookie(ref.slug), token, cookieOpts(CARD_COOKIE_DAYS * 86400));
    return c.json({ slug: ref.slug });
  });

  // ---------- Personal ----------
  api.post('/staff/login', async (c) => {
    const input = loginSchema.parse(await jsonBody(c));
    await rateLimit(`login-ip:${clientIp(c)}`, 20, 15 * 60_000);
    const r = await login(input.email, input.password, input.businessSlug);
    // Varios negocios y ninguno elegido: se devuelve la lista y NO se abre sesión (nada de elegir el primero en silencio).
    if (r.kind === 'choose') return c.json({ chooseBusiness: true, businesses: r.businesses });
    setCookie(c, STAFF_COOKIE, r.token, cookieOpts(config.staffSessionHours * 3600));
    return c.json({ session: publicSession(r.session), businesses: r.businesses });
  });

  // ---------- Invitaciones (quien recibe el enlace) ----------
  api.post('/invitations/inspect', async (c) => {
    await rateLimit(`invite-inspect:${clientIp(c)}`, 30, 15 * 60_000);
    const body = (await jsonBody(c)) as { token?: unknown };
    return c.json(await inspectInvitation(typeof body?.token === 'string' ? body.token : ''));
  });
  api.post('/invitations/accept', async (c) => {
    await rateLimit(`invite-accept:${clientIp(c)}`, 10, 15 * 60_000);
    const r = await acceptInvitation(await jsonBody(c));
    setCookie(c, STAFF_COOKIE, r.token, cookieOpts(config.staffSessionHours * 3600));
    return c.json({ role: r.role, businessSlug: r.businessSlug, linkedExisting: r.linkedExisting });
  });

  api.post('/staff/password-reset', async (c) => {
    await rateLimit(`reset:${clientIp(c)}`, 10, 15 * 60_000);
    return c.json(await resetPasswordWithToken(await jsonBody(c)));
  });

  api.post('/staff/logout', async (c) => {
    await logout(getCookie(c, STAFF_COOKIE));
    deleteCookie(c, STAFF_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  api.get('/staff/me', async (c) => {
    const s = await getStaffSession(getCookie(c, STAFF_COOKIE));
    return c.json({ session: s ? publicSession(s) : null });
  });

  const staff = new Hono<Env>();
  staff.use('*', requireStaff('OWNER', 'EMPLOYEE'));
  staff.get('/business', async (c) => c.json(await getBusinessBySlug(c.get('staff').businessSlug)));
  staff.get('/businesses', async (c) => c.json({ businesses: await listMyBusinesses(c.get('staff').userId), current: c.get('staff').businessSlug }));
  staff.post('/switch', async (c) => {
    const s = c.get('staff');
    await rateLimit(`switch:${s.userId}`, 30, 60_000);
    const body = (await jsonBody(c)) as { slug?: unknown };
    const token = await switchBusiness(s, slugSchema.parse(body?.slug));
    setCookie(c, STAFF_COOKIE, token, cookieOpts(config.staffSessionHours * 3600));
    const next = await getStaffSession(token);
    return c.json({ session: next ? publicSession(next) : null });
  });
  staff.post('/cards/lookup', async (c) => {
    const s = c.get('staff');
    await rateLimit(`lookup:${s.sessionId}`, 120, 60_000);
    const body = (await jsonBody(c)) as { code?: unknown };
    return c.json(await lookupCard(s, String(body?.code ?? '')));
  });
  staff.get('/cards', async (c) => c.json({ cards: await searchCards(c.get('staff'), c.req.query('q') || '') }));
  staff.get('/cards/:cardId', async (c) => c.json(await staffCardView(c.get('staff'), uuidSchema.parse(c.req.param('cardId')))));
  staff.post('/cards/:cardId/purchases', async (c) => {
    const s = c.get('staff');
    await rateLimit(`purchase:${s.sessionId}`, 60, 60_000);
    return c.json(await registerPurchase(s, uuidSchema.parse(c.req.param('cardId')), await jsonBody(c)));
  });
  staff.post('/rewards/:rewardId/redeem', async (c) => {
    const s = c.get('staff');
    await rateLimit(`redeem:${s.sessionId}`, 30, 60_000);
    return c.json(await redeemReward(s, uuidSchema.parse(c.req.param('rewardId'))));
  });
  staff.post('/password', async (c) => {
    const s = c.get('staff');
    await rateLimit(`pwd:${s.userId}`, 5, 15 * 60_000);
    return c.json(await changePassword(s, await jsonBody(c)));
  });
  staff.post('/cards/:cardId/link', async (c) => {
    const s = c.get('staff');
    await rateLimit(`relink:${s.sessionId}`, 10, 60 * 60_000);
    const r = await reissueCardLink(s, uuidSchema.parse(c.req.param('cardId')));
    return c.json({ personalLink: `${publicBaseUrl(c)}/t#${r.token}` });
  });
  api.route('/staff', staff);

  // ---------- Dueño ----------
  const owner = new Hono<Env>();
  owner.use('*', requireStaff('OWNER'));
  owner.use('*', async (c, next) => {
    if (c.req.method !== 'GET') await rateLimit(`owner-write:${c.get('staff').userId}`, 120, 60_000);
    await next();
  });
  owner.get('/dashboard', async (c) => c.json(await dashboard(c.get('staff'))));
  owner.get('/customers', async (c) => c.json({ customers: await listCustomers(c.get('staff')) }));
  owner.get('/customers/:customerId/export', async (c) => c.json(await exportCustomer(c.get('staff'), uuidSchema.parse(c.req.param('customerId')))));
  owner.post('/customers/:customerId/anonymize', async (c) => c.json(await anonymizeCustomer(c.get('staff'), uuidSchema.parse(c.req.param('customerId')))));
  owner.get('/activity', async (c) => c.json({ items: await activity(c.get('staff'), Math.max(1, Math.min(100, Number(c.req.query('limit')) || 30))) }));
  owner.put('/program', async (c) => c.json(await updateProgram(c.get('staff'), await jsonBody(c))));
  owner.get('/staff', async (c) => c.json({ staff: await listStaff(c.get('staff')) }));
  owner.post('/staff', async (c) => c.json(await createEmployee(c.get('staff'), await jsonBody(c)), 201));
  owner.patch('/staff/:membershipId', async (c) => {
    const body = (await jsonBody(c)) as { active?: unknown };
    if (typeof body?.active !== 'boolean') throw new AppError(422, 'validation', 'Indica si el empleado queda activo.');
    return c.json(await setStaffActive(c.get('staff'), uuidSchema.parse(c.req.param('membershipId')), body.active));
  });
  owner.post('/staff/:membershipId/reset-link', async (c) => {
    const s = c.get('staff');
    await rateLimit(`owner-reset:${s.userId}`, 10, 60 * 60_000);
    const r = await ownerIssueEmployeeReset(s, uuidSchema.parse(c.req.param('membershipId')));
    return c.json({ resetLink: `${publicBaseUrl(c)}/restablecer#${r.token}`, expiresInMinutes: r.expiresInMinutes });
  });
  // Invitaciones de empleados por enlace (el dueño solo puede invitar EMPLEADOS de su propio negocio).
  owner.get('/invitations', async (c) => c.json({ invitations: await listInvitations(c.get('staff').businessId, 'EMPLOYEE') }));
  owner.post('/invitations', async (c) => {
    const s = c.get('staff');
    await rateLimit(`owner-invite:${s.userId}`, 20, 60 * 60_000);
    const input = inviteSchema.parse(await jsonBody(c));
    const r = await inviteStaff({ businessId: s.businessId, email: input.email, displayName: input.displayName, role: 'EMPLOYEE', by: { type: 'staff', id: s.userId } });
    return c.json({ invitationId: r.invitationId, link: `${appLinkBase(c)}/invitacion#${r.token}`, expiresAt: r.expiresAt, delivery: 'manual' }, 201);
  });
  owner.post('/invitations/:invId/resend', async (c) => {
    const s = c.get('staff');
    await rateLimit(`owner-invite:${s.userId}`, 20, 60 * 60_000);
    const r = await resendInvitation(s.businessId, uuidSchema.parse(c.req.param('invId')), { type: 'staff', id: s.userId }, 'EMPLOYEE');
    return c.json({ invitationId: r.invitationId, link: `${appLinkBase(c)}/invitacion#${r.token}`, expiresAt: r.expiresAt, delivery: 'manual' });
  });
  owner.post('/invitations/:invId/revoke', async (c) => {
    const s = c.get('staff');
    return c.json(await revokeInvitation(s.businessId, uuidSchema.parse(c.req.param('invId')), { type: 'staff', id: s.userId }, 'EMPLOYEE'));
  });
  owner.post('/purchases/:purchaseId/void', async (c) => {
    const s = c.get('staff');
    await rateLimit(`void:${s.userId}`, 30, 60 * 60_000);
    return c.json(await voidPurchase(s, uuidSchema.parse(c.req.param('purchaseId')), await jsonBody(c)));
  });
  api.route('/owner', owner);

  // ---------- Control Center (equipo VLUX) ----------
  api.route('/admin', buildAdminRoutes({ clientIp, publicBaseUrl, appLinkBase, jsonBody }));

  // ---------- API heredada de plataforma (token compartido) ----------
  // V0.3: apagada por omisión. Solo se enciende con PLATFORM_LEGACY_API=1 (pruebas E2E heredadas).
  api.use('/platform/*', async (c, next) => {
    if (!config.legacyPlatformApi) return c.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404);
    await next();
  });
  api.post('/platform/businesses', async (c) => {
    const expected = config.platformAdminToken;
    const got = (c.req.header('authorization') || '').replace(/^Bearer /, '');
    await rateLimit(`platform:${clientIp(c)}`, 10, 60_000);
    if (expected.length < 32 || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) throw unauthorized();
    return c.json(await createBusiness((await jsonBody(c)) as never), 201);
  });

  api.post('/platform/password-reset', async (c) => {
    const expected = config.platformAdminToken;
    const got = (c.req.header('authorization') || '').replace(/^Bearer /, '');
    await rateLimit(`platform:${clientIp(c)}`, 10, 60_000);
    if (expected.length < 32 || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected))) throw unauthorized();
    const body = (await jsonBody(c)) as { email?: unknown };
    const r = await platformIssueReset(String(body?.email ?? ''));
    return c.json({ resetLink: `${publicBaseUrl(c)}/restablecer#${r.token}`, expiresInMinutes: r.expiresInMinutes });
  });

  app.route('/api', api);
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Ruta no encontrada.' } }, 404));

  // Enlace personal del cliente: guarda el acceso en este teléfono y abre su tarjeta.
  app.get('/t/:token', async (c) => {
    c.header('Cache-Control', 'no-store');
    const token = c.req.param('token');
    await rateLimit(`token:${clientIp(c)}`, 30, 60_000);
    const ref = await resolveCardToken(token);
    if (!ref) return c.redirect('/?enlace=invalido', 302);
    setCookie(c, cardCookie(ref.slug), token, cookieOpts(CARD_COOKIE_DAYS * 86400));
    return c.redirect(`/n/${ref.slug}`, 302);
  });

  return app;
}

function publicSession(s: StaffSession) {
  return { userId: s.userId, email: s.email, displayName: s.displayName, role: s.role, mustChangePassword: s.mustChangePassword, business: { id: s.businessId, slug: s.businessSlug, name: s.businessName } };
}
