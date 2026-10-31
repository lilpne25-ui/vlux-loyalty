// V0.2.2 · Vinculación de la tarjeta con la app instalada (PWA).
// En iPhone, la app de la pantalla de inicio puede tener su propio almacenamiento de cookies, distinto
// al de Safari. Para no poner tokens en el manifiesto ni en la URL de inicio, el cliente genera en
// Safari (donde ya tiene su cookie) un código de 8 dígitos de un solo uso, válido 15 minutos, y lo
// escribe en la app instalada. Solo se guarda el hash del código, con el negocio como sal.
import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { withTenant } from '../db';
import { AppError } from '../errors';
import { newToken, sha256 } from '../security';
import { audit } from './audit';

export const PAIR_MINUTES = 15;
export const pairSchema = z.object({ code: z.string().trim().transform((s) => s.replace(/[\s-]/g, '')).pipe(z.string().regex(/^\d{8}$/, 'El código tiene 8 números.')) });

const codeHash = (businessId: string, code: string) => sha256(`pair:${businessId}:${code}`);

/** Emite un código nuevo para la tarjeta (invalida los anteriores sin usar). */
export async function issuePairCode(ref: { cardId: string; businessId: string }) {
  const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
  const expiresAt = new Date(Date.now() + PAIR_MINUTES * 60_000);
  await withTenant(ref.businessId, async (tx) => {
    await tx.query('UPDATE card_pair_codes SET expires_at = now() WHERE card_id = $1 AND used_at IS NULL AND expires_at > now()', [ref.cardId]);
    await tx.query('INSERT INTO card_pair_codes (code_hash, card_id, business_id, expires_at) VALUES ($1, $2, $3, $4)', [codeHash(ref.businessId, code), ref.cardId, ref.businessId, expiresAt]);
  });
  return { code, expiresAt: expiresAt.toISOString(), expiresInMinutes: PAIR_MINUTES };
}

/** Canjea el código: crea un acceso nuevo para este dispositivo (no revoca el de Safari). */
export async function redeemPairCode(businessId: string, rawCode: string) {
  const { code } = pairSchema.parse({ code: rawCode });
  const token = newToken();
  const invalid = () => new AppError(404, 'invalid_code', 'Ese código no es válido o ya caducó. Genera uno nuevo desde tu tarjeta.');
  // Todo en una transacción con el contexto del negocio: la tarjeta se lee bajo RLS.
  await withTenant(businessId, async (tx) => {
    const row = (await tx.query(
      `UPDATE card_pair_codes SET used_at = now()
        WHERE code_hash = $1 AND business_id = $2 AND used_at IS NULL AND expires_at > now()
        RETURNING card_id`, [codeHash(businessId, code), businessId])).rows[0];
    if (!row) throw invalid();
    const card = (await tx.query("SELECT 1 FROM cards WHERE id = $1 AND status = 'active'", [row.card_id])).rows[0];
    if (!card) throw invalid();
    await tx.query('INSERT INTO card_access_tokens (token_hash, card_id, business_id) VALUES ($1, $2, $3)', [sha256(token), row.card_id, businessId]);
    await audit(tx, businessId, { type: 'customer', id: null }, 'card.device_paired', 'card', row.card_id);
  });
  return { token };
}
