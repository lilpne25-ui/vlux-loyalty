// Configuración leída de variables de entorno. Falla al arrancar si falta algo obligatorio.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}. Revisa .env.example.`);
  return v;
}

export const config = {
  get databaseUrl() { return required('DATABASE_URL'); },
  get adminDatabaseUrl() { return required('DATABASE_ADMIN_URL'); },
  port: Number(process.env.PORT || 8787),
  isProduction: process.env.NODE_ENV === 'production',
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:8787').replace(/\/$/, ''),
  publicBaseUrlExplicit: !!process.env.PUBLIC_BASE_URL,
  onVercel: process.env.VERCEL === '1',
  poolMax: Math.max(1, Math.min(20, Number(process.env.PG_POOL_MAX) || (process.env.VERCEL === '1' ? 3 : 10))),
  allowUnsafeDbRole: process.env.ALLOW_UNSAFE_DB_ROLE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
  platformAdminToken: process.env.PLATFORM_ADMIN_TOKEN || '',
  privacyNoticeVersion: process.env.PRIVACY_NOTICE_VERSION || 'borrador-2026-10',
  staffSessionHours: 12,
};
