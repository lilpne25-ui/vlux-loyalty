// V0.4.5 · Catálogo extensible de giros y tipos de programa. Los giros son SUGERENCIAS de configuración:
// no limitan lo que un negocio puede configurar. Agregar un giro = agregar una entrada aquí (y su id en la
// restricción de la BD). Sin datos de salud: en giros de salud el programa premia visitas o servicios elegibles
// definidos por el negocio, nunca diagnósticos, tratamientos ni decisiones clínicas.

export const PROGRAM_TYPES = ['stamps_purchase', 'stamps_visit', 'stamps_service', 'points', 'custom'] as const;
export type ProgramType = (typeof PROGRAM_TYPES)[number];

export const PROGRAM_TYPE_INFO: Record<ProgramType, { label: string; short: string; unit: [string, string]; how: string; family: 'stamps' | 'points' }> = {
  stamps_purchase: { label: 'Sellos por compra', short: 'Compras', unit: ['sello', 'sellos'], how: 'Cada compra registrada en caja suma un sello (o uno por artículo, con tope).', family: 'stamps' },
  stamps_visit: { label: 'Sellos por visita', short: 'Visitas', unit: ['visita', 'visitas'], how: 'Suma una visita por ocasión. Varias compras dentro de la ventana de visita cuentan como una sola.', family: 'stamps' },
  stamps_service: { label: 'Sellos por servicio', short: 'Servicios', unit: ['servicio', 'servicios'], how: 'Cada servicio participante registrado en caja suma uno (con tope por operación).', family: 'stamps' },
  points: { label: 'Puntos por consumo', short: 'Puntos', unit: ['punto', 'puntos'], how: 'La caja escribe el monto de la cuenta y se suman puntos según la equivalencia. No requiere integración con el punto de venta.', family: 'points' },
  custom: { label: 'Programa personalizado', short: 'Personalizado', unit: ['sello', 'sellos'], how: 'Sellos con tu propio nombre de unidad y condiciones, dentro de las reglas del motor.', family: 'stamps' },
};

/** Tipos que se diseñaron pero NO se activan en V0.4.5 (ver docs/V045_MOTOR_RECOMPENSAS.md). */
export const PLANNED_PROGRAM_TYPES = [{ id: 'frequency', label: 'Beneficios por frecuencia', note: 'Visitas válidas dentro de un periodo. Requiere saldos con vencimiento; queda para una versión posterior.' }] as const;

export type VerticalCategory = 'alimentos' | 'belleza' | 'salud' | 'automotriz' | 'bienestar' | 'mascotas' | 'comercio' | 'servicios';

export interface ProgramTemplate {
  id: string; name: string; programType: ProgramType; stampsRequired: number; rewardDescription: string; conditions: string;
  unitSingular?: string; unitPlural?: string; eligibleServices?: string[]; amountPerPointCents?: number; maxStampsPerPurchase?: number;
}

export interface VerticalInfo {
  id: string; label: string; category: VerticalCategory; icon: string; place: string; example: string;
  recommended: ProgramType[]; templates: ProgramTemplate[]; regulated?: boolean;
}

const T = (id: string, name: string, programType: ProgramType, stampsRequired: number, rewardDescription: string, conditions: string, extra: Partial<ProgramTemplate> = {}): ProgramTemplate =>
  ({ id, name, programType, stampsRequired, rewardDescription, conditions, ...extra });

export const HEALTH_NOTICE = 'Giro regulado: el programa premia la constancia del cliente con beneficios no clínicos definidos por el establecimiento. No registres diagnósticos, tratamientos ni datos de salud, y no condiciones decisiones sanitarias a una recompensa. Revisa con tu asesor las reglas profesionales y de publicidad aplicables antes de ofrecerlo al público.';

export const VERTICALS: VerticalInfo[] = [
  { id: 'cafeteria', label: 'Cafetería', category: 'alimentos', icon: 'Coffee', place: 'Tu café favorito', example: 'Ocho bebidas compradas → una bebida de cortesía.', recommended: ['stamps_purchase', 'points'],
    templates: [T('cafe-8', 'Bebida de cortesía', 'stamps_purchase', 8, 'Una bebida de cortesía', 'Aplica en bebidas de la carta. Un sello por compra.'),
      T('cafe-pts', 'Puntos por consumo', 'points', 500, '$50 de descuento en tu siguiente cuenta', '1 punto por cada $10 de consumo.', { amountPerPointCents: 1000, maxStampsPerPurchase: 200 })] },
  { id: 'restaurante', label: 'Restaurante', category: 'alimentos', icon: 'UtensilsCrossed', place: 'Tu restaurante favorito', example: 'Cinco visitas → postre de cortesía.', recommended: ['stamps_visit', 'points'],
    templates: [T('rest-visitas', 'Postre de cortesía', 'stamps_visit', 5, 'Un postre de cortesía', 'Una visita por mesa y día.'),
      T('rest-pts', 'Puntos por consumo', 'points', 1000, '$100 de descuento', '1 punto por cada $10 de consumo.', { amountPerPointCents: 1000, maxStampsPerPurchase: 500 })] },
  { id: 'barberia', label: 'Barbería', category: 'belleza', icon: 'Scissors', place: 'Tu barbería', example: 'Cinco servicios → beneficio en el siguiente corte.', recommended: ['stamps_service', 'stamps_visit'],
    templates: [T('barb-5', 'Beneficio en tu corte', 'stamps_service', 5, '50% de descuento en tu siguiente corte', 'Aplica en servicios participantes.', { eligibleServices: ['Corte', 'Barba', 'Corte y barba'], maxStampsPerPurchase: 2 })] },
  { id: 'salon', label: 'Salón de belleza', category: 'belleza', icon: 'Sparkles', place: 'Tu salón favorito', example: 'Seis servicios → tratamiento capilar de cortesía.', recommended: ['stamps_service', 'points'],
    templates: [T('salon-6', 'Servicio de cortesía', 'stamps_service', 6, 'Un peinado de cortesía', 'Aplica en servicios participantes.', { eligibleServices: ['Corte', 'Tinte', 'Peinado', 'Tratamiento'], maxStampsPerPurchase: 2 })] },
  { id: 'unas', label: 'Salón de uñas', category: 'belleza', icon: 'Hand', place: 'Tu salón de uñas', example: 'Seis servicios → diseño de cortesía.', recommended: ['stamps_service'],
    templates: [T('unas-6', 'Diseño de cortesía', 'stamps_service', 6, 'Un diseño de uñas de cortesía', 'Aplica en servicios participantes.', { eligibleServices: ['Manicure', 'Pedicure', 'Gelish', 'Acrílico'], maxStampsPerPurchase: 2 })] },
  { id: 'dentista', label: 'Dentista', category: 'salud', icon: 'Smile', place: 'Tu consultorio dental', example: 'Cinco visitas elegibles → beneficio definido por el consultorio.', recommended: ['stamps_visit'], regulated: true,
    templates: [T('dent-5', 'Beneficio por constancia', 'stamps_visit', 5, 'Beneficio definido por el consultorio', 'Visitas elegibles definidas por el consultorio. Beneficio no clínico.')] },
  { id: 'consultorio', label: 'Consultorio médico', category: 'salud', icon: 'Stethoscope', place: 'Tu consultorio', example: 'Visitas elegibles → beneficio no clínico definido por el consultorio.', recommended: ['stamps_visit'], regulated: true,
    templates: [T('med-5', 'Beneficio por constancia', 'stamps_visit', 5, 'Beneficio definido por el consultorio', 'Visitas elegibles definidas por el consultorio. Beneficio no clínico.')] },
  { id: 'taller', label: 'Taller mecánico', category: 'automotriz', icon: 'Wrench', place: 'Tu taller de confianza', example: 'Cinco servicios registrados → descuento en un servicio elegible.', recommended: ['stamps_service', 'points'],
    templates: [T('taller-5', 'Descuento en servicio', 'stamps_service', 5, '15% de descuento en un servicio elegible', 'Aplica en servicios participantes.', { eligibleServices: ['Afinación', 'Cambio de aceite', 'Frenos', 'Alineación y balanceo'], maxStampsPerPurchase: 1 })] },
  { id: 'autolavado', label: 'Autolavado', category: 'automotriz', icon: 'Car', place: 'Tu autolavado', example: 'Seis lavados → un lavado de cortesía.', recommended: ['stamps_service', 'stamps_purchase'],
    templates: [T('lavado-6', 'Lavado de cortesía', 'stamps_service', 6, 'Un lavado exterior de cortesía', 'Un sello por lavado.', { eligibleServices: ['Lavado exterior', 'Lavado completo', 'Encerado'], maxStampsPerPurchase: 1 })] },
  { id: 'gimnasio', label: 'Gimnasio', category: 'bienestar', icon: 'Dumbbell', place: 'Tu gimnasio', example: 'Visitas acumuladas → beneficio por permanencia.', recommended: ['stamps_visit'],
    templates: [T('gym-20', 'Beneficio por permanencia', 'stamps_visit', 20, 'Una semana de cortesía', 'Una visita por día.', { unitSingular: 'asistencia', unitPlural: 'asistencias' })] },
  { id: 'veterinaria', label: 'Veterinaria', category: 'mascotas', icon: 'PawPrint', place: 'Tu veterinaria', example: 'Servicios participantes → beneficio definido por el establecimiento.', recommended: ['stamps_service', 'stamps_visit'], regulated: true,
    templates: [T('vet-5', 'Beneficio para tu mascota', 'stamps_service', 5, 'Un baño de cortesía', 'Aplica en servicios no clínicos participantes (estética, baño, tienda).', { eligibleServices: ['Baño', 'Estética', 'Compra en tienda'], maxStampsPerPurchase: 1 })] },
  { id: 'spa', label: 'Spa', category: 'bienestar', icon: 'Flower2', place: 'Tu spa', example: 'Cinco servicios → upgrade de cortesía.', recommended: ['stamps_service', 'points'],
    templates: [T('spa-5', 'Upgrade de cortesía', 'stamps_service', 5, 'Un upgrade de cortesía en tu siguiente servicio', 'Aplica en servicios participantes.', { eligibleServices: ['Masaje', 'Facial', 'Corporal'], maxStampsPerPurchase: 1 })] },
  { id: 'optica', label: 'Óptica', category: 'salud', icon: 'Glasses', place: 'Tu óptica', example: 'Compras acumuladas → descuento en accesorios.', recommended: ['points', 'stamps_purchase'], regulated: true,
    templates: [T('opt-pts', 'Descuento en accesorios', 'points', 300, '$300 de descuento en accesorios', '1 punto por cada $20 de compra. No aplica a servicios clínicos.', { amountPerPointCents: 2000, maxStampsPerPurchase: 300 })] },
  { id: 'boutique', label: 'Boutique', category: 'comercio', icon: 'Shirt', place: 'Tu boutique', example: 'Puntos por compra → descuento.', recommended: ['points', 'stamps_purchase'],
    templates: [T('bout-pts', 'Puntos por compra', 'points', 1000, '$200 de descuento en tu siguiente compra', '1 punto por cada $10.', { amountPerPointCents: 1000, maxStampsPerPurchase: 1000 })] },
  { id: 'accesorios', label: 'Tienda de accesorios', category: 'comercio', icon: 'Watch', place: 'Tu tienda', example: 'Cinco compras → un accesorio de cortesía.', recommended: ['stamps_purchase', 'points'],
    templates: [T('acc-5', 'Accesorio de cortesía', 'stamps_purchase', 5, 'Un accesorio de cortesía seleccionado', 'Un sello por compra.')] },
  { id: 'otro', label: 'Otros servicios', category: 'servicios', icon: 'Store', place: 'Tu lugar favorito', example: 'Define tu propio programa.', recommended: ['custom', 'stamps_purchase', 'stamps_visit', 'points'],
    templates: [T('otro-8', 'Programa de sellos', 'stamps_purchase', 8, 'Un beneficio de cortesía', 'Un sello por compra.'),
      T('otro-custom', 'Programa personalizado', 'custom', 10, 'Un beneficio definido por el negocio', 'Condiciones definidas por el negocio.', { unitSingular: 'punto VIP', unitPlural: 'puntos VIP' })] },
];

export const VERTICAL_IDS = VERTICALS.map((v) => v.id) as [string, ...string[]];
export const verticalInfo = (id: string) => VERTICALS.find((v) => v.id === id) ?? VERTICALS[VERTICALS.length - 1];

/** Nombre de la unidad del programa (personalizable). */
export function unitLabel(p: { programType?: ProgramType; unitSingular?: string | null; unitPlural?: string | null }, n: number) {
  const base = PROGRAM_TYPE_INFO[p.programType ?? 'stamps_purchase'].unit;
  const one = p.unitSingular || base[0];
  const many = p.unitPlural || base[1];
  return n === 1 ? one : many;
}
