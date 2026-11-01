// V0.4.3 · SVG candidatos de VLUX (T10–T12) y garantía de que no sustituyen a los PNG oficiales sin aprobación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), 'docs/vectorizacion');
const cands = readdirSync(dir).filter((f) => f.endsWith('.candidate.svg'));

test('hay tres candidatos', () => assert.deepEqual(cands.sort(), ['vlux-isotipo.candidate.svg', 'vlux-logo-full.candidate.svg', 'vlux-wordmark.candidate.svg']));
test('T11 sin scripts, eventos ni recursos externos', () => {
  for (const f of cands) {
    const s = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/<script|<foreignObject|<iframe|<use\b|<style|\son[a-z]+\s*=|javascript:|xlink:href|\bhref\s*=|url\(\s*['"]?https?:/i.test(s), `${f} contiene contenido activo o externo`);
    assert.ok(/^<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s) && /viewBox="0 0 \d+ \d+"/.test(s), `${f} sin viewBox`);
  }
});
test('T12 son rutas vectoriales reales, no un PNG incrustado', () => {
  for (const f of cands) {
    const s = readFileSync(join(dir, f), 'utf8');
    assert.ok(!/<image|data:image|base64/i.test(s), `${f} incrusta un raster`);
    const d = /<path[^>]* d="([^"]+)"/.exec(s)?.[1] ?? '';
    assert.ok(d.length > 1000 && /[CcLlMm]/.test(d), `${f} sin trazados`);
    assert.ok(s.length < 40_000, 'peso razonable');
  }
});
test('los SVG de VLUX siguen PENDIENTES: public/brand solo sirve los PNG oficiales', () => {
  const pub = readdirSync(join(process.cwd(), 'public/brand'));
  assert.ok(!pub.some((f) => /^vlux-.*\.svg$/i.test(f)), 'no se debe publicar un SVG de VLUX sin aprobación');
  for (const f of ['vlux-isotipo.png', 'vlux-wordmark.png', 'vlux-logo-full.png']) assert.ok(existsSync(join(process.cwd(), 'public/brand', f)));
});
