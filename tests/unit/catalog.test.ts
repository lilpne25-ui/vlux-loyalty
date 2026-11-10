// V0.4.5 · Catálogo de giros y formulario del programa: las plantillas deben ser válidas para el servidor
// y el formulario del cliente debe validar igual que rulesSchema (sin divergencias entre UI y API).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VERTICALS, VERTICAL_IDS, PROGRAM_TYPES, PROGRAM_TYPE_INFO, unitLabel } from '../../shared/catalog';
import { unitsForOperation } from '../../shared/rules';
import { rulesSchema } from '../../server/validation';
import { DEFAULT_PROGRAM, formFromTemplate, programError, rulesFromForm } from '../../src/lib/program-form';

test('catálogo: 16 giros con id único, plantillas y tipos recomendados válidos', () => {
  assert.equal(VERTICALS.length, 16);
  assert.equal(new Set(VERTICAL_IDS).size, 16);
  for (const v of VERTICALS) {
    assert.ok(v.label && v.icon && v.place && v.example, v.id);
    assert.ok(v.templates.length >= 1, `${v.id} sin plantillas`);
    for (const r of v.recommended) assert.ok(PROGRAM_TYPES.includes(r), `${v.id}: tipo ${r}`);
  }
  const regulated = VERTICALS.filter((v) => v.regulated).map((v) => v.id).sort();
  assert.deepEqual(regulated, ['consultorio', 'dentista', 'optica', 'veterinaria']);
});

test('cada plantilla de cada giro pasa la validación del cliente y la del servidor', () => {
  for (const v of VERTICALS) for (const t of v.templates) {
    const f = formFromTemplate(t);
    assert.equal(programError(f), null, `${t.id}: ${programError(f)}`);
    const parsed = rulesSchema.safeParse(rulesFromForm(f));
    assert.ok(parsed.success, `${t.id}: ${parsed.success ? '' : parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
});

test('el formulario rechaza lo mismo que el servidor (casos límite)', () => {
  const cases = [
    { ...DEFAULT_PROGRAM, stampsRequired: 2 },
    { ...DEFAULT_PROGRAM, stampsRequired: 21 },
    { ...DEFAULT_PROGRAM, programType: 'points' as const, stampsRequired: 5, pesosPerPoint: 10, maxStampsPerPurchase: 100 },
    { ...DEFAULT_PROGRAM, programType: 'points' as const, stampsRequired: 500, pesosPerPoint: 0.5, maxStampsPerPurchase: 100 },
    { ...DEFAULT_PROGRAM, rewardDescription: 'no' },
  ];
  for (const c of cases) {
    assert.notEqual(programError(c), null, JSON.stringify(c));
    assert.equal(rulesSchema.safeParse(rulesFromForm(c)).success, false, JSON.stringify(c));
  }
  // Servicio sin servicios participantes: el formulario lo exige (el servidor lo aceptaría vacío, pero la caja no podría operar).
  assert.notEqual(programError({ ...DEFAULT_PROGRAM, programType: 'stamps_service', eligibleServices: [] }), null);
  // Unidad a medias: el formulario avisa; si se envía así, se normaliza a la unidad por defecto.
  assert.notEqual(programError({ ...DEFAULT_PROGRAM, unitSingular: 'corte', unitPlural: '' }), null);
  assert.equal(rulesFromForm({ ...DEFAULT_PROGRAM, unitSingular: 'corte', unitPlural: '' }).unitSingular, null);
});

test('unidades: por defecto según el tipo y personalizables', () => {
  for (const t of PROGRAM_TYPES) assert.equal(unitLabel({ programType: t }, 2), PROGRAM_TYPE_INFO[t].unit[1]);
  assert.equal(unitLabel({ programType: 'stamps_visit', unitSingular: 'asistencia', unitPlural: 'asistencias' }, 1), 'asistencia');
});

test('motor común: puntos por monto con tope y servicio elegible', () => {
  const pts = { stampsRequired: 500, stampMode: 'per_purchase' as const, maxStampsPerPurchase: 50, visitWindowMinutes: 120, programType: 'points' as const, amountPerPointCents: 1000 };
  assert.equal(unitsForOperation(pts, { itemCount: 1, amountCents: 25_990, isNewVisit: true }).units, 25);
  assert.equal(unitsForOperation(pts, { itemCount: 1, amountCents: 999_900, isNewVisit: true }).units, 50);
  const svc = { stampsRequired: 5, stampMode: 'per_purchase' as const, maxStampsPerPurchase: 2, visitWindowMinutes: 120, programType: 'stamps_service' as const, eligibleServices: ['Corte'] };
  assert.equal(unitsForOperation(svc, { itemCount: 1, service: 'Tinte', isNewVisit: true }).units, 0);
});
