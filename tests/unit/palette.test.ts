import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestPalette, dominantColors, contrast, fromHex } from '../../src/lib/palette';

/** Imagen sintética: lista de [color, cantidad de píxeles] → RGBA plano. */
function img(parts: [string, number, number?][]) {
  const out: number[] = [];
  for (const [hex, n, alpha = 255] of parts) {
    const [r, g, b] = fromHex(hex);
    for (let i = 0; i < n; i++) out.push(r, g, b, alpha);
  }
  return Uint8ClampedArray.from(out);
}

test('ignora píxeles transparentes y agrupa colores cercanos', () => {
  const d = dominantColors(img([['#2B1B14', 300], ['#2C1C15', 50], ['#FF0000', 10, 0]]));
  assert.equal(d.length, 1);
  assert.ok(d[0].weight > 0.99);
});

test('logo café con dorado: primario oscuro y acento dorado con buen contraste', () => {
  const p = suggestPalette(img([['#FFFFFF', 500], ['#3A2418', 300], ['#C9A15B', 120]]));
  assert.equal(p.primary, '#3A2418');
  assert.equal(p.accent, '#C9A15B');
  assert.ok(contrast(fromHex(p.primary), fromHex(p.accent)) >= 3);
});

test('logo de color claro: el primario se oscurece para que la tarjeta sea legible', () => {
  const p = suggestPalette(img([['#7FD3FF', 400], ['#FFFFFF', 400], ['#0A2540', 80]]));
  assert.ok(contrast(fromHex(p.primary), [255, 255, 255]) >= 4.5, `primario ${p.primary} sin contraste`);
});

test('logo monocromo: sugiere un acento metálico en vez de fallar', () => {
  const p = suggestPalette(img([['#111111', 300], ['#FFFFFF', 300]]));
  assert.equal(p.primary, '#111111');
  assert.match(p.accent, /^#[0-9A-F]{6}$/);
  assert.ok(contrast(fromHex(p.primary), fromHex(p.accent)) >= 3);
});

test('imagen vacía o totalmente transparente: paleta VLUX por omisión', () => {
  const p = suggestPalette(img([['#FF0000', 50, 0]]));
  assert.equal(p.primary, '#0E1013');
  assert.equal(p.swatches.length, 0);
});
