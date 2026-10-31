// Operaciones del personal: identificar tarjeta, registrar compra (visita + sellos) y canjear recompensa.
// Todas corren en una transacción con la fila de la tarjeta bloqueada (SELECT ... FOR UPDATE),
// por lo que dos solicitudes simultáneas sobre la misma tarjeta se procesan una después de otra.
import { Tx, withTenant } from '../db';
import { AppError, notFound } from '../errors';
import { newRewardCode, parseScannedCode } from '../security';
import { isSameVisit, ProgramRules, shouldUnlockReward, stampsForPurchase, balanceAfterRedemption } from '../../shared/rules';
import { purchaseSchema } from '../validation';
import { audit } from './audit';
import { loadCardSummary, loadHistory } from './cards';
import type { StaffSession } from './auth';

/** Ventana en la que una segunda compra (con otra llave) se considera posible doble registro. */
export const DUPLICATE_GUARD_SECONDS = 20;

interface ActiveRule extends ProgramRules { id: string; rewardDescription: string }

async function activeRule(tx: Tx): Promise<ActiveRule> {
  const r = (await tx.query('SELECT id, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description FROM reward_rules WHERE active')).rows[0];
  if (!r) throw new Error('El negocio no tiene una regla activa');
  return { id: r.id, stampsRequired: r.stamps_required, stampMode: r.stamp_mode, maxStampsPerPurchase: r.max_stamps_per_purchase, visitWindowMinutes: r.visit_window_minutes, rewardDescription: r.reward_description };
}

/** Desbloquea una recompensa si el saldo alcanza la meta y no hay otra pendiente. Requiere la tarjeta bloqueada. */
export async function unlockIfEligible(tx: Tx, businessId: string, cardId: string, rule: ActiveRule): Promise<{ id: string; code: string } | null> {
  const card = (await tx.query('SELECT stamp_balance, cycle FROM cards WHERE id = $1', [cardId])).rows[0];
  const hasAvailable = !!(await tx.query("SELECT 1 FROM rewards WHERE card_id = $1 AND status = 'available'", [cardId])).rowCount;
  if (!shouldUnlockReward(card.stamp_balance, rule.stampsRequired, hasAvailable)) return null;
  for (let i = 0; i < 5; i++) {
    const code = newRewardCode();
    const r = await tx.query(
      `INSERT INTO rewards (business_id, card_id, rule_id, code, description, stamps_cost, cycle)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (code) DO NOTHING RETURNING id`,
      [businessId, cardId, rule.id, code, rule.rewardDescription, rule.stampsRequired, card.cycle],
    );
    if (r.rowCount) {
      await audit(tx, businessId, { type: 'system', id: null }, 'reward.unlocked', 'reward', r.rows[0].id, { cardId, stampsCost: rule.stampsRequired });
      return { id: r.rows[0].id, code };
    }
  }
  throw new Error('No se pudo generar un código de recompensa único');
}

/** Identifica una tarjeta por el contenido del QR o el código escrito. El QR no autoriza nada por sí mismo. */
export async function lookupCard(session: StaffSession, raw: string) {
  const parsed = parseScannedCode(raw);
  if (!parsed) throw new AppError(422, 'invalid_code', 'Ese código no es de una tarjeta VLUX Loyalty.');
  return withTenant(session.businessId, async (tx) => {
    const sql = parsed.kind === 'card'
      ? "SELECT id FROM cards WHERE public_code = $1 AND status = 'active'"
      : 'SELECT card_id AS id FROM rewards WHERE code = $1';
    const row = (await tx.query(sql, [parsed.code])).rows[0];
    // RLS hace que una tarjeta de otro negocio simplemente "no exista" aquí.
    if (!row) throw notFound('Tarjeta');
    return { cardId: row.id as string, matchedBy: parsed.kind };
  });
}

export async function searchCards(session: StaffSession, q: string) {
  const term = q.trim().slice(0, 40);
  return withTenant(session.businessId, async (tx) => {
    const rows = (await tx.query(
      `SELECT c.id, c.public_code, c.stamp_balance, cu.display_name, c.last_purchase_at,
              EXISTS (SELECT 1 FROM rewards r WHERE r.card_id = c.id AND r.status = 'available') AS has_reward
         FROM cards c JOIN customers cu ON cu.id = c.customer_id
        WHERE c.status = 'active' AND ($1 = '' OR cu.display_name ILIKE '%' || $1 || '%' OR replace(c.public_code, '-', '') ILIKE '%' || replace($1, '-', '') || '%')
        ORDER BY coalesce(c.last_purchase_at, c.created_at) DESC LIMIT 20`,
      [term.replace(/[%_\\]/g, '')],
    )).rows;
    return rows.map((r) => ({ id: r.id, publicCode: r.public_code, customerName: r.display_name, balance: r.stamp_balance, hasReward: r.has_reward, lastPurchaseAt: r.last_purchase_at?.toISOString() ?? null }));
  });
}

export async function staffCardView(session: StaffSession, cardId: string) {
  return withTenant(session.businessId, async (tx) => {
    const card = await loadCardSummary(tx, cardId);
    if (!card) throw notFound('Tarjeta');
    const rule = await activeRule(tx);
    const history = await loadHistory(tx, cardId, 10, true);
    return { card, program: { stampsRequired: rule.stampsRequired, stampMode: rule.stampMode, maxStampsPerPurchase: rule.maxStampsPerPurchase, rewardDescription: rule.rewardDescription }, history };
  });
}

export async function registerPurchase(session: StaffSession, cardId: string, raw: unknown) {
  const input = purchaseSchema.parse(raw);
  return withTenant(session.businessId, async (tx) => {
    const card = (await tx.query("SELECT id, stamp_balance, status FROM cards WHERE id = $1 FOR UPDATE", [cardId])).rows[0];
    if (!card) throw notFound('Tarjeta');

    // Idempotencia: la misma llave devuelve el mismo resultado sin registrar nada nuevo.
    const prior = (await tx.query('SELECT id, card_id, stamps_awarded, visit_id FROM purchases WHERE idempotency_key = $1', [input.idempotencyKey])).rows[0];
    if (prior) {
      if (prior.card_id !== cardId) throw new AppError(409, 'idempotency_conflict', 'Esa operación ya se usó con otra tarjeta.');
      return { replayed: true, purchaseId: prior.id as string, stampsAwarded: prior.stamps_awarded as number, newVisit: false, rewardUnlocked: null, card: await loadCardSummary(tx, cardId) };
    }
    if (card.status !== 'active') throw new AppError(409, 'card_inactive', 'La tarjeta no está activa.');

    const recent = (await tx.query(`SELECT extract(epoch FROM now() - max(created_at))::int AS secs FROM purchases WHERE card_id = $1`, [cardId])).rows[0];
    if (recent.secs !== null && recent.secs < DUPLICATE_GUARD_SECONDS && !input.confirmDuplicate) {
      throw new AppError(409, 'possible_duplicate', `Ya se registró una compra para esta tarjeta hace ${recent.secs} s. Si es otra compra, confírmalo.`, { secondsAgo: recent.secs });
    }

    const rule = await activeRule(tx);
    const stamps = stampsForPurchase(rule, input.itemCount);
    const now = new Date((await tx.query('SELECT now() AS t')).rows[0].t);
    const openVisit = (await tx.query('SELECT id, started_at FROM visits WHERE card_id = $1 ORDER BY started_at DESC LIMIT 1', [cardId])).rows[0];
    const sameVisit = openVisit && isSameVisit(new Date(openVisit.started_at), now, rule.visitWindowMinutes);
    const visitId = sameVisit
      ? openVisit.id
      : (await tx.query('INSERT INTO visits (business_id, card_id, created_by) VALUES ($1, $2, $3) RETURNING id', [session.businessId, cardId, session.userId])).rows[0].id;

    const purchaseId = (await tx.query(
      `INSERT INTO purchases (business_id, card_id, visit_id, rule_id, item_count, stamps_awarded, idempotency_key, staff_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [session.businessId, cardId, visitId, rule.id, input.itemCount, stamps, input.idempotencyKey, session.userId],
    )).rows[0].id as string;
    const balance = card.stamp_balance + stamps;
    await tx.query('INSERT INTO stamp_events (business_id, card_id, delta, reason, purchase_id, balance_after, staff_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [session.businessId, cardId, stamps, 'purchase', purchaseId, balance, session.userId]);
    await tx.query(`UPDATE cards SET stamp_balance = $2, last_purchase_at = now(), last_visit_at = CASE WHEN $3 THEN last_visit_at ELSE now() END WHERE id = $1`, [cardId, balance, !!sameVisit]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'purchase.registered', 'purchase', purchaseId, { cardId, itemCount: input.itemCount, stamps, newVisit: !sameVisit });
    const rewardUnlocked = await unlockIfEligible(tx, session.businessId, cardId, rule);
    return { replayed: false, purchaseId, stampsAwarded: stamps, newVisit: !sameVisit, rewardUnlocked, card: await loadCardSummary(tx, cardId) };
  });
}

export async function redeemReward(session: StaffSession, rewardId: string) {
  return withTenant(session.businessId, async (tx) => {
    const ref = (await tx.query('SELECT card_id FROM rewards WHERE id = $1', [rewardId])).rows[0];
    if (!ref) throw notFound('Recompensa');
    // Mismo orden de bloqueo que registerPurchase (primero la tarjeta) para evitar interbloqueos.
    const card = (await tx.query('SELECT id, stamp_balance FROM cards WHERE id = $1 FOR UPDATE', [ref.card_id])).rows[0];
    const reward = (await tx.query('SELECT id, status, stamps_cost, redeemed_at, description, code FROM rewards WHERE id = $1 FOR UPDATE', [rewardId])).rows[0];
    if (reward.status === 'redeemed') {
      throw new AppError(409, 'already_redeemed', 'Esta recompensa ya fue canjeada. No puede usarse otra vez.', { redeemedAt: reward.redeemed_at.toISOString() });
    }
    if (reward.status !== 'available') throw new AppError(409, 'reward_void', 'Esta recompensa ya no es válida.');
    const balance = balanceAfterRedemption(card.stamp_balance, reward.stamps_cost);
    await tx.query("UPDATE rewards SET status = 'redeemed', redeemed_at = now(), redeemed_by = $2 WHERE id = $1", [rewardId, session.userId]);
    await tx.query('INSERT INTO stamp_events (business_id, card_id, delta, reason, reward_id, balance_after, staff_user_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [session.businessId, card.id, -reward.stamps_cost, 'redemption', rewardId, balance, session.userId]);
    await tx.query('UPDATE cards SET stamp_balance = $2, cycle = cycle + 1 WHERE id = $1', [card.id, balance]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'reward.redeemed', 'reward', rewardId, { cardId: card.id, code: reward.code });
    // El excedente puede alcanzar de nuevo la meta.
    const next = await unlockIfEligible(tx, session.businessId, card.id, await activeRule(tx));
    return { redeemed: { id: rewardId, code: reward.code, description: reward.description }, rewardUnlocked: next, card: await loadCardSummary(tx, card.id) };
  });
}

export async function recordReviewEvent(businessId: string, cardId: string, kind: 'prompt_shown' | 'link_opened' | 'dismissed') {
  return withTenant(businessId, async (tx) => {
    await tx.query(
      `INSERT INTO review_events (business_id, card_id, kind) SELECT $1, $2, $3
        WHERE $3 = 'link_opened' OR NOT EXISTS (SELECT 1 FROM review_events WHERE card_id = $2 AND kind = $3)
       ON CONFLICT DO NOTHING`,
      [businessId, cardId, kind],
    );
  });
}
