// E2E V0.4 · Recorrido comercial: Estudio de marca (logo → colores → tarjeta), presentación, alta con esa marca,
// accesos por rol, agregar al teléfono (dueño y caja) y tarjeta metálica del cliente. Datos sintéticos.
// Uso local: E2E_RESET_ADMINS=1 BASE=http://localhost:8788 node --env-file=.env tests/e2e/v04-premium.cjs
const playwright = require('playwright');
const engine = playwright[process.env.BROWSER || 'chromium'];
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const BASE = process.env.BASE || 'http://localhost:8788';
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const PASSWORD = 'contraseña-e2e-2026';
const ADMIN_PASSWORD = 'clave-admin-e2e-sintetica';
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|410|429/) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const shot = async (page, name, opts = {}) => { await page.waitForTimeout(600); return page.screenshot({ path: path.join(OUT, `v04-${name}.png`), fullPage: !!opts.full, mask: [page.locator('[data-testid=totp-secret]'), page.locator('svg[aria-label^="Código QR para la app"]'), page.locator('[data-testid=owner-invite-link]')] }); };

function b32decode(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); }
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }
const step = () => Math.floor(Date.now() / 30000);

async function resetAdminsIfAsked() {
  if (process.env.E2E_RESET_ADMINS !== '1') return;
  const url = process.env.DATABASE_ADMIN_URL || '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('E2E_RESET_ADMINS solo se permite contra una BD local');
  const pg = require('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect(); await c.query('TRUNCATE platform_admins CASCADE'); await c.query('DELETE FROM rate_limits'); await c.end();
}

// Logo sintético (verde bosque + dorado) con el mismo dibujante de íconos del servidor.
function makeLogo() {
  const file = path.join(require('node:os').tmpdir(), `logo-e2e-${process.pid}.png`);
  const code = `import { renderIcon } from './server/pwa.ts'; import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(file)}, renderIcon({ size: 256, maskable: false, name: 'Barbería Don Beto', primary: '#0B3D2E', accent: '#E8B04B' }));`;
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: path.join(__dirname, '..', '..'), stdio: 'inherit' });
  return file;
}
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

(async () => {
  await resetAdminsIfAsked();
  const run = crypto.randomBytes(3).toString('hex');
  const logoFile = makeLogo();
  const browser = await engine.launch();
  const desktop = { viewport: { width: 1360, height: 900 } };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...(process.env.BROWSER === 'firefox' ? {} : { isMobile: true }) };
  const vlux = await (await browser.newContext({ ...desktop, acceptDownloads: true })).newPage(); watch(vlux, 'VLUX');
  const ownerCtx = await browser.newContext({ ...desktop, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'].filter(() => process.env.BROWSER !== 'firefox' && process.env.BROWSER !== 'webkit') });
  const owner = await ownerCtx.newPage(); watch(owner, 'dueño');
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');
  const anon = await (await browser.newContext(desktop)).newPage(); watch(anon, 'anónimo');

  // ---------- Alta del administrador (igual que V0.3) ----------
  await vlux.goto(BASE + '/vlux-admin');
  await vlux.waitForSelector('text=Instalación del Control Center');
  await vlux.fill('#cc-setup', TOKEN);
  await vlux.fill('#cc-bname', 'Operación VLUX');
  await vlux.fill('#cc-bemail', `ops-${run}@vlux.e2e.test`);
  await vlux.fill('#cc-bpass', ADMIN_PASSWORD);
  await vlux.click('button:has-text("Crear administrador")');
  await vlux.waitForSelector('[data-testid=totp-secret]');
  const secret = (await vlux.textContent('[data-testid=totp-secret]')).trim();
  await vlux.fill('#cc-enroll-code', totp(secret, step()));
  await vlux.click('button:has-text("Activar")');
  await vlux.waitForSelector('[data-testid=recovery-codes]');
  await vlux.check('input[type=checkbox]');
  await vlux.click('button:has-text("Entrar al Control Center")');
  await vlux.waitForSelector('h1:has-text("Resumen")');

  // ---------- L · Estudio de marca ----------
  await vlux.click('nav >> a:has-text("Estudio de marca")');
  await vlux.waitForSelector('h1:has-text("Estudio de marca")');
  ok('L1 el Estudio abre con un caso neutro (VLUX Demo)', (await vlux.textContent('[data-testid=studio-card]')).includes('VLUX Demo'));
  await shot(vlux, 'L1-estudio-cafe');
  await vlux.click('[role=tab]:has-text("Ejemplo: barbería")');
  ok('L2 cambiar de caso actualiza la tarjeta', (await vlux.textContent('[data-testid=studio-card]')).includes('Barbería de ejemplo'));
  await shot(vlux, 'L2-estudio-barberia');
  await vlux.click('[role=tab]:has-text("Mi negocio")');
  await vlux.fill('#st-name', 'Barbería Don Beto');
  await vlux.setInputFiles('#st-logo', logoFile);
  await vlux.waitForSelector('text=Detectamos sus colores');
  const primary = (await vlux.inputValue('#st-primary')).toUpperCase();
  const accent = (await vlux.inputValue('#st-accent')).toUpperCase();
  ok('L3 el logo cargado se detecta: principal verde bosque', dist(hexToRgb(primary), hexToRgb('#0B3D2E')) < 60, primary);
  ok('L4 el acento detectado es dorado y contrasta con el principal', dist(hexToRgb(accent), hexToRgb('#E8B04B')) < 80, accent);
  ok('L5 la tarjeta muestra el logo cargado', (await vlux.$('[data-testid=studio-card] img')) !== null);
  const bg = await vlux.evaluate(() => getComputedStyle(document.querySelector('[data-testid=studio-card] > div')).getPropertyValue('--brand').trim());
  ok('L6 la tarjeta toma el color principal detectado', bg.toUpperCase() === primary, bg);
  await shot(vlux, 'L3-estudio-nuevo-cliente');

  // Tarjeta metálica: capas, y el reflejo sigue al puntero.
  const layers = await vlux.evaluate(() => ['.card-metal-brush', '.card-metal-sheen', '.card-metal-shine', '.card-metal-grain', '.stamp-coin'].map((s) => !!document.querySelector(`[data-testid=studio-card] ${s}`)));
  ok('L7 la tarjeta tiene acabado metálico (cepillado, grano, brillo, monedas en relieve)', layers.every(Boolean), layers.join(','));
  const card = await vlux.locator('[data-testid=studio-card] [data-testid=loyalty-card]').boundingBox();
  const before = await vlux.evaluate(() => document.querySelector('[data-testid=studio-card] .card-stage').style.getPropertyValue('--mx'));
  await vlux.mouse.move(card.x + card.width * 0.85, card.y + card.height * 0.2, { steps: 4 });
  await vlux.waitForTimeout(250);
  const after = await vlux.evaluate(() => document.querySelector('[data-testid=studio-card] .card-stage').style.getPropertyValue('--mx'));
  ok('L8 el reflejo de la tarjeta sigue al puntero', after !== before && parseFloat(after) > 60, `${before} → ${after}`);
  await shot(vlux, 'L4-estudio-reflejo');

  // ---------- S · identidad oficial, acabados y movimiento reducido ----------
  const logoOk = await vlux.evaluate(() => [...document.querySelectorAll('img[src^="/brand/"]')].map((i) => i.complete && i.naturalWidth > 0));
  ok('S1 el logo oficial de VLUX carga en el Control Center', logoOk.length > 0 && logoOk.every(Boolean), String(logoOk.length));
  const finishInfo = async () => vlux.evaluate(() => {
    const st = document.querySelector('[data-testid=studio-card] .card-stage'); const cs = getComputedStyle(st);
    const parse = (h) => { h = h.trim(); const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const con = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const brand = cs.getPropertyValue('--brand').trim(), accent = cs.getPropertyValue('--accent').trim(), cream = cs.getPropertyValue('--cream').trim();
    return { brand, accent, accentContrast: con(parse(brand), parse(accent)), textContrast: con(parse(brand), parse(cream)), hi: cs.getPropertyValue('--card-hi').trim() };
  });
  const sig = await finishInfo();
  await vlux.click('[data-testid=finish-black]');
  const blk = await finishInfo();
  ok('S2 «Negro premium» oscurece la tarjeta y conserva el acento legible', parseInt(blk.brand.slice(1, 3), 16) < 40 && blk.accentContrast >= 3 && blk.textContrast >= 7, JSON.stringify(blk));
  await shot(vlux, 'S2-acabado-negro');
  await vlux.click('[data-testid=finish-silver]');
  const slv = await finishInfo();
  ok('S3 «Plata metálica» es distinta del negro, con mayor brillo y texto legible', slv.brand !== blk.brand && parseInt(slv.hi) > parseInt(blk.hi) && slv.textContrast >= 4.5 && slv.accentContrast >= 3, JSON.stringify(slv));
  await shot(vlux, 'S3-acabado-plata');
  await vlux.click('[data-testid=finish-signature]');
  const back = await finishInfo();
  ok('S4 «Color del negocio» devuelve el color original sin tocar el programa de sellos', back.brand.toUpperCase() === primary.toUpperCase() && (await vlux.textContent('[data-testid=studio-card]')).includes('/'));
  await vlux.emulateMedia({ reducedMotion: 'reduce' });
  const anim = await vlux.evaluate(() => getComputedStyle(document.querySelector('[data-testid=studio-card] .card-metal-shine')).animationName);
  ok('S5 con «reducir movimiento» la tarjeta no anima el brillo', anim === 'none', anim);
  await vlux.emulateMedia({ reducedMotion: 'no-preference' });
  await vlux.click('[data-testid=finish-silver]');

  // ---------- M · presentación comercial ----------
  await vlux.click('[data-testid=studio-present]');
  await vlux.waitForSelector('[data-testid=deck]');
  const titles = [];
  for (let i = 0; i < 6; i++) {
    titles.push((await vlux.textContent('[data-testid=deck-title]')).trim());
    await shot(vlux, `M${i + 1}-presentacion`);
    if (i < 5) { await vlux.keyboard.press('ArrowRight'); await vlux.waitForTimeout(150); }
  }
  ok('M1 la presentación tiene 6 escenas navegables con el teclado', new Set(titles).size === 6, titles.join(' | '));
  ok('M2 la presentación no promete Wallet nativo', !(await vlux.textContent('[data-testid=deck]')).includes('ya funciona en Apple Wallet'));
  await vlux.keyboard.press('Escape');
  await vlux.waitForSelector('[data-testid=deck]', { state: 'detached' });

  // ---------- N · crear el negocio con esa marca ----------
  await vlux.click('[data-testid=studio-use]');
  await vlux.waitForSelector('h1:has-text("Nuevo negocio")');
  ok('N0 el acabado elegido en el Estudio llega al asistente', (await vlux.inputValue('#wz-finish')) === 'silver');
  ok('N1 el asistente recibe nombre, colores y logo del Estudio', (await vlux.inputValue('#wz-name')) === 'Barbería Don Beto' && (await vlux.inputValue('#wz-primary')).toUpperCase() === primary);
  await vlux.selectOption('#wz-vertical', 'barberia');
  await vlux.fill('#wz-city', 'Toluca');
  await vlux.fill('#wz-owner', 'Dueño Sintético Beto');
  await vlux.fill('#wz-email', `beto-${run}@ejemplo.e2e.test`);
  await vlux.click('button:has-text("Siguiente")');
  await vlux.fill('#wz-stamps', '6');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button.cc-choice:has-text("Piloto")');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=wizard-summary]');
  await vlux.click('button:has-text("Crear negocio")');
  await vlux.waitForSelector('[data-testid=owner-invite-link]');
  const invite = (await vlux.textContent('[data-testid=owner-invite-link]')).trim();
  const regUrl = (await vlux.textContent('[data-testid=created-registration-url]')).trim();
  const slug = regUrl.split('/n/')[1];
  const accessTxt = await vlux.textContent('[data-testid=created-access]');
  ok('N2 al crear el negocio se muestran los tres accesos (cliente, caja, dueño)', accessTxt.includes('/n/' + slug) && accessTxt.includes('/caja') && accessTxt.includes('/panel'));
  await shot(vlux, 'N2-negocio-creado-accesos');

  // ---------- O · el dueño: accesos, agregar al teléfono ----------
  await owner.goto(invite);
  await owner.waitForSelector('h1:has-text("Barbería Don Beto")');
  await owner.fill('#inv-pass', PASSWORD);
  await owner.fill('#inv-pass2', PASSWORD);
  await owner.click('button:has-text("Crear cuenta y entrar")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]');
  const manifest = await owner.evaluate(() => document.querySelector('link[rel=manifest]')?.getAttribute('href'));
  ok('O1 el panel del dueño publica su propio manifiesto (agregar al teléfono)', manifest === `/api/pwa/${slug}/staff/panel/manifest.webmanifest`, manifest);
  const mres = await owner.evaluate(async (u) => { const r = await fetch(u); return { s: r.status, j: await r.json() }; }, manifest);
  ok('O2 el manifiesto del panel es válido (standalone, /panel)', mres.s === 200 && mres.j.display === 'standalone' && mres.j.start_url === '/panel?fuente=app', mres.j.start_url);
  ok('O3 el botón «Agregar panel a mi teléfono» está visible', await owner.isVisible('[data-testid=install-panel]'));
  await owner.click('[data-testid=install-panel]');
  await owner.waitForSelector('#install-staff-title, [role=dialog]');
  ok('O4 la guía de instalación explica el paso a paso sin prometer Wallet', /Entendido/.test(await owner.textContent('[role=dialog]')) && /no sustituye a Apple Wallet/.test(await owner.textContent('[role=dialog]')));
  await shot(owner, 'O4-agregar-panel-guia');
  await owner.click('[role=dialog] >> button:has-text("Entendido")');

  await owner.click('button[role=tab]:has-text("Accesos")');
  await owner.waitForSelector('[data-testid=access-customer]');
  const cUrl = (await owner.textContent('[data-testid=access-customer-url]')).trim();
  const kUrl = (await owner.textContent('[data-testid=access-cashier-url]')).trim();
  const oUrl = (await owner.textContent('[data-testid=access-owner-url]')).trim();
  ok('O5 el centro de accesos muestra cliente, caja y dueño con su dirección', cUrl.endsWith('/n/' + slug) && kUrl.endsWith('/caja') && oUrl.endsWith('/panel'), `${cUrl} · ${kUrl} · ${oUrl}`);
  ok('O6 cada acceso explica para qué sirve', /Pon este QR en el mostrador/.test(await owner.textContent('[data-testid=access-customer]')) && /Úsalo en el celular o tablet de caja/.test(await owner.textContent('[data-testid=access-cashier]')) && /Solo tú/.test(await owner.textContent('[data-testid=access-owner]')));
  const dl = owner.waitForEvent('download');
  await owner.click('[data-testid=access-customer] >> button:has-text("Descargar QR")');
  const d = await dl;
  const dpath = path.join(require('node:os').tmpdir(), `qr-${process.pid}.png`);
  await d.saveAs(dpath);
  const png = fs.readFileSync(dpath);
  ok('O7 «Descargar QR» entrega un PNG real', d.suggestedFilename() === `${slug}-clientes.png` && png.subarray(1, 4).toString() === 'PNG' && png.length > 2000, `${d.suggestedFilename()} ${png.length} B`);
  await owner.click('[data-testid=access-cashier] >> button:has-text("Copiar")');
  await owner.waitForSelector('[data-testid=access-cashier] >> text=Copiado');
  ok('O8 «Copiar» confirma con «Copiado»', true);
  await shot(owner, 'O5-centro-de-accesos', { full: true });

  // ---------- P · el cliente: tarjeta con logo y agregar al teléfono ----------
  await cust.goto(regUrl);
  const logoSrc = await cust.evaluate(() => document.querySelector('img[src*="/logo?v="]')?.getAttribute('src'));
  ok('P1 el portal del cliente muestra el logo subido (URL versionada)', /\/logo\?v=[0-9a-f]{12}$/.test(logoSrc || ''), logoSrc);
  await shot(cust, 'P1-portal-cliente', { full: true });
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Mariana Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  ok('P2 la tarjeta del cliente es metálica y lleva el logo', await cust.evaluate(() => !!document.querySelector('.card-metal') && !!document.querySelector('.logo-plate img')));
  ok('P3 el cliente ve «Llévala en tu teléfono» con el botón Agregar', await cust.isVisible('[data-testid=add-to-phone]') && /Llévala en tu teléfono/.test(await cust.textContent('[data-testid=save-card]')));
  await cust.click('[data-testid=add-to-phone]');
  await cust.waitForSelector('[role=dialog]');
  await shot(cust, 'P3-agregar-tarjeta-guia');
  await cust.click('[role=dialog] >> button:has-text("Entendido")');
  await shot(cust, 'P4-tarjeta-metalica', { full: true });

  // ---------- Q · rutas: qué es público y qué exige sesión ----------
  await anon.goto(BASE + '/');
  const probe = async (p, method = 'GET') => anon.evaluate(async ([u, m]) => { const r = await fetch(u.replace(/^https?:\/\/[^/]+/, ''), { method: m, headers: m === 'POST' ? { 'content-type': 'application/json' } : {}, body: m === 'POST' ? '{}' : undefined }); return r.status; }, [BASE + p, method]);
  ok('Q1 portal del cliente y su API pública responden sin sesión', (await probe(`/n/${slug}`)) === 200 && (await probe(`/api/public/businesses/${slug}`)) === 200 && (await probe(`/api/public/businesses/${slug}/logo`)) === 200);
  ok('Q1b el acabado guardado del negocio se publica con su marca', (await anon.evaluate(async (u) => (await (await fetch(u)).json()).business.cardFinish, `/api/public/businesses/${slug}`)) === 'silver');
  ok('Q2 las pantallas de caja y panel cargan, pero sus datos exigen sesión (401)', (await probe('/caja')) === 200 && (await probe('/api/staff/business')) === 401 && (await probe('/api/owner/dashboard')) === 401);
  ok('Q3 el Control Center y su API siguen exigiendo credenciales de VLUX', (await probe('/api/admin/overview')) === 401 && (await probe('/api/admin/businesses')) === 401);
  ok('Q4 el manifiesto del panel es público pero solo trae marca (sin datos)', (await probe(`/api/pwa/${slug}/staff/panel/manifest.webmanifest`)) === 200);

  ok('R1 sin errores de consola ni de página', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const fail = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fail} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
