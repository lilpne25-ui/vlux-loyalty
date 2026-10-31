// Acceso a PostgreSQL. Toda operación sobre datos de un negocio pasa por withTenant(),
// que abre una transacción y fija app.business_id con set_config(..., true): el valor vive
// SOLO dentro de esa transacción. Por eso es seguro con el Transaction Pooler de Supabase
// (Supavisor, puerto 6543), que reasigna la conexión física al terminar cada transacción.
//
// Serverless (Vercel Functions): un solo pool por instancia (variable de módulo, se reutiliza
// entre invocaciones), pocas conexiones por instancia (PG_POOL_MAX), cierre de inactivas y
// reintento SOLO al obtener la conexión o al abrir la transacción (nunca a mitad de una
// transacción, para no duplicar sellos).
import pg from 'pg';
import { config } from './config';
import { pgSsl, stripSslParams } from './pgssl';

let pool: pg.Pool | null = null;
let roleChecked: Promise<void> | null = null;

const TRANSIENT = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', '57P01', '57P02', '57P03', '08000', '08001', '08003', '08006', '53300']);
export function isTransient(e: unknown): boolean {
  const err = e as { code?: string; message?: string };
  if (err?.code && TRANSIENT.has(err.code)) return true;
  return /Connection terminated|timeout exceeded when trying to connect|Max client connections reached|too many clients/i.test(err?.message || '');
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: stripSslParams(config.databaseUrl),
      ssl: pgSsl(),
      max: config.poolMax,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      allowExitOnIdle: true,
      application_name: 'vlux-loyalty',
    });
    // Sin este manejador, un error en una conexión inactiva (p. ej. el pooler la cierra) tumbaría el proceso.
    pool.on('error', (err) => console.error('[db] conexión inactiva con error:', (err as { code?: string }).code ?? '', err.message));
  }
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
  roleChecked = null;
}

export type Tx = pg.PoolClient;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reintenta (3 intentos, espera exponencial) SOLO operaciones seguras de repetir ante errores transitorios. */
async function retrying<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (!isTransient(e)) throw e;
      if (attempt < 2) await sleep(150 * 2 ** attempt + Math.random() * 50);
    }
  }
  throw last;
}

/** Obtiene una conexión y abre la transacción (repetible: aún no se escribió nada). */
function begin(): Promise<pg.PoolClient> {
  return retrying(async () => {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      return client;
    } catch (e) {
      client.release(true);
      throw e;
    }
  });
}

/** Transacción sin negocio fijado: solo tablas globales (negocios, usuarios, sesiones, tokens). */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  await ensureSafeRole();
  const client = await begin();
  let broken: Error | undefined;
  try {
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch((re) => { broken = re as Error; });
    if (isTransient(e)) broken = e as Error;
    throw e;
  } finally {
    // Una conexión rota se destruye en lugar de volver al pool.
    client.release(broken);
  }
}

/** Transacción con aislamiento por negocio (RLS). */
export async function withTenant<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTx(async (tx) => {
    await tx.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    return fn(tx);
  });
}

/**
 * Comprobación al primer uso: la app NO debe conectarse como superusuario, con BYPASSRLS ni como
 * dueña de las tablas (a la dueña no le aplica RLS). En producción se niega a operar; fuera, avisa.
 */
export function ensureSafeRole(): Promise<void> {
  if (!roleChecked) {
    roleChecked = (async () => {
      const r = (await retrying(() => getPool().query(
        `SELECT current_user AS who, r.rolsuper, r.rolbypassrls,
                EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user) AS owns_tables
           FROM pg_roles r WHERE r.rolname = current_user`,
      ))).rows[0];
      const problems = [r.rolsuper && 'es superusuario', r.rolbypassrls && 'tiene BYPASSRLS', r.owns_tables && 'es dueño de tablas'].filter(Boolean);
      if (problems.length) {
        const msg = `[db] El rol "${r.who}" ${problems.join(', ')}: RLS no protege los datos. Usa el rol vlux_app.`;
        if (config.isProduction && !config.allowUnsafeDbRole) throw new Error(msg);
        console.warn(msg);
      }
    })().catch((e) => { roleChecked = null; throw e; });
  }
  return roleChecked;
}
