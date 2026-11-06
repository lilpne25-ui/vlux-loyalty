// V0.4.5 · Adaptador de correo transaccional. Un proveedor "acepta" un mensaje (HTTP 200 con id): eso NO significa
// que llegó al buzón. La entrega solo se conoce por webhook firmado (email.delivered / email.bounced).
//  - EMAIL_PROVIDER=resend + RESEND_API_KEY + EMAIL_FROM  → Resend (API HTTPS, encabezado Idempotency-Key).
//  - EMAIL_PROVIDER=mock                                  → simulado en memoria (solo pruebas; nunca sale a la red).
//  - sin configurar                                       → no se envía nada; la UI ofrece copiar el enlace.
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OutgoingEmail { to: string; subject: string; html: string; text: string; idempotencyKey: string; tags?: Record<string, string> }
export type SendResult = { ok: true; messageId: string } | { ok: false; retryable: boolean; error: string };

export interface EmailProvider {
  readonly name: 'resend' | 'mock';
  send(m: OutgoingEmail): Promise<SendResult>;
}

/** Simulado: guarda los mensajes en memoria. Se puede forzar un fallo para probar reintentos. */
export class MockProvider implements EmailProvider {
  readonly name = 'mock' as const;
  static sent: (OutgoingEmail & { messageId: string })[] = [];
  static failNext: { retryable: boolean; error: string }[] = [];
  private static seen = new Map<string, string>();
  async send(m: OutgoingEmail): Promise<SendResult> {
    const f = MockProvider.failNext.shift();
    if (f) return { ok: false, ...f };
    // Igual que un proveedor real con Idempotency-Key: la misma llave no duplica el envío.
    const prior = MockProvider.seen.get(m.idempotencyKey);
    if (prior) return { ok: true, messageId: prior };
    const messageId = `mock_${MockProvider.sent.length + 1}_${Date.now().toString(36)}`;
    MockProvider.seen.set(m.idempotencyKey, messageId);
    MockProvider.sent.push({ ...m, messageId });
    return { ok: true, messageId };
  }
  static reset() { MockProvider.sent = []; MockProvider.failNext = []; MockProvider.seen.clear(); }
}

export class ResendProvider implements EmailProvider {
  readonly name = 'resend' as const;
  constructor(private apiKey: string, private from: string, private replyTo?: string) {}
  async send(m: OutgoingEmail): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': m.idempotencyKey },
        body: JSON.stringify({
          from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
          tags: Object.entries(m.tags ?? {}).map(([name, value]) => ({ name, value })),
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return { ok: false, retryable: true, error: 'Sin respuesta del proveedor de correo.' };
    }
    const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
    if (res.ok && body?.id) return { ok: true, messageId: body.id };
    // 429 y 5xx se reintentan; 4xx (dominio sin verificar, correo inválido, llave incorrecta) no.
    const retryable = res.status === 429 || res.status >= 500;
    return { ok: false, retryable, error: `Proveedor respondió ${res.status}${body?.message ? `: ${String(body.message).slice(0, 160)}` : ''}` };
  }
}

export type EmailConfig = { provider: EmailProvider | null; state: 'configured' | 'mock' | 'not_configured'; from: string | null; webhookSecret: string | null };

export function emailConfigFromEnv(env = process.env): EmailConfig {
  const kind = (env.EMAIL_PROVIDER || '').toLowerCase();
  const webhookSecret = env.EMAIL_WEBHOOK_SECRET || null;
  if (kind === 'mock' && env.NODE_ENV !== 'production') return { provider: new MockProvider(), state: 'mock', from: 'VLUX Loyalty <pruebas@vlux.invalid>', webhookSecret };
  const from = env.EMAIL_FROM || '';
  if (kind === 'resend' && env.RESEND_API_KEY && /<[^@\s]+@[^>\s]+>$|^[^@\s]+@[^@\s]+$/.test(from)) {
    return { provider: new ResendProvider(env.RESEND_API_KEY, from, env.EMAIL_REPLY_TO || undefined), state: 'configured', from, webhookSecret };
  }
  return { provider: null, state: 'not_configured', from: null, webhookSecret };
}

/**
 * Verificación de webhooks firmados con el esquema de Svix (el que usa Resend): firma HMAC-SHA256 en base64 de
 * `${svix-id}.${svix-timestamp}.${cuerpo}` con el secreto `whsec_<base64>`. Tolerancia de 5 minutos contra repetición.
 */
export function verifyWebhookSignature(secret: string, headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, rawBody: string, nowSec = Math.floor(Date.now() / 1000)) {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest();
  return signature.split(' ').some((part) => {
    const [ver, sig] = part.split(',');
    if (ver !== 'v1' || !sig) return false;
    const got = Buffer.from(sig, 'base64');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
