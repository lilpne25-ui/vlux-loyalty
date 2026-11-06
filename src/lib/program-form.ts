// V0.4.5 · Estado de formulario del motor de recompensas común. Lo usan el alta (Control Center) y el panel del dueño,
// para que ambos validen igual que el servidor (server/validation.ts → rulesSchema).
import { LIMITS } from '../../shared/rules';
import { PROGRAM_TYPE_INFO, type ProgramTemplate, type ProgramType } from '../../shared/catalog';
import type { Program } from './api';

export type ProgramForm = {
  programType: ProgramType; programName: string; stampsRequired: number; stampMode: 'per_purchase' | 'per_item';
  maxStampsPerPurchase: number; visitWindowMinutes: number; rewardDescription: string; conditions: string;
  unitSingular: string; unitPlural: string; eligibleServices: string[]; pesosPerPoint: number;
  maxAwardsPerDay: number | null; validUntil: string;
};

export const DEFAULT_PROGRAM: ProgramForm = {
  programType: 'stamps_purchase', programName: '', stampsRequired: 8, stampMode: 'per_purchase', maxStampsPerPurchase: 3, visitWindowMinutes: 120,
  rewardDescription: 'Un beneficio de cortesía', conditions: '', unitSingular: '', unitPlural: '', eligibleServices: [], pesosPerPoint: 10,
  maxAwardsPerDay: null, validUntil: '',
};

export function formFromTemplate(t: ProgramTemplate, base: ProgramForm = DEFAULT_PROGRAM): ProgramForm {
  return {
    ...base, programType: t.programType, programName: t.name, stampsRequired: t.stampsRequired, rewardDescription: t.rewardDescription, conditions: t.conditions,
    unitSingular: t.unitSingular ?? '', unitPlural: t.unitPlural ?? '', eligibleServices: t.eligibleServices ?? [],
    pesosPerPoint: t.amountPerPointCents ? t.amountPerPointCents / 100 : base.pesosPerPoint,
    maxStampsPerPurchase: t.maxStampsPerPurchase ?? (t.programType === 'points' ? 500 : base.maxStampsPerPurchase),
    stampMode: t.programType === 'stamps_purchase' || t.programType === 'custom' ? base.stampMode : 'per_purchase',
  };
}

export function formFromProgram(p: Program): ProgramForm {
  return {
    programType: p.programType ?? 'stamps_purchase', programName: p.programName ?? '', stampsRequired: p.stampsRequired, stampMode: p.stampMode,
    maxStampsPerPurchase: p.maxStampsPerPurchase, visitWindowMinutes: p.visitWindowMinutes ?? 120, rewardDescription: p.rewardDescription,
    conditions: p.conditions ?? '', unitSingular: p.unitSingular ?? '', unitPlural: p.unitPlural ?? '', eligibleServices: p.eligibleServices ?? [],
    pesosPerPoint: p.amountPerPointCents ? p.amountPerPointCents / 100 : 10, maxAwardsPerDay: p.maxAwardsPerDay ?? null, validUntil: p.validUntil ?? '',
  };
}

/** Cuerpo `rules` que espera el servidor. */
export function rulesFromForm(f: ProgramForm) {
  const t = f.programType;
  const unitOk = f.unitSingular.trim() && f.unitPlural.trim();
  return {
    programType: t, programName: f.programName.trim(), stampsRequired: Number(f.stampsRequired),
    stampMode: t === 'stamps_purchase' || t === 'custom' ? f.stampMode : 'per_purchase',
    maxStampsPerPurchase: (t === 'stamps_purchase' || t === 'custom') && f.stampMode === 'per_purchase' ? 1 : t === 'stamps_visit' ? 1 : Number(f.maxStampsPerPurchase),
    visitWindowMinutes: Number(f.visitWindowMinutes), rewardDescription: f.rewardDescription.trim(), conditions: f.conditions.trim(),
    unitSingular: unitOk ? f.unitSingular.trim() : null, unitPlural: unitOk ? f.unitPlural.trim() : null,
    eligibleServices: t === 'stamps_service' ? f.eligibleServices.map((s) => s.trim()).filter(Boolean) : [],
    amountPerPointCents: t === 'points' ? Math.round(Number(f.pesosPerPoint) * 100) : null,
    maxAwardsPerDay: f.maxAwardsPerDay ? Number(f.maxAwardsPerDay) : null,
    validUntil: f.validUntil || null,
  };
}

/** Primer error en lenguaje claro, o null. Mismos rangos que el servidor. */
export function programError(f: ProgramForm): string | null {
  const r = rulesFromForm(f);
  const between = (v: number, l: { min: number; max: number }) => Number.isInteger(v) && v >= l.min && v <= l.max;
  const unit = PROGRAM_TYPE_INFO[f.programType].unit[1];
  if (f.programType === 'points') {
    if (!between(r.stampsRequired, LIMITS.pointsRequired)) return `La meta debe estar entre ${LIMITS.pointsRequired.min} y ${LIMITS.pointsRequired.max} puntos.`;
    if (!r.amountPerPointCents || !between(r.amountPerPointCents, LIMITS.amountPerPointCents)) return `La equivalencia debe estar entre $${LIMITS.amountPerPointCents.min / 100} y $${LIMITS.amountPerPointCents.max / 100} por punto.`;
    if (!between(r.maxStampsPerPurchase, LIMITS.maxPointsPerPurchase)) return `El tope por operación debe estar entre ${LIMITS.maxPointsPerPurchase.min} y ${LIMITS.maxPointsPerPurchase.max} puntos.`;
  } else {
    if (!between(r.stampsRequired, LIMITS.stampsRequired)) return `La meta debe estar entre ${LIMITS.stampsRequired.min} y ${LIMITS.stampsRequired.max} ${unit}.`;
    if (!between(r.maxStampsPerPurchase, LIMITS.maxStampsPerPurchase)) return `El tope por operación debe estar entre 1 y ${LIMITS.maxStampsPerPurchase.max}.`;
  }
  if (!between(r.visitWindowMinutes, LIMITS.visitWindowMinutes)) return `La ventana de visita debe estar entre ${LIMITS.visitWindowMinutes.min} y ${LIMITS.visitWindowMinutes.max} minutos.`;
  if (r.rewardDescription.length < 3 || r.rewardDescription.length > 80) return 'Describe la recompensa en 3 a 80 caracteres.';
  if (r.conditions.length > 300) return 'Las condiciones admiten hasta 300 caracteres.';
  if (f.programType === 'stamps_service' && r.eligibleServices.length === 0) return 'Agrega al menos un servicio participante.';
  if (r.eligibleServices.length > 20 || r.eligibleServices.some((s) => s.length > 40)) return 'Hasta 20 servicios de máximo 40 caracteres.';
  if (!!f.unitSingular.trim() !== !!f.unitPlural.trim()) return 'Escribe la unidad en singular y en plural.';
  if (r.maxAwardsPerDay != null && !between(r.maxAwardsPerDay, { min: 1, max: 20 })) return 'El límite diario debe estar entre 1 y 20 operaciones.';
  return null;
}

/** Programa "público" para vistas previas (tarjeta y textos) antes de guardar. */
export function previewProgram(f: ProgramForm): Program {
  const r = rulesFromForm(f);
  return { ...r, version: 0 } as unknown as Program;
}
