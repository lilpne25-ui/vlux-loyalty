// V0.4.3 · Envoltorio con DOM del Intelligent Logo Engine (el análisis puro vive en lib/logoFit.ts).
// Todo ocurre en el navegador; el original no se sube ni se modifica. Límites: ≤ 256 px por lado y ≤ 90 000 caracteres.
import { analyzePixels, defaultFit, removeBackground, type LogoAnalysis, type LogoFit } from '../lib/logoFit';

const MAX_CHARS = 90_000;

async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const i = new Image();
    const t = setTimeout(() => bad(new Error('La imagen tardó demasiado en leerse.')), 10_000);
    i.onload = () => { clearTimeout(t); ok(i); };
    i.onerror = () => { clearTimeout(t); bad(new Error('No se pudo leer la imagen.')); };
    i.src = dataUrl;
  });
}

async function pixels(dataUrl: string) {
  const img = await loadImage(dataUrl);
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

export async function analyzeLogo(dataUrl: string): Promise<{ analysis: LogoAnalysis; fit: LogoFit }> {
  const { w, h, data } = await pixels(dataUrl);
  const analysis = analyzePixels(data, w, h);
  return { analysis, fit: defaultFit(analysis) };
}

/** Quita el fondo sólido conectado con el borde. Devuelve un PNG nuevo, o null si no es confiable (se conserva el original). */
export async function removeLogoBackground(dataUrl: string, analysis: LogoAnalysis): Promise<string | null> {
  if (!analysis.bg) return null;
  const { w, h, data } = await pixels(dataUrl);
  const r = removeBackground(data, w, h, analysis.bg.rgb);
  if (!r) return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), w, h), 0, 0);
  const out = c.toDataURL('image/png');
  return out.length <= MAX_CHARS ? out : null;
}
