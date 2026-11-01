// Lectura de tarjetas: vista del cliente (solo la suya) y vista del personal.
import { Tx, withTenant } from '../db';
import { notFound } from '../errors';
import { getBusinessById } from './businesses';

export const REVIEW_MIN_VISITS = 2;

export interface CardSummary {
  id: string;
  publicCode: string;
  customerName: string;
  balance: number;
  cycle: number;
  status: string;
  createdAt: string;
  lastVisitAt: string | null;
  lastPurchaseAt: string | null;
  visits: number;
  purchases: number;
  redeemed: number;
  reward: { id: string; code: string; description: string; stampsCost: number; unlockedAt: string } | null;
}

export async function loadCardSummary(tx: Tx, cardId: string): Promise<CardSummary | null> {
  const row = (await tx.query(
    `SELECT c.id, c.public_code, c.stamp_balance, c.cycle, c.status, c.created_at, c.last_visit_at, c.last_purchase_at, cu.display_name,
            (SELECT count(*)::int FROM visits v WHERE v.card_id = c.id) AS visits,
            (SELECT count(*)::int FROM purchases p WHERE p.card_id = c.id AND p.voided_at IS NULL) AS purchases,
            (SELECT count(*)::int FROM rewards r WHERE r.card_id = c.id AND r.status = 'redeemed') AS redeemed
       FROM cards c JOIN customers cu ON cu.id = c.customer_id
      WHERE c.id = $1`,
    [cardId],
  )).rows[0];
  if (!row) return null;
  const rw = (await tx.query("SELECT id, code, description, stamps_cost, unlocked_at FROM rewards WHERE card_id = $1 AND status = 'available'", [cardId])).rows[0];
  return {
    id: row.id, publicCode: row.public_code, customerName: row.display_name, balance: row.stamp_balance, cycle: row.cycle, status: row.status,
    createdAt: row.created_at.toISOString(), lastVisitAt: row.last_visit_at?.toISOString() ?? null, lastPurchaseAt: row.last_purchase_at?.toISOString() ?? null,
    visits: row.visits, purchases: row.purchases, redeemed: row.redeemed,
    reward: rw ? { id: rw.id, code: rw.code, description: rw.description, stampsCost: rw.stamps_cost, unlockedAt: rw.unlocked_at.toISOString() } : null,
  };
}

export interface HistoryItem { kind: 'card_created' | 'purchase' | 'purchase_voided' | 'reward_unlocked' | 'reward_redeemed'; at: string; stamps: number; items?: number; purchaseId?: string; voided?: boolean; customerName?: string; publicCode?: string; staffName?: string | null }

/** Historial de una tarjeta o de todo el negocio (si cardId es null). Solo eventos reales persistidos. */
export async function loadHistory(tx: Tx, cardId: string | null, limit: number, includeStaff: boolean): Promise<HistoryItem[]> {
  const rows = (await tx.query(
    `SELECT h.kind, h.at, h.stamps, h.items, h.purchase_id, h.voided, c.public_code, cu.display_name, su.display_name AS staff_name FROM (
        SELECT 'purchase' AS kind, p.created_at AS at, p.stamps_awarded AS stamps, p.item_count AS items, p.card_id, p.staff_user_id, p.id AS purchase_id, p.voided_at IS NOT NULL AS voided
          FROM purchases p WHERE ($1::uuid IS NULL OR p.card_id = $1)
        UNION ALL
        SELECT 'purchase_voided', p.voided_at, -p.stamps_awarded, p.item_count, p.card_id, p.voided_by, p.id, true
          FROM purchases p WHERE p.voided_at IS NOT NULL AND ($1::uuid IS NULL OR p.card_id = $1)
        UNION ALL
        SELECT 'reward_unlocked', r.unlocked_at, 0, NULL, r.card_id, NULL, NULL, false FROM rewards r WHERE ($1::uuid IS NULL OR r.card_id = $1)
        UNION ALL
        SELECT 'reward_redeemed', r.redeemed_at, -r.stamps_cost, NULL, r.card_id, r.redeemed_by, NULL, false FROM rewards r WHERE r.status = 'redeemed' AND ($1::uuid IS NULL OR r.card_id = $1)
        UNION ALL
        SELECT 'card_created', c.created_at, 0, NULL, c.id, NULL, NULL, false FROM cards c WHERE ($1::uuid IS NULL OR c.id = $1)
      ) h
      JOIN cards c ON c.id = h.card_id JOIN customers cu ON cu.id = c.customer_id
      LEFT JOIN staff_users su ON su.id = h.staff_user_id
      ORDER BY h.at DESC LIMIT $2`,
    [cardId, limit],
  )).rows;
  return rows.map((r) => ({
    kind: r.kind, at: r.at.toISOString(), stamps: r.stamps, items: r.items ?? undefined,
    purchaseId: includeStaff && r.purchase_id ? r.purchase_id : undefined, voided: r.voided || undefined,
    customerName: r.display_name, publicCode: r.public_code, staffName: includeStaff ? r.staff_name ?? null : undefined,
  }));
}

/** Vista del cliente: su tarjeta, regla vigente, historial propio y si corresponde invitar a reseña. */
export async function customerCardView(businessId: string, cardId: string) {
  const business = await getBusinessById(businessId);
  return withTenant(businessId, async (tx) => {
    const card = await loadCardSummary(tx, cardId);
    if (!card || card.status !== 'active') throw notFound('Tarjeta');
    const history = await loadHistory(tx, cardId, 8, false);
    const rev = (await tx.query("SELECT kind FROM review_events WHERE card_id = $1 AND kind IN ('prompt_shown','dismissed')", [cardId])).rows.map((r) => r.kind);
    const showReview = !!business.reviewUrl && card.visits >= REVIEW_MIN_VISITS && !rev.includes('dismissed');
    return {
      business: { slug: business.slug, name: business.name, city: business.city, vertical: business.vertical, primaryColor: business.primaryColor, accentColor: business.accentColor, cardFinish: business.cardFinish, reviewUrl: business.reviewUrl, isDemo: business.isDemo, logoUrl: business.logoUrl },
      program: business.program,
      card: { publicCode: card.publicCode, customerName: card.customerName, balance: card.balance, cycle: card.cycle, createdAt: card.createdAt, visits: card.visits, redeemed: card.redeemed, reward: card.reward },
      history: history.map(({ kind, at, stamps, items }) => ({ kind, at, stamps, items })),
      review: { show: showReview, alreadyShown: rev.includes('prompt_shown') },
    };
  });
}
