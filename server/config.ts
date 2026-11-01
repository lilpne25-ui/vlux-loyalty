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
  // V0.4 · Origen PÚBLICO de la app para los enlaces que se entregan a negocios y clientes (tarjeta, caja,
  // panel e invitaciones). Sirve cuando el Control Center vive en un despliegue protegido por Vercel
  // Authentication y la parte comercial en otro público. Debe ser https:// (o http://localhost en pruebas).
  publicAppUrl: (/^https?:\/\/[a-z0-9.:-]+$/i.test((process.env.PUBLIC_APP_URL || '').replace(/\/$/, '')) ? (process.env.PUBLIC_APP_URL || '').replace(/\/$/, '') : ''),
  onVercel: process.env.VERCEL === '1',
  poolMax: Math.max(1, Math.min(20, Number(process.env.PG_POOL_MAX) || (process.env.VERCEL === '1' ? 3 : 10))),
  allowUnsafeDbRole: process.env.ALLOW_UNSAFE_DB_ROLE === '1',
  trustProxy: process.env.TRUST_PROXY === '1',
  platformAdminToken: process.env.PLATFORM_ADMIN_TOKEN || '',
  privacyNoticeVersion: process.env.PRIVACY_NOTICE_VERSION || 'borrador-2026-10',
  staffSessionHours: 12,
  // V0.3 · Control Center. En producción (NODE_ENV=production, incluido Vercel) solo se activa con
  // CONTROL_CENTER_ENABLED=1 (proyecto interno). En desarrollo y pruebas está activo salvo CONTROL_CENTER_ENABLED=0.
  get controlCenterEnabled() {
    const v = process.env.CONTROL_CENTER_ENABLED;
    return v === '1' || (process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1' && v !== '0');
  },
  /** Llave para cifrar secretos TOTP y códigos de recuperación. En producción es obligatoria y SEPARADA del token de instalación. */
  get adminSecretsKeyMaterial() { return process.env.ADMIN_SECRETS_KEY || ''; },
  /** API antigua con token de plataforma (V0.2): apagada salvo PLATFORM_LEGACY_API=1. */
  get legacyPlatformApi() { return process.env.PLATFORM_LEGACY_API === '1'; },
  adminSessionHours: 8,
  adminIdleMinutes: 30,
  invitationHours: 72,
};
