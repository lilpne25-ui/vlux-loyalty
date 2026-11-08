// 1.0.x · Cartel QR (R1) y enlaces de soporte (R3/R4): funciones puras, sin navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { POSTER_SIZES, QUIET_MODULES, buildPosterPdf, posterFilename, posterLayout, qrModule, qrRuns } from '../../src/lib/poster';
import { qrMatrix } from '../../src/lib/qr';
import { customerSupportText, deviceSummary, mxToIntl, newSupportRef, reportText, vluxSupportLink, waLink, VLUX_SUPPORT_WHATSAPP } from '../../src/lib/support';

const URL_LARGA = 'https://vlux-loyalty-git-release-100-rc1-vlux-s-projects.vercel.app/n/cafeteria-ejemplo-metepec';
const MM_PER_PT = 25.4 / 72;

test('P01: el diseño cabe en la hoja (carta y A5, 1 y 2 renglones) y el QR queda centrado', () => {
  for (const size of ['letter', 'a5'] as const) for (const lines of [1, 2] as const) {
    const L = posterLayout(size, lines);
    const { wPt, hPt } = POSTER_SIZES[size];
    assert.ok(L.panel.x > 0 && L.panel.y > 0 && L.panel.x + L.panel.w < wPt && L.panel.y + L.panel.h < hPt, `${size}/${lines} panel dentro de la hoja`);
    assert.ok(L.brand.y + L.brand.size * 2 <= L.panel.y + L.panel.h + 0.01, `${size}/${lines} contenido dentro del panel`);
    assert.ok(L.tile.y > L.instruction.y && L.program.y > L.tile.y + L.tile.h, 'orden vertical');
    assert.ok(Math.abs(L.tile.x + L.tile.w / 2 - wPt / 2) < 0.01, 'QR centrado');
    assert.ok(L.url.y + L.url.size < hPt, 'dirección dentro de la hoja');
    // Margen blanco ≥ 8 mm: las impresoras caseras no imprimen hasta la orilla.
    assert.ok(L.panel.x * MM_PER_PT >= 8, `${size} margen ${L.panel.x * MM_PER_PT} mm`);
  }
});

test('P02: el QR impreso es grande: ≥ 9 cm en carta y ≥ 6.5 cm en A5, con módulos ≥ 1.5 mm para la URL más larga', () => {
  const n = qrMatrix(URL_LARGA).length;
  for (const [size, minCm] of [['letter', 9], ['a5', 6.5]] as const) for (const lines of [1, 2] as const) {
    const L = posterLayout(size, lines);
    const cm = (L.tile.w * MM_PER_PT) / 10;
    assert.ok(cm >= minCm, `${size}/${lines}: ${cm.toFixed(1)} cm`);
    assert.ok(qrModule(L.tile.w, n) * MM_PER_PT >= 1.5, `${size}/${lines}: módulo ${(qrModule(L.tile.w, n) * MM_PER_PT).toFixed(2)} mm`);
  }
});

test('P03: rasterizado como en el PNG (200 ppp, módulos enteros y 4 de silencio) el QR se lee con jsQR', () => {
  const m = qrMatrix(URL_LARGA);
  const L = posterLayout('a5', 2);
  const k = 200 / 72;
  const cell = Math.floor((L.tile.w * k) / (m.length + QUIET_MODULES * 2));
  assert.ok(cell >= 4, `módulo de ${cell} px`);
  const side = cell * (m.length + QUIET_MODULES * 2);
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (const r of qrRuns(m)) for (let x = r.x; x < r.x + r.len; x++)
    for (let dy = 0; dy < cell; dy++) for (let dx = 0; dx < cell; dx++) {
      const i = (((r.y + QUIET_MODULES) * cell + dy) * side + (x + QUIET_MODULES) * cell + dx) * 4;
      px[i] = px[i + 1] = px[i + 2] = 14;
    }
  assert.equal(jsQR(px, side, side)?.data, URL_LARGA);
});

test('P04: qrRuns cubre exactamente los módulos oscuros', () => {
  const m = qrMatrix('https://ejemplo.mx/n/abc');
  const dark = m.flat().filter(Boolean).length;
  const runs = qrRuns(m);
  assert.equal(runs.reduce((a, r) => a + r.len, 0), dark);
  assert.ok(runs.length < dark, 'agrupa módulos contiguos');
});

test('P05: PDF válido: encabezado, xref con desplazamientos exactos, tamaño de página y QR vectorial', () => {
  const m = qrMatrix(URL_LARGA);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const L = posterLayout('letter');
  const pdf = buildPosterPdf({ size: 'letter', jpeg, jpegW: 1700, jpegH: 2200, matrix: m, tile: L.tile, title: 'Cartel QR · Cafetería Ñandú' });
  const text = Buffer.from(pdf).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.match(text, /\/MediaBox \[0 0 612 792\]/);
  const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((x) => Number(x[1]));
  assert.equal(offsets.length, 6);
  offsets.forEach((o, i) => assert.equal(text.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.equal((text.match(/ re\n/g) ?? []).length, qrRuns(m).length);
  assert.match(text, /\/Filter \/DCTDecode \/Length 4 /);
  assert.match(text, /\/Title <FEFF/);
  // El contenido declara su longitud real.
  const len = Number(text.match(/5 0 obj\n<< \/Length (\d+) >>/)![1]);
  const start = text.indexOf('stream\n', text.indexOf('5 0 obj')) + 7;
  assert.equal(text.slice(start + len, start + len + 10), '\nendstream');
});

test('P06: nombres de archivo predecibles', () => {
  assert.equal(posterFilename('cafe-luna', 'cartel', 'letter', 'pdf'), 'cafe-luna-cartel-carta.pdf');
  assert.equal(posterFilename('cafe-luna', 'cartel', 'a5', 'png'), 'cafe-luna-cartel-a5.png');
  assert.equal(posterFilename('cafe-luna', 'qr'), 'cafe-luna-qr.png');
});

test('S01: WhatsApp de soporte VLUX: wa.me/527441452048 con mensaje del negocio codificado', () => {
  assert.equal(VLUX_SUPPORT_WHATSAPP, '527441452048');
  const link = vluxSupportLink('Café & Pan Ñ');
  assert.ok(link.startsWith('https://wa.me/527441452048?text='));
  assert.equal(decodeURIComponent(link.split('text=')[1]), customerSupportText('Café & Pan Ñ'));
  assert.equal(customerSupportText('Barbería Toño'), 'Hola, necesito ayuda con mi tarjeta de lealtad de Barbería Toño.');
  assert.throws(() => waLink('72212', 'x'));
});

test('S02: números de México a formato wa.me', () => {
  assert.equal(mxToIntl('722 123 4567'), '527221234567');
  assert.equal(mxToIntl('+52 722 123 4567'), '527221234567');
  assert.equal(mxToIntl('12345'), null);
  assert.equal(mxToIntl(null), null);
});

test('S03: reporte del dueño: referencia válida, dispositivo legible y contexto completo', () => {
  const ref = newSupportRef();
  assert.match(ref, /^VLX-[2-9A-HJKMNP-Z]{6}$/);
  assert.equal(deviceSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', 390, 844), 'iPhone · iOS 18 · Safari 18 · 390×844');
  assert.equal(deviceSummary('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36'), 'Android 14 · Chrome 129');
  const t = reportText({ ref, businessName: 'Café Luna', slug: 'cafe-luna', view: 'Panel › Accesos', role: 'OWNER', userName: 'Ana', at: new Date('2026-11-08T18:30:00Z'), device: 'iPhone · iOS 18', appVersion: '1.0.0-rc.1', description: '' });
  assert.ok(t.startsWith('Hola, reporto un problema en VLUX Loyalty.\nNegocio: Café Luna (cafe-luna)\nVista: Panel › Accesos\nDescripción: (escribe aquí qué pasó)'));
  for (const piece of ['Usuario: Ana · Dueño', 'Dispositivo: iPhone · iOS 18', 'Versión: 1.0.0-rc.1', `Ref: ${ref}`, '12:30']) assert.ok(t.includes(piece), piece);
});
