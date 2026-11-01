// Panel del dueño: métricas reales, clientes, actividad, configuración, personal y privacidad.
import { withTenant, getPool, withTx } from '../db';
import { AppError, notFound } from '../errors';
import { hashPassword } from '../security';
import { createEmployeeSchema, updateProgramSchema } from '../validation';
import { audit } from './audit';
import { loadHistory } from './cards';
import { unlockIfEligible } from './loyalty';
import type { StaffSession } from './auth';

const TZ = 'America/Mexico_City';

export async function dashboard(session: StaffSession, days = 14) {
  return withTenant(session.businessId, async (tx) => {
    const k = (await tx.query(
      `SELECT
         (SELECT count(*) FROM customers WHERE anonymized_at IS NULL)::int AS customers,
         (SELECT count(*) FROM customers WHERE created_at >= now() - interval '7 days')::int AS new_customers_7d,
         (SELECT count(*) FROM visits)::int AS visits,
         (SELECT count(*) FROM purchases WHERE voided_at IS NULL)::int AS purchases,
         (SELECT coalesce(sum(delta), 0) FROM stamp_events WHERE reason IN ('purchase','void'))::int AS stamps,
         (SELECT count(*) FROM (SELECT card_id FROM visits GROUP BY card_id HAVING count(*) >= 2) x)::int AS recurring,
         (SELECT count(*) FROM rewards)::int AS rewards_unlocked,
         (SELECT count(*) FROM rewards WHERE status = 'redeemed')::int AS redemptions,
         (SELECT count(*) FROM rewards WHERE status = 'available')::int AS rewards_pending,
         (SELECT count(*) FROM review_events WHERE kind = 'prompt_shown')::int AS review_prompts,
         (SELECT count(*) FROM review_events WHERE kind = 'link_opened')::int AS review_clicks`,
    )).rows[0];
    const series = (await tx.query(
      `SELECT d::date AS day,
              (SELECT count(*) FROM visits v WHERE (v.started_at AT TIME ZONE $2)::date = d::date)::int AS visits,
              (SELECT count(*) FROM purchases p WHERE p.voided_at IS NULL AND (p.created_at AT TIME ZONE $2)::date = d::date)::int AS purchases
         FROM generate_series((now() AT TIME ZONE $2)::date - ($1::int - 1), (now() AT TIME ZONE $2)::date, interval '1 day') d
        ORDER BY d`,
      [days, TZ],
    )).rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), visits: r.visits, purchases: r.purchases }));
    const rule = (await tx.query('SELECT stamps_required, reward_description FROM reward_rules WHERE active')).rows[0];
    const visitCounts = (await tx.query(
      `SELECT coalesce(v.n, 0)::int AS n FROM cards c LEFT JOIN (SELECT card_id, count(*) AS n FROM visits GROUP BY card_id) v ON v.card_id = c.id WHERE c.status = 'active'`,
    )).rows.map((r) => r.n as number);
    const req = rule.stamps_required as number;
    const recurrence = [
      { label: 'Sin visitas aún', value: visitCounts.filter((n) => n === 0).length },
      { label: '1 visita', value: visitCounts.filter((n) => n === 1).length },
      { label: '2 a 3 visitas', value: visitCounts.filter((n) => n >= 2 && n <= 3).length },
      { label: `4 o más visitas`, value: visitCounts.filter((n) => n >= 4).length },
    ];
    const near = (await tx.query(
      `SELECT cu.display_name FROM cards c JOIN customers cu ON cu.id = c.customer_id
        WHERE c.status = 'active' AND c.stamp_balance > 0 AND c.stamp_balance >= $1 - 2 AND c.stamp_balance < $1
          AND NOT EXISTS (SELECT 1 FROM rewards r WHERE r.card_id = c.id AND r.status = 'available') ORDER BY c.stamp_balance DESC LIMIT 20`,
      [req],
    )).rows.map((r) => r.display_name as string);
    const pending = (await tx.query(
      "SELECT cu.display_name FROM rewards r JOIN cards c ON c.id = r.card_id JOIN customers cu ON cu.id = c.customer_id WHERE r.status = 'available' ORDER BY r.unlocked_at LIMIT 20",
    )).rows.map((r) => r.display_name as string);
    return {
      kpis: {
        customers: k.customers, newCustomers7d: k.new_customers_7d, visits: k.visits, purchases: k.purchases, stamps: k.stamps, recurring: k.recurring,
        rewardsUnlocked: k.rewards_unlocked, redemptions: k.redemptions, rewardsPending: k.rewards_pending, reviewPrompts: k.review_prompts, reviewClicks: k.review_clicks,
      },
      series, recurrence, program: { stampsRequired: req, rewardDescription: rule.reward_description }, nearReward: near, pendingRewards: pending,
    };
  });
}

export async function listCustomers(session: StaffSession) {
  return withTenant(session.businessId, async (tx) => {
    const rows = (await tx.query(
      `SELECT c.id AS card_id, c.public_code, c.stamp_balance, c.last_visit_at, c.created_at, cu.id AS customer_id, cu.display_name, cu.contact_type, cu.marketing_consent, cu.anonymized_at,
              (SELECT count(*) FROM visits v WHERE v.card_id = c.id)::int AS visits,
              (SELECT count(*) FROM purchases p WHERE p.card_id = c.id AND p.voided_at IS NULL)::int AS purchases,
              (SELECT count(*) FROM rewards r WHERE r.card_id = c.id AND r.status = 'redeemed')::int AS redeemed,
              EXISTS (SELECT 1 FROM rewards r WHERE r.card_id = c.id AND r.status = 'available') AS has_reward
         FROM cards c JOIN customers cu ON cu.id = c.customer_id
        ORDER BY coalesce(c.last_purchase_at, c.created_at) DESC LIMIT 500`,
    )).rows;
    return rows.map((r) => ({
      cardId: r.card_id, customerId: r.customer_id, publicCode: r.public_code, customerName: r.display_name, balance: r.stamp_balance,
      visits: r.visits, purchases: r.purchases, redeemed: r.redeemed, hasReward: r.has_reward, contactType: r.contact_type,
      marketingConsent: r.marketing_consent, anonymized: !!r.anonymized_at, lastVisitAt: r.last_visit_at?.toISOString() ?? null, createdAt: r.created_at.toISOString(),
    }));
  });
}

export async function activity(session: StaffSession, limit = 30) {
  return withTenant(session.businessId, (tx) => loadHistory(tx, null, Math.min(limit, 100), true));
}

export async function updateProgram(session: StaffSession, raw: unknown) {
  const input = updateProgramSchema.parse(raw);
  return withTenant(session.businessId, async (tx) => {
    await tx.query('UPDATE businesses SET name = $2, vertical = $3, primary_color = $4, accent_color = $5, review_url = $6 WHERE id = $1',
      [session.businessId, input.name, input.vertical, input.primaryColor, input.accentColor, input.reviewUrl]);
    const cur = (await tx.query('SELECT id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description FROM reward_rules WHERE active FOR UPDATE')).rows[0];
    const r = input.rules;
    const changed = cur.stamps_required !== r.stampsRequired || cur.stamp_mode !== r.stampMode || cur.max_stamps_per_purchase !== r.maxStampsPerPurchase
      || cur.visit_window_minutes !== r.visitWindowMinutes || cur.reward_description !== r.rewardDescription;
    let unlocked = 0;
    if (changed) {
      // Nueva versión de la regla; la anterior queda como historial. Las recompensas ya ganadas conservan su costo y descripción.
      await tx.query('UPDATE reward_rules SET active = false WHERE id = $1', [cur.id]);
      const ruleId = (await tx.query(
        `INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [session.businessId, cur.version + 1, r.stampsRequired, r.stampMode, r.maxStampsPerPurchase, r.visitWindowMinutes, r.rewardDescription, session.userId],
      )).rows[0].id;
      const rule = { id: ruleId, ...r };
      const eligible = (await tx.query(
        "SELECT id FROM cards c WHERE status = 'active' AND stamp_balance >= $1 AND NOT EXISTS (SELECT 1 FROM rewards r WHERE r.card_id = c.id AND r.status = 'available') ORDER BY id FOR UPDATE",
        [r.stampsRequired],
      )).rows;
      for (const c of eligible) if (await unlockIfEligible(tx, session.businessId, c.id, rule)) unlocked++;
    }
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'program.updated', 'business', session.businessId, { ruleChanged: changed, unlocked });
    return { ruleChanged: changed, rewardsUnlocked: unlocked };
  });
}

export async function listStaff(session: StaffSession) {
  return (await getPool().query(
    `SELECT m.id AS membership_id, m.role, m.active, u.email, u.display_name, m.created_at FROM staff_memberships m JOIN staff_users u ON u.id = m.user_id
      WHERE m.business_id = $1 ORDER BY m.role, u.display_name`,
    [session.businessId],
  )).rows.map((r) => ({ membershipId: r.membership_id, role: r.role, active: r.active, email: r.email, displayName: r.display_name, createdAt: r.created_at.toISOString() }));
}

export async function createEmployee(session: StaffSession, raw: unknown) {
  const input = createEmployeeSchema.parse(raw);
  const hash = await hashPassword(input.password);
  const membershipId = await withTx(async (tx) => {
    const existing = (await tx.query('SELECT id FROM staff_users WHERE email = $1', [input.email])).rows[0];
    // Por privacidad no se reutiliza ni se revela una cuenta existente de otro negocio.
    if (existing) throw new AppError(409, 'email_taken', 'Ese correo ya tiene una cuenta. Usa otro correo para este empleado.');
    const userId = (await tx.query('INSERT INTO staff_users (email, password_hash, display_name, must_change_password) VALUES ($1, $2, $3, true) RETURNING id', [input.email, hash, input.displayName])).rows[0].id;
    return (await tx.query("INSERT INTO staff_memberships (business_id, user_id, role) VALUES ($1, $2, 'EMPLOYEE') RETURNING id", [session.businessId, userId])).rows[0].id as string;
  });
  await withTenant(session.businessId, (tx) => audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'staff.created', 'staff_membership', membershipId, { role: 'EMPLOYEE' }));
  return { membershipId };
}

export async function setStaffActive(session: StaffSession, membershipId: string, active: boolean) {
  const m = (await getPool().query('SELECT id, role, user_id FROM staff_memberships WHERE id = $1 AND business_id = $2', [membershipId, session.businessId])).rows[0];
  if (!m) throw notFound('Empleado');
  if (m.role === 'OWNER') throw new AppError(422, 'cannot_change_owner', 'La cuenta del dueño no se desactiva desde aquí.');
  await withTx(async (tx) => {
    await tx.query('UPDATE staff_memberships SET active = $2 WHERE id = $1', [membershipId, active]);
    if (!active) await tx.query('UPDATE staff_sessions SET revoked_at = now() WHERE membership_id = $1 AND revoked_at IS NULL', [membershipId]);
  });
  await withTenant(session.businessId, (tx) => audit(tx, session.businessId, { type: 'staff', id: session.userId }, active ? 'staff.activated' : 'staff.deactivated', 'staff_membership', membershipId));
  return { membershipId, active };
}

/** Derecho de cancelación (ARCO): se borran datos personales y se revoca el acceso; las métricas agregadas se conservan. */
export async function anonymizeCustomer(session: StaffSession, customerId: string) {
  return withTenant(session.businessId, async (tx) => {
    const c = (await tx.query('SELECT id, anonymized_at FROM customers WHERE id = $1 FOR UPDATE', [customerId])).rows[0];
    if (!c) throw notFound('Cliente');
    if (c.anonymized_at) return { customerId, alreadyAnonymized: true };
    await tx.query("UPDATE customers SET display_name = 'Cliente eliminado', contact = NULL, contact_type = NULL, marketing_consent = false, anonymized_at = now() WHERE id = $1", [customerId]);
    await tx.query("UPDATE cards SET status = 'revoked' WHERE customer_id = $1", [customerId]);
    await tx.query('UPDATE card_access_tokens SET revoked_at = now() WHERE revoked_at IS NULL AND card_id IN (SELECT id FROM cards WHERE customer_id = $1)', [customerId]);
    await tx.query("UPDATE rewards SET status = 'void' WHERE status = 'available' AND card_id IN (SELECT id FROM cards WHERE customer_id = $1)", [customerId]);
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'customer.anonymized', 'customer', customerId);
    return { customerId, alreadyAnonymized: false };
  });
}

/** Exportación de los datos de un cliente (derecho de acceso). */
export async function exportCustomer(session: StaffSession, customerId: string) {
  return withTenant(session.businessId, async (tx) => {
    const c = (await tx.query('SELECT id, display_name, contact, contact_type, marketing_consent, privacy_notice_version, privacy_accepted_at, created_at, anonymized_at FROM customers WHERE id = $1', [customerId])).rows[0];
    if (!c) throw notFound('Cliente');
    const cards = (await tx.query('SELECT id, public_code, stamp_balance, cycle, status, created_at FROM cards WHERE customer_id = $1', [customerId])).rows;
    const purchases = (await tx.query('SELECT p.created_at, p.item_count, p.stamps_awarded, p.voided_at FROM purchases p JOIN cards c ON c.id = p.card_id WHERE c.customer_id = $1 ORDER BY p.created_at', [customerId])).rows;
    const rewards = (await tx.query('SELECT r.code, r.description, r.status, r.unlocked_at, r.redeemed_at FROM rewards r JOIN cards c ON c.id = r.card_id WHERE c.customer_id = $1 ORDER BY r.unlocked_at', [customerId])).rows;
    await audit(tx, session.businessId, { type: 'staff', id: session.userId }, 'customer.exported', 'customer', customerId);
    return { customer: c, cards, purchases, rewards, generatedAt: new Date().toISOString() };
  });
}
