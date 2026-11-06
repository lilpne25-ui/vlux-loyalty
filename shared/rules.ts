// Reglas de fidelización puras (sin BD ni red). Las usa el servidor y se prueban por separado.
//
// Glosario del dominio (V0.2):
//  - Compra (purchase): operación comercial registrada por el personal. Puede incluir varios artículos.
//  - Visita (visit): ocasión en que el cliente acudió al negocio. Varias compras dentro de la
//    ventana de visita cuentan como UNA visita.
//  - Sello (stamp): unidad de fidelización. Se calcula a partir de la compra según la regla del negocio.
//  - Recompensa (reward): beneficio desbloqueado al juntar los sellos requeridos.
//  - Recurrencia: el cliente tiene 2 o más visitas distintas.

import type { ProgramType } from './catalog';
export type StampMode = 'per_purchase' | 'per_item';

export interface ProgramRules {
  stampsRequired: number;
  stampMode: StampMode;
  maxStampsPerPurchase: number;
  visitWindowMinutes: number;
  /** V0.4.5: tipo de programa del motor común (por omisión, sellos por compra = comportamiento V0.2–V0.4.4). */
  programType?: ProgramType;
  /** Puntos: centavos de consumo que equivalen a 1 punto (1000 = 1 punto por cada $10). */
  amountPerPointCents?: number | null;
  /** Servicios: lista de servicios participantes (vacía = cualquier servicio). */
  eligibleServices?: string[] | null;
}

export const LIMITS = {
  stampsRequired: { min: 3, max: 20 },
  pointsRequired: { min: 10, max: 100000 },
  maxPointsPerPurchase: { min: 1, max: 100000 },
  amountPerPointCents: { min: 100, max: 100000 },
  amountCents: { min: 1, max: 10_000_000 },
  maxStampsPerPurchase: { min: 1, max: 10 },
  visitWindowMinutes: { min: 15, max: 720 },
  itemCount: { min: 1, max: 50 },
} as const;

export const DEFAULT_RULES: ProgramRules = {
  stampsRequired: 8,
  stampMode: 'per_purchase',
  maxStampsPerPurchase: 1,
  visitWindowMinutes: 120,
};

/** Sellos que genera una compra. per_purchase: 1 por compra. per_item: 1 por artículo, con tope. */
export function stampsForPurchase(rules: ProgramRules, itemCount: number): number {
  if (!Number.isInteger(itemCount) || itemCount < LIMITS.itemCount.min || itemCount > LIMITS.itemCount.max) {
    throw new RangeError(`itemCount fuera de rango: ${itemCount}`);
  }
  if (rules.stampMode === 'per_purchase') return 1;
  return Math.min(itemCount, rules.maxStampsPerPurchase);
}

export type OperationInput = { itemCount: number; amountCents?: number | null; service?: string | null; isNewVisit: boolean };
export type OperationResult = { units: number; error?: 'amount_required' | 'service_required' | 'service_not_eligible' };

/**
 * V0.4.5 · Motor común: cuántas unidades (sellos, visitas, servicios o puntos) genera una operación de caja.
 * Un solo libro mayor y un solo flujo de canje para todos los tipos; solo cambia esta función.
 */
export function unitsForOperation(rules: ProgramRules, op: OperationInput): OperationResult {
  const type = rules.programType ?? 'stamps_purchase';
  switch (type) {
    case 'stamps_purchase':
    case 'custom':
      return { units: stampsForPurchase(rules, op.itemCount) };
    case 'stamps_visit':
      // Varias compras dentro de la ventana de visita = una sola visita.
      return { units: op.isNewVisit ? 1 : 0 };
    case 'stamps_service': {
      const list = (rules.eligibleServices ?? []).filter(Boolean);
      if (list.length) {
        if (!op.service) return { units: 0, error: 'service_required' };
        if (!list.some((s) => s.toLowerCase() === op.service!.trim().toLowerCase())) return { units: 0, error: 'service_not_eligible' };
      }
      return { units: Math.min(op.itemCount, rules.maxStampsPerPurchase) };
    }
    case 'points': {
      if (!op.amountCents || !Number.isInteger(op.amountCents) || op.amountCents < LIMITS.amountCents.min) return { units: 0, error: 'amount_required' };
      const per = rules.amountPerPointCents && rules.amountPerPointCents > 0 ? rules.amountPerPointCents : 1000;
      return { units: Math.min(Math.floor(op.amountCents / per), rules.maxStampsPerPurchase) };
    }
  }
}

/** Una compra pertenece a la visita abierta si ocurre dentro de la ventana desde que inició esa visita. */
export function isSameVisit(openVisitStartedAt: Date | null, now: Date, windowMinutes: number): boolean {
  if (!openVisitStartedAt) return false;
  const elapsed = now.getTime() - openVisitStartedAt.getTime();
  return elapsed >= 0 && elapsed < windowMinutes * 60_000;
}

/** Se desbloquea una recompensa cuando el saldo alcanza la meta y no hay otra pendiente de canje. */
export function shouldUnlockReward(balance: number, stampsRequired: number, hasAvailableReward: boolean): boolean {
  return !hasAvailableReward && balance >= stampsRequired;
}

/** Saldo después de canjear: se descuentan los sellos que costó la recompensa; el excedente pasa al siguiente ciclo. */
export function balanceAfterRedemption(balance: number, stampsCost: number): number {
  if (stampsCost <= 0) throw new RangeError('stampsCost debe ser positivo');
  if (balance < stampsCost) throw new RangeError('Saldo insuficiente para canjear');
  return balance - stampsCost;
}

export function validateRules(r: ProgramRules): string | null {
  const inRange = (v: number, l: { min: number; max: number }) => Number.isInteger(v) && v >= l.min && v <= l.max;
  if (!inRange(r.stampsRequired, LIMITS.stampsRequired)) return `Los sellos necesarios deben estar entre ${LIMITS.stampsRequired.min} y ${LIMITS.stampsRequired.max}.`;
  if (r.stampMode !== 'per_purchase' && r.stampMode !== 'per_item') return 'Modo de sellos inválido.';
  if (!inRange(r.maxStampsPerPurchase, LIMITS.maxStampsPerPurchase)) return `El tope de sellos por compra debe estar entre ${LIMITS.maxStampsPerPurchase.min} y ${LIMITS.maxStampsPerPurchase.max}.`;
  if (!inRange(r.visitWindowMinutes, LIMITS.visitWindowMinutes)) return `La ventana de visita debe estar entre ${LIMITS.visitWindowMinutes.min} y ${LIMITS.visitWindowMinutes.max} minutos.`;
  return null;
}

/**
 * Simulación en memoria del flujo de compras de UNA tarjeta, usando exactamente las mismas reglas
 * que el servidor. Sirve para pruebas y para explicar las métricas.
 */
export interface Tally { purchases: number; visits: number; stampsEarned: number; balance: number; rewardsUnlocked: number; rewardsRedeemed: number; }

export function simulate(rules: ProgramRules, events: ({ kind: 'purchase'; at: Date; items: number } | { kind: 'redeem'; at: Date })[]): Tally {
  const t: Tally = { purchases: 0, visits: 0, stampsEarned: 0, balance: 0, rewardsUnlocked: 0, rewardsRedeemed: 0 };
  let openVisit: Date | null = null;
  let available = false;
  for (const e of events) {
    if (e.kind === 'purchase') {
      if (!isSameVisit(openVisit, e.at, rules.visitWindowMinutes)) {
        openVisit = e.at;
        t.visits++;
      }
      const s = stampsForPurchase(rules, e.items);
      t.purchases++;
      t.stampsEarned += s;
      t.balance += s;
    } else if (available) {
      t.balance = balanceAfterRedemption(t.balance, rules.stampsRequired);
      t.rewardsRedeemed++;
      available = false;
    }
    if (shouldUnlockReward(t.balance, rules.stampsRequired, available)) {
      available = true;
      t.rewardsUnlocked++;
    }
  }
  return t;
}
