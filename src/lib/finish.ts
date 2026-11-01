// V0.4.1 · Acabados de la tarjeta. Son solo tres y siempre respetan los colores del negocio.
//   signature  Color del negocio, con acabado metálico (el de V0.4).
//   silver     Metal plateado oscuro (gunmetal) con un matiz del color del negocio y mayor brillo.
//   black      Negro premium con el acento del negocio.
// Función pura: devuelve los colores efectivos y garantiza contraste suficiente del acento sobre el fondo.
import { contrast, fromHex, fromHsl, toHex, toHsl, type RGB } from './palette';

export type CardFinish = 'signature' | 'silver' | 'black';
export const FINISHES: { id: CardFinish; label: string; hint: string }[] = [
  { id: 'signature', label: 'Color del negocio', hint: 'Tu color principal con brillo metálico' },
  { id: 'silver', label: 'Plata metálica', hint: 'Metal plateado con un matiz de tu marca' },
  { id: 'black', label: 'Negro premium', hint: 'Negro profundo con tu color de acento' },
];
export const isFinish = (v: unknown): v is CardFinish => v === 'signature' || v === 'silver' || v === 'black';

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Sube la luminosidad del acento hasta alcanzar el contraste mínimo contra el fondo. */
function ensureAccent(accent: RGB, bg: RGB, min = 3): RGB {
  let [h, s, l] = toHsl(accent);
  let out = accent;
  for (let i = 0; i < 24 && contrast(out, bg) < min; i++) { l = Math.min(0.95, l + 0.04); out = fromHsl(h, s, l); }
  return out;
}

export interface FinishColors { primary: string; accent: string; hi: number }

export function applyFinish(finish: CardFinish | undefined, primary: string, accent: string): FinishColors {
  let p: RGB, a: RGB;
  try { p = fromHex(primary); a = fromHex(accent); } catch { return { primary, accent, hi: 18 }; }
  if (finish === 'black') {
    const bg = mix([11, 12, 14], p, 0.07);
    return { primary: toHex(bg), accent: toHex(ensureAccent(a, bg)), hi: 12 };
  }
  if (finish === 'silver') {
    const bg = mix([44, 50, 58], p, 0.12);
    return { primary: toHex(bg), accent: toHex(ensureAccent(a, bg)), hi: 40 };
  }
  return { primary, accent, hi: 18 };
}
