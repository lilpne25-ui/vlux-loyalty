// V0.4.3 · Color perceptual (OKLab / OKLCH, Björn Ottosson). Funciones puras, sin DOM.
// Se usa para teñir el metal con la identidad del negocio sin que deje de verse como metal neutro:
// se fija la luminosidad y se limita el croma, solo se toma el matiz (hue) del cliente.
import type { RGB } from './palette';

const toLin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export interface OKLCH { l: number; c: number; h: number }

export function rgbToOklch([r, g, b]: RGB): OKLCH {
  const R = toLin(r), G = toLin(g), B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.hypot(a, bb);
  return { l: L, c, h: c < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 };
}

/** Devuelve el color sRGB y si cayó dentro del gamut sin recortar. */
function oklchRaw({ l: L, c, h }: OKLCH): { rgb: RGB; inGamut: boolean } {
  const a = c * Math.cos((h * Math.PI) / 180), b = c * Math.sin((h * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  const eps = 1e-4;
  const inGamut = lin.every((v) => v >= -eps && v <= 1 + eps);
  return { rgb: lin.map((v) => toSrgb(Math.min(1, Math.max(0, v)))) as RGB, inGamut };
}

/** Convierte a sRGB reduciendo el croma hasta caber en el gamut (conserva L y h). */
export function oklchToRgb(x: OKLCH): RGB {
  let c = x.c;
  for (let i = 0; i < 24; i++) {
    const r = oklchRaw({ ...x, c });
    if (r.inGamut) return r.rgb;
    c *= 0.9;
  }
  return oklchRaw({ ...x, c: 0 }).rgb;
}

export const rgbCss = ([r, g, b]: RGB, a = 1) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
