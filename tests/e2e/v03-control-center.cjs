// E2E V0.3 · Criterio de éxito completo SIN tocar PostgreSQL ni ejecutar comandos técnicos:
// crear negocio → invitar dueño → configurar programa → QR → empleado → cliente → sello → estadísticas.
// Escenarios A–J con contextos de navegador independientes (VLUX, dueño 1, empleado, cliente, dueño 2).
// K (Google Wallet) queda BLOCKED: no hay credenciales del emisor.
//
// Uso local (BD desechable): E2E_RESET_ADMINS=1 BASE=http://localhost:8788 PLATFORM_ADMIN_TOKEN=... node tests/e2e/v03-control-center.cjs
// E2E_RESET_ADMINS=1 vacía SOLO las tablas de administradores de plataforma en una BD local (127.0.0.1/localhost).
const playwright = require('playwright');
const engine = playwright[process.env.BROWSER || 'chromium'];
const crypto = require('node:crypto');
const path = require('node:path');

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
// Las capturas tapan el QR/clave TOTP y los enlaces con token (aunque sean de cuentas sintéticas desechables).
const shot = async (page, name) => { await page.waitForTimeout(450); return page.screenshot({ path: path.join(OUT, `v03-${name}.png`), fullPage: true, mask: [page.locator('[data-testid=totp-secret]'), page.locator('svg[aria-label^="Código QR para la app"]'), page.locator('[data-testid=owner-invite-link]'), page.locator('[data-testid=employee-invite-link]'), page.locator('svg[aria-label*="invitación"]')] }); };

// TOTP RFC 6238 (SHA1, 30 s, 6 dígitos): el "teléfono" del administrador dentro de la prueba.
function b32decode(s) {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
}
function totp(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}
const step = () => Math.floor(Date.now() / 30000);

async function resetAdminsIfAsked() {
  if (process.env.E2E_RESET_ADMINS !== '1') return;
  const url = process.env.DATABASE_ADMIN_URL || '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('E2E_RESET_ADMINS solo se permite contra una BD local');
  const pg = require('pg');
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  await c.query('TRUNCATE platform_admins CASCADE');
  await c.end();
}

(async () => {
  await resetAdminsIfAsked();
  const run = crypto.randomBytes(3).toString('hex');
  const browser = await engine.launch();
  const desktop = { viewport: { width: 1360, height: 900 } };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, ...(process.env.BROWSER === 'firefox' ? {} : { isMobile: true }) };
  const vlux = await (await browser.newContext(desktop)).newPage(); watch(vlux, 'VLUX');
  const owner = await (await browser.newContext(desktop)).newPage(); watch(owner, 'dueño 1');
  const emp = await (await browser.newContext(mobile)).newPage(); watch(emp, 'empleado');
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');
  const owner2 = await (await browser.newContext(desktop)).newPage(); watch(owner2, 'dueño 2');

  // ---------- A · VLUX instala el Control Center, activa 2FA y crea una cafetería ----------
  await vlux.goto(BASE + '/vlux-admin');
  await vlux.waitForSelector('text=Instalación del Control Center');
  await shot(vlux, 'A1-instalacion');
  await vlux.fill('#cc-setup', TOKEN);
  await vlux.fill('#cc-bname', 'Operación VLUX');
  await vlux.fill('#cc-bemail', `ops-${run}@vlux.e2e.test`);
  await vlux.fill('#cc-bpass', ADMIN_PASSWORD);
  await vlux.click('button:has-text("Crear administrador")');
  await vlux.waitForSelector('[data-testid=totp-secret]');
  const secret = (await vlux.textContent('[data-testid=totp-secret]')).trim();
  ok('A1 el primer administrador debe configurar 2FA antes de entrar', /^[A-Z2-7]{32}$/.test(secret));
  await shot(vlux, 'A2-alta-2fa');
  const s0 = step();
  await vlux.fill('#cc-enroll-code', totp(secret, s0));
  await vlux.click('button:has-text("Activar")');
  await vlux.waitForSelector('[data-testid=recovery-codes]');
  const codes = (await vlux.textContent('[data-testid=recovery-codes]')).match(/[A-Z0-9]{5}-[A-Z0-9]{5}/g) || [];
  ok('A2 se muestran 8 códigos de recuperación una sola vez', codes.length === 8, String(codes.length));
  await vlux.check('input[type=checkbox]');
  await vlux.click('button:has-text("Entrar al Control Center")');
  await vlux.waitForSelector('h1:has-text("Resumen")');
  ok('A3 el administrador entra al resumen con 2FA verificado', true);
  await shot(vlux, 'A3-resumen');

  // Asistente de 4 pasos.
  await vlux.click('aside >> button:has-text("Nuevo negocio")');
  await vlux.waitForSelector('h1:has-text("Nuevo negocio")');
  const name1 = `Café Control ${run}`;
  await vlux.fill('#wz-name', name1);
  await vlux.selectOption('#wz-vertical', 'cafeteria');
  await vlux.fill('#wz-city', 'Metepec');
  await vlux.fill('#wz-owner', 'Dueña Sintética Uno');
  await vlux.fill('#wz-email', `duena1-${run}@ejemplo.e2e.test`);
  await shot(vlux, 'A4-asistente-paso1');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.fill('#wz-stamps', '6');
  await vlux.fill('#wz-reward', 'Un café americano');
  await vlux.fill('#wz-review', 'https://g.page/r/sintetico-e2e/review');
  await shot(vlux, 'A5-asistente-paso2');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button.cc-choice:has-text("Piloto")');
  await shot(vlux, 'A6-asistente-paso3');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=wizard-summary]');
  await shot(vlux, 'A7-asistente-resumen');
  await vlux.click('button:has-text("Crear negocio")');
  await vlux.waitForSelector('[data-testid=owner-invite-link]');
  const invite1 = (await vlux.textContent('[data-testid=owner-invite-link]')).trim();
  const regUrl = (await vlux.textContent('[data-testid=created-registration-url]')).trim();
  ok('A8 el asistente crea el negocio y genera invitación + QR de registro', /\/invitacion#[A-Za-z0-9_-]{43}$/.test(invite1) && /\/n\/cafe-control-/.test(regUrl), regUrl);
  ok('A9 la pantalla dice que NO se envió correo', (await vlux.textContent('body')).includes('No se envió ningún correo'));
  await shot(vlux, 'A8-negocio-creado');

  // ---------- B · el dueño acepta la invitación ----------
  await owner.goto(invite1);
  await owner.waitForSelector(`h1:has-text("${name1}")`);
  ok('B1 el token desaparece de la barra de direcciones', !owner.url().includes('#'), owner.url());
  await shot(owner, 'B1-invitacion');
  await owner.fill('#inv-pass', PASSWORD);
  await owner.fill('#inv-pass2', PASSWORD);
  await owner.click('button:has-text("Crear cuenta y entrar")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]');
  ok('B2 el dueño queda dentro de su panel', owner.url().endsWith('/panel'), owner.url());
  const reuse = await (await browser.newContext(desktop)).newPage(); watch(reuse, 'reuso (409 esperado)');
  await reuse.goto(invite1);
  await reuse.waitForSelector('text=No se pudo abrir la invitación');
  ok('B3 la invitación no se puede reutilizar', (await reuse.textContent('body')).includes('ya se usó'));
  await reuse.close();

  // ---------- C · el dueño configura su programa ----------
  await owner.click('button[role=tab]:has-text("Programa")');
  await owner.fill('#set-stamps', '5');
  await owner.fill('#set-reward', 'Un café americano grande');
  await owner.click('button:has-text("Guardar cambios")');
  await owner.waitForSelector('text=/Programa actualizado/');
  ok('C1 el dueño cambia el programa desde su panel', true);
  await owner.click('button[role=tab]:has-text("QR")');
  await owner.waitForSelector('text=Escanea y obtén tu tarjeta');
  ok('C2 el dueño ve el QR de su mostrador', true);
  await shot(owner, 'C2-qr-mostrador');

  // ---------- D · el dueño incorpora un empleado por enlace ----------
  await owner.click('button[role=tab]:has-text("Equipo")');
  await owner.fill('#emp-name', 'Caja Sintética');
  await owner.fill('#emp-email', `caja-${run}@ejemplo.e2e.test`);
  await owner.click('form >> button:has-text("Generar invitación")');
  await owner.waitForSelector('[data-testid=employee-invite-link]');
  const empInvite = (await owner.textContent('[data-testid=employee-invite-link]')).trim();
  await shot(owner, 'D1-invitacion-empleado');
  await owner.keyboard.press('Escape');
  await emp.goto(empInvite);
  await emp.waitForSelector('text=personal de caja');
  await emp.fill('#inv-pass', PASSWORD);
  await emp.fill('#inv-pass2', PASSWORD);
  await emp.click('button:has-text("Crear cuenta y entrar")');
  await emp.waitForSelector('text=Panel del empleado');
  ok('D1 el empleado entra a la caja con su invitación', emp.url().endsWith('/caja'), emp.url());
  const empPanel = await emp.goto(BASE + '/panel').then(() => emp.waitForSelector('text=Solo el dueño puede ver este panel'));
  ok('D2 el empleado no ve el panel del dueño', !!empPanel);
  await emp.goto(BASE + '/caja');
  await emp.waitForSelector('text=Panel del empleado');

  // ---------- E · el cliente escanea el QR y crea su tarjeta ----------
  await cust.goto(regUrl);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Mariana Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  ok('E1 el cliente obtiene su tarjeta (programa nuevo: 5 sellos)', !!(await cust.$('[data-testid=stamp-count] >> text=/0 de 5/')), code);

  // ---------- F · el empleado registra una compra ----------
  await emp.click('button:has-text("Escribir")');
  await emp.fill('#manual-id', code);
  await emp.click('button:has-text("Buscar tarjeta")');
  await emp.waitForSelector('[data-testid=card-panel]');
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count] >> text=1');
  ok('F1 el empleado registra la compra y otorga 1 sello', true);

  // ---------- G · la PWA del cliente recibe el sello ----------
  await cust.waitForSelector('[data-testid=stamp-count] >> text=/1 de 5/', { timeout: 15000 });
  ok('G1 la tarjeta del cliente muestra 1 de 5 sin recargar', true);
  await shot(cust, 'G1-cliente-sello');

  // ---------- H · el dueño ve la operación ----------
  await owner.click('button[role=tab]:has-text("Resumen")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value] >> text=1', { timeout: 15000 });
  ok('H1 el panel del dueño cuenta 1 compra', true);
  await shot(owner, 'H1-dueno-resumen');

  // ---------- I · VLUX ve el negocio y su actividad ----------
  await vlux.click('aside >> a:has-text("Negocios")');
  await vlux.waitForSelector(`[data-testid=directory] >> text=${name1}`);
  const row = vlux.locator('[data-testid=directory] tbody tr', { hasText: name1 });
  const cells = (await row.locator('td').allTextContents()).map((t) => t.trim());
  ok('I1 el directorio muestra dueño, plan piloto y 1 cliente', cells[3] === 'Dueña Sintética Uno' && cells[4].startsWith('Piloto') && cells[7] === '1', cells.join(' | '));
  await shot(vlux, 'I1-directorio');
  await row.click();
  await vlux.waitForSelector(`[data-testid=business-name]:has-text("${name1}")`);
  const detail = await vlux.textContent('main');
  ok('I2 la ficha muestra compras y sellos del negocio', /Compras\s*1/.test(detail) && /Sellos\s*1/.test(detail));
  await shot(vlux, 'I2-ficha-negocio');
  await vlux.click('button[role=tab]:has-text("Acceso")');
  await vlux.waitForSelector('text=Caja Sintética');
  ok('I3 VLUX ve al dueño y al empleado con acceso', (await vlux.textContent('main')).includes('Dueña Sintética Uno'));
  await shot(vlux, 'I3-ficha-acceso');
  await vlux.click('aside >> a:has-text("Resumen")');
  await vlux.waitForSelector('text=Actividad reciente en los negocios');
  await vlux.waitForSelector(`text=${name1}`);
  await shot(vlux, 'I4-resumen-con-actividad');

  // ---------- J · un segundo dueño no puede ver el primer negocio ----------
  await vlux.click('aside >> button:has-text("Nuevo negocio")');
  const name2 = `Barbería Control ${run}`;
  await vlux.fill('#wz-name', name2);
  await vlux.selectOption('#wz-vertical', 'barberia');
  await vlux.fill('#wz-owner', 'Dueño Sintético Dos');
  await vlux.fill('#wz-email', `dueno2-${run}@ejemplo.e2e.test`);
  for (let i = 0; i < 3; i++) await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button:has-text("Crear negocio")');
  await vlux.waitForSelector('[data-testid=owner-invite-link]');
  const invite2 = (await vlux.textContent('[data-testid=owner-invite-link]')).trim();
  await owner2.goto(invite2);
  await owner2.fill('#inv-pass', PASSWORD);
  await owner2.fill('#inv-pass2', PASSWORD);
  await owner2.click('button:has-text("Crear cuenta y entrar")');
  await owner2.waitForSelector('[data-testid=kpi-purchases-value]');
  const k2 = (await owner2.textContent('[data-testid=kpi-purchases-value]')).trim();
  const api2 = (p, method = 'GET', body) => owner2.evaluate(async ([p, method, body]) => {
    const r = await fetch('/api' + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null) };
  }, [p, method, body]);
  const customers2 = await api2('/owner/customers');
  const lookup = await api2('/staff/cards/lookup', 'POST', { code });
  const adminTry = await api2('/admin/businesses');
  ok('J1 el dueño 2 ve 0 compras y 0 clientes propios', k2 === '0' && customers2.json.customers.length === 0, `${k2}/${customers2.json.customers.length}`);
  ok('J2 el dueño 2 no encuentra la tarjeta del negocio 1', lookup.status === 404, String(lookup.status));
  ok('J3 el dueño 2 no entra al Control Center', adminTry.status === 401, String(adminTry.status));
  await owner2.goto(BASE + '/vlux-admin');
  await owner2.waitForSelector('text=Iniciar sesión');
  ok('J4 /vlux-admin pide credenciales de VLUX al dueño', true);

  // ---------- K · Google Wallet ----------
  console.log('BLOCKED K Google Wallet: sin cuenta de emisor ni service account (no se simula).');

  ok('Z sin errores de consola ni de página', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fails} PASS, ${fails} FAIL, 1 BLOCKED (K)`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
