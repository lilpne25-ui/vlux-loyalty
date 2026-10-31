// Primitivas de seguridad con node:crypto (sin dependencias externas).
import { createHash, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split('$');
  if (alg !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Hash ficticio para igualar el tiempo de respuesta cuando el correo no existe. */
export const DUMMY_PASSWORD_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

/** Token opaco de 256 bits en base64url. Se entrega al cliente; en BD solo vive su hash. */
export const newToken = () => randomBytes(32).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest();

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para dictarse en el mostrador.
export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const randomChars = (n: number) => Array.from({ length: n }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

/** Código público de tarjeta: 8 caracteres (~40 bits). Solo identifica; no autoriza nada. */
export const newCardCode = () => `${randomChars(4)}-${randomChars(4)}`;
export const newRewardCode = () => `R-${randomChars(6)}`;

const CARD_CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;
const REWARD_CODE_RE = /^R-[2-9A-HJKMNP-Z]{6}$/;

/** Acepta el contenido del QR (URL o texto) o lo que escribe el empleado, con o sin guion. */
export function parseScannedCode(raw: string): { kind: 'card' | 'reward'; code: string } | null {
  let s = String(raw || '').trim();
  if (s.length > 300) return null;
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      s = u.searchParams.get('tarjeta') || u.searchParams.get('premio') || '';
    }
  } catch {
    return null;
  }
  s = s.toUpperCase().replace(/\s+/g, '');
  const bare = s.replace(/-/g, '');
  if (/^R[2-9A-HJKMNP-Z]{6}$/.test(bare)) return { kind: 'reward', code: `R-${bare.slice(1)}` };
  if (/^[2-9A-HJKMNP-Z]{8}$/.test(bare)) return { kind: 'card', code: `${bare.slice(0, 4)}-${bare.slice(4)}` };
  if (CARD_CODE_RE.test(s)) return { kind: 'card', code: s };
  if (REWARD_CODE_RE.test(s)) return { kind: 'reward', code: s };
  return null;
}
