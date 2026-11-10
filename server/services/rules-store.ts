// V0.4.5 · Persistencia de reglas del motor común. Una regla activa por negocio, versionada: cambiar el programa
// crea una versión nueva y la anterior queda como historial (los premios ya ganados conservan costo y descripción).
import type { Tx } from '../db';
import type { ProgramType } from '../../shared/catalog';
import type { ProgramRules } from '../../shared/rules';
import type { RulesInput } from '../validation';

export interface StoredRule extends ProgramRules {
  id: string; version: number; rewardDescription: string; programType: ProgramType; programName: string; conditions: string;
  unitSingular: string | null; unitPlural: string | null; eligibleServices: string[]; amountPerPointCents: number | null;
  maxAwardsPerDay: number | null; validUntil: string | null;
}

export const RULE_COLUMNS = `id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description,
  program_type, program_name, conditions, unit_singular, unit_plural, eligible_services, amount_per_point_cents, max_awards_per_day, valid_until`;

export function ruleFromRow(r: Record<string, any>): StoredRule {
  const vu = r.valid_until;
  return {
    id: r.id, version: r.version, stampsRequired: r.stamps_required, stampMode: r.stamp_mode, maxStampsPerPurchase: r.max_stamps_per_purchase,
    visitWindowMinutes: r.visit_window_minutes, rewardDescription: r.reward_description, programType: r.program_type ?? 'stamps_purchase',
    programName: r.program_name ?? '', conditions: r.conditions ?? '', unitSingular: r.unit_singular ?? null, unitPlural: r.unit_plural ?? null,
    eligibleServices: r.eligible_services ?? [], amountPerPointCents: r.amount_per_point_cents ?? null, maxAwardsPerDay: r.max_awards_per_day ?? null,
    validUntil: vu ? (vu instanceof Date ? `${vu.getFullYear()}-${String(vu.getMonth() + 1).padStart(2, '0')}-${String(vu.getDate()).padStart(2, '0')}` : String(vu).slice(0, 10)) : null,
  };
}

/** Lo que ven cliente, caja y panel (sin ids internos de más). */
export function publicProgram(r: StoredRule) {
  return {
    ruleId: r.id, version: r.version, programType: r.programType, programName: r.programName, stampsRequired: r.stampsRequired, stampMode: r.stampMode,
    maxStampsPerPurchase: r.maxStampsPerPurchase, visitWindowMinutes: r.visitWindowMinutes, rewardDescription: r.rewardDescription, conditions: r.conditions,
    unitSingular: r.unitSingular, unitPlural: r.unitPlural, eligibleServices: r.eligibleServices, amountPerPointCents: r.amountPerPointCents,
    maxAwardsPerDay: r.maxAwardsPerDay, validUntil: r.validUntil,
  };
}

export async function loadActiveRule(tx: Tx, lock = false): Promise<StoredRule> {
  const r = (await tx.query(`SELECT ${RULE_COLUMNS} FROM reward_rules WHERE active${lock ? ' FOR UPDATE' : ''}`)).rows[0];
  if (!r) throw new Error('El negocio no tiene una regla activa');
  return ruleFromRow(r);
}

/** Normaliza: en sellos por compra el modo decide; en los demás tipos el modo no aplica (se guarda per_purchase). */
function normalized(r: RulesInput) {
  const stampMode = r.programType === 'stamps_purchase' || r.programType === 'custom' ? r.stampMode : 'per_purchase';
  return {
    ...r, stampMode,
    amountPerPointCents: r.programType === 'points' ? r.amountPerPointCents : null,
    eligibleServices: r.programType === 'stamps_service' ? r.eligibleServices : [],
  };
}

export async function insertRule(tx: Tx, businessId: string, version: number, raw: RulesInput, createdBy: string | null) {
  const r = normalized(raw);
  return (await tx.query(
    `INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, max_stamps_per_purchase, visit_window_minutes, reward_description,
       program_type, program_name, conditions, unit_singular, unit_plural, eligible_services, amount_per_point_cents, max_awards_per_day, valid_until, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [businessId, version, r.stampsRequired, r.stampMode, r.maxStampsPerPurchase, r.visitWindowMinutes, r.rewardDescription, r.programType, r.programName,
      r.conditions, r.unitSingular, r.unitPlural, r.eligibleServices, r.amountPerPointCents, r.maxAwardsPerDay, r.validUntil, createdBy],
  )).rows[0].id as string;
}

/** ¿Cambió algo que afecta la acumulación o el canje? (para versionar solo cuando hace falta) */
export function ruleChanged(cur: StoredRule, raw: RulesInput) {
  const n = normalized(raw);
  const same = cur.programType === n.programType && cur.stampsRequired === n.stampsRequired && cur.stampMode === n.stampMode
    && cur.maxStampsPerPurchase === n.maxStampsPerPurchase && cur.visitWindowMinutes === n.visitWindowMinutes && cur.rewardDescription === n.rewardDescription
    && cur.programName === n.programName && cur.conditions === n.conditions && cur.unitSingular === n.unitSingular && cur.unitPlural === n.unitPlural
    && JSON.stringify(cur.eligibleServices) === JSON.stringify(n.eligibleServices) && cur.amountPerPointCents === n.amountPerPointCents
    && cur.maxAwardsPerDay === n.maxAwardsPerDay && cur.validUntil === n.validUntil;
  return !same;
}
