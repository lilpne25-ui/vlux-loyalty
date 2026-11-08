// 1.0.x · Contacto y soporte: enlaces de WhatsApp (wa.me) con mensaje prellenado y contexto del reporte del dueño.
// Todo se arma en el teléfono del usuario: no hay servicio externo de mensajería ni se envía nada sin que la persona
// toque «Enviar» en WhatsApp.

/** Soporte VLUX por WhatsApp: 744 145 2048 (México). En wa.me el número va con lada de país 52 y sin el «1» antiguo. */
export const VLUX_SUPPORT_WHATSAPP = '527441452048';
export const VLUX_SUPPORT_DISPLAY = '744 145 2048';

/** Página pública de VLUX Loyalty. Configurable al compilar (VITE_VLUX_LANDING_URL); por omisión, la presentación de esta misma app. */
export const VLUX_LANDING_URL: string = (() => {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_VLUX_LANDING_URL?.trim();
    if (v && /^https:\/\/[^\s]+$/.test(v)) return v;
  } catch { /* fuera de Vite (pruebas) */ }
  return '/?ref=tarjeta';
})();

/** 10 dígitos de México → formato internacional para wa.me. Devuelve null si no es válido. */
export function mxToIntl(phone: string | null | undefined): string | null {
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 10) return `52${d}`;
  if (d.length === 12 && d.startsWith('52')) return d;
  return null;
}

/** Enlace universal de WhatsApp con mensaje prellenado. */
export function waLink(intlNumber: string, text: string): string {
  if (!/^[0-9]{11,15}$/.test(intlNumber)) throw new Error('Número inválido para WhatsApp');
  return `https://wa.me/${intlNumber}?text=${encodeURIComponent(text)}`;
}

export const customerSupportText = (businessName: string) => `Hola, necesito ayuda con mi tarjeta de lealtad de ${businessName}.`;
export const vluxSupportLink = (businessName: string) => waLink(VLUX_SUPPORT_WHATSAPP, customerSupportText(businessName));

/** Mensaje del cliente al negocio tras pedir recuperar su tarjeta (sin datos sensibles: el negocio ya ve su número). */
export const businessRecoveryText = (businessName: string, name?: string) =>
  `Hola${name ? `, soy ${name}` : ''}. Pedí recuperar mi tarjeta de lealtad de ${businessName} desde la app. ¿Me ayudan con un enlace nuevo?`;

/** Mensaje del dueño al cliente con su enlace nuevo. */
export const customerLinkText = (businessName: string, link: string) =>
  `Hola, te comparto tu enlace nuevo para abrir tu tarjeta de lealtad de ${businessName}: ${link}\nÁbrelo en tu teléfono y guárdalo. No lo compartas: es tu llave. El enlace anterior ya no funciona.`;

// ---------------------------------------------------------------- Reporte de problemas (dueño)

const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Referencia corta del reporte (también la valida el servidor). */
export function newSupportRef(rand: (n: number) => number = (n) => {
  const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0]! % n;
}): string {
  let s = 'VLX-';
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[rand(REF_ALPHABET.length)];
  return s;
}

/** Resumen legible del dispositivo a partir del User-Agent (sin huella completa). */
export function deviceSummary(ua: string, width?: number, height?: number): string {
  const os = /iPhone/.test(ua) ? `iPhone · iOS ${(ua.match(/OS (\d+)[_.]?(\d+)?/) ?? [])[1] ?? ''}`.trim()
    : /iPad/.test(ua) ? `iPad · iPadOS ${(ua.match(/OS (\d+)/) ?? [])[1] ?? ''}`.trim()
    : /Android/.test(ua) ? `Android ${(ua.match(/Android (\d+(?:\.\d+)?)/) ?? [])[1] ?? ''}`.trim()
    : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const pick = (re: RegExp, name: string) => { const m = ua.match(re); return m ? `${name} ${m[1]}` : null; };
  const browser = pick(/EdgA?\/(\d+)/, 'Edge') ?? pick(/SamsungBrowser\/(\d+)/, 'Samsung Internet') ?? pick(/CriOS\/(\d+)/, 'Chrome')
    ?? pick(/FxiOS\/(\d+)/, 'Firefox') ?? pick(/Chrome\/(\d+)/, 'Chrome') ?? pick(/Firefox\/(\d+)/, 'Firefox')
    ?? pick(/Version\/(\d+).*Safari/, 'Safari') ?? 'Navegador desconocido';
  const screen = width && height ? ` · ${width}×${height}` : '';
  return `${os} · ${browser}${screen}`.slice(0, 160);
}

export interface ReportContext {
  ref: string; businessName: string; slug: string; view: string; role: 'OWNER' | 'EMPLOYEE'; userName: string;
  at: Date; device: string; appVersion: string; description: string;
}

export const roleLabel = (r: 'OWNER' | 'EMPLOYEE') => (r === 'OWNER' ? 'Dueño' : 'Caja');

export function formatReportDate(d: Date) {
  return d.toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Texto del reporte para WhatsApp: problema primero y contexto después, en renglones cortos. */
export function reportText(c: ReportContext): string {
  const desc = c.description.trim() || '(escribe aquí qué pasó)';
  return [
    'Hola, reporto un problema en VLUX Loyalty.',
    `Negocio: ${c.businessName} (${c.slug})`,
    `Vista: ${c.view}`,
    `Descripción: ${desc}`,
    '',
    `Usuario: ${c.userName} · ${roleLabel(c.role)}`,
    `Fecha: ${formatReportDate(c.at)}`,
    `Dispositivo: ${c.device}`,
    `Versión: ${c.appVersion}`,
    `Ref: ${c.ref}`,
  ].join('\n');
}
