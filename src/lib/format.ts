// Formato de fechas en español de México (antes en domain/model.ts de V0.1).
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function relativeTime(iso: string | null) {
  if (!iso) return 'Sin operaciones';
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return 'Hace un momento';
  if (m < 60) return `Hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Ayer';
  if (d < 30) return `Hace ${d} días`;
  return formatDateTime(iso);
}

export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Contenido de los QR: URLs propias. Si se escanean con la cámara del teléfono abren la caja (requiere sesión). */
export const cardQrValue = (code: string) => `${location.origin}/caja?tarjeta=${code}`;
export const rewardQrValue = (code: string) => `${location.origin}/caja?premio=${code}`;
export const businessQrValue = (slug: string) => `${location.origin}/n/${slug}`;
