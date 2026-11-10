// V0.4.3 · Sistema de acabados. Tres materiales (los identificadores no cambian: se guardan en la base):
//   silver     «Signature Silver»: plata cepillada neutra. El color del negocio solo tiñe DETALLES (reflejo, borde, sellos).
//   black      «Black Titanium»: titanio negro satinado con detalles del negocio.
//   signature  «Signature Color»: el color del negocio con carácter metálico (no se confunde con la plata).
// Todo es función pura: devuelve las variables CSS que consume la tarjeta (.card-metal). Sin imágenes ni librerías.
import { contrast, fromHex, fromHsl, toHex, toHsl, type RGB } from './palette';
import { oklchToRgb, rgbCss, rgbToOklch } from './oklch';

export type CardFinish = 'signature' | 'silver' | 'black';
export const FINISHES: { id: CardFinish; label: string; hint: string }[] = [
  { id: 'silver', label: 'Signature Silver', hint: 'Plata cepillada con detalles de tu marca' },
  { id: 'black', label: 'Black Titanium', hint: 'Titanio negro satinado' },
  { id: 'signature', label: 'Signature Color', hint: 'El color de tu marca con brillo metálico' },
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

/** Colores efectivos de la tarjeta (compatibilidad con V0.4.1). */
export function applyFinish(finish: CardFinish | undefined, primary: string, accent: string): FinishColors {
  let p: RGB, a: RGB;
  try { p = fromHex(primary); a = fromHex(accent); } catch { return { primary, accent, hi: 18 }; }
  if (finish === 'black') { const bg = mix([20, 22, 25], p, 0.05); return { primary: toHex(bg), accent: toHex(ensureAccent(a, bg)), hi: 12 }; }
  if (finish === 'silver') { const bg: RGB = [196, 201, 208]; return { primary: toHex(bg), accent: toHex(tintFor(p, a).detail), hi: 40 }; }
  return { primary, accent, hi: 18 };
}

// ---------- Matiz del negocio (solo para detalles) ----------
export interface Tint { neutral: boolean; hue: number; chroma: number; detail: RGB; glint: RGB; deep: RGB; soft: RGB }

/**
 * Elige el matiz que representa al negocio (el más cromático entre principal y acento) y construye tonos de
 * luminosidad fija. Si la marca es neutra (negro, gris, blanco) no tiñe: usa grafito.
 * `detail` L=.50 (grabados y sellos sobre plata) · `deep` L=.34 · `glint` L=.80 (reflejos) · `soft` L=.90.
 */
export function tintFor(primary: RGB, accent: RGB): Tint {
  const cands = [rgbToOklch(accent), rgbToOklch(primary)].sort((a, b) => b.c - a.c);
  const src = cands[0];
  const neutral = src.c < 0.04;
  const hue = neutral ? 255 : src.h;
  const chroma = neutral ? 0.012 : Math.min(0.1, Math.max(0.055, src.c * 0.7));
  const mk = (l: number, k = 1) => oklchToRgb({ l, c: chroma * k, h: hue });
  return { neutral, hue, chroma, detail: mk(neutral ? 0.38 : 0.5), deep: mk(neutral ? 0.3 : 0.34), glint: mk(0.8, neutral ? 1 : 0.55), soft: mk(0.9, neutral ? 1 : 0.35) };
}

export interface FinishTheme { vars: Record<string, string>; light: boolean }

// Texturas SVG (feTurbulence) incrustadas: cepillado direccional y grano fino. Sin archivos externos.
const svg = (inner: string, w = 360, h = 360) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>${inner}</svg>`)}")`;
export const BRUSH_TEX = svg(`<filter id='b' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.004 0.55' numOctaves='3' seed='7' result='n'/><feColorMatrix type='matrix' values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  1.6 0 0 0 -0.35'/></filter><rect width='100%' height='100%' filter='url(%23b)'/>`.replace('%23', '#'));
export const GRAIN_TEX = svg(`<filter id='g' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='3' result='n'/><feColorMatrix type='matrix' values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1.4 -0.45'/></filter><rect width='100%' height='100%' filter='url(#g)'/>`, 200, 200);

/** Variables CSS del material. `light` indica si el material es claro (tinta oscura). */
export function finishTheme(finish: CardFinish | undefined, primary: string, accent: string): FinishTheme {
  let p: RGB, a: RGB;
  try { p = fromHex(primary); a = fromHex(accent); } catch { p = [20, 23, 28]; a = [185, 192, 201]; }
  const t = tintFor(p, a);
  const css = (c: RGB, al = 1) => rgbCss(c, al);

  if (finish === 'silver') {
    const hi = oklchToRgb({ l: 0.95, c: 0.004, h: 250 }), mid = oklchToRgb({ l: 0.84, c: 0.006, h: 250 }), lo = oklchToRgb({ l: 0.7, c: 0.008, h: 250 }), sh = oklchToRgb({ l: 0.58, c: 0.01, h: 250 });
    return { light: true, vars: {
      '--c-bg': `linear-gradient(158deg, ${css(hi)} 0%, ${css(mid)} 34%, ${css(oklchToRgb({ l: 0.89, c: 0.005, h: 250 }))} 52%, ${css(lo)} 100%)`,
      '--c-aniso': `conic-gradient(from 200deg at 135% 12%, rgba(255,255,255,.0), rgba(255,255,255,.55) 9%, rgba(120,128,138,.16) 18%, rgba(255,255,255,.4) 30%, rgba(90,98,108,.2) 46%, rgba(255,255,255,.35) 60%, rgba(110,118,128,.16) 78%, rgba(255,255,255,.0) 100%)`,
      '--c-ink': '#2A2F36', '--c-ink2': 'rgba(42,47,54,.74)',
      '--c-text-sh': '0 1px 0 rgba(255,255,255,.75), 0 -1px 0 rgba(0,0,0,.14)',
      '--c-rim': 'linear-gradient(140deg, rgba(255,255,255,.95), rgba(255,255,255,.25) 28%, rgba(60,66,74,.35) 62%, rgba(255,255,255,.7))',
      '--c-edge': css(sh, 0.55), '--c-shadow': 'rgba(24,28,34,.5)',
      '--c-tint': css(t.glint, t.neutral ? 0 : 0.55), '--c-detail': css(t.detail), '--c-detail-lo': css(t.deep), '--c-detail-hi': css(t.glint),
      '--c-stamp': `radial-gradient(circle at 34% 28%, ${css(t.glint)}, ${css(t.detail)} 58%, ${css(t.deep)})`,
      '--c-stamp-ink': '#F7F9FB', '--c-slot': 'rgba(70,78,88,.1)', '--c-slot-line': 'rgba(42,47,54,.28)',
      '--c-brush-op': '.2', '--c-brush-blend': 'multiply', '--c-grain-op': '.16', '--c-sheen-op': '.42',
      '--c-divider': 'rgba(42,47,54,.2)', '--c-plate': 'linear-gradient(160deg, #FFFFFF, #E9ECEF)', '--c-plate-dark': 'linear-gradient(160deg, #2A2F36, #14171C)',
    } };
  }
  if (finish === 'black') {
    const base = oklchToRgb({ l: 0.2, c: 0.006, h: 255 }), hi = oklchToRgb({ l: 0.34, c: 0.008, h: 255 }), lo = oklchToRgb({ l: 0.13, c: 0.004, h: 255 });
    const det = oklchToRgb({ l: 0.76, c: t.neutral ? 0.01 : t.chroma * 0.9, h: t.hue });
    return { light: false, vars: {
      '--c-bg': `linear-gradient(158deg, ${css(hi)} 0%, ${css(base)} 38%, ${css(oklchToRgb({ l: 0.17, c: 0.005, h: 255 }))} 62%, ${css(lo)} 100%)`,
      '--c-aniso': `conic-gradient(from 200deg at 135% 12%, rgba(255,255,255,0), rgba(255,255,255,.09) 9%, rgba(0,0,0,.14) 20%, rgba(255,255,255,.06) 32%, rgba(0,0,0,.18) 48%, rgba(255,255,255,.06) 62%, rgba(0,0,0,.1) 80%, rgba(255,255,255,0) 100%)`,
      '--c-ink': '#E8EBEF', '--c-ink2': 'rgba(232,235,239,.72)',
      '--c-text-sh': '0 -1px 0 rgba(0,0,0,.7), 0 1px 0 rgba(255,255,255,.07)',
      '--c-rim': 'linear-gradient(140deg, rgba(255,255,255,.5), rgba(255,255,255,.08) 28%, rgba(0,0,0,.5) 64%, rgba(255,255,255,.28))',
      '--c-edge': 'rgba(0,0,0,.7)', '--c-shadow': 'rgba(0,0,0,.65)',
      '--c-tint': css(det, t.neutral ? 0 : 0.2), '--c-detail': css(det), '--c-detail-lo': css(oklchToRgb({ l: 0.5, c: t.neutral ? 0.01 : t.chroma * 0.8, h: t.hue })), '--c-detail-hi': css(oklchToRgb({ l: 0.88, c: t.neutral ? 0.008 : t.chroma * 0.5, h: t.hue })),
      '--c-stamp': `radial-gradient(circle at 34% 28%, ${css(oklchToRgb({ l: 0.9, c: t.neutral ? 0.006 : t.chroma * 0.5, h: t.hue }))}, ${css(det)} 55%, ${css(oklchToRgb({ l: 0.5, c: t.neutral ? 0.01 : t.chroma * 0.8, h: t.hue }))})`,
      '--c-stamp-ink': '#0E1013', '--c-slot': 'rgba(0,0,0,.3)', '--c-slot-line': 'rgba(232,235,239,.26)',
      '--c-brush-op': '.1', '--c-brush-blend': 'screen', '--c-grain-op': '.22', '--c-sheen-op': '.16',
      '--c-divider': 'rgba(232,235,239,.16)', '--c-plate': 'linear-gradient(160deg, #FFFFFF, #E4E7EB)', '--c-plate-dark': 'linear-gradient(160deg, #23272D, #0E1013)',
    } };
  }
  // Signature Color: color del negocio con brillo metálico (L ajustada en OKLCH, croma conservado).
  const o = rgbToOklch(p);
  const INK_DARK: RGB = [30, 20, 15], INK_LIGHT: RGB = [245, 236, 223];
  const stops = (L: number) => [oklchToRgb({ l: Math.min(0.78, L + 0.1), c: o.c * 0.95, h: o.h }), oklchToRgb({ l: L, c: o.c, h: o.h }), oklchToRgb({ l: Math.max(0.14, L - 0.12), c: o.c * 0.9, h: o.h })];
  const worst = (ink: RGB, st: RGB[]) => Math.min(...st.map((c) => contrast(ink, c)));
  // Si el tono del negocio queda a media luz y la tinta no alcanza 4.5:1, se oscurece el metal (croma y tono se conservan).
  let L0 = Math.min(0.62, Math.max(0.24, o.l));
  for (let i = 0; i < 20 && Math.max(worst(INK_DARK, stops(L0)), worst(INK_LIGHT, stops(L0))) < 4.5; i++) L0 = Math.max(0.2, L0 - 0.02);
  const [top, mid, bot] = stops(L0);
  const lightBase = worst(INK_DARK, [top, mid, bot]) >= worst(INK_LIGHT, [top, mid, bot]);
  const det = ensureAccent(a, mid);
  return { light: lightBase, vars: {
    '--c-bg': `linear-gradient(158deg, ${css(top)} 0%, ${css(mid)} 40%, ${css(bot)} 100%)`,
    '--c-aniso': `conic-gradient(from 200deg at 135% 12%, rgba(255,255,255,0), rgba(255,255,255,.32) 9%, rgba(0,0,0,.14) 20%, rgba(255,255,255,.2) 32%, rgba(0,0,0,.18) 48%, rgba(255,255,255,.2) 62%, rgba(0,0,0,.12) 80%, rgba(255,255,255,0) 100%)`,
    '--c-ink': lightBase ? '#1E140F' : '#F5ECDF', '--c-ink2': lightBase ? 'rgba(30,20,15,.74)' : 'rgba(245,236,223,.74)',
    '--c-text-sh': lightBase ? '0 1px 0 rgba(255,255,255,.4)' : '0 1px 0 rgba(0,0,0,.4), 0 -1px 0 rgba(255,255,255,.1)',
    '--c-rim': 'linear-gradient(140deg, rgba(255,255,255,.7), rgba(255,255,255,.12) 30%, rgba(0,0,0,.35) 64%, rgba(255,255,255,.4))',
    '--c-edge': css(bot, 0.9), '--c-shadow': 'rgba(0,0,0,.55)',
    '--c-tint': 'rgba(255,255,255,0)', '--c-detail': css(det), '--c-detail-lo': css(mix(det, [0, 0, 0], 0.4)), '--c-detail-hi': css(mix(det, [255, 255, 255], 0.55)),
    '--c-stamp': `radial-gradient(circle at 34% 28%, ${css(mix(det, [255, 255, 255], 0.55))}, ${css(det)} 55%, ${css(mix(det, [0, 0, 0], 0.4))})`,
    '--c-stamp-ink': css(mid), '--c-slot': 'rgba(0,0,0,.2)', '--c-slot-line': lightBase ? 'rgba(30,20,15,.3)' : 'rgba(245,236,223,.34)',
    '--c-brush-op': '.18', '--c-brush-blend': 'overlay', '--c-grain-op': '.14', '--c-sheen-op': '.2',
    '--c-divider': lightBase ? 'rgba(30,20,15,.2)' : 'rgba(245,236,223,.18)', '--c-plate': 'linear-gradient(160deg, #FFFFFF, #EEEAE4)', '--c-plate-dark': `linear-gradient(160deg, ${css(bot)}, #0E1013)`,
  } };
}
