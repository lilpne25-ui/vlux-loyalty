import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_RULES, ProgramRules, stampsForPurchase, isSameVisit, shouldUnlockReward, balanceAfterRedemption, validateRules, simulate } from '../../shared/rules';

const cafePerItem: ProgramRules = { stampsRequired: 8, stampMode: 'per_item', maxStampsPerPurchase: 3, visitWindowMinutes: 120 };
const t0 = new Date('2026-11-02T09:00:00-06:00');
const min = (m: number) => new Date(t0.getTime() + m * 60_000);

test('compra con 2 cafés en modo por artículo da 2 sellos y 1 sola visita', () => {
  const r = simulate(cafePerItem, [{ kind: 'purchase', at: t0, items: 2 }]);
  assert.deepEqual({ purchases: r.purchases, visits: r.visits, stamps: r.stampsEarned }, { purchases: 1, visits: 1, stamps: 2 });
});

test('dos compras separadas dentro de la ventana cuentan como una visita', () => {
  const r = simulate(cafePerItem, [
    { kind: 'purchase', at: t0, items: 1 },
    { kind: 'purchase', at: min(25), items: 1 },
  ]);
  assert.equal(r.purchases, 2);
  assert.equal(r.visits, 1);
  assert.equal(r.stampsEarned, 2);
});

test('una compra fuera de la ventana es una visita nueva (recurrencia)', () => {
  const r = simulate(DEFAULT_RULES, [
    { kind: 'purchase', at: t0, items: 1 },
    { kind: 'purchase', at: min(24 * 60), items: 1 },
  ]);
  assert.equal(r.visits, 2);
});

test('modo por compra: 3 artículos siguen siendo 1 sello', () => {
  assert.equal(stampsForPurchase(DEFAULT_RULES, 3), 1);
});

test('modo por artículo respeta el tope por compra', () => {
  assert.equal(stampsForPurchase(cafePerItem, 10), 3);
});

test('cantidad de artículos inválida se rechaza', () => {
  assert.throws(() => stampsForPurchase(DEFAULT_RULES, 0), RangeError);
  assert.throws(() => stampsForPurchase(DEFAULT_RULES, 1.5), RangeError);
  assert.throws(() => stampsForPurchase(DEFAULT_RULES, 51), RangeError);
});

test('ventana de visita: límites', () => {
  assert.equal(isSameVisit(null, t0, 120), false);
  assert.equal(isSameVisit(t0, min(119), 120), true);
  assert.equal(isSameVisit(t0, min(120), 120), false);
  assert.equal(isSameVisit(t0, min(-1), 120), false);
});

test('desbloqueo solo al llegar a la meta y sin premio pendiente', () => {
  assert.equal(shouldUnlockReward(7, 8, false), false);
  assert.equal(shouldUnlockReward(8, 8, false), true);
  assert.equal(shouldUnlockReward(9, 8, true), false);
});

test('canje descuenta la meta y conserva el excedente', () => {
  assert.equal(balanceAfterRedemption(10, 8), 2);
  assert.throws(() => balanceAfterRedemption(7, 8), RangeError);
});

test('ciclo completo: 8 visitas, desbloqueo, canje y excedente', () => {
  const ev: Parameters<typeof simulate>[1] = [];
  for (let d = 0; d < 8; d++) ev.push({ kind: 'purchase', at: min(d * 24 * 60), items: 1 });
  ev.push({ kind: 'redeem', at: min(8 * 24 * 60) });
  const r = simulate(DEFAULT_RULES, ev);
  assert.deepEqual(r, { purchases: 8, visits: 8, stampsEarned: 8, balance: 0, rewardsUnlocked: 1, rewardsRedeemed: 1 });
});

test('el premio se desbloquea con menos visitas si una compra da varios sellos', () => {
  const r = simulate(cafePerItem, [
    { kind: 'purchase', at: t0, items: 3 },
    { kind: 'purchase', at: min(1440), items: 3 },
    { kind: 'purchase', at: min(2880), items: 3 },
  ]);
  assert.equal(r.visits, 3);
  assert.equal(r.stampsEarned, 9);
  assert.equal(r.rewardsUnlocked, 1);
});

test('canjear sin premio disponible no hace nada', () => {
  const r = simulate(DEFAULT_RULES, [{ kind: 'purchase', at: t0, items: 1 }, { kind: 'redeem', at: min(5) }]);
  assert.equal(r.rewardsRedeemed, 0);
  assert.equal(r.balance, 1);
});

test('validación de reglas', () => {
  assert.equal(validateRules(DEFAULT_RULES), null);
  assert.match(validateRules({ ...DEFAULT_RULES, stampsRequired: 2 })!, /entre 3 y 15/);
  assert.match(validateRules({ ...DEFAULT_RULES, visitWindowMinutes: 5 })!, /ventana/);
});
