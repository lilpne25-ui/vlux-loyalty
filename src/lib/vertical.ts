// Textos que dependen del giro y del tipo de programa (V0.4.5: catálogo extensible en shared/catalog.ts).
import type { Vertical, Program } from './api';
import { lowerFirst } from './format';
import { PROGRAM_TYPE_INFO, VERTICALS, unitLabel, verticalInfo } from '../../shared/catalog';

export const VERTICAL_LABEL: Record<Vertical, string> = Object.fromEntries(VERTICALS.map((v) => [v.id, v.label]));

export const welcomeHeadline = (v: Vertical) => `${verticalInfo(v).place} ahora tiene recompensas.`;

const fmt = (n: number) => new Intl.NumberFormat('es-MX').format(n);
const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);

/** Unidad del programa: "sello/sellos", "visita/visitas", "punto/puntos" o la personalizada. */
export const units = (p: Program, n: number) => unitLabel({ programType: p.programType, unitSingular: p.unitSingular, unitPlural: p.unitPlural }, n);
export const unitTitle = (p: Program) => { const u = units(p, 2); return u.charAt(0).toUpperCase() + u.slice(1); };
export const isPoints = (p: Program) => p.programType === 'points';

/** Cómo se gana (bloque corto "1 compra = 1 sello"). */
export function stampRule(p: Program): { title: string; sub: string } {
  switch (p.programType) {
    case 'stamps_visit': return { title: '1 visita', sub: `= 1 ${units(p, 1)}` };
    case 'stamps_service': return { title: '1 servicio', sub: p.maxStampsPerPurchase > 1 ? `= 1 ${units(p, 1)} (hasta ${p.maxStampsPerPurchase})` : `= 1 ${units(p, 1)}` };
    case 'points': return { title: money(p.amountPerPointCents ?? 1000), sub: `= 1 ${units(p, 1)}` };
    default:
      if (p.stampMode === 'per_item') return { title: '1 artículo', sub: `= 1 ${units(p, 1)} (hasta ${p.maxStampsPerPurchase})` };
      return { title: '1 compra', sub: `= 1 ${units(p, 1)}` };
  }
}

export const rewardSentence = (p: Program) => `Acumula ${fmt(p.stampsRequired)} ${units(p, p.stampsRequired)} y recibe ${lowerFirst(p.rewardDescription)}.`;

/** Explicación de una línea del tipo de programa. */
export const programHow = (p: Program) => PROGRAM_TYPE_INFO[p.programType ?? 'stamps_purchase'].how;
