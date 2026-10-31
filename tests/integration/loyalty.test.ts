// Átomo 05 (y verificación de Átomo 02 con datos persistidos): sellos, visitas, canjes,
// idempotencia y concurrencia.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { closePool } from '../../server/db';
import { identify, key, loggedIn, newBusiness, registerCustomer, withEmployee } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await admin.end(); });

async function setup(opts: Parameters<typeof newBusiness>[0] = {}) {
  const b = await newBusiness(opts);
  const owner = await loggedIn('dueño', b.ownerEmail);
  const emp = await loggedIn('empleado', (await withEmployee(owner)).email);
  const cust = await registerCustomer(b.slug);
  const cardId = await identify(emp, cust.publicCode);
  return { b, owner, emp, cust, cardId };
}

const buy = (emp: any, cardId: string, itemCount = 1, k = key(), confirmDuplicate = true) =>
  emp.post(`/api/staff/cards/${cardId}/purchases`, { itemCount, idempotencyKey: k, confirmDuplicate });

async function ledgerMatches(cardId: string) {
  const r = (await admin.query('SELECT c.stamp_balance, coalesce(sum(e.delta),0)::int AS ledger FROM cards c LEFT JOIN stamp_events e ON e.card_id = c.id WHERE c.id = $1 GROUP BY c.stamp_balance', [cardId])).rows[0];
  return r.stamp_balance === r.ledger;
}

test('2 cafés en una compra (modo por artículo) = 2 sellos, 1 compra, 1 visita', async () => {
  const { emp, owner, cardId } = await setup({ stampMode: 'per_item', maxStampsPerPurchase: 3 });
  const r = await buy(emp, cardId, 2);
  assert.equal(r.status, 200);
  assert.equal(r.json.stampsAwarded, 2);
  assert.equal(r.json.newVisit, true);
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.deepEqual({ purchases: k.purchases, visits: k.visits, stamps: k.stamps, recurring: k.recurring }, { purchases: 1, visits: 1, stamps: 2, recurring: 0 });
});

test('segunda compra en la misma visita: suma sellos pero no visitas', async () => {
  const { emp, owner, cardId } = await setup();
  await buy(emp, cardId);
  const second = await buy(emp, cardId);
  assert.equal(second.json.newVisit, false);
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.deepEqual({ purchases: k.purchases, visits: k.visits, stamps: k.stamps }, { purchases: 2, visits: 1, stamps: 2 });
});

test('una visita en otro día cuenta como regreso (recurrencia)', async () => {
  const { emp, owner, cardId } = await setup();
  await buy(emp, cardId);
  await admin.query("UPDATE visits SET started_at = started_at - interval '1 day' WHERE card_id = $1", [cardId]);
  await admin.query("UPDATE purchases SET created_at = created_at - interval '1 day' WHERE card_id = $1", [cardId]);
  const r = await buy(emp, cardId, 1, key(), false);
  assert.equal(r.json.newVisit, true);
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.equal(k.visits, 2);
  assert.equal(k.recurring, 1);
});

test('idempotencia: la misma llave enviada 2 veces registra 1 sola compra', async () => {
  const { emp, cardId } = await setup();
  const k = key();
  const a = await buy(emp, cardId, 1, k);
  const b = await buy(emp, cardId, 1, k);
  assert.equal(a.json.replayed, false);
  assert.equal(b.json.replayed, true);
  assert.equal(b.json.purchaseId, a.json.purchaseId);
  assert.equal(b.json.card.balance, 1);
});

test('idempotencia con 10 solicitudes simultáneas idénticas: 1 compra', async () => {
  const { emp, cardId } = await setup();
  const k = key();
  const rs = await Promise.all(Array.from({ length: 10 }, () => buy(emp, cardId, 1, k)));
  assert.ok(rs.every((r) => r.status === 200), JSON.stringify(rs.map((r) => r.status)));
  assert.equal(new Set(rs.map((r) => r.json.purchaseId)).size, 1);
  const n = (await admin.query('SELECT count(*)::int AS n FROM purchases WHERE card_id = $1', [cardId])).rows[0].n;
  assert.equal(n, 1);
  assert.ok(await ledgerMatches(cardId));
});

test('doble toque con llaves distintas: el segundo pide confirmación (no suma)', async () => {
  const { emp, cardId } = await setup();
  const a = await buy(emp, cardId, 1, key(), false);
  const b = await buy(emp, cardId, 1, key(), false);
  assert.equal(a.status, 200);
  assert.equal(b.status, 409);
  assert.equal(b.json.error.code, 'possible_duplicate');
  const confirmed = await buy(emp, cardId, 1, key(), true);
  assert.equal(confirmed.json.card.balance, 2);
});

test('el cliente no puede agregarse sellos ni canjear', async () => {
  const { cust, cardId, b } = await setup();
  assert.equal((await cust.phone.post(`/api/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: key() })).status, 401);
  const view = await cust.phone.get(`/api/me/${b.slug}/card`);
  assert.equal(view.json.card.balance, 0);
});

test('8 compras desbloquean la recompensa; el cliente la ve; se canjea una vez', async () => {
  const { emp, cust, cardId, b, owner } = await setup();
  let last: any;
  for (let i = 0; i < 8; i++) last = await buy(emp, cardId);
  assert.ok(last.json.rewardUnlocked, 'recompensa desbloqueada en la 8a compra');
  const view = (await cust.phone.get(`/api/me/${b.slug}/card`)).json;
  assert.equal(view.card.balance, 8);
  assert.equal(view.card.reward.code, last.json.rewardUnlocked.code);
  const rewardId = last.json.card.reward.id;
  const r1 = await emp.post(`/api/staff/rewards/${rewardId}/redeem`);
  assert.equal(r1.status, 200);
  assert.equal(r1.json.card.balance, 0);
  assert.equal(r1.json.card.cycle, 2);
  const r2 = await emp.post(`/api/staff/rewards/${rewardId}/redeem`);
  assert.equal(r2.status, 409);
  assert.equal(r2.json.error.code, 'already_redeemed');
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.deepEqual({ unlocked: k.rewardsUnlocked, redemptions: k.redemptions, pending: k.rewardsPending }, { unlocked: 1, redemptions: 1, pending: 0 });
  assert.ok(await ledgerMatches(cardId));
});

test('canje concurrente: 10 intentos simultáneos consumen la recompensa 1 sola vez', async () => {
  const { emp, owner, cardId } = await setup({ stampsRequired: 3 });
  let last: any;
  for (let i = 0; i < 3; i++) last = await buy(emp, cardId);
  const rewardId = last.json.card.reward.id;
  const devices = [emp, owner];
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => devices[i % 2].post(`/api/staff/rewards/${rewardId}/redeem`)));
  const ok = rs.filter((r) => r.status === 200).length;
  const dup = rs.filter((r) => r.status === 409 && r.json.error.code === 'already_redeemed').length;
  assert.equal(ok, 1, JSON.stringify(rs.map((r) => r.status)));
  assert.equal(dup, 9);
  const card = (await admin.query('SELECT stamp_balance, cycle FROM cards WHERE id = $1', [cardId])).rows[0];
  assert.deepEqual(card, { stamp_balance: 0, cycle: 2 });
  assert.ok(await ledgerMatches(cardId));
});

test('compras y canje concurrentes en la misma tarjeta mantienen el saldo íntegro', async () => {
  const { emp, owner, cardId } = await setup({ stampsRequired: 3 });
  let last: any;
  for (let i = 0; i < 3; i++) last = await buy(emp, cardId);
  const rewardId = last.json.card.reward.id;
  await Promise.all([
    ...Array.from({ length: 6 }, () => buy(emp, cardId)),
    owner.post(`/api/staff/rewards/${rewardId}/redeem`),
  ]);
  const card = (await admin.query('SELECT stamp_balance FROM cards WHERE id = $1', [cardId])).rows[0];
  assert.equal(card.stamp_balance, 3 + 6 - 3);
  assert.ok(await ledgerMatches(cardId));
  const avail = (await admin.query("SELECT count(*)::int AS n FROM rewards WHERE card_id = $1 AND status = 'available'", [cardId])).rows[0].n;
  assert.equal(avail, 1, 'el excedente (6) vuelve a desbloquear exactamente 1 recompensa');
});

test('el excedente pasa al siguiente ciclo', async () => {
  const { emp, cardId } = await setup({ stampsRequired: 3, stampMode: 'per_item', maxStampsPerPurchase: 5 });
  const r = await buy(emp, cardId, 5);
  assert.equal(r.json.card.balance, 5);
  const red = await emp.post(`/api/staff/rewards/${r.json.card.reward.id}/redeem`);
  assert.equal(red.json.card.balance, 2);
  assert.equal(red.json.card.reward, null);
});

test('QR de recompensa identifica la tarjeta; códigos inválidos se rechazan sin revelar datos', async () => {
  const { emp, cardId } = await setup({ stampsRequired: 3 });
  let last: any;
  for (let i = 0; i < 3; i++) last = await buy(emp, cardId);
  assert.equal(await identify(emp, last.json.card.reward.code), cardId);
  assert.equal((await emp.post('/api/staff/cards/lookup', { code: 'hola' })).status, 422);
  assert.equal((await emp.post('/api/staff/cards/lookup', { code: 'ZZZZ-ZZZZ' })).status, 404);
  assert.equal((await emp.post('/api/staff/cards/lookup', { code: 'https://otro.example/?tarjeta=' })).status, 422);
});

test('bajar la meta desbloquea premios en tarjetas que ya la alcanzan; los ganados conservan su costo', async () => {
  const { emp, owner, cardId, b } = await setup();
  for (let i = 0; i < 5; i++) await buy(emp, cardId);
  const biz = (await owner.get('/api/staff/business')).json;
  const res = await owner.req('PUT', '/api/owner/program', {
    name: biz.name, vertical: biz.vertical, primaryColor: biz.primaryColor, accentColor: biz.accentColor, reviewUrl: biz.reviewUrl,
    rules: { ...biz.program, stampsRequired: 5 },
  });
  assert.equal(res.status, 200);
  assert.equal(res.json.rewardsUnlocked, 1);
  const view = (await (await registerCustomer(b.slug)).phone.get(`/api/me/${b.slug}/card`)).json;
  assert.equal(view.program.stampsRequired, 5);
  const reward = (await admin.query("SELECT stamps_cost FROM rewards WHERE card_id = $1 AND status = 'available'", [cardId])).rows[0];
  assert.equal(reward.stamps_cost, 5);
});

test('invitación a reseña: desde la 2a visita, una vez, sin premio', async () => {
  const { emp, cust, cardId, b, owner } = await setup();
  await buy(emp, cardId);
  assert.equal((await cust.phone.get(`/api/me/${b.slug}/card`)).json.review.show, false);
  await admin.query("UPDATE visits SET started_at = started_at - interval '1 day' WHERE card_id = $1", [cardId]);
  await buy(emp, cardId);
  assert.equal((await cust.phone.get(`/api/me/${b.slug}/card`)).json.review.show, true);
  await cust.phone.post(`/api/me/${b.slug}/review-events`, { kind: 'prompt_shown' });
  await cust.phone.post(`/api/me/${b.slug}/review-events`, { kind: 'prompt_shown' });
  await cust.phone.post(`/api/me/${b.slug}/review-events`, { kind: 'link_opened' });
  const k = (await owner.get('/api/owner/dashboard')).json.kpis;
  assert.deepEqual({ p: k.reviewPrompts, c: k.reviewClicks, stamps: k.stamps }, { p: 1, c: 1, stamps: 2 });
});

test('derechos ARCO: exportar y anonimizar al cliente revoca su acceso', async () => {
  const { owner, cust, b } = await setup();
  const list = (await owner.get('/api/owner/customers')).json.customers;
  const id = list[0].customerId;
  const exp = await owner.get(`/api/owner/customers/${id}/export`);
  assert.equal(exp.json.customer.display_name, 'Cliente Sintético');
  await owner.post(`/api/owner/customers/${id}/anonymize`);
  assert.equal((await cust.phone.get(`/api/me/${b.slug}/card`)).json.card, null);
  const after = (await owner.get('/api/owner/customers')).json.customers[0];
  assert.equal(after.customerName, 'Cliente eliminado');
});
