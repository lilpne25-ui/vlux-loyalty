// V0.4.5 · Motor de recompensas común y giros (T18–T30).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { createBusiness } from '../../server/services/businesses';
import { VERTICALS } from '../../shared/catalog';
import { Device, PASSWORD, identify, key, loggedIn, registerCustomer } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await db.end(); });

async function biz(vertical: string, rules: Record<string, unknown>) {
  await resetRateLimits();
  const slug = 'r-' + randomUUID().slice(0, 8);
  const ownerEmail = `dueno-${slug}@ejemplo.test`;
  await createBusiness({ slug, name: 'Negocio ' + slug, vertical: vertical as any, reviewUrl: null,
    rules: { stampsRequired: 5, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Beneficio de cortesía', ...rules } as any,
    owner: { email: ownerEmail, displayName: 'Dueña Sintética', password: PASSWORD } });
  const owner = await loggedIn('dueña', ownerEmail);
  const c = await registerCustomer(slug);
  const cardId = await identify(owner, c.publicCode);
  return { slug, owner, cardId, customer: c };
}
const buy = (d: Device, cardId: string, body: Record<string, unknown> = {}) => d.post(`/api/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: key(), confirmDuplicate: true, ...body });

test('T18: sellos por compra (comportamiento V0.4.4 intacto) y desbloqueo al llegar a la meta', async () => {
  const b = await biz('cafeteria', { stampsRequired: 3 });
  for (let i = 0; i < 2; i++) assert.equal((await buy(b.owner, b.cardId)).json.stampsAwarded, 1);
  const r = await buy(b.owner, b.cardId);
  assert.ok(r.json.rewardUnlocked, 'premio desbloqueado');
  assert.equal(r.json.card.balance, 3);
});

test('T19: sellos por visita: varias compras en la misma visita cuentan una sola vez', async () => {
  const b = await biz('restaurante', { programType: 'stamps_visit', stampsRequired: 3 });
  assert.equal((await buy(b.owner, b.cardId)).json.stampsAwarded, 1);
  const second = await buy(b.owner, b.cardId);
  assert.equal(second.status, 200);
  assert.equal(second.json.stampsAwarded, 0, 'misma visita: no suma');
  assert.equal(second.json.card.balance, 1);
  // Nueva visita (fuera de la ventana).
  await db.query("UPDATE visits SET started_at = now() - interval '3 hours' WHERE card_id = $1", [b.cardId]);
  assert.equal((await buy(b.owner, b.cardId)).json.stampsAwarded, 1);
  // El libro mayor no tiene movimientos "+0".
  assert.equal((await db.query('SELECT count(*)::int n FROM stamp_events WHERE card_id = $1', [b.cardId])).rows[0].n, 2);
});

test('T20: sellos por servicio: solo servicios participantes y con tope por operación', async () => {
  const b = await biz('barberia', { programType: 'stamps_service', stampsRequired: 5, maxStampsPerPurchase: 2, eligibleServices: ['Corte', 'Barba'] });
  assert.equal((await buy(b.owner, b.cardId)).status, 422, 'falta el servicio');
  assert.equal((await buy(b.owner, b.cardId, { service: 'Tinte' })).json.error.code, 'service_not_eligible');
  const r = await buy(b.owner, b.cardId, { service: 'corte', itemCount: 4 });
  assert.equal(r.json.stampsAwarded, 2, 'tope 2 por operación');
  assert.equal((await db.query('SELECT service_label FROM purchases WHERE id = $1', [r.json.purchaseId])).rows[0].service_label, 'corte');
});

test('puntos por consumo: monto → puntos, con tope; sin monto se rechaza', async () => {
  const b = await biz('boutique', { programType: 'points', stampsRequired: 100, maxStampsPerPurchase: 60, amountPerPointCents: 1000 });
  assert.equal((await buy(b.owner, b.cardId)).json.error.code, 'amount_required');
  assert.equal((await buy(b.owner, b.cardId, { amountCents: 25_990 })).json.stampsAwarded, 25, '$259.90 → 25 puntos');
  assert.equal((await buy(b.owner, b.cardId, { amountCents: 1_000_000 })).json.stampsAwarded, 60, 'tope por compra');
  const view = await b.customer.phone.get(`/api/me/${b.slug}/card`);
  assert.equal(view.json.program.programType, 'points');
  assert.equal(view.json.card.balance, 85);
  // Validación por tipo: puntos sin equivalencia.
  await assert.rejects(createBusiness({ slug: 'x-' + randomUUID().slice(0, 6), name: 'Mal', vertical: 'boutique', reviewUrl: null,
    rules: { programType: 'points', stampsRequired: 100, stampMode: 'per_purchase', maxStampsPerPurchase: 10, visitWindowMinutes: 120, rewardDescription: 'X de regalo' } as any,
    owner: { email: `m-${randomUUID().slice(0, 6)}@ejemplo.test`, displayName: 'Mal', password: PASSWORD } }), /equivale a 1 punto/);
});

test('T21–T22: nueva versión del programa sin invalidar premios ganados; historial conservado', async () => {
  const b = await biz('cafeteria', { stampsRequired: 3, rewardDescription: 'Café americano' });
  for (let i = 0; i < 3; i++) await buy(b.owner, b.cardId);
  const before = (await b.owner.get(`/api/staff/cards/${b.cardId}`)).json;
  assert.equal(before.card.reward.description, 'Café americano');
  const biz1 = (await b.owner.get('/api/staff/business')).json;
  const up = await b.owner.req('PUT', '/api/owner/program', { name: biz1.name, vertical: 'cafeteria', primaryColor: biz1.primaryColor, accentColor: biz1.accentColor, reviewUrl: null,
    rules: { programType: 'stamps_purchase', stampsRequired: 10, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Bebida grande', conditions: 'Solo bebidas calientes' } });
  assert.equal(up.status, 200, JSON.stringify(up.json));
  assert.equal(up.json.ruleChanged, true);
  const after1 = (await b.owner.get(`/api/staff/cards/${b.cardId}`)).json;
  assert.equal(after1.card.reward.description, 'Café americano', 'el premio ganado conserva su descripción');
  assert.equal(after1.card.reward.stampsCost, 3, 'y su costo original');
  assert.equal(after1.program.stampsRequired, 10);
  assert.equal(after1.program.version, 2);
  assert.equal((await db.query('SELECT count(*)::int n FROM reward_rules WHERE business_id = (SELECT business_id FROM cards WHERE id = $1)', [b.cardId])).rows[0].n, 2);
  // Se canjea con el costo original.
  const red = await b.owner.post(`/api/staff/rewards/${after1.card.reward.id}/redeem`, {});
  assert.equal(red.status, 200, JSON.stringify(red.json));
  assert.equal(red.json.card.balance, 0);
});

test('T23–T24: sin doble acumulación (idempotencia y guardia de duplicado) ni doble canje (en paralelo)', async () => {
  const b = await biz('cafeteria', { stampsRequired: 3 });
  const k = key();
  const [a, c] = await Promise.all([b.owner.post(`/api/staff/cards/${b.cardId}/purchases`, { itemCount: 1, idempotencyKey: k }), b.owner.post(`/api/staff/cards/${b.cardId}/purchases`, { itemCount: 1, idempotencyKey: k })]);
  assert.equal(a.json.purchaseId, c.json.purchaseId, 'misma llave = misma compra');
  assert.equal((await b.owner.post(`/api/staff/cards/${b.cardId}/purchases`, { itemCount: 1, idempotencyKey: key() })).json.error.code, 'possible_duplicate');
  await buy(b.owner, b.cardId); await buy(b.owner, b.cardId);
  const reward = (await b.owner.get(`/api/staff/cards/${b.cardId}`)).json.card.reward;
  const results = await Promise.all([0, 1, 2].map(() => b.owner.post(`/api/staff/rewards/${reward.id}/redeem`, {})));
  assert.equal(results.filter((r) => r.status === 200).length, 1, 'un solo canje');
  assert.equal(results.filter((r) => r.json?.error?.code === 'already_redeemed').length, 2);
});

test('límite diario y vigencia del programa', async () => {
  const b = await biz('gimnasio', { programType: 'stamps_visit', stampsRequired: 10, maxAwardsPerDay: 1 });
  assert.equal((await buy(b.owner, b.cardId)).json.stampsAwarded, 1);
  await db.query("UPDATE visits SET started_at = now() - interval '3 hours' WHERE card_id = $1", [b.cardId]);
  const r = await buy(b.owner, b.cardId);
  assert.equal(r.json.stampsAwarded, 0);
  assert.equal(r.json.limitReached, true);
  await db.query("UPDATE reward_rules SET valid_until = current_date - 2 WHERE business_id = (SELECT business_id FROM cards WHERE id = $1)", [b.cardId]);
  assert.equal((await buy(b.owner, b.cardId)).json.error.code, 'program_ended');
});

test('cambiar entre sellos y puntos con tarjetas en progreso se bloquea; sin progreso se permite', async () => {
  const b = await biz('accesorios', { stampsRequired: 5 });
  await buy(b.owner, b.cardId);
  const biz1 = (await b.owner.get('/api/staff/business')).json;
  const body = { name: biz1.name, vertical: 'accesorios', primaryColor: biz1.primaryColor, accentColor: biz1.accentColor, reviewUrl: null,
    rules: { programType: 'points', stampsRequired: 200, stampMode: 'per_purchase', maxStampsPerPurchase: 100, visitWindowMinutes: 120, rewardDescription: '$50 de descuento', amountPerPointCents: 1000 } };
  const r = await b.owner.req('PUT', '/api/owner/program', body);
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'program_family_change');
  // Entre tipos de sellos sí (el saldo conserva su significado).
  const r2 = await b.owner.req('PUT', '/api/owner/program', { ...body, rules: { ...body.rules, programType: 'stamps_visit', stampsRequired: 5, maxStampsPerPurchase: 1, amountPerPointCents: null } });
  assert.equal(r2.status, 200, JSON.stringify(r2.json));
});

test('T25–T30: alta de negocios de los 16 giros del catálogo con su plantilla sugerida', async () => {
  assert.equal(VERTICALS.length, 16);
  for (const v of VERTICALS) {
    const t = v.templates[0];
    const b = await biz(v.id, { programType: t.programType, stampsRequired: t.stampsRequired, rewardDescription: t.rewardDescription, conditions: t.conditions,
      maxStampsPerPurchase: t.maxStampsPerPurchase ?? 1, eligibleServices: t.eligibleServices ?? [], amountPerPointCents: t.amountPerPointCents ?? null,
      unitSingular: t.unitSingular ?? null, unitPlural: t.unitPlural ?? null });
    const body = t.programType === 'points' ? { amountCents: 50_000 } : t.programType === 'stamps_service' && t.eligibleServices?.length ? { service: t.eligibleServices[0] } : {};
    const r = await buy(b.owner, b.cardId, body);
    assert.equal(r.status, 200, `${v.id}: ${JSON.stringify(r.json)}`);
    assert.ok(r.json.stampsAwarded > 0, v.id);
    const pub = await new Device('x').get(`/api/public/businesses/${b.slug}`);
    assert.equal(pub.json.business.vertical, v.id);
    assert.equal(pub.json.program.programType, t.programType);
  }
  // Giros de salud: marcados como regulados y sin campos de salud en el modelo.
  for (const id of ['dentista', 'consultorio']) assert.equal(VERTICALS.find((x) => x.id === id)!.regulated, true);
  const cols = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name IN ('customers','purchases','cards')")).rows.map((r) => r.column_name).join(' ');
  assert.ok(!/diagn|tratamiento|clinic|health|salud/i.test(cols), 'el modelo no tiene campos de salud');
});
