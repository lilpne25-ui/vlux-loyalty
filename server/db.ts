// Acceso a PostgreSQL. Toda operación sobre datos de un negocio pasa por withTenant(),
// que abre una transacción y fija app.business_id para que Row Level Security filtre.
import pg from 'pg';
import { config } from './config';

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  return pool;
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
}

export type Tx = pg.PoolClient;

/** Transacción sin negocio fijado: solo tablas globales (negocios, usuarios, sesiones, tokens). */
export async function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Transacción con aislamiento por negocio (RLS). */
export async function withTenant<T>(businessId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTx(async (tx) => {
    await tx.query("SELECT set_config('app.business_id', $1, true)", [businessId]);
    return fn(tx);
  });
}
