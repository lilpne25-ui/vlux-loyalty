// Límite de solicitudes en memoria (ventana fija). Válido con UNA instancia del servidor.
// Con varias instancias hay que moverlo a la BD o a un servicio compartido (ver informe de seguridad).
import { AppError } from './errors';

const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > max) throw new AppError(429, 'rate_limited', 'Demasiados intentos. Espera un momento y vuelve a intentar.', { retryAfterSeconds: Math.ceil((b.resetAt - now) / 1000) });
}

export const resetRateLimits = () => buckets.clear();
