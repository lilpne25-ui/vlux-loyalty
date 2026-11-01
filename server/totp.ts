// TOTP (RFC 6238, HMAC-SHA1, 30 s, 6 dígitos) y cifrado de secretos con AES-256-GCM. Sin dependencias.
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from './config';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(randomBytes(20));
export const STEP_SECONDS = 30;
export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

export function totpAt(secretB32: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const n = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** Devuelve el paso de tiempo que coincide (±1 paso de tolerancia) o null. */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const s = currentStep(now);
  for (const step of [s - 1, s, s + 1]) {
    const expected = Buffer.from(totpAt(secretB32, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

export function otpauthUri(secretB32: string, email: string) {
  const label = encodeURIComponent(`VLUX Control Center:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent('VLUX Control Center')}&algorithm=SHA1&digits=6&period=30`;
}

// ---------- Cifrado de secretos ----------
const DEV_KEY_MATERIAL = 'solo-desarrollo-local-no-usar-en-produccion-vlux';
function keyMaterial(): string {
  let material = config.adminSecretsKeyMaterial;
  if (material.length < 32) {
    if (config.isProduction) throw new Error('Falta ADMIN_SECRETS_KEY (32+ caracteres) para cifrar el segundo factor.');
    material = DEV_KEY_MATERIAL;
  }
  return material;
}
function key(): Buffer {
  return Buffer.from(hkdfSync('sha256', keyMaterial(), 'vlux-control-center', 'totp-secret-v1', 32));
}

/** Hash de un código de recuperación: HMAC con llave del servidor (un volcado de BD solo no basta para probarlos offline). */
export function recoveryCodeHash(normalized: string): Buffer {
  const k = Buffer.from(hkdfSync('sha256', keyMaterial(), 'vlux-control-center', 'recovery-code-v1', 32));
  return createHmac('sha256', k).update(normalized).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${enc.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
}

export function decryptSecret(blob: string): string {
  const [v, iv, enc, tag] = blob.split('.');
  if (v !== 'v1' || !iv || !enc || !tag) throw new Error('Formato de secreto inválido.');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]).toString('utf8');
}
