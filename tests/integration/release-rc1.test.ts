// 1.0.0-rc.1 · Pruebas de las correcciones del cierre: search_path, EXECUTE mínimo, permisos tras restaurar,
// bitácoras de solo inserción, disparadores y serie diaria del tablero.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { key, loggedIn, newBusiness, registerCustomer } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
after(async () => { await admin.end(); await app.end(); });

test('todas las funciones de public tienen search_path fijo (asesor 0011 de Supabase)', async () => {
  const r = await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')`);
  assert.deepEqual(r.rows.map((x) => x.proname), []);
  const two = await admin.query(`SELECT proname, proconfig FROM pg_proc WHERE proname IN ('forbid_mutation','businesses_set_logo_hash') ORDER BY 1`);
  for (const f of two.rows) assert.deepEqual(f.proconfig, ['search_path=pg_catalog, public'], f.proname);
});

test('ninguna función de public es ejecutable por PUBLIC; vlux_app conserva solo las suyas', async () => {
  const r = await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('public', p.oid, 'EXECUTE') IS NOT DISTINCT FROM true
      AND EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0)`);
  assert.deepEqual(r.rows.map((x) => x.proname), []);
  const mine = await admin.query(`SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND has_function_privilege('vlux_app', p.oid, 'EXECUTE') ORDER BY 1`);
  const has0016 = (await admin.query("SELECT to_regprocedure('public.app_scope()') IS NOT NULL AS ok")).rows[0].ok as boolean;
  assert.deepEqual(mine.rows.map((x) => x.proname), [...(has0016 ? ['app_scope'] : []), 'current_business_id', 'notification_due_businesses', 'platform_business_export',
    'platform_business_stats', 'platform_purge_business', 'platform_recent_activity']);
});

test('los disparadores siguen funcionando para vlux_app sin EXECUTE (logo_hash y updated_at)', async () => {
  const b = await newBusiness();
  const c = await app.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('app.business_id', $1, true)", [b.businessId]);
    const r = await c.query("UPDATE businesses SET logo_data_url = 'data:image/png;base64,AAAA' WHERE id = $1 RETURNING logo_hash", [b.businessId]);
    assert.match(r.rows[0].logo_hash, /^[0-9a-f]{12}$/);
    await c.query('ROLLBACK');
  } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
});

test('bitácoras de solo inserción: ni el dueño del esquema puede modificarlas fuera de la purga', async () => {
  const b = await newBusiness();
  const { rows } = await admin.query('SELECT id FROM audit_events WHERE business_id = $1 LIMIT 1', [b.businessId]);
  assert.ok(rows.length, 'el alta deja bitácora');
  await assert.rejects(admin.query('DELETE FROM audit_events WHERE id = $1', [rows[0].id]), /solo inserción/);
  await assert.rejects(admin.query("UPDATE audit_events SET action = 'x' WHERE id = $1", [rows[0].id]), /solo inserción/);
  // Con la variable de purga de OTRO negocio tampoco se puede borrar.
  const c = await admin.connect();
  try {
    await c.query('BEGIN');
    await c.query("SELECT set_config('vlux.purge_business', gen_random_uuid()::text, true)");
    await assert.rejects(c.query('DELETE FROM audit_events WHERE id = $1', [rows[0].id]), /solo inserción/);
    await c.query('ROLLBACK');
  } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
  // Y vlux_app no tiene DELETE.
  await assert.rejects(app.query('DELETE FROM stamp_events WHERE false'), /permission denied/);
});

test('ops/grants.sql reproduce exactamente los permisos de una base recién migrada (restauración --no-privileges)', async () => {
  const fingerprint = async (c: pg.PoolClient) => (await c.query(`
    SELECT string_agg(x, ' ' ORDER BY x) AS f FROM (
      SELECT 't:' || c.relname || ':' ||
        (CASE WHEN has_table_privilege('vlux_app', c.oid, 'SELECT') THEN 'r' ELSE '' END) ||
        (CASE WHEN has_table_privilege('vlux_app', c.oid, 'INSERT') THEN 'a' ELSE '' END) ||
        (CASE WHEN has_table_privilege('vlux_app', c.oid, 'UPDATE') THEN 'w' ELSE '' END) ||
        (CASE WHEN has_table_privilege('vlux_app', c.oid, 'DELETE') THEN 'd' ELSE '' END) AS x
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'
      UNION ALL
      SELECT 'f:' || p.proname || ':' || (CASE WHEN has_function_privilege('vlux_app', p.oid, 'EXECUTE') THEN 'x' ELSE '' END)
        || ':' || (CASE WHEN EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) THEN 'PUBLIC' ELSE '' END)
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public') y`)).rows[0].f as string;
  const c = await admin.connect();
  try {
    await c.query('BEGIN');
    const before = await fingerprint(c);
    // Simula pg_restore --no-privileges: sin permisos para vlux_app y EXECUTE a PUBLIC en todas las funciones.
    await c.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vlux_app; REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM vlux_app;
                   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;`);
    assert.notEqual(await fingerprint(c), before);
    await c.query(readFileSync(join(import.meta.dirname, '..', '..', 'ops', 'grants.sql'), 'utf8'));
    assert.equal(await fingerprint(c), before);
    assert.doesNotMatch(before, /:PUBLIC/);
    await c.query('ROLLBACK');
  } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
});

test('serie diaria del tablero: cuenta por día local de México y excluye anuladas y días fuera del rango', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  await registerCustomer(b.slug);
  const card = (await admin.query('SELECT id FROM cards WHERE business_id = $1 LIMIT 1', [b.businessId])).rows[0].id;
  const staff = b.ownerUserId;
  const rule = (await admin.query('SELECT id FROM reward_rules WHERE business_id = $1 AND active', [b.businessId])).rows[0].id;
  // Hora local de México: hoy 00:30 y 23:30, ayer 12:00, hace 20 días (fuera de los 14 días) y una compra anulada hoy.
  const at = async (sqlTs: string, voided = false) => {
    const v = (await admin.query(`INSERT INTO visits (business_id, card_id, started_at, created_by) VALUES ($1, $2, ${sqlTs}, $3) RETURNING id, started_at`, [b.businessId, card, staff])).rows[0];
    await admin.query(`INSERT INTO purchases (business_id, card_id, visit_id, rule_id, item_count, stamps_awarded, idempotency_key, staff_user_id, created_at, voided_at, voided_by, void_reason)
      VALUES ($1, $2, $3, $4, 1, 0, gen_random_uuid()::text, $5, $6, ${voided ? 'now()' : 'NULL'}, ${voided ? '$5' : 'NULL'}, ${voided ? "'prueba'" : 'NULL'})`, [b.businessId, card, v.id, rule, staff, v.started_at]);
  };
  const local = (expr: string) => `((${expr})::timestamp AT TIME ZONE 'America/Mexico_City')`;
  const today = `(now() AT TIME ZONE 'America/Mexico_City')::date`;
  await at(local(`${today} + time '00:30'`));
  await at(local(`${today} + time '00:31'`), true);
  await at(local(`${today} - 1 + time '12:00'`));
  await at(local(`${today} - 20 + time '12:00'`));
  const d = (await owner.get('/api/owner/dashboard')).json;
  assert.equal(d.series.length, 14);
  const last = d.series[13], prev = d.series[12];
  assert.deepEqual([last.visits, last.purchases], [2, 1], 'hoy: 2 visitas, 1 compra (la anulada no cuenta)');
  assert.deepEqual([prev.visits, prev.purchases], [1, 1], 'ayer');
  assert.equal(d.series.reduce((s: number, x: { visits: number }) => s + x.visits, 0), 3, 'hace 20 días queda fuera');
});

test('funciones congeladas: con FEATURE_*=0 la promoción y la cita se rechazan y la operación normal sigue', async () => {
  const saved = { p: process.env.FEATURE_PROMOTIONS, a: process.env.FEATURE_APPOINTMENTS, w: process.env.FEATURE_WEB_PUSH };
  process.env.FEATURE_PROMOTIONS = '0'; process.env.FEATURE_APPOINTMENTS = '0'; process.env.FEATURE_WEB_PUSH = '0';
  try {
    const b = await newBusiness();
    const owner = await loggedIn('dueño', b.ownerEmail);
    const { publicCode } = await registerCustomer(b.slug);
    const promo = await owner.post('/api/owner/communication/promotions', { title: 'Promo prueba', body: 'Texto de prueba sintético' });
    assert.equal(promo.json?.error?.code, 'feature_disabled', JSON.stringify(promo.json));
    const appt = await owner.post('/api/owner/appointments', { cardCode: publicCode, startsAt: new Date(Date.now() + 86400_000).toISOString() });
    assert.equal(appt.json?.error?.code, 'feature_disabled');
    assert.deepEqual((await owner.get('/api/public/push-config')).json, { enabled: false, publicKey: null });
    // La operación central no depende de nada de esto: caja registra una compra.
    const lookup = await owner.post('/api/staff/cards/lookup', { code: publicCode });
    assert.equal(lookup.status, 200);
    const buy = await owner.post(`/api/staff/cards/${lookup.json.cardId}/purchases`, { itemCount: 1, idempotencyKey: key() });
    assert.ok([200, 201].includes(buy.status), JSON.stringify(buy.json));
  } finally {
    for (const [k, v] of [['FEATURE_PROMOTIONS', saved.p], ['FEATURE_APPOINTMENTS', saved.a], ['FEATURE_WEB_PUSH', saved.w]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
});
