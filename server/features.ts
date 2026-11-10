// 1.0.0-rc.1 · Funciones opcionales CONGELADAS hasta validarlas con un negocio real.
// Solo se encienden con variables de entorno del servidor (Vercel → Environment Variables). No existe ningún
// endpoint, parámetro, cookie ni pantalla que pueda cambiarlas: una página pública no puede activarlas.
// Por omisión: APAGADAS en Vercel y en producción; encendidas en desarrollo local y pruebas (para que la suite
// siga cubriendo el código). FEATURE_X=0 apaga en cualquier entorno; FEATURE_X=1 enciende en cualquier entorno.
// Con todas apagadas la app opera completa: tarjeta, QR, caja, recompensas, panel, invitaciones con enlace copiado.
export type Feature = 'webPush' | 'promotions' | 'autoReminders' | 'appointments' | 'smtpEmail';

const ENV: Record<Feature, string> = {
  webPush: 'FEATURE_WEB_PUSH',             // avisos Web Push (además requiere VAPID_*)
  promotions: 'FEATURE_PROMOTIONS',        // campañas promocionales del dueño
  autoReminders: 'FEATURE_AUTO_REMINDERS', // "casi lo logras" y "te extrañamos"
  appointments: 'FEATURE_APPOINTMENTS',    // citas y recordatorios de cita
  smtpEmail: 'FEATURE_SMTP_EMAIL',         // correo por SMTP propio (Stalwart)
};

export function featureEnabled(f: Feature, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[ENV[f]];
  if (v === '1') return true;
  if (v === '0') return false;
  return env.NODE_ENV !== 'production' && env.VERCEL !== '1';
}

export function featureStates(env: NodeJS.ProcessEnv = process.env): Record<Feature, boolean> {
  return Object.fromEntries((Object.keys(ENV) as Feature[]).map((f) => [f, featureEnabled(f, env)])) as Record<Feature, boolean>;
}

export const FEATURE_ENV = ENV;
