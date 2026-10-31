// Límite de solicitudes compartido entre instancias (Vercel Functions) usando PostgreSQL.
// Ventana fija por llave; una sola sentencia atómica (INSERT ... ON CONFLICT) por verificación.
// La llave se guarda como sha256: la tabla no contiene IPs, correos ni tokens en claro.
import { AppError } from './errors';
import { getPool } from './db';
import { sha256 } from './security';

export async function rateLimit(key: string, max: number, windowMs: number): Promise<void> {
  const { rows } = await getPool().query(
    `INSERT INTO rate_limits AS r (key_hash, count, expires_at)
       VALUES ($1, 1, now() + make_interval(secs => $2::double precision / 1000))
     ON CONFLICT (key_hash) DO UPDATE SET
       count      = CASE WHEN r.expires_at <= now() THEN 1 ELSE r.count + 1 END,
       expires_at = CASE WHEN r.expires_at <= now() THEN now() + make_interval(secs => $2::double precision / 1000) ELSE r.expires_at END
     RETURNING count, ceil(extract(epoch FROM (expires_at - now())))::int AS retry_after`,
    [sha256(key).toString('hex'), windowMs],
  );
  // Limpieza ocasional de llaves vencidas (barata, sin cron).
  if (Math.random() < 0.01) getPool().query("DELETE FROM rate_limits WHERE expires_at < now() - interval '1 hour'").catch(() => {});
  const { count, retry_after } = rows[0];
  if (count > max) throw new AppError(429, 'rate_limited', 'Demasiados intentos. Espera un momento y vuelve a intentar.', { retryAfterSeconds: Math.max(1, retry_after) });
}

/** Solo pruebas: borra todos los contadores. */
export async function resetRateLimits() {
  await getPool().query('DELETE FROM rate_limits');
}
