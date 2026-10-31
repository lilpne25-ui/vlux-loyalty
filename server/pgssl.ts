// TLS hacia PostgreSQL. Local: sin TLS. Supabase: TLS obligatorio.
//  - DATABASE_SSL_CA (PEM del certificado raíz de Supabase): TLS con verificación completa (recomendado).
//  - DATABASE_SSL=require sin CA: cifrado, pero sin verificar el certificado (solo como transición).
//  - DATABASE_SSL=supabase: TLS verificado con el certificado raíz público de Supabase incluido en el código.
import type { ConnectionOptions } from 'node:tls';
import { SUPABASE_ROOT_CA_2021 } from './certs/supabase-ca';

export function pgSsl(): false | ConnectionOptions {
  const ca = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  if (ca) return { ca, rejectUnauthorized: true };
  if (process.env.DATABASE_SSL === 'supabase') return { ca: SUPABASE_ROOT_CA_2021, rejectUnauthorized: true };
  if (process.env.DATABASE_SSL === 'require') return { rejectUnauthorized: false };
  return false;
}

/** Quita sslmode/ssl de la URL para que la opción `ssl` explícita sea la única fuente de verdad. */
export function stripSslParams(url: string): string {
  try {
    const u = new URL(url);
    for (const k of ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat']) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

/** Describe una URL de conexión sin contraseña (para logs). */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.username}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  } catch {
    return '(URL inválida)';
  }
}
