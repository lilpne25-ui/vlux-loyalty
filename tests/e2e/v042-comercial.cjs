// E2E V0.4.2 · Plataforma comercial: landing, identidad oficial, rutas heredadas, estudio público con datos temporales,
// demostración guiada y UN recorrido comercial completo (landing → personalizar → cliente → caja demo → sellos → premio → panel del dueño).
// Requiere DEMO_ACCESS=1 y el negocio sintético "vlux-demo" (npm run db:seed:demo).
// Uso: BASE=http://localhost:8788 node tests/e2e/v042-comercial.cjs   (BASE puede ser un Preview público)
const playwright = require('playwright');
const engine = playwright[process.env.BROWSER || 'chromium'];
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const BASE = process.env.BASE || 'http://localhost:8788';
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/40[1349]|410|429/.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const shot = async (page, name, full = false) => { await page.waitForTimeout(500); return page.screenshot({ path: path.join(OUT, `v042-${name}.png`), fullPage: full }); };

function makeLogo() {
  const file = path.join(require('node:os').tmpdir(), `logo-e2e42-${process.pid}.png`);
  const code = `import { renderIcon } from './server/pwa.ts'; import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(file)}, renderIcon({ size: 256, maskable: false, name: 'Barbería Don Beto', primary: '#0B3D2E', accent: '#E8B04B' }));`;
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { cwd: path.join(__dirname, '..', '..'), stdio: 'inherit' });
  return file;
}
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

(async () => {
  const logoFile = makeLogo();
  const browser = await engine.launch();
  const desktop = { viewport: { width: 1360, height: 900 } };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const anon = await (await browser.newContext(desktop)).newPage(); watch(anon, 'anónimo');

  // ---------- T01 · T02 · T03: la URL principal es VLUX Loyalty ----------
  const apiCalls = [];
  anon.on('request', (r) => { if (/\/api\//.test(r.url()) && r.method() !== 'GET') apiCalls.push(`${r.method()} ${r.url()}`); });
  await anon.goto(BASE + '/');
  await anon.waitForSelector('[data-testid=hero-title]');
  const body = await anon.textContent('body');
  ok('T01 la URL principal muestra VLUX Loyalty y su mensaje', /Clientes que regresan\./.test(body) && /Negocios que crecen\./.test(body) && /VLUX Loyalty/.test(body));
  ok('T01b no aparece Café Demo Toluca ni su enlace en la portada', !/Caf[eé] Demo Toluca|cafe-demo-toluca|Barber[ií]a Demo Metepec/i.test(body + (await anon.content())));
  const imgs = await anon.evaluate(() => [...document.querySelectorAll('img[src^="/brand/"]')].map((i) => ({ s: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0 })));
  ok('T02 los logos oficiales (PNG) cargan en la portada', imgs.length >= 3 && imgs.every((i) => i.ok) && imgs.some((i) => /logo-full/.test(i.s)) && imgs.some((i) => /isotipo/.test(i.s)) && imgs.some((i) => /wordmark/.test(i.s)), imgs.map((i) => i.s).join(','));
  ok('T02b ya no se sirven los JPG provisionales', !/^image\//.test((await anon.request.get(BASE + '/brand/vlux-isotipo-dark.jpg')).headers()['content-type'] || ''));
  const heroOk = await anon.evaluate(() => !!document.querySelector('[data-testid=hero-card] .card-metal'));
  ok('T03a la tarjeta metálica del hero está viva (no es imagen estática)', heroOk);
  await shot(anon, 'landing-hero');
  await anon.click('nav >> text=Cómo funciona');
  await anon.waitForTimeout(900);
  ok('T03b la navegación lleva a «Cómo funciona»', await anon.evaluate(() => { const r = document.getElementById('como-funciona').getBoundingClientRect(); return r.top < 300 && r.bottom > 100; }));
  const fin = await anon.evaluate(() => ['signature', 'silver', 'black'].map((f) => !!document.querySelector(`[data-testid=finish-card-${f}] .card-metal`)));
  ok('T03c los tres acabados (Signature, Silver, Black) usan la tarjeta real', fin.every(Boolean));
  await anon.evaluate(() => document.querySelectorAll('.lp-reveal').forEach((e) => e.classList.add('in')));
  await shot(anon, 'landing-completa', true);

  // ---------- T18 · rutas heredadas ----------
  const legacy = await (await browser.newContext(desktop)).newPage(); watch(legacy, 'heredada');
  await legacy.goto(BASE + '/n/cafe-demo-toluca');
  await legacy.waitForSelector('[data-testid=hero-title]');
  ok('T18 /n/cafe-demo-toluca redirige a la portada con aviso, sin error ni datos del café', new URL(legacy.url()).pathname === '/' && /ya no está disponible/.test(await legacy.textContent('body')) && !/Caf[eé] Demo Toluca/.test(await legacy.textContent('body')));
  const prefetch = await anon.request.get(BASE + '/api/public/businesses/cafe-demo-toluca');
  ok('T18b la API heredada responde de forma controlada (200 o 404 sin filtrar secretos)', [200, 404].includes(prefetch.status()) && !/password|token|hash/i.test(await prefetch.text()));

  // ---------- T08 · T09 · T10 · T11: Estudio público ----------
  await anon.click('[data-testid=cta-personalizar]').catch(async () => { await anon.goto(BASE + '/personalizar'); });
  await anon.waitForSelector('[data-testid=public-studio]');
  ok('T08a el estudio público abre desde la portada, sin sesión', new URL(anon.url()).pathname === '/personalizar');
  ok('T08b arranca con un caso neutro (VLUX Demo), no con un café', /VLUX Demo/.test(await anon.textContent('[data-testid=studio-card]')) && !/Caf[eé]/.test(await anon.textContent('[data-testid=studio-card]')));
  await anon.click('[role=tab]:has-text("Mi negocio")');
  await anon.fill('#st-name', 'Barbería Don Beto');
  await anon.setInputFiles('#st-logo', logoFile);
  await anon.waitForSelector('text=Detectamos sus colores');
  const primary = (await anon.inputValue('#st-primary')).toUpperCase();
  const accent = (await anon.inputValue('#st-accent')).toUpperCase();
  ok('T09 los colores se extraen del logo (verde bosque y dorado)', dist(hexToRgb(primary), hexToRgb('#0B3D2E')) < 60 && dist(hexToRgb(accent), hexToRgb('#E8B04B')) < 80, `${primary} ${accent}`);
  await anon.click('[data-testid=finish-silver]');
  const bg = await anon.evaluate(() => getComputedStyle(document.querySelector('[data-testid=studio-card] > div')).getPropertyValue('--brand').trim());
  ok('T10 la tarjeta se actualiza con el logo, el nombre y el acabado', (await anon.textContent('[data-testid=studio-card]')).includes('Barbería Don Beto') && !!(await anon.$('[data-testid=studio-card] img')) && bg.length > 0);
  const sBefore = await anon.textContent('[data-testid=studio-card] [data-testid=loyalty-card]');
  for (let i = 0; i < 12; i++) { if (await anon.isVisible('[data-testid=studio-redeem]')) break; await anon.click('[data-testid=studio-stamp]'); }
  ok('T11a en el estudio los sellos se acumulan hasta el premio', await anon.isVisible('[data-testid=studio-redeem]'));
  await shot(anon, 'estudio-publico-premio');
  await anon.click('[data-testid=studio-redeem]');
  ok('T11b canjear reinicia la tarjeta', await anon.isVisible('[data-testid=studio-stamp]'));
  ok('T15a el estudio no hizo ninguna escritura al servidor (datos temporales)', apiCalls.length === 0, apiCalls.join(' | '));
  // Abusos conocidos: archivo que no es imagen y archivo enorme → mensaje claro, sin colgarse
  fs.writeFileSync('/tmp/no-es-imagen.png', Buffer.from('esto no es una imagen'));
  await anon.setInputFiles('#st-logo', { name: 'x.png', mimeType: 'image/png', buffer: fs.readFileSync('/tmp/no-es-imagen.png') });
  await anon.waitForSelector('[role=alert]');
  ok('T15b un archivo falso con extensión .png se rechaza con mensaje', /No se pudo leer/.test(await anon.textContent('[role=alert]')));
  await anon.setInputFiles('#st-logo', { name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) });
  await anon.waitForSelector('[role=alert]:has-text("5 MB")');
  ok('T15c un archivo de 6 MB se rechaza antes de procesarlo', true);
  await anon.setInputFiles('#st-logo', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await anon.waitForSelector('[role=alert]:has-text("PNG, JPG o WebP")');
  ok('T15d un SVG se rechaza (solo PNG, JPG o WebP)', true);

  // ---------- Demostración guiada (historia en 5 pasos) ----------
  await anon.goto(BASE + '/');
  await anon.waitForSelector('[data-testid=guided-demo]');
  await anon.fill('[data-testid=gd-name]', 'Mi Marca');
  await anon.click('[data-testid=gd-finish-black]');
  await anon.click('[data-testid=gd-next]');
  await anon.click('[data-testid=gd-create-card]');
  await anon.click('[data-testid=gd-next]');
  for (let i = 0; i < 3; i++) await anon.click('[data-testid=gd-stamp]');
  await anon.click('[data-testid=gd-step-premio]');
  await anon.click('[data-testid=gd-fill]');
  await anon.click('[data-testid=gd-redeem]');
  await anon.click('[data-testid=gd-step-panel]');
  const kp = async (k) => Number((await anon.textContent(`[data-testid=gd-kpi-${k}]`)).trim());
  ok('G1 la demostración guiada refleja clientes, visitas y premios del recorrido', (await kp('clientes')) === 1 && (await kp('visitas')) === 5 && (await kp('premios')) === 1 && (await kp('sellos')) === 0, `${await kp('clientes')}/${await kp('visitas')}/${await kp('premios')}`);
  await shot(anon, 'demo-guiada-panel');

  // ---------- T16 · T04 · T05 · T06 · T11 · T12: recorrido comercial completo con negocio sintético ----------
  const st = await (await anon.request.get(BASE + '/api/public/demo')).json();
  ok('T04a el acceso de demostración está activo en este entorno y apunta a un negocio sintético', st.enabled === true && typeof st.slug === 'string', JSON.stringify(st));
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');
  await cust.goto(BASE + '/');
  await cust.waitForSelector('[data-testid=exp-cliente]');
  await cust.click('[data-testid=exp-cliente]');
  await cust.waitForURL('**/n/' + st.slug);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Cliente Sintético E2E');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  ok('T04b el cliente obtiene su tarjeta sin cuenta de Vercel ni credenciales', /^[A-Z0-9-]{6,}$/i.test(code), code);
  await shot(cust, 'cliente-tarjeta');

  const cashier = await (await browser.newContext(desktop)).newPage(); watch(cashier, 'caja');
  await cashier.goto(BASE + '/');
  await cashier.waitForSelector('[data-testid=exp-caja]');
  await cashier.click('[data-testid=exp-caja]');
  await cashier.waitForURL('**/caja');
  await cashier.click('button:has-text("Escribir")');
  await cashier.fill('#manual-id', code);

  await cashier.click('button:has-text("Buscar tarjeta")');
  await cashier.waitForSelector('[data-testid=card-panel]');
  await cashier.click('button:has-text("Registrar compra")');
  await cashier.waitForSelector('[data-testid=staff-stamp-count]');
  await cashier.waitForFunction(() => /^1\s*\//.test(document.querySelector('[data-testid=staff-stamp-count]').textContent.trim()));
  ok('T06 la caja de demostración usa la autenticación propia (cookie HttpOnly) y registra el sello', /1\s*\/\s*\d+/.test((await cashier.textContent('[data-testid=staff-stamp-count]')).trim()));
  const sess = await (await cashier.request.get(BASE + '/api/staff/me')).json();
  ok('T06b la sesión es de demostración y de caja', sess.session?.demo === true && sess.session?.role === 'EMPLOYEE');
  const cookies = await cashier.context().cookies();
  ok('T06c la cookie de sesión es HttpOnly', cookies.some((c) => c.name === 'vlx_staff' && c.httpOnly));
  const blocked = await cashier.request.post(BASE + '/api/staff/password', { data: { currentPassword: 'x', newPassword: 'y'.repeat(14) }, headers: { 'content-type': 'application/json' } });
  ok('T06d la sesión de demostración no puede cambiar contraseñas', blocked.status() === 403);
  await shot(cashier, 'caja-demo');

  const owner = await (await browser.newContext(desktop)).newPage(); watch(owner, 'dueño');
  await owner.goto(BASE + '/');
  await owner.waitForSelector('[data-testid=exp-dueno]');
  await owner.click('[data-testid=exp-dueno]');
  await owner.waitForURL('**/panel');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]');
  const purchases = Number((await owner.textContent('[data-testid=kpi-purchases-value]')).trim());
  ok('T05 el dueño de demostración entra con la autenticación propia de VLUX Loyalty', (await (await owner.request.get(BASE + '/api/staff/me')).json()).session?.role === 'OWNER');
  ok('T12 el panel del dueño refleja la compra registrada en caja', purchases >= 1, String(purchases));
  const wr = await owner.request.put(BASE + '/api/owner/program', { data: { name: 'Hack' }, headers: { 'content-type': 'application/json' } });
  ok('T05b el dueño de demostración no puede modificar el negocio', wr.status() === 403);
  await shot(owner, 'panel-demo');
  ok('T16 recorrido comercial completo: landing → cliente → caja → sellos → panel del dueño', true);

  // ---------- T07 · T19: lo que el sitio público no expone ----------
  for (const p of ['/api/admin/overview', '/api/admin/auth/login']) {
    const r = await anon.request.get(BASE + p);
    ok(`T19 ${p} no está expuesto sin sesión`, [401, 404, 405].includes(r.status()), String(r.status()));
  }
  const html = await (await anon.request.get(BASE + '/')).text();
  ok('T19b la portada no incluye credenciales ni contraseñas de demostración', !/password|contrase[ñn]a-|PLATFORM_ADMIN|ADMIN_SECRETS/i.test(html));

  // ---------- T13 · PWA con origen correcto ----------
  const man = await (await anon.request.get(BASE + `/api/pwa/${st.slug}/staff/caja/manifest.webmanifest`)).json();
  ok('T13 el manifest de la caja conserva su ruta propia (start_url /caja) y su ámbito', /\/caja/.test(man.start_url) && !!man.scope, `${man.start_url} ${man.scope}`);

  // ---------- móvil: portada sin desbordes ----------
  const m = await (await browser.newContext(mobile)).newPage(); watch(m, 'móvil');
  await m.goto(BASE + '/');
  await m.waitForSelector('[data-testid=hero-title]');
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('M1 la portada no desborda horizontalmente en un teléfono (390 px)', overflow <= 1, String(overflow));
  await shot(m, 'landing-movil');
  ok('Z sin errores de consola ni excepciones', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();
  const failed = results.filter(([c]) => !c);
  console.log(`\nTotal ${results.length} · FAIL ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
