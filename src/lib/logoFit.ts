// V0.4.3 · Intelligent Logo Engine. Funciones PURAS sobre píxeles RGBA (se prueban sin navegador).
//   analyzePixels   → dimensiones, aspecto, transparencia, límites visibles, margen sobrante, fondo sólido y luminosidad.
//   removeBackground → quita SOLO el fondo conectado con el borde (opcional y reversible: devuelve copia, no toca el original).
//   defaultFit / placeLogo → composición: caja de contención (object-fit: contain) sin estirar, deformar ni recortar.
// El logotipo original nunca se modifica: el ajuste es un conjunto de parámetros (LogoFit) que se aplica al dibujar.
import type { RGB } from './palette';

export type LogoKind = 'horizontal' | 'square' | 'vertical';
export type PlateVariant = 'light' | 'dark' | 'none';
export interface Bounds { x: number; y: number; w: number; h: number } // normalizados 0..1 sobre la imagen completa

export interface LogoAnalysis {
  width: number; height: number; aspect: number;
  hasAlpha: boolean;
  bounds: Bounds;            // zona visible estimada (sin márgenes sobrantes)
  contentAspect: number;     // proporción de la zona visible
  kind: LogoKind;
  marginFraction: number;    // fracción del área que es margen sobrante (0..1)
  bg: { rgb: RGB; confident: boolean } | null; // fondo sólido detectado en el borde (solo imágenes sin transparencia)
  luminance: number;         // luminancia (0..1) del primer plano
  plate: PlateVariant;       // base de contraste recomendada
  warnings: string[];
}

export interface LogoFit {
  v: 1; iw: number; ih: number; bounds: Bounds;
  plate: PlateVariant; scale: number; dx: number; dy: number; pad: number; align: 'center' | 'left';
}

export const PLATE_SIZES: Record<LogoKind, { w: number; h: number }> = {
  horizontal: { w: 112, h: 48 }, square: { w: 52, h: 52 }, vertical: { w: 46, h: 58 },
};
const FULL: Bounds = { x: 0, y: 0, w: 1, h: 1 };
const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const dist = (r: number, g: number, b: number, c: RGB) => Math.hypot(r - c[0], g - c[1], b - c[2]);
export const kindOf = (aspect: number): LogoKind => (aspect > 1.35 ? 'horizontal' : aspect < 0.75 ? 'vertical' : 'square');

type Px = ArrayLike<number>;

/** Color de fondo según el borde de la imagen: mediana de los píxeles del perímetro y qué tan uniforme es. */
function borderBackground(d: Px, w: number, h: number): { rgb: RGB; confident: boolean } {
  const pts: number[] = [];
  const push = (x: number, y: number) => pts.push((y * w + x) * 4);
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { push(0, y); push(w - 1, y); }
  const med = (k: number) => { const v = pts.map((i) => d[i + k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
  const rgb: RGB = [med(0), med(1), med(2)];
  const near = pts.filter((i) => dist(d[i], d[i + 1], d[i + 2], rgb) < 26).length;
  return { rgb, confident: near / pts.length >= 0.9 };
}

export function analyzePixels(d: Px, w: number, h: number): LogoAnalysis {
  if (!(w > 0 && h > 0)) throw new Error('Imagen vacía.');
  const warnings: string[] = [];
  const total = w * h;
  let transparent = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
  const hasAlpha = transparent / total > 0.005;
  const alphaBg = hasAlpha && transparent / total > 0.02; // transparencia real (no solo bordes suavizados)

  let bg: LogoAnalysis['bg'] = null;
  if (!alphaBg) { const b = borderBackground(d, w, h); bg = b.confident ? b : null; }

  // Máscara de primer plano
  const fg = new Uint8Array(total);
  let count = 0, sumL = 0;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    const a = d[i + 3];
    const on = alphaBg ? a > 24 : bg ? a > 24 && dist(d[i], d[i + 1], d[i + 2], bg.rgb) > 30 : a > 24;
    if (on) { fg[p] = 1; count++; sumL += lum(d[i], d[i + 1], d[i + 2]); }
  }
  if (count === 0) { warnings.push('No se detectó contenido visible.'); }

  // Límites: primera y última fila/columna con presencia suficiente (ignora motas aisladas)
  const rows = new Uint32Array(h), cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (fg[y * w + x]) { rows[y]++; cols[x]++; }
  const tr = Math.max(1, Math.round(w * 0.004)), tc = Math.max(1, Math.round(h * 0.004));
  const first = (a: Uint32Array, t: number) => { for (let i = 0; i < a.length; i++) if (a[i] >= t) return i; return 0; };
  const last = (a: Uint32Array, t: number) => { for (let i = a.length - 1; i >= 0; i--) if (a[i] >= t) return i; return a.length - 1; };
  let x0 = first(cols, tc), x1 = last(cols, tc), y0 = first(rows, tr), y1 = last(rows, tr);
  if (count === 0 || x1 <= x0 || y1 <= y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const bounds: Bounds = { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h };
  const contentAspect = ((x1 - x0 + 1) * 1) / (y1 - y0 + 1);
  const marginFraction = 1 - bounds.w * bounds.h;
  if (marginFraction > 0.35) warnings.push('El archivo tiene márgenes amplios: se recortan al dibujar (sin tocar el original).');

  const fgLum = count ? sumL / count : 0.5;
  let plate: PlateVariant;
  if (bg) plate = lum(bg.rgb[0], bg.rgb[1], bg.rgb[2]) > 0.45 ? 'light' : 'dark'; // el fondo propio queda como base: se integra sin costuras
  else plate = fgLum > 0.55 ? 'dark' : 'light';
  if (!bg && !alphaBg && !hasAlpha) warnings.push('Fondo no uniforme: se conserva tal cual.');

  return { width: w, height: h, aspect: w / h, hasAlpha, bounds, contentAspect, kind: kindOf(contentAspect), marginFraction, bg, luminance: fgLum, plate, warnings };
}

/**
 * Quita el fondo sólido conectado con el borde (relleno por inundación) con borde suave. Devuelve una COPIA o null si
 * no es confiable (fondo no uniforme, o se come casi todo / casi nada). Pensada para ser opcional y reversible.
 */
export function removeBackground(d: Px, w: number, h: number, bgRgb: RGB, tol = 34): { data: Uint8ClampedArray; removed: number } | null {
  if (!(w > 0 && h > 0) || w * h > 4_000_000) return null; // tope de memoria/tiempo
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i++) out[i] = d[i];
  const total = w * h;
  const seen = new Uint8Array(total);
  const stack: number[] = [];
  const near = (p: number) => dist(out[p * 4], out[p * 4 + 1], out[p * 4 + 2], bgRgb) <= tol;
  const seed = (x: number, y: number) => { const p = y * w + x; if (!seen[p] && near(p)) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  let removed = 0;
  while (stack.length) {
    const p = stack.pop()!; removed++;
    const x = p % w, y = (p - x) / w;
    if (x > 0) seed(x - 1, y); if (x < w - 1) seed(x + 1, y); if (y > 0) seed(x, y - 1); if (y < h - 1) seed(x, y + 1);
  }
  const frac = removed / total;
  if (frac < 0.04 || frac > 0.97) return null; // no hay fondo que quitar, o la segmentación se comió el logo
  // Borde suave: los píxeles vecinos al fondo quitado se vuelven semitransparentes según su cercanía al color de fondo
  for (let p = 0; p < total; p++) {
    if (seen[p]) { out[p * 4 + 3] = 0; continue; }
    const x = p % w, y = (p - x) / w;
    const edge = (x > 0 && seen[p - 1]) || (x < w - 1 && seen[p + 1]) || (y > 0 && seen[p - w]) || (y < h - 1 && seen[p + w]);
    if (!edge) continue;
    const dd = dist(out[p * 4], out[p * 4 + 1], out[p * 4 + 2], bgRgb);
    const t = Math.min(1, Math.max(0, (dd - tol) / (tol * 1.2)));
    out[p * 4 + 3] = Math.round(out[p * 4 + 3] * (0.25 + 0.75 * t));
  }
  return { data: out, removed: frac };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const defaultPad = (k: LogoKind) => (k === 'horizontal' ? 0.07 : k === 'vertical' ? 0.09 : 0.14);

export function defaultFit(a: Pick<LogoAnalysis, 'width' | 'height' | 'bounds' | 'plate' | 'kind'>): LogoFit {
  return { v: 1, iw: a.width, ih: a.height, bounds: a.bounds, plate: a.plate, scale: 1, dx: 0, dy: 0, pad: defaultPad(a.kind), align: 'center' };
}

/** Ajuste de respaldo para logos antiguos (sin análisis): imagen completa, base clara, proporción real. */
export function legacyFit(iw: number, ih: number): LogoFit {
  return { v: 1, iw, ih, bounds: FULL, plate: 'light', scale: 1, dx: 0, dy: 0, pad: 0.1, align: 'center' };
}

export function fitKind(f: LogoFit): LogoKind { return kindOf((f.bounds.w * f.iw) / (f.bounds.h * f.ih)); }

export interface Placement { plateW: number; plateH: number; imgW: number; imgH: number; left: number; top: number; fitW: number; fitH: number; kind: LogoKind; scale: number }

/**
 * Coloca la zona visible del logo dentro de la placa conservando su proporción (contain). `scale` > 1 amplía, pero
 * nunca más allá del borde de la placa (no se recorta contenido). Devuelve medidas en px de la imagen completa.
 */
export function placeLogo(f: LogoFit, scalePlate = 1): Placement {
  const kind = fitKind(f);
  const base = PLATE_SIZES[kind];
  const plateW = Math.round(base.w * scalePlate), plateH = Math.round(base.h * scalePlate);
  const cw = f.bounds.w * f.iw, ch = f.bounds.h * f.ih; // zona visible en px de la imagen original
  const availW = plateW * (1 - 2 * f.pad), availH = plateH * (1 - 2 * f.pad);
  const contain = Math.min(availW / cw, availH / ch);
  const maxInside = Math.min(plateW / cw, plateH / ch); // límite duro: nunca sale de la placa
  const s = Math.min(contain * f.scale, maxInside);
  const fitW = cw * s, fitH = ch * s;
  const imgW = f.iw * s, imgH = f.ih * s;
  const cx = f.align === 'left' ? plateW * f.pad + fitW / 2 : plateW / 2;
  const centerX = clamp(cx + f.dx * plateW, fitW / 2, plateW - fitW / 2);
  const centerY = clamp(plateH / 2 + f.dy * plateH, fitH / 2, plateH - fitH / 2);
  return { plateW, plateH, imgW, imgH, left: centerX - fitW / 2 - f.bounds.x * imgW, top: centerY - fitH / 2 - f.bounds.y * imgH, fitW, fitH, kind, scale: s };
}

/** Valida y normaliza un ajuste recibido de fuera (base de datos, sessionStorage). Devuelve null si no es válido. */
export function sanitizeFit(x: unknown): LogoFit | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, any>;
  const n = (v: unknown, a: number, b: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : d);
  const bo = o.bounds && typeof o.bounds === 'object' ? o.bounds : null;
  if (!bo || o.v !== 1) return null;
  const iw = n(o.iw, 1, 4096, 0), ih = n(o.ih, 1, 4096, 0);
  if (!iw || !ih) return null;
  const bx = n(bo.x, 0, 1, 0), by = n(bo.y, 0, 1, 0);
  const bw = n(bo.w, 0.02, 1 - bx, 1 - bx), bh = n(bo.h, 0.02, 1 - by, 1 - by);
  const plate: PlateVariant = o.plate === 'dark' || o.plate === 'none' ? o.plate : 'light';
  return { v: 1, iw, ih, bounds: { x: bx, y: by, w: bw, h: bh }, plate, scale: n(o.scale, 0.4, 2, 1), dx: n(o.dx, -0.4, 0.4, 0), dy: n(o.dy, -0.4, 0.4, 0), pad: n(o.pad, 0, 0.3, 0.1), align: o.align === 'left' ? 'left' : 'center' };
}
