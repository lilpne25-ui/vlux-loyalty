// V0.4.2 · Acceso de demostración. Sin contraseñas publicadas: el servidor abre una sesión corta sobre el negocio sintético.
import { useEffect, useState } from 'react';
import { api } from './api';
import { navigate } from './router';

export type DemoStatus = { enabled: boolean; slug: string | null };

export function useDemoStatus() {
  const [st, setSt] = useState<DemoStatus | null>(null);
  useEffect(() => { api<DemoStatus>('GET', '/public/demo').then(setSt).catch(() => setSt({ enabled: false, slug: null })); }, []);
  return st;
}

/** Abre la sesión de demostración de dueño o caja y entra a su pantalla. Devuelve un mensaje de error o null. */
export async function enterDemo(role: 'OWNER' | 'EMPLOYEE'): Promise<string | null> {
  try {
    const r = await api<{ landing: string }>('POST', '/public/demo/session', { role });
    navigate(r.landing);
    return null;
  } catch (e) {
    return (e as Error).message || 'No se pudo abrir la demostración.';
  }
}

/** Contacto comercial configurable (mailto: o https://) en tiempo de compilación; nunca va en el código. */
export const CONTACT_URL: string = (import.meta.env.VITE_CONTACT_URL as string | undefined)?.trim() || '';
