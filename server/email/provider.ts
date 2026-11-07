// V0.4.5 · Adaptador de correo transaccional. Un proveedor "acepta" un mensaje (HTTP 200 con id): eso NO significa
// que llegó al buzón. La entrega solo se conoce por webhook firmado (email.delivered / email.bounced).
//  - EMAIL_PROVIDER=resend + RESEND_API_KEY + EMAIL_FROM  → Resend (API HTTPS, encabezado Idempotency-Key).
//  - EMAIL_PROVIDER=mock                                  → simulado en memoria (solo pruebas; nunca sale a la red).
//  - EMAIL_PROVIDER=smtp (alias: stalwart) + SMTP_*        → servidor SMTP propio (p. ej. Stalwart en vlux.com.mx). V0.4.6.
//    En SMTP "aceptado" = el servidor respondió 250 al mensaje. La entrega al buzón NO se puede confirmar por SMTP:
//    solo llegan rebotes (DSN) al buzón del remitente. TLS siempre con verificación de certificado y nombre de host.
//  - sin configurar                                       → no se envía nada; la UI ofrece copiar el enlace.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { featureEnabled } from '../features';
import nodemailer from 'nodemailer';

export interface OutgoingEmail { to: string; subject: string; html: string; text: string; idempotencyKey: string; tags?: Record<string, string> }
export type SendResult = { ok: true; messageId: string } | { ok: false; retryable: boolean; error: string };

export interface EmailProvider {
  readonly name: 'resend' | 'mock' | 'smtp';
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

export interface SmtpSettings { host: string; port: number; secure: boolean; user?: string; password?: string; from: string; replyTo?: string; ca?: string; servername?: string; messageIdDomain: string }

/**
 * SMTP con TLS obligatorio: puerto 465 (TLS implícito) o 587 con STARTTLS requerido. Nunca se desactiva la
 * verificación del certificado (rejectUnauthorized siempre true). Para un certificado propio se agrega su CA con
 * SMTP_CA_PEM en lugar de apagar la verificación.
 */
export class SmtpProvider implements EmailProvider {
  readonly name = 'smtp' as const;
  private transport: ReturnType<typeof nodemailer.createTransport>;
  constructor(private s: SmtpSettings) {
    this.transport = nodemailer.createTransport({
      host: s.host, port: s.port, secure: s.secure, requireTLS: true,
      auth: s.user ? { user: s.user, pass: s.password ?? '' } : undefined,
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: s.servername ?? s.host, ...(s.ca ? { ca: [s.ca] } : {}) },
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000, disableFileAccess: true, disableUrlAccess: true,
    });
  }
  async send(m: OutgoingEmail): Promise<SendResult> {
    // SMTP no tiene llave de idempotencia: el Message-ID determinista permite reconocer duplicados en el buzón y en los rebotes.
    const messageId = `<${m.idempotencyKey.replace(/[^A-Za-z0-9._-]/g, '')}@${this.s.messageIdDomain}>`;
    try {
      const info = await this.transport.sendMail({
        from: this.s.from, to: m.to, subject: m.subject, html: m.html, text: m.text, messageId,
        ...(this.s.replyTo ? { replyTo: this.s.replyTo } : {}),
        headers: { 'X-VLUX-Kind': m.tags?.kind ?? 'transactional', 'Auto-Submitted': 'auto-generated' },
      });
      if (info.rejected?.length) return { ok: false, retryable: false, error: 'El servidor SMTP rechazó el destinatario.' };
      return { ok: true, messageId: info.messageId || messageId };
    } catch (e) {
      const err = e as { code?: string; responseCode?: number; message?: string };
      // 4xx SMTP y fallas de red/tiempo se reintentan; 5xx (rechazo permanente) y fallas de TLS/autenticación no.
      const tlsOrAuth = err.code === 'EAUTH' || err.code === 'ETLS' || /certificate|self.signed|hostname|altnames/i.test(err.message ?? '');
      const retryable = !tlsOrAuth && (err.responseCode ? err.responseCode < 500 : ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED'].includes(err.code ?? ''));
      const label = tlsOrAuth ? (err.code === 'EAUTH' ? 'Autenticación SMTP rechazada' : 'Certificado TLS del servidor no válido') : `SMTP ${err.responseCode ?? err.code ?? 'error'}`;
      return { ok: false, retryable, error: label };
    }
  }
  /** Prueba de conexión (EHLO + TLS + autenticación) sin enviar ningún mensaje. */
  async verify(): Promise<{ ok: boolean; error?: string }> {
    try { await this.transport.verify(); return { ok: true }; } catch (e) { return { ok: false, error: (e as Error).message.slice(0, 200) }; }
  }
}

export function smtpSettingsFromEnv(env = process.env): SmtpSettings | null {
  const host = env.SMTP_HOST || '';
  const port = Number(env.SMTP_PORT || 587);
  const from = env.EMAIL_FROM || '';
  if (!/^[a-z0-9.-]+$/i.test(host) || ![465, 587, 2525].includes(port) && !(env.NODE_ENV !== 'production' && port > 1024)) return null;
  if (!/<[^@\s]+@[^>\s]+>$|^[^@\s]+@[^@\s]+$/.test(from)) return null;
  if (env.SMTP_USER && !env.SMTP_PASSWORD) return null;
  const domain = (from.match(/@([^>\s]+)>?$/)?.[1] || 'vlux.invalid').toLowerCase();
  return {
    host, port, secure: env.SMTP_SECURE ? env.SMTP_SECURE === '1' || env.SMTP_SECURE === 'true' : port === 465,
    user: env.SMTP_USER || undefined, password: env.SMTP_PASSWORD || undefined, from, replyTo: env.EMAIL_REPLY_TO || undefined,
    ca: env.SMTP_CA_PEM ? env.SMTP_CA_PEM.replace(/\\n/g, '\n') : undefined, servername: env.SMTP_TLS_SERVERNAME || undefined, messageIdDomain: domain,
  };
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
  if ((kind === 'smtp' || kind === 'stalwart') && featureEnabled('smtpEmail', env)) {
    const st = smtpSettingsFromEnv(env);
    if (st) return { provider: new SmtpProvider(st), state: 'configured', from: st.from, webhookSecret };
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
