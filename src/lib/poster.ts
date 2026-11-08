// 1.0.x · Cartel del QR del mostrador generado como ARCHIVO (PNG y PDF), no como captura de la pantalla.
//
// Por qué así: imprimir la vista del panel con window.print() dependía del ancho del teléfono, del zoom y de que el
// navegador imprimiera fondos; en celular salía pequeño, cortado o sin color. Aquí el cartel tiene tamaño físico fijo
// (carta o A5), el QR conserva su zona de silencio de 4 módulos y cada módulo cae en píxeles enteros (PNG) o es un
// rectángulo vectorial (PDF), así que no se ve borroso al imprimirse.
//
// Las funciones puras (diseño, PDF, recorridos del QR) no tocan el DOM y tienen pruebas unitarias.
import { qrMatrix } from './qr';

export type PosterSize = 'letter' | 'a5';
export const POSTER_SIZES: Record<PosterSize, { label: string; wPt: number; hPt: number; cssPage: string; wMm: number; hMm: number }> = {
  letter: { label: 'Carta', wPt: 612, hPt: 792, cssPage: 'letter portrait', wMm: 215.9, hMm: 279.4 },
  a5: { label: 'A5', wPt: 419.53, hPt: 595.28, cssPage: 'A5 portrait', wMm: 148, hMm: 210 },
};
/** Módulos blancos alrededor del QR (la norma pide 4). */
export const QUIET_MODULES = 4;
/** El PNG se dibuja a 200 ppp: nítido al imprimir y dentro del límite de lienzo de Safari en iPhone (~16.7 Mpx). */
export const POSTER_DPI = 200;

export interface PosterSpec {
  name: string;
  instruction: string;
  programLine: string;
  url: string;
  primary: string;
  /** Texto sobre el color de la marca (claro u oscuro según el contraste). */
  onBrand: string;
  logoUrl?: string | null;
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface PosterLayout {
  page: { w: number; h: number };
  panel: Rect & { r: number };
  logo: { cx: number; cy: number; d: number };
  name: { y: number; size: number; lineH: number; maxW: number };
  instruction: { y: number; size: number };
  tile: Rect & { r: number };
  program: { y: number; size: number };
  small: { y: number; size: number };
  brand: { y: number; size: number };
  url: { y: number; size: number };
}

/** Diseño en puntos (1/72 in) con origen arriba a la izquierda. `nameLines` = 1 o 2 renglones del nombre. */
export function posterLayout(size: PosterSize, nameLines: 1 | 2 = 1): PosterLayout {
  const { wPt: W, hPt: H } = POSTER_SIZES[size];
  const m = W * 0.06;
  const urlBand = W * 0.05;
  const panel = { x: m, y: m, w: W - 2 * m, h: H - 2 * m - urlBand, r: W * 0.035 };
  const pw = panel.w;
  const pad = pw * 0.07;
  const logoD = pw * 0.12;
  const nameSize = pw * 0.07;
  const nameLineH = nameSize * 1.15;
  const instrSize = pw * 0.04;
  const progSize = pw * 0.037;
  const smallSize = pw * 0.027;
  const brandSize = pw * 0.03;
  // Alturas fijas; el QR toma el espacio restante (máximo 62 % del ancho del panel) y el sobrante se reparte en los huecos.
  const fixed = pad + logoD + nameLineH * nameLines + instrSize * 1.3 + progSize * 1.3 + smallSize * 1.3 + brandSize * 2 + pad;
  const gaps = 6;
  const minGap = pw * 0.025;
  const tileSize = Math.min(pw * 0.62, panel.h - fixed - gaps * minGap);
  const gap = (panel.h - fixed - tileSize) / gaps;
  let y = panel.y + pad;
  const logo = { cx: W / 2, cy: y + logoD / 2, d: logoD };
  y += logoD + gap;
  const name = { y, size: nameSize, lineH: nameLineH, maxW: pw - 2 * pad };
  y += nameLineH * nameLines + gap * 0.5;
  const instruction = { y, size: instrSize };
  y += instrSize * 1.3 + gap;
  const tile = { x: (W - tileSize) / 2, y, w: tileSize, h: tileSize, r: tileSize * 0.05 };
  y += tileSize + gap;
  const program = { y, size: progSize };
  y += progSize * 1.3 + gap * 0.5;
  const small = { y, size: smallSize };
  y += smallSize * 1.3 + gap;
  const brand = { y, size: brandSize };
  const url = { y: panel.y + panel.h + urlBand * 0.35, size: W * 0.018 };
  return { page: { w: W, h: H }, panel, logo, name, instruction, tile, program, small, brand, url };
}

/** Lado del módulo del QR dentro del cuadro blanco, con 4 módulos de silencio por lado. */
export function qrModule(tileSide: number, n: number) {
  return tileSide / (n + QUIET_MODULES * 2);
}

/** Módulos oscuros agrupados en tramos horizontales (menos rectángulos en el PDF). */
export function qrRuns(m: boolean[][]): { x: number; y: number; len: number }[] {
  const runs: { x: number; y: number; len: number }[] = [];
  m.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) { x++; continue; }
      const start = x;
      while (x < row.length && row[x]) x++;
      runs.push({ x: start, y, len: x - start });
    }
  });
  return runs;
}

const hexRgb = (hex: string) => {
  const c = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
};
const n3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

/**
 * PDF de una página: fondo como imagen JPEG (cartel sin los módulos del QR) + QR en rectángulos vectoriales.
 * El QR nunca se comprime con pérdida ni se reescala: sale exacto a cualquier tamaño de impresión.
 */
export function buildPosterPdf(opts: { size: PosterSize; jpeg: Uint8Array; jpegW: number; jpegH: number; matrix: boolean[][]; tile: Rect; fg?: string; title?: string }): Uint8Array {
  const { wPt: W, hPt: H } = POSTER_SIZES[opts.size];
  const n = opts.matrix.length;
  const cell = qrModule(opts.tile.w, n);
  const ox = opts.tile.x + QUIET_MODULES * cell;
  const oyTop = opts.tile.y + QUIET_MODULES * cell;
  const [r, g, b] = hexRgb(opts.fg ?? '#0E1013');
  let ops = `q ${n3(W)} 0 0 ${n3(H)} 0 0 cm /Im0 Do Q\n${n3(r)} ${n3(g)} ${n3(b)} rg\n`;
  for (const run of qrRuns(opts.matrix)) {
    // PDF mide desde abajo: y = alto − (arriba + (fila + 1) · módulo).
    ops += `${n3(ox + run.x * cell)} ${n3(H - (oyTop + (run.y + 1) * cell))} ${n3(run.len * cell)} ${n3(cell)} re\n`;
  }
  ops += 'f\n';
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => { const u = typeof data === 'string' ? enc.encode(data) : data; chunks.push(u); length += u.length; };
  const obj = (num: number, body: string | (Uint8Array | string)[]) => {
    offsets[num] = length;
    push(`${num} 0 obj\n`);
    if (typeof body === 'string') push(body); else body.forEach(push);
    push('\nendobj\n');
  };
  const title = (opts.title ?? 'Cartel QR').slice(0, 120);
  // Título en UTF-16BE con BOM (admite acentos y ñ).
  const titleHex = 'FEFF' + Array.from(title).map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('').toUpperCase();
  push('%PDF-1.4\n%âãÏÓ\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n3(W)} ${n3(H)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, [`<< /Type /XObject /Subtype /Image /Width ${opts.jpegW} /Height ${opts.jpegH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${opts.jpeg.length} >>\nstream\n`, opts.jpeg, '\nendstream']);
  const content = enc.encode(ops);
  obj(5, [`<< /Length ${content.length} >>\nstream\n`, content, '\nendstream']);
  obj(6, `<< /Title <${titleHex}> /Producer (VLUX Loyalty) >>`);
  const xref = length;
  let table = `xref\n0 7\n0000000000 65535 f \n`;
  for (let i = 1; i <= 6; i++) table += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(table);
  push(`trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/** Nombre de archivo seguro: slug + tipo + tamaño. */
export const posterFilename = (slug: string, kind: 'cartel' | 'qr', size?: PosterSize, ext = 'png') =>
  `${slug}-${kind}${size ? '-' + (size === 'letter' ? 'carta' : 'a5') : ''}.${ext}`;

// ---------------------------------------------------------------- Dibujo en el navegador (canvas)

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => resolve(i);
    i.onerror = () => resolve(null);
    i.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Parte el nombre en 1 o 2 renglones que quepan; si no cabe, reduce la letra (nunca la corta). */
function fitName(ctx: CanvasRenderingContext2D, name: string, maxW: number, size: number, font: string): { lines: string[]; size: number } {
  for (let s = size; s >= size * 0.55; s *= 0.92) {
    ctx.font = `${s}px ${font}`;
    if (ctx.measureText(name).width <= maxW) return { lines: [name], size: s };
    const words = name.split(/\s+/);
    for (let cut = Math.ceil(words.length / 2); cut > 0 && cut < words.length; cut--) {
      const a = words.slice(0, cut).join(' ');
      const b = words.slice(cut).join(' ');
      if (ctx.measureText(a).width <= maxW && ctx.measureText(b).width <= maxW) return { lines: [a, b], size: s };
    }
  }
  ctx.font = `${size * 0.55}px ${font}`;
  return { lines: [name], size: size * 0.55 };
}

const DISPLAY_FONT = "'Young Serif', Georgia, serif";
const UI_FONT = "Geist, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/**
 * Dibuja el cartel a `dpi`. Con `withQr = false` deja el cuadro blanco vacío (lo usa el PDF, que pone el QR en vector).
 * Devuelve también el diseño final y la matriz del QR.
 */
export async function renderPosterCanvas(spec: PosterSpec, size: PosterSize, opts: { dpi?: number; withQr?: boolean } = {}) {
  const dpi = opts.dpi ?? POSTER_DPI;
  const withQr = opts.withQr ?? true;
  try { await Promise.all([document.fonts?.load(`40px ${DISPLAY_FONT}`), document.fonts?.load(`20px ${UI_FONT}`)]); } catch { /* sin fuentes: se usan las del sistema */ }
  const k = dpi / 72;
  const probe = document.createElement('canvas').getContext('2d')!;
  const base = posterLayout(size, 1);
  const fitted = fitName(probe, spec.name, base.name.maxW * k, base.name.size * k, DISPLAY_FONT);
  const L = fitted.lines.length === 2 ? posterLayout(size, 2) : base;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(L.page.w * k);
  canvas.height = Math.round(L.page.h * k);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Panel con el color de la marca.
  ctx.fillStyle = spec.primary;
  roundRect(ctx, L.panel.x * k, L.panel.y * k, L.panel.w * k, L.panel.h * k, L.panel.r * k);
  ctx.fill();
  // Logotipo (o iniciales) en un círculo blanco.
  const lc = { x: L.logo.cx * k, y: L.logo.cy * k, r: (L.logo.d / 2) * k };
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(lc.x, lc.y, lc.r, 0, Math.PI * 2); ctx.fill();
  const logo = spec.logoUrl ? await loadImage(spec.logoUrl) : null;
  if (logo && logo.naturalWidth > 0) {
    const box = lc.r * 2 * 0.74;
    const s = Math.min(box / logo.naturalWidth, box / logo.naturalHeight);
    const w = logo.naturalWidth * s, h = logo.naturalHeight * s;
    ctx.save(); ctx.beginPath(); ctx.arc(lc.x, lc.y, lc.r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(logo, lc.x - w / 2, lc.y - h / 2, w, h);
    ctx.restore();
  } else {
    const initials = spec.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'V';
    ctx.fillStyle = spec.primary;
    ctx.font = `${lc.r * 0.9}px ${DISPLAY_FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(initials, lc.x, lc.y + lc.r * 0.04);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = spec.onBrand;
  // Nombre.
  ctx.font = `${fitted.size}px ${DISPLAY_FONT}`;
  fitted.lines.forEach((line, i) => ctx.fillText(line, (L.page.w / 2) * k, (L.name.y + i * L.name.lineH) * k + (L.name.size * k - fitted.size) / 2));
  // Instrucción.
  ctx.globalAlpha = 0.9;
  ctx.font = `500 ${L.instruction.size * k}px ${UI_FONT}`;
  ctx.fillText(spec.instruction, (L.page.w / 2) * k, L.instruction.y * k, L.name.maxW * k);
  ctx.globalAlpha = 1;
  // Cuadro blanco del QR; el QR con módulos de tamaño entero en píxeles (nítido) y centrado dentro del cuadro.
  const matrix = qrMatrix(spec.url);
  const n = matrix.length;
  const tilePx = L.tile.w * k;
  const cellPx = Math.floor(tilePx / (n + QUIET_MODULES * 2));
  const qrPx = cellPx * (n + QUIET_MODULES * 2);
  const tileX = Math.round(L.tile.x * k), tileY = Math.round(L.tile.y * k);
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, tileX, tileY, tilePx, tilePx, L.tile.r * k);
  ctx.fill();
  if (withQr) {
    const ox = tileX + Math.round((tilePx - qrPx) / 2) + QUIET_MODULES * cellPx;
    const oy = tileY + Math.round((tilePx - qrPx) / 2) + QUIET_MODULES * cellPx;
    ctx.fillStyle = '#0E1013';
    for (const run of qrRuns(matrix)) ctx.fillRect(ox + run.x * cellPx, oy + run.y * cellPx, run.len * cellPx, cellPx);
  }
  // Programa, nota y marca VLUX.
  ctx.fillStyle = spec.onBrand;
  ctx.globalAlpha = 0.92;
  ctx.font = `500 ${L.program.size * k}px ${UI_FONT}`;
  ctx.fillText(spec.programLine, (L.page.w / 2) * k, L.program.y * k, L.name.maxW * k);
  ctx.globalAlpha = 0.7;
  ctx.font = `${L.small.size * k}px ${UI_FONT}`;
  ctx.fillText('Sin app · Sin contraseña', (L.page.w / 2) * k, L.small.y * k);
  ctx.globalAlpha = 1;
  const iso = await loadImage('/brand/vlux-isotipo.png');
  const chip = L.brand.size * 1.6 * k;
  ctx.font = `600 ${L.brand.size * k}px ${UI_FONT}`;
  const label = 'VLUX Loyalty';
  const tw = ctx.measureText(label).width;
  const total = chip + L.brand.size * 0.5 * k + tw;
  const bx = (L.page.w / 2) * k - total / 2;
  const by = L.brand.y * k;
  ctx.fillStyle = '#0E1013';
  roundRect(ctx, bx, by, chip, chip, chip * 0.22); ctx.fill();
  if (iso) { const s = chip * 0.8; ctx.drawImage(iso, bx + (chip - s) / 2, by + (chip - s) / 2, s, s * (iso.naturalHeight / iso.naturalWidth || 1)); }
  ctx.fillStyle = spec.onBrand;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(label, bx + chip + L.brand.size * 0.5 * k, by + chip / 2);
  // Dirección debajo del panel (por si la cámara falla).
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillStyle = '#475467';
  ctx.font = `${L.url.size * k}px 'Geist Mono', ui-monospace, monospace`;
  ctx.fillText(spec.url, (L.page.w / 2) * k, L.url.y * k, L.panel.w * k);
  // El QR del PDF va exactamente en el cuadro centrado que se dibujó aquí.
  const qrTilePt: Rect = { x: (tileX + Math.round((tilePx - qrPx) / 2)) / k, y: (tileY + Math.round((tilePx - qrPx) / 2)) / k, w: qrPx / k, h: qrPx / k };
  return { canvas, layout: L, matrix, qrTilePt, cellPx };
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), type, quality));
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export async function posterPngBlob(spec: PosterSpec, size: PosterSize) {
  const { canvas } = await renderPosterCanvas(spec, size);
  return canvasBlob(canvas, 'image/png');
}

export async function posterPdfBlob(spec: PosterSpec, size: PosterSize) {
  const { canvas, matrix, qrTilePt } = await renderPosterCanvas(spec, size, { withQr: false });
  const jpeg = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.9)).arrayBuffer());
  const pdf = buildPosterPdf({ size, jpeg, jpegW: canvas.width, jpegH: canvas.height, matrix, tile: qrTilePt, title: `Cartel QR · ${spec.name}` });
  return new Blob([pdf as BlobPart], { type: 'application/pdf' });
}
