// E2E V0.4.3 · Signature Metal Design System: Intelligent Logo Engine (5 logos ficticios), acabados, Studio, demo guiada,
// presentación, responsive 320/375/390/768/1440, movimiento reducido y errores de JS.
// Uso: BASE=http://localhost:8788 node tests/e2e/v043-metal.cjs   (requiere DEMO_ACCESS=1; BASE puede ser un Preview público)
const playwright = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:8788';
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
const FIX = path.join(__dirname, '..', 'fixtures', 'logos');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/40[1349]|410|429/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const shot = async (page, name, full = false) => { await page.waitForTimeout(450); return page.screenshot({ path: path.join(OUT, `v043-${name}.png`), fullPage: full }); };

/** Mide el logo dentro de la tarjeta: proporción renderizada vs natural y si el contenido visible cabe en la placa. */
async function logoGeometry(page, scope) {
  return page.evaluate((sel) => {
    const plate = document.querySelector(`${sel} [data-testid=logo-plate] .logo-plate-in`);
    const img = plate && plate.querySelector('img');
    if (!plate || !img) return null;
    const [l, t, w, h] = plate.dataset.content.split(',').map(Number);
    const pr = plate.getBoundingClientRect(), ir = img.getBoundingClientRect();
    return {
      natural: img.naturalWidth / img.naturalHeight, rendered: ir.width / ir.height,
      inside: l >= -0.6 && t >= -0.6 && l + w <= pr.width + 0.6 && t + h <= pr.height + 0.6,
      fill: Math.max(w / pr.width, h / pr.height), kind: plate.parentElement.dataset.kind, plateVariant: plate.parentElement.dataset.plate,
    };
  }, scope);
}

(async () => {
  const browser = await playwright.chromium.launch();
  const desktop = { viewport: { width: 1360, height: 900 } };
  const anon = await (await browser.newContext(desktop)).newPage(); watch(anon, 'anónimo');

  // ---------- Hero: la tarjeta metálica es la protagonista ----------
  await anon.goto(BASE + '/');
  await anon.waitForSelector('[data-testid=hero-card] [data-testid=loyalty-card]');
  const heroBg = await anon.evaluate(() => getComputedStyle(document.querySelector('[data-testid=hero-card] > *')).getPropertyValue('--c-bg'));
  ok('T25a el hero usa la tarjeta Signature Silver (material --c-bg, sin chip bancario)', /linear-gradient/.test(heroBg) && !(await anon.$('[data-testid=hero-card] .card-chip')));
  await anon.evaluate(() => document.querySelectorAll('.lp-reveal').forEach((e) => e.classList.add('in')));
  ok('T25b la sección de tarjetas anuncia metal real y los tres acabados', /Metal real/i.test(await anon.textContent('#acabados')) && /Signature Silver/.test(await anon.textContent('#acabados')) && /Black Titanium/.test(await anon.textContent('#acabados')));
  await shot(anon, 'landing-1360');

  // ---------- Estudio público: 5 logos ficticios ----------
  await anon.goto(BASE + '/personalizar');
  await anon.waitForSelector('[data-testid=public-studio]');
  await anon.click('[role=tab]:has-text("Mi negocio")');
  const files = fs.readdirSync(FIX).filter((f) => /^\d-/.test(f)).sort();
  ok('T00 existen cinco logos ficticios de formatos distintos', files.length === 5 && new Set(files.map((f) => path.extname(f))).size >= 3, files.join(', '));
  const geom = {};
  for (const f of files) {
    await anon.setInputFiles('#st-logo', path.join(FIX, f));
    await anon.waitForSelector('[data-testid=logo-analysis]');
    await anon.waitForFunction(() => { const i = document.querySelector('[data-testid=studio-card] [data-testid=logo-plate] img'); return i && i.complete && i.naturalWidth > 0; });
    await anon.waitForTimeout(250);
    const g = geom[f] = await logoGeometry(anon, '[data-testid=studio-card]');
    ok(`T-logo ${f}: sin deformar (${g && g.natural.toFixed(3)} vs ${g && g.rendered.toFixed(3)}) y sin recortar`, !!g && Math.abs(g.natural - g.rendered) < 0.02 && g.inside, JSON.stringify(g));
    await shot(anon, `logo-${f.split('.')[0]}`);
  }
  ok('T01 el logo horizontal usa región horizontal', geom['1-horizontal-transparente.png'].kind === 'horizontal');
  ok('T02 el logo cuadrado usa región proporcional', geom['2-cuadrado-transparente.png'].kind === 'square');
  ok('T03 el logo vertical conserva su proporción', geom['3-vertical-fondo-blanco.jpg'].kind === 'vertical' && Math.abs(geom['3-vertical-fondo-blanco.jpg'].natural - geom['3-vertical-fondo-blanco.jpg'].rendered) < 0.02);
  ok('T07a márgenes excesivos: el contenido visible llena la placa', geom['4-margenes-excesivos.webp'].fill > 0.6, `fill ${geom['4-margenes-excesivos.webp'].fill}`);
  ok('T06 logo claro sobre fondo oscuro: base oscura integrada', geom['5-claro-sobre-oscuro.png'].plateVariant === 'dark');

  // T07b / T08: ajuste manual y restauración
  await anon.setInputFiles('#st-logo', path.join(FIX, files[0]));
  await anon.waitForSelector('[data-testid=logo-controls]');
  await anon.waitForTimeout(250);
  const before = await anon.getAttribute('[data-testid=studio-card] .logo-plate-in', 'data-content');
  await anon.fill('[data-testid=logo-scale]', '0.6');
  await anon.waitForTimeout(150);
  const changed = await anon.getAttribute('[data-testid=studio-card] .logo-plate-in', 'data-content');
  ok('T07b el usuario puede cambiar el tamaño a mano', before !== changed);
  await anon.click('[data-testid=logo-plate-dark]');
  ok('T07c puede cambiar la base del logo', (await anon.getAttribute('[data-testid=studio-card] [data-testid=logo-plate]', 'data-plate')) === 'dark');
  await anon.click('[data-testid=logo-align-left]');
  await anon.click('[data-testid=logo-reset]');
  await anon.waitForTimeout(150);
  ok('T08 "Restaurar" devuelve el autoajuste', (await anon.getAttribute('[data-testid=studio-card] .logo-plate-in', 'data-content')) === before && (await anon.getAttribute('[data-testid=studio-card] [data-testid=logo-plate]', 'data-plate')) === 'light');

  // Quitar fondo (opcional y reversible) con el logo de fondo blanco
  await anon.setInputFiles('#st-logo', path.join(FIX, '3-vertical-fondo-blanco.jpg'));
  await anon.waitForSelector('[data-testid=logo-remove-bg]');
  const srcBefore = await anon.getAttribute('[data-testid=studio-card] [data-testid=logo-plate] img', 'src');
  await anon.click('[data-testid=logo-remove-bg]');
  await anon.waitForSelector('[data-testid=logo-restore-bg]');
  const srcAfter = await anon.getAttribute('[data-testid=studio-card] [data-testid=logo-plate] img', 'src');
  ok('T05a quitar el fondo es opcional y genera un PNG nuevo', srcAfter !== srcBefore && /^data:image\/png/.test(srcAfter));
  await anon.click('[data-testid=logo-restore-bg]');
  await anon.waitForSelector('[data-testid=logo-remove-bg]');
  ok('T05b es reversible: vuelve al original', (await anon.getAttribute('[data-testid=studio-card] [data-testid=logo-plate] img', 'src')) === srcBefore);

  // ---------- Acabados con el mismo logo ----------
  await anon.setInputFiles('#st-logo', path.join(FIX, files[0]));
  await anon.waitForSelector('[data-testid=finish-compare]');
  await anon.waitForTimeout(500);
  const cmp = await anon.$$eval('[data-testid=finish-compare] [data-testid=loyalty-card]', (els) => els.map((e) => ({ bg: getComputedStyle(e).backgroundImage.slice(0, 120), logo: !!e.querySelector('[data-testid=logo-plate] img') })));
  ok('T16a comparación en vivo: tres tarjetas con el mismo logo', cmp.length === 3 && cmp.every((c) => c.logo) && new Set(cmp.map((c) => c.bg)).size === 3);
  await shot(anon, 'estudio-comparacion-1360', true);
  await anon.click('[data-testid=compare-black]');
  ok('T15 Black Titanium se elige desde la comparación', (await anon.getAttribute('[data-testid=finish-black]', 'aria-checked')) === 'true');
  await anon.click('[data-testid=finish-silver]');
  ok('T13 Signature Silver es una opción del selector y queda activa', (await anon.getAttribute('[data-testid=finish-silver]', 'aria-checked')) === 'true' && /Signature Silver/.test(await anon.textContent('[data-testid=finish-silver]')));
  ok('T16b Signature Color usa la identidad del negocio', /Signature Color/.test(await anon.textContent('[data-testid=finish-signature]')));
  ok('antes/después visibles', await anon.isVisible('[data-testid=before-after]') && await anon.isVisible('[data-testid=after-card]'));

  // T19/T20: sellos y premio
  for (let i = 0; i < 12; i++) { if (await anon.isVisible('[data-testid=studio-redeem]')) break; await anon.click('[data-testid=studio-stamp]'); }
  ok('T19 los sellos se acumulan hasta el premio', await anon.isVisible('[data-testid=studio-redeem]'));
  await anon.click('[data-testid=studio-redeem]');
  ok('T20 canjear reinicia la tarjeta', await anon.isVisible('[data-testid=studio-stamp]'));

  // ---------- Demostración guiada ----------
  await anon.goto(BASE + '/');
  await anon.waitForSelector('[data-testid=guided-demo]');
  await anon.click('[data-testid=gd-sample-horizontal]');
  await anon.waitForSelector('[data-testid=gd-analysis]');
  await anon.waitForFunction(() => document.querySelector('[data-testid=gd-card] [data-testid=logo-plate] img'));
  ok('demo: el logo de ejemplo se autoajusta y se detectan colores', /horizontal/.test(await anon.textContent('[data-testid=gd-analysis]')) && !!(await anon.$('[data-testid=gd-swatches]')));
  await anon.click('[data-testid=gd-compare-toggle]');
  ok('demo: compara los tres acabados', (await anon.$$('[data-testid=gd-compare] [data-testid=loyalty-card]')).length === 3);
  await anon.setInputFiles('[data-testid=gd-file]', path.join(FIX, '2-cuadrado-transparente.png'));
  await anon.waitForTimeout(700);
  ok('demo: subir un logo propio funciona sin enviar nada al servidor', /cuadrado/.test(await anon.textContent('[data-testid=gd-analysis]')));
  await shot(anon, 'demo-guiada', false);

  // ---------- Movimiento: inclinación ligera, sombra dinámica, movimiento reducido ----------
  await anon.goto(BASE + '/');
  await anon.waitForSelector('[data-testid=hero-card] [data-testid=loyalty-card]');
  const box = await (await anon.$('[data-testid=hero-card] .card-stage')).boundingBox();
  await anon.mouse.move(box.x + box.width * 0.95, box.y + box.height * 0.05);
  await anon.waitForTimeout(250);
  const tilt = await anon.evaluate(() => { const s = document.querySelector('[data-testid=hero-card] .card-stage'); const g = (v) => parseFloat(s.style.getPropertyValue(v)); return { rx: g('--rx'), ry: g('--ry'), sx: g('--sx'), sy: g('--sy') }; });
  ok('T18a la inclinación es muy ligera (≤ 4° y ≤ 4°) y hay sombra dinámica', Math.abs(tilt.rx) <= 4 && Math.abs(tilt.ry) <= 4 && Math.abs(tilt.sx) > 0, JSON.stringify(tilt));
  const rm = await (await browser.newContext({ ...desktop, reducedMotion: 'reduce' })).newPage(); watch(rm, 'movimiento-reducido');
  await rm.goto(BASE + '/');
  await rm.waitForSelector('[data-testid=hero-card] [data-testid=loyalty-card]');
  const rb = await (await rm.$('[data-testid=hero-card] .card-stage')).boundingBox();
  await rm.mouse.move(rb.x + rb.width * 0.9, rb.y + rb.height * 0.1);
  await rm.waitForTimeout(250);
  const rmState = await rm.evaluate(() => ({ anim: getComputedStyle(document.querySelector('[data-testid=hero-card] .card-metal-shine')).animationName, rx: document.querySelector('[data-testid=hero-card] .card-stage').style.getPropertyValue('--rx') }));
  ok('T18b con movimiento reducido no hay animación ni inclinación', rmState.anim === 'none' && rmState.rx === '', JSON.stringify(rmState));

  // ---------- Responsive 320/375/390/768/1440 ----------
  for (const w of [320, 375, 390, 768, 1440]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 780 : 900 }, deviceScaleFactor: w < 500 ? 2 : 1, hasTouch: w < 800, isMobile: w < 500 });
    const p = await ctx.newPage(); watch(p, `w${w}`);
    await p.goto(BASE + '/');
    await p.waitForSelector('[data-testid=hero-card] [data-testid=loyalty-card]');
    await p.waitForTimeout(1600);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await shot(p, `landing-${w}`);
    await p.goto(BASE + '/personalizar'); await p.waitForSelector('[data-testid=public-studio]');
    await p.click('[role=tab]:has-text("Mi negocio")');
    await p.setInputFiles('#st-logo', path.join(FIX, files[0])); await p.waitForSelector('[data-testid=logo-controls]');
    await p.waitForFunction(() => { const i = document.querySelector('[data-testid=studio-card] [data-testid=logo-plate] img'); return i && i.complete && i.naturalWidth > 0; });
    const over2 = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const g = await logoGeometry(p, '[data-testid=studio-card]');
    ok(`T24 ${w}px: sin desbordamiento horizontal y logo íntegro`, over <= 1 && over2 <= 1 && g && g.inside && Math.abs(g.natural - g.rendered) < 0.02, `landing ${over}, estudio ${over2}`);
    await shot(p, `estudio-${w}`);
    await ctx.close();
  }

  ok('T26 sin errores de JavaScript ni de consola', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  const failed = results.filter((r) => !r[0]);
  console.log(`\n${results.length - failed.length}/${results.length} OK`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
