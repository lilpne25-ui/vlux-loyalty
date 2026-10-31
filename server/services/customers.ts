// Registro del cliente desde el QR del negocio y acceso sin contraseña a SU tarjeta.
import { config } from '../config';
import { getPool, Tx, withTenant } from '../db';
import { AppError } from '../errors';
import { newCardCode, newToken, sha256 } from '../security';
import { normalizeContact, registerCustomerSchema } from '../validation';
import { audit } from './audit';
import { getBusinessBySlug } from './businesses';

export async function registerCustomer(slug: string, raw: unknown) {
  const biz = await getBusinessBySlug(slug);
  const input = registerCustomerSchema.parse(raw);
  const c = normalizeContact(input.contact);
  if (c.error) throw new AppError(422, 'invalid_contact', c.error);
  const token = newToken();
  const result = await withTenant(biz.id, async (tx) => {
    const customer = (await tx.query(
      `INSERT INTO customers (business_id, display_name, contact, contact_type, marketing_consent, privacy_notice_version, privacy_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id`,
      [biz.id, input.displayName.replace(/\s+/g, ' '), c.contact, c.type, !!c.contact && input.marketingConsent, config.privacyNoticeVersion],
    )).rows[0].id as string;
    const card = await insertCardWithUniqueCode(tx, biz.id, customer);
    await tx.query('INSERT INTO card_access_tokens (token_hash, card_id, business_id) VALUES ($1, $2, $3)', [sha256(token), card.id, biz.id]);
    await audit(tx, biz.id, { type: 'customer', id: customer }, 'card.created', 'card', card.id, { hasContact: !!c.contact, marketingConsent: !!c.contact && input.marketingConsent });
    return card;
  });
  return { token, cardId: result.id, publicCode: result.publicCode, businessId: biz.id };
}

async function insertCardWithUniqueCode(tx: Tx, businessId: string, customerId: string) {
  for (let i = 0; i < 5; i++) {
    const code = newCardCode();
    const r = await tx.query(
      'INSERT INTO cards (business_id, customer_id, public_code) VALUES ($1, $2, $3) ON CONFLICT (public_code) DO NOTHING RETURNING id',
      [businessId, customerId, code],
    );
    if (r.rowCount) return { id: r.rows[0].id as string, publicCode: code };
  }
  throw new Error('No se pudo generar un código de tarjeta único');
}

/** Devuelve la tarjeta a la que da acceso el token (o null). No revela nada si el token no es válido. */
export async function resolveCardToken(token: string | undefined): Promise<{ cardId: string; businessId: string; slug: string } | null> {
  if (!token || token.length < 30 || token.length > 100) return null;
  const row = (await getPool().query(
    `SELECT t.card_id, t.business_id, b.slug FROM card_access_tokens t JOIN businesses b ON b.id = t.business_id
      WHERE t.token_hash = $1 AND t.revoked_at IS NULL AND b.status = 'active'`,
    [sha256(token)],
  )).rows[0];
  if (!row) return null;
  await getPool().query('UPDATE card_access_tokens SET last_used_at = now() WHERE token_hash = $1', [sha256(token)]);
  return { cardId: row.card_id, businessId: row.business_id, slug: row.slug };
}
