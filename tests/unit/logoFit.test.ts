// V0.4.3 · Intelligent Logo Engine (T01–T08) y material (T13–T17). Logos ficticios sintéticos: sin archivos ni red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzePixels, defaultFit, placeLogo, removeBackground, sanitizeFit, PLATE_SIZES, type LogoFit } from '../../src/lib/logoFit';
import { finishTheme, tintFor } from '../../src/lib/finish';
import { contrast, fromHex, type RGB } from '../../src/lib/palette';
import { rgbToOklch } from '../../src/lib/oklch';

type Img = { d: Uint8ClampedArray; w: number; h: number };
function make(w: number, h: number, bg: RGB | null, draw: (set: (x: number, y: number, c: RGB, a?: number) => void) => void): Img {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { if (bg) { d[i * 4] = bg[0]; d[i * 4 + 1] = bg[1]; d[i * 4 + 2] = bg[2]; d[i * 4 + 3] = 255; } }
  draw((x, y, c, a = 255) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a; });
  return { d, w, h };
}
const rect = (set: Parameters<Parameters<typeof make>[3]>[0], x0: number, y0: number, x1: number, y1: number, c: RGB) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c); };
const disc = (set: Parameters<Parameters<typeof make>[3]>[0], cx: number, cy: number, r: number, c: RGB) => { for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) set(x, y, c); };

// Cinco logotipos ficticios de formatos distintos
const horizontal = () => make(256, 64, null, (s) => { rect(s, 6, 20, 250, 44, [20, 90, 60]); });                       // transparente, ancho
const square = () => make(120, 120, null, (s) => { disc(s, 60, 60, 50, [200, 40, 40]); });                              // isotipo
const vertical = () => make(60, 160, [255, 255, 255], (s) => { rect(s, 10, 8, 50, 152, [30, 60, 160]); });             // alto, fondo blanco
const whiteBg = () => make(200, 100, [255, 255, 255], (s) => { rect(s, 40, 25, 160, 75, [10, 10, 10]); });             // fondo blanco, logo oscuro
const darkBg = () => make(180, 90, [12, 14, 18], (s) => { rect(s, 30, 30, 150, 60, [240, 230, 200]); });               // fondo oscuro, logo claro
const margins = () => make(200, 200, null, (s) => { rect(s, 80, 85, 120, 115, [90, 60, 20]); });                      // contenido pequeño, márgenes enormes

const analyze = (i: Img) => analyzePixels(i.d, i.w, i.h);
/** El contenido ajustado jamás se sale de la placa y conserva su proporción. */
function assertContained(fit: LogoFit) {
  const p = placeLogo(fit);
  assert.ok(p.fitW <= p.plateW + 1e-6 && p.fitH <= p.plateH + 1e-6, `se sale de la placa ${p.fitW}x${p.fitH} > ${p.plateW}x${p.plateH}`);
  const ratio = (fit.bounds.w * fit.iw) / (fit.bounds.h * fit.ih);
  assert.ok(Math.abs(p.fitW / p.fitH - ratio) < 1e-6, 'se deformó');
  assert.ok(p.left + p.imgW * fit.bounds.x >= -1e-6 && p.top + p.imgH * fit.bounds.y >= -1e-6, 'se recortó por la izquierda o arriba');
  return p;
}

test('T01 horizontal: región horizontal, proporción intacta', () => {
  const a = analyze(horizontal()); assert.equal(a.kind, 'horizontal'); assert.ok(a.hasAlpha);
  const p = assertContained(defaultFit(a)); assert.equal(p.plateW, PLATE_SIZES.horizontal.w);
});
test('T02 cuadrado: región proporcional', () => {
  const a = analyze(square()); assert.equal(a.kind, 'square');
  const p = assertContained(defaultFit(a)); assert.equal(p.plateW, p.plateH);
});
test('T03 vertical: conserva proporción, placa vertical', () => {
  const a = analyze(vertical()); assert.equal(a.kind, 'vertical'); assert.ok(a.bg, 'detecta fondo sólido');
  const p = assertContained(defaultFit(a)); assert.ok(p.plateH > p.plateW);
});
test('T04 transparencia: se detecta y el análisis no altera los píxeles', () => {
  const i = horizontal(); const copia = new Uint8ClampedArray(i.d);
  const a = analyze(i); assert.ok(a.hasAlpha); assert.equal(a.bg, null);
  assert.deepEqual(Array.from(i.d), Array.from(copia));
  // los bordes del logo (alfa 255) y el vacío (alfa 0) se conservan en la copia sin fondo
  assert.equal(removeBackground(i.d, i.w, i.h, [255, 255, 255]), null, 'sin fondo sólido no hay nada que quitar');
});
test('T05 fondo claro: base clara, quitar fondo es opcional y conserva contornos', () => {
  const i = whiteBg(); const a = analyze(i);
  assert.equal(a.plate, 'light'); assert.ok(a.bg && a.bg.confident);
  const r = removeBackground(i.d, i.w, i.h, a.bg!.rgb)!; assert.ok(r, 'segmentación confiable');
  const at = (x: number, y: number) => r.data[(y * i.w + x) * 4 + 3];
  assert.equal(at(2, 2), 0, 'el fondo queda transparente');
  assert.equal(at(100, 50), 255, 'el interior del logo se conserva');
  assert.equal(i.d[3], 255, 'el original no se modifica');
});
test('T06 logo oscuro y logo claro: la base compensa el contraste', () => {
  const dark = analyze(whiteBg()); const light = analyze(darkBg());
  assert.equal(dark.plate, 'light'); assert.equal(light.plate, 'dark');
  const sinFondo = make(100, 60, null, (s) => rect(s, 10, 10, 90, 50, [250, 250, 250]));
  assert.equal(analyze(sinFondo).plate, 'dark', 'logo blanco transparente → base oscura');
});
test('T07 márgenes excesivos: se detectan y se corrigen sin tocar el original', () => {
  const a = analyze(margins());
  assert.ok(a.marginFraction > 0.8, `margen ${a.marginFraction}`);
  assert.ok(a.bounds.w < 0.25 && a.bounds.h < 0.2);
  assert.ok(a.warnings.some((w) => /márgenes/i.test(w)));
  const p = assertContained(defaultFit(a));
  assert.ok(p.fitW > p.plateW * 0.5, 'el contenido llena la placa');
});
test('T08 restaurar autoajuste: defaultFit anula los cambios manuales', () => {
  const a = analyze(square()); const auto = defaultFit(a);
  const manual: LogoFit = { ...auto, scale: 1.6, dx: 0.3, dy: -0.3, pad: 0.02, plate: 'none', align: 'left' };
  assert.notDeepEqual(manual, auto);
  const restaurado = defaultFit(a);
  assert.deepEqual(restaurado, auto);
  // aun con ajustes extremos nada sale de la placa ni se deforma
  assertContained(manual);
});
test('cinco logos distintos: ninguno se deforma ni se recorta', () => {
  for (const mk of [horizontal, square, vertical, whiteBg, darkBg, margins]) {
    const a = analyze(mk());
    for (const scale of [0.5, 1, 1.6]) assertContained({ ...defaultFit(a), scale });
  }
});
test('sanitizeFit: rechaza basura y acota valores', () => {
  assert.equal(sanitizeFit(null), null); assert.equal(sanitizeFit('x'), null); assert.equal(sanitizeFit({ v: 2 }), null);
  const ok = sanitizeFit({ v: 1, iw: 100, ih: 50, bounds: { x: 0.1, y: 0.1, w: 5, h: 5 }, plate: 'evil', scale: 99, dx: -9, dy: NaN, pad: 5, align: 'right' })!;
  assert.ok(ok.scale <= 2 && ok.dx >= -0.4 && ok.pad <= 0.3 && ok.plate === 'light' && ok.align === 'center');
  assert.ok(ok.bounds.x + ok.bounds.w <= 1 + 1e-9 && ok.bounds.y + ok.bounds.h <= 1 + 1e-9);
});

// ---- Material ----
const rgbs = (s: string): RGB[] => [...s.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])] as RGB);
const hexOrRgb = (s: string): RGB => (s.startsWith('#') ? fromHex(s) : rgbs(s)[0]);
const COLORS: [string, string][] = [['#0B3D2E', '#E8B04B'], ['#1D4ED8', '#93C5FD'], ['#B45309', '#FCD34D'], ['#111111', '#CCCCCC'], ['#7C2D12', '#FDBA74']];

test('T13 Signature Silver conserva base plateada neutra sin importar el color del negocio', () => {
  for (const [p, a] of COLORS) {
    const t = finishTheme('silver', p, a);
    for (const c of rgbs(t.vars['--c-bg'])) { const o = rgbToOklch(c); assert.ok(o.c < 0.02 && o.l > 0.6, `base no neutra ${JSON.stringify(o)} con ${p}`); }
  }
});
test('T14 el color del cliente solo cambia los detalles, no el metal', () => {
  const verde = finishTheme('silver', '#0B3D2E', '#2FA36B'), azul = finishTheme('silver', '#1D4ED8', '#3B82F6');
  assert.equal(verde.vars['--c-bg'], azul.vars['--c-bg']);
  assert.notEqual(verde.vars['--c-detail'], azul.vars['--c-detail']);
  const h = (v: string) => rgbToOklch(rgbs(v)[0]);
  assert.ok(Math.abs(h(verde.vars['--c-detail']).h - h(azul.vars['--c-detail']).h) > 40, 'tonos distintos');
  const neutro = finishTheme('silver', '#111111', '#CCCCCC');
  assert.ok(rgbToOklch(rgbs(neutro.vars['--c-detail'])[0]).c < 0.06, 'negro/gris → detalles neutros');
  assert.equal(tintFor(fromHex('#111111'), fromHex('#CCCCCC')).neutral, true);
});
test('T15 Black Titanium mantiene legibilidad (≥ 7:1 texto principal, ≥ 4.5:1 secundario)', () => {
  for (const [p, a] of COLORS) {
    const t = finishTheme('black', p, a);
    const bg = rgbs(t.vars['--c-bg']); const ink = hexOrRgb(t.vars['--c-ink']);
    for (const c of bg) assert.ok(contrast(ink, c) >= 7, `tinta/fondo ${contrast(ink, c).toFixed(2)}`);
    for (const c of bg) assert.ok(contrast(rgbs(t.vars['--c-detail'])[0], c) >= 4.5, `detalle ${contrast(rgbs(t.vars['--c-detail'])[0], c).toFixed(2)}`);
  }
});
test('T16 Signature Color usa la identidad del negocio y no se confunde con Silver', () => {
  const a = finishTheme('signature', '#0B3D2E', '#E8B04B'), b = finishTheme('signature', '#7C2D12', '#FDBA74'), s = finishTheme('silver', '#0B3D2E', '#E8B04B');
  assert.notEqual(a.vars['--c-bg'], b.vars['--c-bg']);
  const g = rgbToOklch(rgbs(a.vars['--c-bg'])[1]); assert.ok(g.c > 0.05, 'conserva croma del negocio');
  assert.ok(Math.abs(g.h - rgbToOklch(fromHex('#0B3D2E')).h) < 20, 'mismo tono');
  assert.notEqual(a.vars['--c-bg'], s.vars['--c-bg']);
});
test('T17 contraste suficiente: tinta sobre cada tramo del fondo en los 3 acabados (≥ 4.5:1)', () => {
  for (const f of ['silver', 'black', 'signature'] as const) for (const [p, a] of COLORS) {
    const t = finishTheme(f, p, a); const ink = hexOrRgb(t.vars['--c-ink']);
    for (const c of rgbs(t.vars['--c-bg'])) assert.ok(contrast(ink, c) >= 4.5, `${f} ${p} contraste ${contrast(ink, c).toFixed(2)}`);
  }
});
