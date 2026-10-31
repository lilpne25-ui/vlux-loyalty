// Textos que dependen del giro del negocio, para que el producto no suene solo a cafetería.
import type { Vertical, Program } from './api';
import { lowerFirst } from './format';

const PLACE: Record<Vertical, string> = {
  cafeteria: 'Tu café favorito',
  barberia: 'Tu barbería',
  salon: 'Tu salón favorito',
  restaurante: 'Tu restaurante favorito',
  otro: 'Tu lugar favorito',
};

export const VERTICAL_LABEL: Record<Vertical, string> = {
  cafeteria: 'Cafetería',
  barberia: 'Barbería',
  salon: 'Salón de belleza',
  restaurante: 'Restaurante',
  otro: 'Otro giro',
};

export const welcomeHeadline = (v: Vertical) => `${PLACE[v] ?? PLACE.otro} ahora tiene recompensas.`;

export function stampRule(p: Program): { title: string; sub: string } {
  if (p.stampMode === 'per_item') return { title: '1 artículo', sub: `= 1 sello (hasta ${p.maxStampsPerPurchase})` };
  return { title: '1 compra', sub: '= 1 sello' };
}

export const rewardSentence = (p: Program) => `Acumula ${p.stampsRequired} sellos y recibe ${lowerFirst(p.rewardDescription)}.`;
