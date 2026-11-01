// Átomos 06, 07 y 10: recorrido comercial completo con TRES contextos de navegador independientes
// (cookies y almacenamiento separados, como tres teléfonos/computadoras distintos), contra el servidor real
// y PostgreSQL. El empleado identifica la tarjeta con la CÁMARA (video falso de Chromium con el QR real).
// Uso: BASE=http://localhost:8787 PLATFORM_ADMIN_TOKEN=... node tests/e2e/v02-tres-dispositivos.cjs
const { chromium } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const BASE = process.env.BASE || 'http://localhost:8787';
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const PASSWORD = 'e2e-' + crypto.randomBytes(8).toString('hex');
const results = [];
const ok = (name, cond, info = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' · ' + info : ''}`); if (!cond) console.error('FAIL', name, info); };
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true });

async function platformBusiness(slug, name, vertical, stamps, reward) {
  const r = await fetch(BASE + '/api/platform/businesses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ slug, name, city: 'Toluca, Estado de México', vertical, reviewUrl: 'https://g.page/r/ejemplo-sintetico/review',
      rules: { stampsRequired: stamps, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: reward },
      owner: { email: `dueno@${slug}.e2e.test`, displayName: 'Dueña E2E', password: PASSWORD } }),
  });
  return { status: r.status, body: await r.json() };
}

async function login(page, email) {
  await page.goto(BASE + '/acceso');
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  await page.click('button:has-text("Entrar")');
}

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

(async () => {
  const run = crypto.randomBytes(3).toString('hex');
  const slug = `cafe-e2e-${run}`;
  const errors = [];

  // 1. Alta del negocio (equipo VLUX)
  const biz = await platformBusiness(slug, 'Café E2E Toluca', 'cafeteria', 8, 'Una bebida de cortesía');
  ok('01 alta del negocio', biz.status === 201, slug);
  const other = await platformBusiness(`barberia-e2e-${run}`, 'Barbería E2E Metepec', 'barberia', 6, 'Un corte de cortesía');
  ok('01b alta de un segundo negocio (aislamiento)', other.status === 201);

  const browser = await chromium.launch();
  const watch = (p, who) => { p.on('pageerror', (e) => errors.push(`${who}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|Failed to load resource.*40[1349]/.test(m.text())) errors.push(`${who}: ${m.text()}`); }); };

  // DISPOSITIVO 3: dueño en computadora
  const ownerCtx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const owner = await ownerCtx.newPage(); watch(owner, 'dueño');
  await login(owner, `dueno@${slug}.e2e.test`);
  await owner.waitForSelector('text=Panel del negocio');
  // 2. Alta de empleado desde el panel
  await owner.click('[role=tab]:has-text("Equipo")');
  await owner.fill('#emp-name', 'Barista E2E');
  await owner.fill('#emp-email', `caja@${slug}.e2e.test`);
  await owner.getByRole('tab', { name: 'Contraseña temporal' }).click(); // V0.3: por omisión se invita por enlace
  await owner.fill('#emp-pass', PASSWORD);
  await owner.click('button:has-text("Agregar")');
  await owner.waitForSelector(`text=caja@${slug}.e2e.test`);
  ok('02 alta de empleado desde el panel del dueño', true);
  await shot(owner, 'v02-03-dueno-equipo');

  // DISPOSITIVO 1: cliente en su teléfono, llega por el QR del mostrador
  const custCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const cust = await custCtx.newPage(); watch(cust, 'cliente');
  await owner.click('[role=tab]:has-text("Accesos")');
  const counterUrl = (await owner.locator('p.font-mono').first().textContent()).trim();
  ok('05a QR del mostrador apunta a la URL pública de registro', counterUrl === `${BASE}/n/${slug}`, counterUrl);
  await shot(owner, 'v02-04-qr-mostrador');
  await cust.goto(counterUrl);
  await cust.waitForSelector('text=Tu café favorito ahora tiene recompensas.');
  await shot(cust, 'v02-01-cliente-bienvenida');
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Mariana Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  const personalLink = (await cust.textContent('[data-testid=personal-link]')).trim();
  ok('03 registro de cliente', /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code), code);
  ok('04 tarjeta web creada (0 de 8)', /0 de 8 sellos/.test(await cust.textContent('[data-testid=stamp-count]')));
  await cust.waitForSelector('text=/Tarjeta creada: /', { state: 'detached', timeout: 8000 });
  const qrSvg = cust.locator('svg[aria-label^="Código QR de la tarjeta"]');
  await qrSvg.screenshot({ path: path.join(OUT, 'qr-tarjeta.png') });
  ok('05b QR de la tarjeta sin datos personales', !(await qrSvg.getAttribute('aria-label')).includes('Mariana'));
  await shot(cust, 'v02-02-cliente-tarjeta');
  ok('13a móvil sin scroll horizontal (cliente)', (await noHorizontalScroll(cust)) <= 0);

  // Video falso de cámara con el QR real de la tarjeta (para la prueba de cámara en vivo).
  const y4m = path.join(OUT, '..', 'qr-tarjeta.y4m');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', path.join(OUT, 'qr-tarjeta.png'), '-vf', 'scale=360:360,pad=640:480:140:60:white,format=yuv420p', '-t', '2', '-r', '10', y4m]);

  // DISPOSITIVO 2: empleado en OTRO teléfono, con cámara
  const camBrowser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
  const empCtx = await camBrowser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, permissions: ['camera'] });
  const emp = await empCtx.newPage(); watch(emp, 'empleado');
  await login(emp, `caja@${slug}.e2e.test`);
  // V0.2.1: la contraseña que puso el dueño es temporal; el empleado elige la suya al entrar.
  await emp.waitForSelector('text=Cambia tu contraseña temporal');
  await emp.fill('#pwd-current', PASSWORD);
  await emp.fill('#pwd-new', PASSWORD + '-propia');
  await emp.fill('#pwd-repeat', PASSWORD + '-propia');
  await emp.click('button:has-text("Cambiar contraseña")');
  await emp.waitForSelector('text=Panel del empleado');
  ok('02b empleado cambia su contraseña temporal al primer acceso', true);
  ok('14a empleado entra directo a caja (sin panel del dueño en el menú)', (await emp.locator('nav >> text=Panel').count()) === 0);
  await emp.click('button:has-text("Escanear con cámara")');
  await emp.waitForSelector('[data-testid=card-panel]', { timeout: 15000 });
  ok('07 empleado identifica la tarjeta con la cámara en vivo', (await emp.textContent('[data-testid=card-panel] h2')).includes('Mariana Sintética'));
  await shot(emp, 'v02-05-empleado-tarjeta');

  // 6–7. Compra y sello autorizado por el servidor
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count]:has-text("1")');
  ok('06 compra registrada y sello asignado', true);

  // 8. Sincronización: el teléfono del cliente se actualiza solo (consulta periódica)
  const t0 = Date.now();
  await cust.waitForSelector('[data-testid=stamp-count]:has-text("1 de 8")', { timeout: 12000 });
  ok('08 sincronización: el cliente ve el sello sin recargar', true, `${Date.now() - t0} ms`);
  await shot(cust, 'v02-06-cliente-sello-nuevo');
  await owner.click('[role=tab]:has-text("Resumen")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]:has-text("1")', { timeout: 12000 });
  ok('08b el dueño ve la operación desde su computadora', (await owner.textContent('[data-testid=kpi-customers-value]')).trim() === '1');

  // Enlace personal en un cuarto dispositivo
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p4 = await ctx4.newPage();
  await p4.goto(personalLink);
  await p4.waitForSelector('[data-testid=stamp-count]:has-text("1 de 8")');
  ok('04b enlace personal abre la misma tarjeta en otro teléfono', (await p4.textContent('[data-testid=card-code]')).trim() === code);
  await ctx4.close();

  // Doble toque: segunda compra inmediata pide confirmación
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('text=¿Otra compra?');
  ok('11a doble toque detectado y no suma sin confirmación', (await emp.textContent('[data-testid=staff-stamp-count]')).trim().startsWith('1'));
  await emp.click('button:has-text("Sí, registrar otra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count]:has-text("2")');
  for (let n = 3; n <= 8; n++) {
    await emp.click('button:has-text("Registrar compra")');
    await emp.click('button:has-text("Sí, registrar otra")');
    await emp.waitForSelector(`[data-testid=staff-stamp-count]:has-text("${n}")`);
  }
  // 9. Desbloqueo
  await emp.waitForSelector('text=Recompensa disponible');
  ok('09 recompensa desbloqueada en caja', true);
  await cust.waitForSelector('text=¡Felicidades!', { timeout: 12000 });
  ok('09b el cliente recibe la celebración en su teléfono', true);
  await shot(cust, 'v02-07-cliente-recompensa');
  await cust.click('button:has-text("Ver mi recompensa")');
  await cust.waitForSelector('text=Muestra este código al personal');
  await cust.keyboard.press('Escape');

  // 10. Canje
  const cardId = (await emp.evaluate(async (c) => (await (await fetch('/api/staff/cards/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) })).json()).cardId, code));
  const rewardId = await emp.evaluate(async (id) => (await (await fetch('/api/staff/cards/' + id)).json()).card.reward.id, cardId);
  await emp.click('button:has-text("Confirmar canje")');
  await emp.waitForSelector('text=El canje no se puede deshacer');
  await emp.click('button:has-text("Sí, canjear")');
  await emp.waitForSelector('text=Canje confirmado');
  await emp.waitForSelector('[data-testid=staff-stamp-count]:has-text("0")');
  ok('10 canje confirmado; inicia ciclo nuevo', (await emp.textContent('[data-testid=card-panel]')).includes('Ciclo 2'));
  await shot(emp, 'v02-08-empleado-canje');

  // 11. Canje duplicado desde otro dispositivo (el dueño) se rechaza
  const dup = await owner.evaluate(async (id) => { const r = await fetch(`/api/staff/rewards/${id}/redeem`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); return { s: r.status, b: await r.json() }; }, rewardId);
  ok('11 canje duplicado rechazado', dup.s === 409 && dup.b.error.code === 'already_redeemed', String(dup.s));
  await cust.waitForSelector('[data-testid=stamp-count]:has-text("0 de 8")', { timeout: 12000 });
  ok('10b el cliente ve su nuevo ciclo', true);

  // 12. Estadísticas: 8 compras y 8 sellos en UNA visita
  await owner.waitForSelector('[data-testid=kpi-redemptions-value]:has-text("1")', { timeout: 12000 });
  const kpi = async (id) => (await owner.textContent(`[data-testid=kpi-${id}-value]`)).trim();
  const k = { customers: await kpi('customers'), visits: await kpi('visits'), purchases: await kpi('purchases'), stamps: await kpi('stamps'), unlocked: await kpi('unlocked'), redemptions: await kpi('redemptions'), recurring: await kpi('recurring') };
  ok('12 estadísticas: compras y sellos no se confunden con visitas', JSON.stringify(k) === JSON.stringify({ customers: '1', visits: '1', purchases: '8', stamps: '8', unlocked: '1', redemptions: '1', recurring: '0' }), JSON.stringify(k));
  await shot(owner, 'v02-09-dueno-resumen');
  await owner.click('[role=tab]:has-text("Clientes")');
  await owner.waitForSelector('text=Mariana Sintética');
  await shot(owner, 'v02-10-dueno-clientes');

  // 13. Aislamiento entre negocios
  const otherCtx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const otherOwner = await otherCtx.newPage(); watch(otherOwner, 'otro dueño');
  await login(otherOwner, `dueno@barberia-e2e-${run}.e2e.test`);
  await otherOwner.waitForSelector('[data-testid=kpi-customers-value]');
  ok('13 otro negocio no ve clientes ajenos', (await otherOwner.textContent('[data-testid=kpi-customers-value]')).trim() === '0');
  const cross = await otherOwner.evaluate(async (c) => (await fetch('/api/staff/cards/lookup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: c }) })).status, code);
  ok('13b otro negocio no puede identificar la tarjeta', cross === 404, String(cross));
  await shot(otherOwner, 'v02-11-otro-negocio-vacio');

  // 14. Roles y móvil
  await emp.goto(BASE + '/panel');
  await emp.waitForSelector('text=Solo el dueño puede ver este panel');
  const api403 = await emp.evaluate(async () => (await fetch('/api/owner/dashboard')).status);
  ok('14b empleado no accede al panel del dueño (UI y API)', api403 === 403, String(api403));
  await emp.goto(BASE + '/caja');
  await emp.waitForSelector('text=Panel del empleado');
  ok('14c móvil sin scroll horizontal (caja)', (await noHorizontalScroll(emp)) <= 0);
  const ownerMobile = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })).newPage();
  await login(ownerMobile, `dueno@${slug}.e2e.test`);
  await ownerMobile.waitForSelector('[data-testid=kpi-customers-value]');
  ok('14d móvil sin scroll horizontal (panel del dueño)', (await noHorizontalScroll(ownerMobile)) <= 0, String(await noHorizontalScroll(ownerMobile)));
  await shot(ownerMobile, 'v02-12-dueno-movil');
  const ce = await cust.evaluate(() => document.cookie);
  ok('14e la cookie de la tarjeta no es legible desde JavaScript (HttpOnly)', !/vlx_card/.test(ce));

  ok('sin errores de consola ni de página', errors.length === 0, errors.join(' | '));
  console.log(results.join('\n'));
  console.log(`\nTotal: ${results.filter((r) => r.startsWith('PASS')).length} PASS, ${results.filter((r) => r.startsWith('FAIL')).length} FAIL`);
  await camBrowser.close();
  await browser.close();
  process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
})().catch((e) => { console.log(results.join('\n')); console.error(e); process.exit(1); });
