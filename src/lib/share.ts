// V0.4.6 · Compartir accesos sin depender del correo: copiar, menú nativo de compartir y WhatsApp.
// Abrir WhatsApp con un mensaje preparado NO significa que se envió: la UI siempre lo dice así.
export type ShareKind = 'invitation' | 'reset' | 'permanent' | 'cashier' | 'customers';

const fmt = (d: string | Date) => new Date(d).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).replace(/\.$/, '');

export function shareMessage(p: { kind: ShareKind; url: string; businessName: string; recipientName?: string; expiresAt?: string | Date | null; role?: 'OWNER' | 'EMPLOYEE' }) {
  const hi = p.recipientName ? `Hola, ${p.recipientName}: ` : 'Hola: ';
  switch (p.kind) {
    case 'invitation':
      return `${hi}${p.role === 'EMPLOYEE' ? `te invitaron a la caja de ${p.businessName}` : `VLUX preparó el panel de ${p.businessName}`} en VLUX Loyalty. Activa tu cuenta y elige tu contraseña aquí (enlace de un solo uso${p.expiresAt ? `, vence el ${fmt(p.expiresAt)}` : ''}): ${p.url}`;
    case 'reset':
      return `${hi}este es tu enlace para crear una contraseña nueva en VLUX Loyalty. Sirve una sola vez durante 60 minutos: ${p.url}`;
    case 'permanent':
      return `${hi}este es el acceso al panel de ${p.businessName} en VLUX Loyalty: ${p.url} Entra con tu correo y contraseña. Desde ahí puedes instalar el panel en tu teléfono.`;
    case 'cashier':
      return `${hi}este es el acceso de caja de ${p.businessName}: ${p.url} Entra con tu correo y contraseña y toca «Agregar caja a este teléfono».`;
    case 'customers':
      return `Crea tu tarjeta de recompensas de ${p.businessName}: ${p.url}`;
  }
}

/** wa.me con el texto preparado. Sin número: la persona elige el chat en WhatsApp. */
export const whatsappUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

export const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** Menú nativo de compartir. Devuelve 'shared' solo si el sistema lo confirmó; 'cancelled' si la persona lo cerró. */
export async function nativeShare(title: string, text: string, url: string): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (!canNativeShare()) return 'unavailable';
  try { await navigator.share({ title, text, url }); return 'shared'; } catch { return 'cancelled'; }
}
