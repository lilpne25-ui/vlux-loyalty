// Acceso a PostgreSQL. Toda operación sobre datos de un negocio pasa por withTenant(),
// que abre una transacción y fija app.business_id con set_config(..., true): el valor vive
// SOLO dentro de esa transacción. Por eso es seguro con el Transaction Pooler de Supabase
// (Supavisor, puerto 6543), que reasigna la conexión física al terminar cada transacción.
//
// Serverless (Vercel Functions): un solo pool por instancia (variable de módulo, se reutiliza
// entre invocaciones), pocas conexiones por instancia (PG_POOL_MAX), cierre de inactivas y
// reintento SOLO al obtener la conexión o al abrir la transacción (nunca a mitad de una
// transacción, para no duplicar sellos).
import { AsyncLocalStorage } from 'node:async_hooks';
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

/**
 * Alcance de la transacción (migración 0016). Declara de dónde viene la autoridad cuando NO hay un negocio fijado:
 *   auth     antes de conocer el negocio (iniciar sesión, resolver sesión/token de tarjeta/invitación por su llave secreta);
 *   platform Control Center, tras validar la sesión del administrador con 2FA;
 *   webhook  devoluciones firmadas del proveedor de correo;
 *   worker   tarea programada de avisos.
 * Se propaga con AsyncLocalStorage y se escribe con set_config(..., true) al abrir CADA transacción: vive solo en ella
 * (seguro con el Transaction Pooler). Sin alcance ni negocio, las tablas gobernadas por 0016 no devuelven filas.
 */
export type Scope = 'auth' | 'platform' | 'webhook' | 'worker';
const SCOPES: ReadonlySet<string> = new Set<Scope>(['auth', 'platform', 'webhook', 'worker']);
const scopeStore = new AsyncLocalStorage<Scope>();
/** Ejecuta fn y todo lo que invoque (incluidas sus transacciones) con ese alcance. Úsalo en el borde mínimo posible. */
export function runWithScope<T>(scope: Scope, fn: () => Promise<T>): Promise<T> {
  if (!SCOPES.has(scope)) throw new Error(`Alcance inválido: ${scope}`);
  return scopeStore.run(scope, fn);
}
export const currentScope = (): Scope | undefined => scopeStore.getStore();

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
      // El alcance sale de una lista cerrada (nunca de la entrada del usuario), así que se envía junto con BEGIN en un solo viaje.
      // SIEMPRE se fijan ambos valores locales (vacíos si no aplican): así un valor de SESIÓN que alguien haya dejado en esta
      // conexión del pool (set_config(..., false) tras una inyección SQL) queda tapado durante la transacción y no la hereda.
      const scope = scopeStore.getStore();
      await client.query(`BEGIN; SELECT set_config('app.scope', '${scope && SCOPES.has(scope) ? scope : ''}', true), set_config('app.business_id', '', true)`);
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

/**
 * Una consulta suelta con el alcance vigente (sustituye a getPool().query cuando la tabla está gobernada por 0016:
 * fuera de una transacción no existe forma segura de fijar el contexto con el Transaction Pooler).
 */
export function q(sql: string, params?: unknown[]): Promise<pg.QueryResult> {
  return withTx((tx) => tx.query(sql, params));
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
