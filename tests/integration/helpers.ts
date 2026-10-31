// Utilidades de prueba: app en memoria (sin red) con cookies por "dispositivo".
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../server/app';
import { createBusiness } from '../../server/services/businesses';
import { resetRateLimits } from '../../server/ratelimit';

export const app = buildApp();

/** Cada Device guarda sus propias cookies: simula un teléfono o computadora independiente. */
export class Device {
  cookies = new Map<string, string>();
  constructor(public name: string) {}
  async req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await app.request(path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      const k = pair.slice(0, i), v = pair.slice(i + 1);
      if (/max-age=0/i.test(sc) || v === '') this.cookies.delete(k); else this.cookies.set(k, v);
    }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b: unknown = {}) => this.req('POST', p, b);
}

export const PASSWORD = 'contraseña-de-prueba-123';

export async function newBusiness(opts: Partial<{ stampsRequired: number; stampMode: 'per_purchase' | 'per_item'; maxStampsPerPurchase: number; vertical: string; reviewUrl: string | null }> = {}) {
  await resetRateLimits();
  const slug = 'p-' + randomUUID().slice(0, 8);
  const ownerEmail = `dueno-${slug}@ejemplo.test`;
  const r = await createBusiness({
    slug, name: 'Negocio ' + slug, vertical: (opts.vertical as any) ?? 'cafeteria', reviewUrl: opts.reviewUrl === undefined ? 'https://g.page/r/ejemplo/review' : opts.reviewUrl,
    rules: { stampsRequired: opts.stampsRequired ?? 8, stampMode: opts.stampMode ?? 'per_purchase', maxStampsPerPurchase: opts.maxStampsPerPurchase ?? 1, visitWindowMinutes: 120, rewardDescription: 'Bebida de cortesía' },
    owner: { email: ownerEmail, displayName: 'Dueña Sintética', password: PASSWORD },
  });
  return { ...r, ownerEmail };
}

export async function loggedIn(name: string, email: string, password = PASSWORD) {
  const d = new Device(name);
  const r = await d.post('/api/staff/login', { email, password });
  if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.json)}`);
  return d;
}

export async function withEmployee(owner: Device) {
  const email = `empleado-${randomUUID().slice(0, 8)}@ejemplo.test`;
  const r = await owner.post('/api/owner/staff', { email, displayName: 'Empleado Sintético', password: PASSWORD });
  if (r.status !== 201) throw new Error('alta empleado ' + JSON.stringify(r.json));
  return { email, membershipId: r.json.membershipId as string };
}

export async function registerCustomer(slug: string, name = 'Cliente Sintético') {
  const phone = new Device('cliente');
  const r = await phone.post(`/api/public/businesses/${slug}/register`, { displayName: name, contact: '', marketingConsent: false, privacyAccepted: true });
  if (r.status !== 201) throw new Error('registro ' + JSON.stringify(r.json));
  return { phone, publicCode: r.json.publicCode as string, personalLink: r.json.personalLink as string };
}

export const key = () => randomUUID().replace(/-/g, '');

export async function identify(employee: Device, code: string) {
  const r = await employee.post('/api/staff/cards/lookup', { code });
  if (r.status !== 200) throw new Error('lookup ' + JSON.stringify(r.json));
  return r.json.cardId as string;
}
