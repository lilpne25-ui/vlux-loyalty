// V0.4 · Extracción de colores del logotipo (todo en el navegador; el logo no sale del dispositivo).
// Función pura sobre píxeles RGBA para poder probarla sin DOM: cuantiza, agrupa, y elige
//   - primario: el color de marca más presente que sirva de fondo (oscuro o muy saturado),
//   - acento: el color con más contraste/saturación respecto al primario.
// Siempre devuelve una paleta legible (si el logo es monocromo, se sugiere un acento metálico).

export type RGB = [number, number, number];
export interface Palette { primary: string; accent: string; swatches: string[] }

export const toHex = ([r, g, b]: RGB) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
export function fromHex(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = m ? parseInt(m[1], 16) : 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lin(v: number) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function luminance([r, g, b]: RGB) { return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(a: RGB, b: RGB) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

export function toHsl([r, g, b]: RGB): [number, number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h * 60, s, l];
}
export function fromHsl(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** Agrupa píxeles opacos en cubetas de 16 niveles por canal y devuelve los colores más frecuentes. */
export function dominantColors(data: ArrayLike<number>, max = 8): { rgb: RGB; weight: number }[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 160) continue; // transparencia
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    e.r += r; e.g += g; e.b += b; e.n++;
    buckets.set(key, e);
    total++;
  }
  if (!total) return [];
  const merged: { rgb: RGB; weight: number }[] = [];
  for (const e of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const rgb: RGB = [e.r / e.n, e.g / e.n, e.b / e.n];
    const near = merged.find((m) => Math.hypot(m.rgb[0] - rgb[0], m.rgb[1] - rgb[1], m.rgb[2] - rgb[2]) < 42);
    if (near) near.weight += e.n / total;
    else merged.push({ rgb, weight: e.n / total });
  }
  return merged.sort((x, y) => y.weight - x.weight).slice(0, max);
}

const isNearWhite = (c: RGB) => luminance(c) > 0.82 && toHsl(c)[1] < 0.25;

/** Paleta sugerida a partir de los colores del logotipo. */
export function suggestPalette(data: ArrayLike<number>): Palette {
  const colors = dominantColors(data, 8);
  const swatches = colors.map((c) => toHex(c.rgb));
  const usable = colors.filter((c) => !isNearWhite(c.rgb)); // el blanco suele ser el fondo del logo
  if (!usable.length) return { primary: '#0E1013', accent: '#B9C0C9', swatches };

  // Primario: peso alto y que funcione como fondo con texto claro (oscuro) o color de marca saturado.
  const score = (c: { rgb: RGB; weight: number }) => {
    const [, s, l] = toHsl(c.rgb);
    return c.weight * 2 + s * 0.6 + (l < 0.45 ? 0.5 : 0) - (l > 0.75 ? 0.8 : 0);
  };
  const primaryC = [...usable].sort((a, b) => score(b) - score(a))[0];
  let primary = primaryC.rgb;
  // Si el primario es claro, se oscurece conservando el tono para que la tarjeta sea legible.
  const [h, s, l] = toHsl(primary);
  if (luminance(primary) > 0.3) primary = fromHsl(h, Math.min(1, s * 1.05), Math.min(l, 0.32));

  // Acento: el que más contraste y saturación tenga frente al primario.
  // El blanco/negro casi puro suele ser fondo o texto del logo: solo cuenta si no hay otro color.
  const tinted = colors.filter((c) => c !== primaryC && !isNearWhite(c.rgb) && toHsl(c.rgb)[1] > 0.12);
  const others = tinted.length ? tinted : colors.filter((c) => c !== primaryC && !isNearWhite(c.rgb));
  let accent: RGB | null = null;
  let best = -1;
  for (const c of others) {
    const cr = contrast(c.rgb, primary);
    const sat = toHsl(c.rgb)[1];
    const sc = Math.min(cr, 7) + sat * 3 + c.weight * 2;
    if (cr >= 2.2 && sc > best) { best = sc; accent = c.rgb; }
  }
  if (!accent) {
    // Logo de un solo color: acento metálico armónico (plata en marcas frías, oro suave en cálidas).
    const warm = h < 70 || h > 300;
    accent = s < 0.12 ? fromHex('#C9CED6') : warm ? fromHex('#D4B06A') : fromHex('#C9D3DD');
  }
  return { primary: toHex(primary), accent: toHex(accent), swatches };
}

/** Lee los píxeles de una imagen (data URL o URL del mismo origen) reducida a 64 px. Solo en navegador. */
export async function paletteFromImage(src: string): Promise<Palette> {
  const img = await new Promise<HTMLImageElement>((ok, bad) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => bad(new Error('No se pudo leer la imagen.'));
    i.src = src;
  });
  const side = 64;
  const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return suggestPalette(ctx.getImageData(0, 0, c.width, c.height).data);
}
