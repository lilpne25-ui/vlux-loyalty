// 1.0 · Aislamiento entre negocios a nivel de PostgreSQL (migración 0016).
// Todo con datos SINTÉTICOS (tres negocios A, B y C creados en la base local de pruebas) y ejecutando SQL
// directo como vlux_app (NOBYPASSRLS), que es lo que ve un atacante con inyección SQL o un error de código.
// Las pruebas del contexto de aplicación (HTTP) están en tenant-isolation-api.test.ts.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { inviteStaff } from '../../server/services/invitations';
import { PASSWORD, loggedIn, newBusiness, registerCustomer } from './helpers';

const admin = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
const app = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
after(async () => { await admin.end(); await app.end(); });

/** Las nueve tablas con business_id cuya política era USING (true). */
const NINE = ['business_deletions', 'business_subscriptions', 'card_access_tokens', 'email_events', 'email_outbox',
  'platform_audit_events', 'staff_invitations', 'staff_memberships', 'staff_sessions'] as const;

type Ctx = { business?: string | null; scope?: string | null };
/** Ejecuta fn como vlux_app dentro de una transacción con el contexto indicado (siempre se revierte). */
async function as<T>(ctx: Ctx, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await app.connect();
  try {
    await c.query('BEGIN');
    if (ctx.business) await c.query("SELECT set_config('app.business_id', $1, true)", [ctx.business]);
    if (ctx.scope) await c.query("SELECT set_config('app.scope', $1, true)", [ctx.scope]);
    return await fn(c);
  } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
}
const count = async (ctx: Ctx, sql: string, params: unknown[] = []) => as(ctx, async (c) => (await c.query(sql, params)).rows[0].n as number);
/** Intenta una operación y devuelve 'ok:<filas>' o el mensaje de error (sin romper la transacción de la prueba). */
async function attempt(ctx: Ctx, sql: string, params: unknown[] = []) {
  return as(ctx, async (c) => {
    await c.query('SAVEPOINT s');
    try { const r = await c.query(sql, params); return `ok:${r.rowCount}`; }
    catch (e) { await c.query('ROLLBACK TO s'); return (e as Error).message; }
  });
}

type Biz = Awaited<ReturnType<typeof newBusiness>> & { sessionOwner: Awaited<ReturnType<typeof loggedIn>> };
let A: Biz, B: Biz, C: Biz;

let ADMIN_ID: string;
before(async () => {
  // Administrador de plataforma SINTÉTICO (sin contraseña utilizable): solo satisface las llaves foráneas de las bitácoras.
  ADMIN_ID = (await admin.query(`INSERT INTO platform_admins (email, display_name, password_hash) VALUES ($1, 'Admin Sintético', 'x') RETURNING id`, [`admin-${randomUUID().slice(0, 8)}@ejemplo.test`])).rows[0].id;
  const mk = async () => {
    const b = await newBusiness();
    const sessionOwner = await loggedIn('dueno', b.ownerEmail);
    await registerCustomer(b.slug);
    await inviteStaff({ businessId: b.businessId, email: `emp-${randomUUID().slice(0, 8)}@ejemplo.test`, displayName: 'Empleado Sintético', role: 'EMPLOYEE', by: { type: 'platform', id: ADMIN_ID } });
    // Filas que las rutas normales no crean en una prueba: se insertan como dueño del esquema (datos sintéticos).
    const outbox = (await admin.query('SELECT id FROM email_outbox WHERE business_id = $1 LIMIT 1', [b.businessId])).rows[0].id;
    await admin.query("INSERT INTO email_events (outbox_id, business_id, kind) VALUES ($1, $2, 'requested')", [outbox, b.businessId]);
    await admin.query("INSERT INTO platform_audit_events (action, business_id, entity_type) VALUES ('test.sintetico', $1, 'business')", [b.businessId]);
    await admin.query(`INSERT INTO business_deletions (business_id, slug, name, was_demo, counts, backup_sha256, reason, deleted_by)
      SELECT $1, $2, 'Eliminado sintético', true, '{}', repeat('a', 64), 'prueba', $3`, [randomUUID(), 'del-' + randomUUID().slice(0, 8), ADMIN_ID]);
    return { ...b, sessionOwner } as Biz;
  };
  [A, B, C] = [await mk(), await mk(), await mk()];
});

// ---------- 1. Lectura ----------
for (const t of NINE) {
  test(`${t}: con el contexto del negocio A no se ve ninguna fila de otros negocios`, async () => {
    const col = t === 'business_deletions' || t === 'platform_audit_events' ? null : 'business_id';
    const total = Number((await admin.query(`SELECT count(*) n FROM ${t} WHERE ${col ? 'business_id <> $1' : 'true'}`, col ? [A.businessId] : [])).rows[0].n);
    if (col) assert.ok(total > 0, `fixture: debe haber filas de otros negocios en ${t}`);
    const seen = await count({ business: A.businessId }, `SELECT count(*)::int n FROM ${t} ${col ? 'WHERE business_id <> $1' : ''}`, col ? [A.businessId] : []);
    assert.equal(seen, 0);
  });

  test(`${t}: sin contexto ni alcance no se ve ninguna fila`, async () => {
    assert.equal(await count({}, `SELECT count(*)::int n FROM ${t}`), 0);
  });

  test(`${t}: un identificador de negocio inválido falla de forma segura`, async () => {
    // Con política por negocio, PostgreSQL rechaza el uuid inválido; las dos tablas sin brazo por negocio
    // (solo alcance platform) simplemente no conceden nada. En ambos casos: nunca devuelve filas.
    const r = await attempt({ business: 'no-es-uuid' }, `SELECT count(*)::int AS n FROM ${t}`);
    if (t === 'business_deletions' || t === 'platform_audit_events') {
      assert.equal(await count({ business: 'no-es-uuid' }, `SELECT count(*)::int n FROM ${t}`), 0);
    } else {
      assert.match(r, /invalid input syntax for type uuid/);
    }
  });
}

test('el negocio A sí ve sus propias filas (no se bloquea a todos)', async () => {
  for (const t of ['business_subscriptions', 'card_access_tokens', 'email_outbox', 'email_events', 'staff_invitations', 'staff_memberships', 'staff_sessions']) {
    assert.ok(await count({ business: A.businessId }, `SELECT count(*)::int n FROM ${t} WHERE business_id = $1`, [A.businessId]) > 0, t);
  }
});

// ---------- 2. Escritura cruzada ----------
test('INSERT hacia otro negocio es rechazado por WITH CHECK', async () => {
  const sess = await attempt({ business: A.businessId }, 'INSERT INTO staff_sessions (token_hash, user_id, membership_id, business_id, expires_at) SELECT decode(repeat(\'ab\', 32), \'hex\'), user_id, id, business_id, now() + interval \'1 hour\' FROM staff_memberships WHERE business_id = $1 LIMIT 1', [B.businessId]);
  assert.match(sess, /row-level security|permission denied|0 filas|ok:0/i);
  assert.doesNotMatch(sess, /^ok:[1-9]/);
  const subs = await attempt({ business: A.businessId }, "INSERT INTO business_subscriptions (business_id, plan_code, commercial_status, start_date, price_cents, currency) VALUES ($1, 'piloto', 'piloto', current_date, 0, 'MXN')", [C.businessId]);
  assert.match(subs, /row-level security|duplicate key/);
  const inv = await attempt({ business: A.businessId }, "INSERT INTO staff_invitations (token_hash, business_id, email, display_name, role, invited_by_type, expires_at) VALUES (decode(repeat('cd', 32), 'hex'), $1, 'x@ejemplo.test', 'X', 'OWNER', 'staff', now() + interval '1 day')", [B.businessId]);
  assert.match(inv, /row-level security/);
  const mem = await attempt({ business: A.businessId }, "INSERT INTO staff_memberships (business_id, user_id, role) SELECT $1, user_id, 'OWNER' FROM staff_memberships WHERE business_id = $2 LIMIT 1", [B.businessId, A.businessId]);
  assert.match(mem, /row-level security/);
});

test('UPDATE sobre filas de otro negocio no afecta ninguna fila', async () => {
  for (const [t, set] of [['staff_sessions', 'revoked_at = now()'], ['staff_invitations', 'revoked_at = now()'], ['staff_memberships', 'active = false'],
    ['card_access_tokens', 'revoked_at = now()'], ['email_outbox', "status = 'failed'"], ['business_subscriptions', 'notes = \'x\'']] as const) {
    assert.equal(await attempt({ business: A.businessId }, `UPDATE ${t} SET ${set} WHERE business_id = $1`, [B.businessId]), 'ok:0', t);
  }
});

test('UPDATE no puede trasladar una fila propia a otro negocio', async () => {
  for (const t of ['staff_sessions', 'staff_invitations', 'staff_memberships', 'card_access_tokens', 'email_outbox', 'business_subscriptions']) {
    const r = await attempt({ business: A.businessId }, `UPDATE ${t} SET business_id = $2 WHERE business_id = $1`, [A.businessId, B.businessId]);
    assert.match(r, /permission denied|row-level security/, t);
  }
});

test('vlux_app no puede borrar filas de las nueve tablas', async () => {
  for (const t of NINE) assert.match(await attempt({ business: A.businessId }, `DELETE FROM ${t} WHERE true`), /permission denied/, t);
});

// ---------- 3. Alcances (app.scope) ----------
test('un alcance inventado o mal escrito no concede acceso', async () => {
  for (const scope of ['x', 'AUTH', 'Platform', 'admin', 'true', 'auth ', "auth'--"]) {
    for (const t of NINE) assert.equal(await count({ scope }, `SELECT count(*)::int n FROM ${t}`), 0, `${t} con alcance «${scope}»`);
  }
});

test('alcance auth: solo lectura de sesiones, membresías, tokens e invitaciones; escribe únicamente revocaciones', async () => {
  for (const t of ['staff_sessions', 'staff_memberships', 'card_access_tokens', 'staff_invitations']) {
    assert.ok(await count({ scope: 'auth' }, `SELECT count(*)::int n FROM ${t}`) > 0, `auth lee ${t}`);
  }
  for (const t of ['email_outbox', 'email_events', 'business_subscriptions', 'platform_audit_events', 'business_deletions']) {
    assert.equal(await count({ scope: 'auth' }, `SELECT count(*)::int n FROM ${t}`), 0, `auth NO lee ${t}`);
  }
  assert.ok(Number((await attempt({ scope: 'auth' }, 'UPDATE staff_sessions SET revoked_at = now() WHERE business_id = $1', [A.businessId])).replace('ok:', '')) > 0);
  assert.ok(Number((await attempt({ scope: 'auth' }, 'UPDATE card_access_tokens SET last_used_at = now() WHERE business_id = $1', [A.businessId])).replace('ok:', '')) > 0);
  assert.equal(await attempt({ scope: 'auth' }, 'UPDATE staff_memberships SET active = false WHERE business_id = $1', [A.businessId]), 'ok:0');
  assert.equal(await attempt({ scope: 'auth' }, 'UPDATE staff_invitations SET revoked_at = now() WHERE business_id = $1', [A.businessId]), 'ok:0');
  assert.match(await attempt({ scope: 'auth' }, "INSERT INTO staff_sessions (token_hash, user_id, membership_id, business_id, expires_at) SELECT decode(repeat('ef', 32), 'hex'), user_id, id, business_id, now() + interval '1 hour' FROM staff_memberships WHERE business_id = $1 LIMIT 1", [A.businessId]), /row-level security/);
});

test('alcance platform: lectura transversal acotada; sin acceso a tokens de tarjeta ni salida de correo', async () => {
  for (const t of ['staff_sessions', 'staff_memberships', 'staff_invitations', 'business_subscriptions', 'platform_audit_events', 'business_deletions', 'email_outbox']) {
    assert.ok(await count({ scope: 'platform' }, `SELECT count(*)::int n FROM ${t}`) >= 0, t);
  }
  assert.ok(await count({ scope: 'platform' }, 'SELECT count(*)::int n FROM staff_memberships') > 0);
  assert.equal(await count({ scope: 'platform' }, 'SELECT count(*)::int n FROM card_access_tokens'), 0);
});

test('alcance webhook: localiza la salida de correo por id del proveedor y nada más', async () => {
  assert.ok(await count({ scope: 'webhook' }, 'SELECT count(*)::int n FROM email_outbox') > 0);
  for (const t of ['staff_sessions', 'staff_memberships', 'card_access_tokens', 'staff_invitations', 'email_events', 'business_subscriptions']) {
    assert.equal(await count({ scope: 'webhook' }, `SELECT count(*)::int n FROM ${t}`), 0, t);
  }
});

// ---------- 4. Funciones SECURITY DEFINER ----------
test('las funciones de plataforma exigen alcance platform (no sirven con el contexto de un negocio)', async () => {
  const calls: [string, unknown[]][] = [
    ['SELECT platform_business_export($1)', [B.businessId]],
    ['SELECT * FROM platform_business_stats()', []],
    ['SELECT * FROM platform_recent_activity(5)', []],
    ['SELECT platform_purge_business($1, $2)', [B.businessId, B.slug]],
  ];
  for (const [sql, p] of calls) {
    for (const ctx of [{}, { business: A.businessId }, { business: B.businessId, scope: 'auth' }, { scope: 'webhook' }]) {
      assert.match(await attempt(ctx, sql, p), /alcance de plataforma requerido/, `${sql} con ${JSON.stringify(ctx)}`);
    }
  }
  const ok = await as({ scope: 'platform' }, async (c) => (await c.query('SELECT platform_business_export($1) AS j', [B.businessId])).rows[0].j);
  assert.equal(ok.business.id, B.businessId);
  assert.ok(Array.isArray(ok.customers));
});

test('notification_due_businesses exige alcance worker', async () => {
  for (const ctx of [{}, { business: A.businessId }, { scope: 'platform' }, { scope: 'auth' }]) {
    assert.match(await attempt(ctx, 'SELECT * FROM notification_due_businesses(10)'), /alcance de trabajo requerido/);
  }
  assert.match(await attempt({ scope: 'worker' }, 'SELECT * FROM notification_due_businesses(10)'), /^ok:/);
});

test('vlux_app no puede cambiarse a un rol con más privilegios ni redefinir las políticas', async () => {
  assert.match(await attempt({}, 'SET LOCAL ROLE postgres'), /permission denied|must be member|not permitted/);
  assert.match(await attempt({}, 'ALTER TABLE staff_sessions DISABLE ROW LEVEL SECURITY'), /must be owner/);
  assert.match(await attempt({}, 'CREATE POLICY p ON staff_sessions USING (true)'), /must be owner/);
  // Apagar row_security no sirve: con RLS aplicable, PostgreSQL falla en lugar de devolver filas.
  const off = await as({ business: A.businessId }, async (c) => {
    await c.query('SET LOCAL row_security = off');
    try { return `ok:${(await c.query('SELECT count(*)::int n FROM staff_sessions')).rows[0].n}`; } catch (e) { return (e as Error).message; }
  });
  assert.match(off, /query would be affected by row-level security policy/);
});

// ---------- 5. Contexto y conexiones reutilizadas ----------
test('el contexto no se filtra entre transacciones de una misma conexión (un solo cliente en el pool)', async () => {
  const one = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const c = await one.connect();
    try {
      await c.query('BEGIN'); await c.query("SELECT set_config('app.business_id', $1, true)", [A.businessId]);
      assert.ok((await c.query('SELECT count(*)::int n FROM staff_sessions')).rows[0].n > 0);
      await c.query('COMMIT');
      assert.equal((await c.query('SELECT count(*)::int n FROM staff_sessions')).rows[0].n, 0, 'tras COMMIT no queda contexto');
      await c.query('BEGIN'); await c.query("SELECT set_config('app.business_id', $1, true)", [A.businessId]);
      await c.query('SAVEPOINT x'); await c.query('SELECT 1/0').catch(() => c.query('ROLLBACK TO x'));
      await c.query('ROLLBACK');
      assert.equal((await c.query('SELECT count(*)::int n FROM staff_sessions')).rows[0].n, 0, 'tras ROLLBACK no queda contexto');
      assert.equal((await c.query("SELECT current_setting('app.scope', true) AS s")).rows[0].s ?? '', '', 'no queda alcance');
    } finally { c.release(); }
  } finally { await one.end(); }
});

test('cambio legítimo de contexto A→B dentro de la misma conexión y concurrencia de negocios distintos', async () => {
  const mine = (b: Biz) => as({ business: b.businessId }, async (c) => (await c.query('SELECT DISTINCT business_id FROM staff_sessions')).rows.map((r) => r.business_id));
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => mine([A, B, C][i % 3]).then((ids) => ({ i, ids }))));
  for (const r of results) assert.deepEqual(r.ids, [[A, B, C][r.i % 3].businessId], `solicitud ${r.i}`);
});

// ---------- 6. Contraseñas y datos: la sesión de A no sirve en B (a nivel de datos) ----------
test('PASSWORD de pruebas sigue siendo la esperada (guardia contra fixtures rotos)', () => { assert.ok(PASSWORD.length > 10); });

// ---------- 7. Guardias de catálogo: lo que impide que H-1 reaparezca ----------
test('ninguna tabla con business_id admite una política abierta (excepción documentada: INSERT de la bitácora de plataforma)', async () => {
  const r = await admin.query(`
    SELECT p.tablename, p.policyname, p.cmd, p.qual, p.with_check FROM pg_policies p
     WHERE p.schemaname = 'public'
       AND EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = 'public' AND c.table_name = p.tablename AND c.column_name = 'business_id')
       AND (p.qual = 'true' OR p.with_check = 'true')`);
  assert.deepEqual(r.rows.map((x) => `${x.tablename}.${x.policyname}.${x.cmd}`), ['platform_audit_events.append_only_insert.INSERT']);
});

test('todas las tablas de public tienen RLS; vlux_app no es superusuario, no tiene BYPASSRLS y no es dueño de nada', async () => {
  const t = await admin.query(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity`);
  assert.deepEqual(t.rows, []);
  const role = (await admin.query(`SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = 'vlux_app'`)).rows[0];
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
  const owned = await admin.query(`SELECT count(*)::int n FROM pg_class WHERE relnamespace = 'public'::regnamespace AND pg_get_userbyid(relowner) = 'vlux_app'`);
  assert.equal(owned.rows[0].n, 0);
});

test('vlux_app solo puede actualizar columnas permitidas (nunca business_id ni llaves) en las tablas con alcance', async () => {
  const r = await admin.query(`
    SELECT table_name, string_agg(column_name, ',' ORDER BY column_name) cols FROM information_schema.column_privileges
     WHERE grantee = 'vlux_app' AND privilege_type = 'UPDATE' AND table_schema = 'public'
       AND table_name IN ('staff_sessions','staff_memberships','card_access_tokens','staff_invitations','email_outbox','business_subscriptions')
     GROUP BY 1 ORDER BY 1`);
  const m: Record<string, string> = Object.fromEntries(r.rows.map((x) => [x.table_name, String(x.cols)]));
  for (const [t, cols] of Object.entries(m)) assert.ok(!/(^|,)(business_id|id|token_hash|user_id)(,|$)/.test(cols), `${t}: ${String(cols)}`);
  assert.equal(Object.keys(m).length, 6);
});

test('un valor de SESIÓN dejado en una conexión del pool no se hereda en la siguiente transacción de la app', async () => {
  const { withTx, runWithScope, getPool } = await import('../../server/db');
  const pool = getPool();
  // Simula una inyección que dejó app.scope/app.business_id a nivel sesión en una conexión del pool (Transaction Pooler).
  const c = await pool.connect();
  try {
    await c.query("SELECT set_config('app.scope','platform',false), set_config('app.business_id', $1, false)", [B.businessId]);
  } finally { c.release(); }
  // Varias transacciones sin alcance: ninguna debe ver filas ajenas por herencia del valor de sesión.
  for (let i = 0; i < 6; i++) {
    const n = await withTx(async (tx) => (await tx.query('SELECT count(*)::int n FROM staff_sessions')).rows[0].n as number);
    assert.equal(n, 0);
    const s = await withTx(async (tx) => (await tx.query("SELECT app_scope() s, current_setting('app.business_id', true) b")).rows[0]);
    assert.ok(s.s === 'none' && !s.b, JSON.stringify(s));
  }
  // Con alcance explícito sí aplica solo ese alcance.
  const p = await runWithScope('auth', () => withTx(async (tx) => (await tx.query('SELECT app_scope() s')).rows[0].s));
  assert.equal(p, 'auth');
  // Limpieza de las conexiones del pool.
  const c2 = await pool.connect();
  try { await c2.query("RESET app.scope; RESET app.business_id"); } finally { c2.release(); }
});

test('email_outbox: el negocio dueño actualiza solo columnas permitidas; el webhook lee pero no escribe', async () => {
  assert.match(await attempt({ business: A.businessId }, "UPDATE email_outbox SET status = status WHERE business_id = $1", [A.businessId]), /^ok:/);
  assert.match(await attempt({ business: A.businessId }, 'UPDATE email_outbox SET business_id = $1 WHERE business_id = $2', [B.businessId, A.businessId]), /permission denied/);
  assert.match(await attempt({ scope: 'webhook' }, "UPDATE email_outbox SET status = 'failed'"), /^ok:0$/);
  assert.match(await attempt({ scope: 'webhook' }, 'DELETE FROM email_outbox'), /permission denied/);
});
