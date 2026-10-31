// E2E V0.2.1 · operación del piloto con 3 contextos de navegador independientes:
// restablecer contraseña de un empleado, anular una compra y reemitir el enlace de una tarjeta.
// Uso: BASE=http://localhost:8788 PLATFORM_ADMIN_TOKEN=... node tests/e2e/v021-operacion.cjs
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const path = require('node:path');

const BASE = process.env.BASE || 'http://localhost:8787';
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const PASSWORD = 'contraseña-e2e-2026';
const OUT = path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|429/) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
async function login(page, email, password = PASSWORD) {
  await page.goto(BASE + '/acceso');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button:has-text("Entrar")');
}

(async () => {
  const run = crypto.randomBytes(3).toString('hex');
  const slug = `op-e2e-${run}`;
  const r = await fetch(BASE + '/api/platform/businesses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ slug, name: 'Café Operación E2E', city: 'Toluca', vertical: 'cafeteria', rules: { stampsRequired: 8, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Una bebida de cortesía' }, owner: { email: `dueno@${slug}.e2e.test`, displayName: 'Dueña E2E', password: PASSWORD } }),
  });
  ok('00 alta del negocio de prueba', r.status === 201, String(r.status));

  const browser = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const owner = await (await browser.newContext({ viewport: { width: 1280, height: 860 } })).newPage(); watch(owner, 'dueño');
  const emp = await (await browser.newContext(mobile)).newPage(); watch(emp, 'empleado');
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');

  // Dueño da de alta al empleado y le emite un enlace de contraseña nueva.
  await login(owner, `dueno@${slug}.e2e.test`);
  await owner.waitForSelector('text=Resumen');
  await owner.click('button:has-text("Equipo")');
  await owner.fill('#emp-name', 'Caja E2E');
  await owner.fill('#emp-email', `caja@${slug}.e2e.test`);
  await owner.fill('#emp-pass', PASSWORD);
  await owner.click('form >> button:has-text("Agregar")');
  await owner.waitForSelector(`text=caja@${slug}.e2e.test`);
  await owner.click('button:has-text("Nueva contraseña")');
  const resetLink = (await owner.textContent('[data-testid=reset-link]')).trim();
  ok('01 el dueño genera un enlace de contraseña para su empleado', /\/restablecer#[A-Za-z0-9_-]{43}$/.test(resetLink));
  await owner.screenshot({ path: path.join(OUT, 'v021-01-dueno-enlace-contrasena.png') });
  await owner.keyboard.press('Escape');

  // Empleado usa el enlace en su teléfono.
  await emp.goto(resetLink);
  await emp.waitForSelector('text=Crea tu contraseña nueva');
  ok('02 el token del enlace se borra de la barra de direcciones', !emp.url().includes('#'), emp.url());
  await emp.fill('#pwd-new', 'nueva-contraseña-e2e');
  await emp.fill('#pwd-repeat', 'nueva-contraseña-e2e');
  await emp.click('button:has-text("Guardar contraseña")');
  await emp.waitForSelector('text=Contraseña actualizada');
  const again = await (await browser.newContext(mobile)).newPage(); watch(again, 'reintento (400 esperado: enlace usado)', /40[01349]|429/);
  await again.goto(resetLink);
  await again.waitForSelector('text=Crea tu contraseña nueva');
  await again.fill('#pwd-new', 'otra-contraseña-e2e');
  await again.fill('#pwd-repeat', 'otra-contraseña-e2e');
  await again.click('button:has-text("Guardar contraseña")');
  await again.waitForSelector('text=/no es válido o ya venció/');
  ok('03 el enlace de contraseña sirve una sola vez', true);
  await login(emp, `caja@${slug}.e2e.test`, 'nueva-contraseña-e2e');
  await emp.waitForSelector('text=Panel del empleado');
  ok('04 el empleado entra con su contraseña nueva', true);

  // Cliente crea su tarjeta.
  await cust.goto(`${BASE}/n/${slug}`);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Lucía Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();

  // Empleado registra 2 compras (la segunda confirmando "otra compra").
  await emp.click('button:has-text("Escribir")');
  await emp.fill('#manual-id', code);
  await emp.click('button:has-text("Buscar tarjeta")');
  await emp.waitForSelector('[data-testid=card-panel]');
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count] >> text=1');
  await emp.click('button:has-text("Registrar compra")');
  await emp.click('button:has-text("Sí, registrar otra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count] >> text=2');
  await cust.waitForSelector('[data-testid=stamp-count] >> text=/2 de 8/', { timeout: 15000 });
  ok('05 el cliente ve 2 sellos', true);

  // Dueño anula una compra desde la actividad.
  await owner.click('button:has-text("Clientes")');
  await owner.waitForSelector('button:has-text("Anular")');
  await owner.locator('button:has-text("Anular")').first().click();
  await owner.fill('#void-reason', 'Se registró dos veces');
  await owner.click('button:has-text("Anular compra")');
  await owner.waitForSelector('text=/Compra anulada: se quitaron 1 sello/');
  ok('06 el dueño anula una compra con motivo', true);
  await owner.waitForSelector('text=(anulada)');
  await owner.screenshot({ path: path.join(OUT, 'v021-02-dueno-compra-anulada.png') });
  await cust.waitForSelector('[data-testid=stamp-count] >> text=/1 de 8/', { timeout: 15000 });
  ok('07 la tarjeta del cliente baja a 1 sello sin recargar', true);
  await owner.click('button:has-text("Resumen")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]');
  const kp = (await owner.textContent('[data-testid=kpi-purchases-value]')).trim();
  ok('08 el panel cuenta 1 compra válida (la anulada no cuenta)', kp === '1', kp);

  // Empleado reemite el enlace de la tarjeta; el teléfono anterior pierde acceso y el nuevo lo gana.
  await emp.click('button:has-text("Nuevo enlace")');
  await emp.click('button:has-text("Generar")');
  const newLink = (await emp.textContent('[data-testid=new-card-link]')).trim();
  ok('09 enlace nuevo con token en el fragmento', /\/t#[A-Za-z0-9_-]{43}$/.test(newLink));
  await emp.screenshot({ path: path.join(OUT, 'v021-03-empleado-nuevo-enlace.png') });
  const phone2 = await (await browser.newContext(mobile)).newPage(); watch(phone2, 'teléfono nuevo');
  await phone2.goto(newLink);
  await phone2.waitForSelector('[data-testid=card-code]');
  ok('10 el teléfono nuevo abre la tarjeta con el enlace', (await phone2.textContent('[data-testid=card-code]')).trim() === code);
  ok('11 el token no queda en la URL del teléfono nuevo', !phone2.url().includes('#'), phone2.url());
  await cust.reload();
  await cust.waitForSelector('text=Obtener mi tarjeta gratis', { timeout: 10000 });
  ok('12 el teléfono anterior ya no ve la tarjeta', true);

  ok('13 sin errores de consola ni de página', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
