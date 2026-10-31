// Átomo 03: persistencia real, recuperación desde otra sesión, RLS y libro mayor inmutable.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const appUrl = process.env.DATABASE_URL!;
const sessionA = new pg.Pool({ connectionString: appUrl, max: 2 });
const sessionB = new pg.Pool({ connectionString: appUrl, max: 2 });
after(async () => { await sessionA.end(); await sessionB.end(); });

async function tenantQuery(pool: pg.Pool, businessId: string | null, sql: string, params: unknown[] = []) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (businessId) await c.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    const r = await c.query(sql, params);
    await c.query('COMMIT');
    return r;
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

async function makeBusinessWithCard(pool: pg.Pool) {
  const slug = 't-' + randomUUID().slice(0, 8);
  const biz = (await pool.query('INSERT INTO businesses (slug, name) VALUES ($1, $2) RETURNING id', [slug, 'Negocio ' + slug])).rows[0].id as string;
  await tenantQuery(pool, biz, "INSERT INTO reward_rules (business_id, version, stamps_required, stamp_mode, reward_description) VALUES ($1, 1, 8, 'per_purchase', 'Café gratis')", [biz]);
  const cust = (await tenantQuery(pool, biz, "INSERT INTO customers (business_id, display_name, privacy_notice_version, privacy_accepted_at) VALUES ($1, 'Cliente Sintético', 'v1', now()) RETURNING id", [biz])).rows[0].id;
  const card = (await tenantQuery(pool, biz, 'INSERT INTO cards (business_id, customer_id, public_code) VALUES ($1, $2, $3) RETURNING id', [biz, cust, randomCode()])).rows[0].id;
  return { biz, cust, card };
}
const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const randomCode = () => Array.from({ length: 9 }, (_, i) => (i === 4 ? '-' : A[Math.floor(Math.random() * A.length)])).join('');

test('cliente y tarjeta persisten y se recuperan desde una sesión independiente', async () => {
  const { biz, card } = await makeBusinessWithCard(sessionA);
  const r = await tenantQuery(sessionB, biz, 'SELECT c.public_code, cu.display_name FROM cards c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1', [card]);
  assert.equal(r.rowCount, 1);
  assert.equal(r.rows[0].display_name, 'Cliente Sintético');
});

test('RLS: sin negocio fijado no se ve ninguna tarjeta', async () => {
  await makeBusinessWithCard(sessionA);
  const r = await tenantQuery(sessionB, null, 'SELECT count(*)::int AS n FROM cards');
  assert.equal(r.rows[0].n, 0);
});

test('RLS: un negocio no ve ni puede escribir datos de otro', async () => {
  const one = await makeBusinessWithCard(sessionA);
  const two = await makeBusinessWithCard(sessionA);
  const seen = await tenantQuery(sessionB, two.biz, 'SELECT count(*)::int AS n FROM cards WHERE id = $1', [one.card]);
  assert.equal(seen.rows[0].n, 0);
  const upd = await tenantQuery(sessionB, two.biz, 'UPDATE cards SET stamp_balance = 99 WHERE id = $1', [one.card]);
  assert.equal(upd.rowCount, 0);
  await assert.rejects(
    tenantQuery(sessionB, two.biz, "INSERT INTO customers (business_id, display_name, privacy_notice_version, privacy_accepted_at) VALUES ($1, 'Intruso', 'v1', now())", [one.biz]),
    /row-level security/,
  );
});

test('una tarjeta no puede apuntar a un cliente de otro negocio (FK compuesta)', async () => {
  const one = await makeBusinessWithCard(sessionA);
  const two = await makeBusinessWithCard(sessionA);
  await assert.rejects(tenantQuery(sessionA, two.biz, 'INSERT INTO cards (business_id, customer_id, public_code) VALUES ($1, $2, $3)', [two.biz, one.cust, randomCode()]), /foreign key/);
});

test('saldo negativo y dos recompensas disponibles se rechazan en BD', async () => {
  const { biz, card } = await makeBusinessWithCard(sessionA);
  await assert.rejects(tenantQuery(sessionA, biz, 'UPDATE cards SET stamp_balance = -1 WHERE id = $1', [card]), /check constraint/);
  const rule = (await tenantQuery(sessionA, biz, 'SELECT id FROM reward_rules WHERE business_id = $1', [biz])).rows[0].id;
  const ins = "INSERT INTO rewards (business_id, card_id, rule_id, code, description, stamps_cost, cycle) VALUES ($1, $2, $3, $4, 'x', 8, 1)";
  await tenantQuery(sessionA, biz, ins, [biz, card, rule, 'R-' + randomCode().replace('-', '').slice(0, 6)]);
  await assert.rejects(tenantQuery(sessionA, biz, ins, [biz, card, rule, 'R-' + randomCode().replace('-', '').slice(0, 6)]), /rewards_one_available/);
});

test('la app no puede borrar ni editar auditoría', async () => {
  const { biz } = await makeBusinessWithCard(sessionA);
  await tenantQuery(sessionA, biz, "INSERT INTO audit_events (business_id, actor_type, action) VALUES ($1, 'system', 'prueba')", [biz]);
  await assert.rejects(tenantQuery(sessionA, biz, 'DELETE FROM audit_events WHERE business_id = $1', [biz]), /permission denied/);
  await assert.rejects(tenantQuery(sessionA, biz, "UPDATE audit_events SET action = 'otra' WHERE business_id = $1", [biz]), /permission denied/);
});
