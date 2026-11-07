// V0.4.6 · Web Push estándar sin dependencias: cifrado del mensaje (RFC 8291, aes128gcm / RFC 8188) y
// autenticación del servidor con VAPID (RFC 8292, JWT ES256). Solo usa node:crypto.
// Importante: Web Push NO es "sin servicios externos": la entrega la hace el servicio push de cada navegador
// (Google FCM para Chrome/Android, Mozilla autopush, Apple Push para Safari/iOS, WNS para Edge). Nosotros solo
// enviamos el mensaje cifrado a la dirección (endpoint) que ese servicio entregó al navegador del cliente.
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from 'node:crypto';

export const b64u = {
  enc: (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64url'),
  dec: (s: string) => Buffer.from(s, 'base64url'),
};

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

export interface PushKeys { p256dh: string; auth: string }
export interface VapidConfig { publicKey: string; privateKey: string; subject: string }

/** Par de llaves VAPID nuevo (P-256): pública sin comprimir (65 bytes) y privada (32 bytes), ambas en base64url. */
export function generateVapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u.enc(ecdh.getPublicKey()), privateKey: b64u.enc(ecdh.getPrivateKey()) };
}

/** Valida llaves VAPID y asunto (mailto: o https:). Devuelve null si no hay configuración válida. */
export function vapidFromEnv(env = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY || '', privateKey = env.VAPID_PRIVATE_KEY || '', subject = env.VAPID_SUBJECT || '';
  if (!publicKey || !privateKey || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(subject)) return null;
  try {
    const pub = b64u.dec(publicKey), priv = b64u.dec(privateKey);
    if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return null;
    // La privada debe corresponder a la pública.
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    if (!ecdh.getPublicKey().equals(pub)) return null;
  } catch { return null; }
  return { publicKey, privateKey, subject };
}

/** JWT ES256 de VAPID para el origen del servicio push. Vigencia máxima 24 h (usamos 12 h). */
export function vapidAuthorization(endpoint: string, v: VapidConfig, nowSec = Math.floor(Date.now() / 1000)) {
  const aud = new URL(endpoint).origin;
  const header = b64u.enc(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.enc(Buffer.from(JSON.stringify({ aud, exp: nowSec + 12 * 3600, sub: v.subject })));
  const pub = b64u.dec(v.publicKey);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33, 65)) }, format: 'jwk' });
  const sig = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u.enc(sig)}, k=${v.publicKey}`;
}

/**
 * Cifra el contenido para un navegador (RFC 8291). Un solo registro; rs = 4096.
 * `fixed` solo se usa en pruebas para reproducir los valores del Apéndice A del RFC.
 */
export function encryptPayload(plaintext: Buffer, keys: PushKeys, fixed?: { salt: Buffer; asPrivateKey: Buffer }) {
  const uaPublic = b64u.dec(keys.p256dh);
  const authSecret = b64u.dec(keys.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh inválida');
  if (authSecret.length !== 16) throw new Error('auth inválido');
  const as = createECDH('prime256v1');
  if (fixed) as.setPrivateKey(fixed.asPrivateKey); else as.generateKeys();
  const asPublic = as.getPublicKey();
  const salt = fixed?.salt ?? randomBytes(16);
  const ecdhSecret = as.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const rs = 4096;
  if (plaintext.length + 1 + 16 > rs) throw new Error('mensaje demasiado grande');
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(rs, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, body]);
}

// ---------- Servicios push permitidos (evita que el servidor haga solicitudes a direcciones arbitrarias: SSRF) ----------
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, // Chrome, Edge (Android), Samsung, Opera
  /^updates\.push\.services\.mozilla\.com$/, /^[a-z0-9-]+\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.push\.apple\.com$/, // Safari (macOS) y apps web de iOS/iPadOS 16.4+
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge en Windows (WNS)
];
export function isAllowedPushEndpoint(endpoint: string, extraHosts: string[] = []) {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  return PUSH_HOSTS.some((re) => re.test(u.hostname)) || extraHosts.includes(u.host);
}

export type PushResult = { ok: true; status: number } | { ok: false; status: number; gone: boolean; retryable: boolean; error: string };

/** Envía un mensaje. 404/410 = la suscripción ya no existe (se desactiva). 429/5xx = reintentar después. */
export async function sendPush(sub: { endpoint: string } & PushKeys, payload: unknown, v: VapidConfig, o: { ttlSeconds: number; urgency?: 'low' | 'normal' | 'high'; topic?: string; fetchImpl?: typeof fetch } ) {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub);
  const headers: Record<string, string> = {
    'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(Math.max(0, Math.floor(o.ttlSeconds))),
    Urgency: o.urgency ?? 'normal', Authorization: vapidAuthorization(sub.endpoint, v),
  };
  if (o.topic) headers.Topic = o.topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(sub.endpoint, { method: 'POST', headers, body, signal: AbortSignal.timeout(6000) });
  } catch {
    return { ok: false, status: 0, gone: false, retryable: true, error: 'Sin respuesta del servicio push.' } as PushResult;
  }
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status } as PushResult;
  const gone = res.status === 404 || res.status === 410;
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, status: res.status, gone, retryable, error: `Servicio push respondió ${res.status}` } as PushResult;
}
