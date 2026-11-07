// E2E V0.4.5 · T31–T40: catálogo de giros y plantillas en el alta, aviso de giros regulados, envío de invitación con
// proveedor SIMULADO (nunca sale un correo), primeros pasos del dueño, caja adaptable (servicios y puntos), unidades
// en la tarjeta del cliente, ciclo de vida en el Control Center (archivar → declarar prueba → respaldo → eliminar).
// Uso local (BD desechable): scripts/e2e-v045.sh  (arranca el emulador con EMAIL_PROVIDER=mock).
const playwright = require('playwright');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const BASE = (process.env.BASE || 'http://localhost:8788').replace(/\/$/, '');
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const PASSWORD = 'contraseña-e2e-2026';
const ADMIN_PASSWORD = 'clave-admin-e2e-sintetica';
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|410|422|429/) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const MASK = (p) => [p.locator('[data-testid=totp-secret]'), p.locator('svg[aria-label^="Código QR para la app"]'), p.locator('[data-testid=owner-invite-link]')];
const shot = async (page, name) => { await page.waitForTimeout(400); return page.screenshot({ path: path.join(OUT, `v045-${name}.png`), fullPage: true, mask: MASK(page) }); };

function b32decode(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); }
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }
const step = () => Math.floor(Date.now() / 30000);
let lastStep = 0;
// Código 2FA de una ventana nueva (el servidor rechaza reutilizar la misma ventana).
async function freshCode(secret) {
  while (step() <= lastStep) await new Promise((r) => setTimeout(r, 1000));
  lastStep = step();
  return totp(secret, lastStep);
}
async function sql(q, params = []) {
  const url = process.env.DATABASE_ADMIN_URL || '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('SQL de prueba solo contra una BD local');
  const pg = require('pg'); const c = new pg.Client({ connectionString: url }); await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}

(async () => {
  if (process.env.E2E_RESET_ADMINS === '1') await sql('TRUNCATE platform_admins CASCADE');
  const run = crypto.randomBytes(3).toString('hex');
  const browser = await playwright.chromium.launch();
  const desktop = { viewport: { width: 1360, height: 900 }, acceptDownloads: true };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const vlux = await (await browser.newContext(desktop)).newPage(); watch(vlux, 'VLUX');
  const owner = await (await browser.newContext(desktop)).newPage(); watch(owner, 'dueño');
  const cashier = await (await browser.newContext(mobile)).newPage(); watch(cashier, 'caja');
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');

  // ---------- Administrador con 2FA ----------
  await vlux.goto(BASE + '/vlux-admin');
  await vlux.waitForSelector('text=Instalación del Control Center');
  await vlux.fill('#cc-setup', TOKEN);
  await vlux.fill('#cc-bname', 'Operación VLUX');
  await vlux.fill('#cc-bemail', `ops-${run}@vlux.e2e.test`);
  await vlux.fill('#cc-bpass', ADMIN_PASSWORD);
  await vlux.click('button:has-text("Crear administrador")');
  await vlux.waitForSelector('[data-testid=totp-secret]');
  const secret = (await vlux.textContent('[data-testid=totp-secret]')).trim();
  await vlux.fill('#cc-enroll-code', await freshCode(secret));
  await vlux.click('button:has-text("Activar")');
  await vlux.waitForSelector('[data-testid=recovery-codes]');
  await vlux.check('input[type=checkbox]');
  await vlux.click('button:has-text("Entrar al Control Center")');
  await vlux.waitForSelector('h1:has-text("Resumen")');

  // ---------- T31 · catálogo de 16 giros y aviso en giros regulados ----------
  await vlux.goto(BASE + '/vlux-admin/negocios/nuevo');
  await vlux.waitForSelector('#wz-vertical');
  const options = await vlux.$$eval('#wz-vertical option', (o) => o.map((x) => x.value));
  ok('T31a el alta ofrece los 16 giros del catálogo', options.length === 16, String(options.length));
  const name = `Barbería Motor ${run}`;
  await vlux.fill('#wz-name', name);
  await vlux.selectOption('#wz-vertical', 'dentista');
  await vlux.fill('#wz-city', 'Toluca');
  await vlux.fill('#wz-owner', 'Dueño Sintético');
  await vlux.fill('#wz-email', `dueno-${run}@ejemplo.e2e.test`);
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=program-fields]');
  ok('T31b un giro regulado (dentista) muestra el aviso de no guardar datos de salud', await vlux.isVisible('[data-testid=health-notice]'));
  ok('T31c la plantilla del dentista sugiere sellos por visita', (await vlux.getAttribute('[data-testid=program-fields]', 'data-program-type')) === 'stamps_visit');
  await shot(vlux, 'T31-dentista-aviso');

  // ---------- T32 · plantilla de barbería (servicios) y alta ----------
  await vlux.click('button:has-text("Atrás")');
  await vlux.selectOption('#wz-vertical', 'barberia');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=program-fields][data-program-type=stamps_service]');
  ok('T32a sin edición manual, cambiar de giro aplica la plantilla del nuevo giro (servicios)', !(await vlux.isVisible('[data-testid=health-notice]')));
  const services = await vlux.$$eval('[data-testid=service-list] span', (s) => s.map((x) => x.textContent.trim()));
  ok('T32b la plantilla trae servicios participantes editables', services.length >= 2, services.join(', '));
  await vlux.fill('#wz-stamps', '5');
  await shot(vlux, 'T32-plantilla-barberia');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button.cc-choice:has-text("Piloto")');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=wizard-summary]');
  ok('T32c el resumen describe el programa con su unidad (servicios)', /servicios/.test(await vlux.textContent('[data-testid=wizard-summary]')));
  await vlux.click('main button:text-is("Crear negocio")');
  await vlux.waitForSelector('[data-testid=owner-invite-link]');
  const invite = (await vlux.textContent('[data-testid=owner-invite-link]')).trim();
  const regUrl = (await vlux.textContent('[data-testid=created-registration-url]')).trim();
  const slug = new URL(regUrl).pathname.split('/').pop();

  // ---------- T33–T34 · envío simulado y reenvío sin duplicar ----------
  const intro = await vlux.textContent('[data-testid=activation-screen]');
  ok('T33a antes de enviar, la pantalla dice que no se envió ningún correo', intro.includes('No se envió ningún correo'));
  await vlux.click('[data-testid=send-invite-email]');
  await vlux.waitForSelector('[data-testid=email-status]:has-text("Aceptado por el proveedor")');
  const statusText = await vlux.textContent('[data-testid=email-invite]');
  ok('T33b con proveedor simulado queda "Aceptado por el proveedor", nunca "Entregado"', !/Entregado/.test(statusText));
  await shot(vlux, 'T33-envio-simulado');
  await vlux.click('[data-testid=send-invite-email]');
  await vlux.waitForSelector('[data-testid=email-invite] [role=alert]');
  const invCount = (await sql("SELECT count(*)::int AS n FROM staff_invitations i JOIN businesses b ON b.id = i.business_id WHERE b.slug = $1", [slug]))[0].n;
  const outbox = (await sql("SELECT o.attempts, o.sends_accepted FROM email_outbox o JOIN businesses b ON b.id = o.business_id WHERE b.slug = $1", [slug]))[0];
  ok('T34 reenviar de inmediato se frena (espera mínima) y no crea otra invitación', invCount === 1 && outbox.sends_accepted === 1, JSON.stringify({ invCount, ...outbox }));

  // ---------- T35–T36 · dueño: primeros pasos y editor del programa ----------
  await owner.goto(invite);
  await owner.waitForSelector('#inv-pass');
  await owner.fill('#inv-pass', PASSWORD);
  await owner.fill('#inv-pass2', PASSWORD);
  await owner.click('button:has-text("Crear cuenta y entrar")');
  // V0.4.6: tras activar, el dueño ve la bienvenida con 3 acciones; se cierra con «Abrir mi panel».
  await owner.waitForSelector('[data-testid=owner-welcome]', { timeout: 8000 }).then(() => owner.click('[data-testid=welcome-open-panel]')).catch(() => undefined);
  await owner.waitForSelector('[data-testid=owner-onboarding]');
  ok('T35a el dueño nuevo ve "Primeros pasos" (opcional)', /Primeros pasos/.test(await owner.textContent('[data-testid=owner-onboarding]')));
  await shot(owner, 'T35-primeros-pasos');
  await owner.click('button[role=tab]:has-text("Programa")');
  await owner.waitForSelector('[data-testid=program-fields][data-program-type=stamps_service]');
  ok('T36a el editor del dueño muestra el tipo y los servicios del programa', (await owner.$$('[data-testid=service-list] span')).length >= 2);
  await owner.fill('#set-stamps', '25');
  ok('T36b una meta fuera de rango se explica y no se puede guardar', (await owner.isDisabled('button:has-text("Guardar cambios")')) && /entre 3 y 20/.test(await owner.textContent('[role=alert]')));
  await owner.fill('#set-stamps', '6');
  await owner.click('button:has-text("Guardar cambios")');
  await owner.waitForSelector('text=/Programa actualizado/');
  await owner.click('button[role=tab]:has-text("Resumen")');
  await owner.click('[data-testid=onboarding-hide]');
  ok('T35b los primeros pasos se pueden ocultar', !(await owner.isVisible('[data-testid=owner-onboarding]')));

  // ---------- T37 · cliente y caja con servicio participante ----------
  await cust.goto(regUrl);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Cliente Sintético');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  ok('T37a la tarjeta del cliente usa la unidad del programa (servicios)', /0 de 6 servicios/.test(await cust.textContent('[data-testid=stamp-count]')));
  const ctx = cashier.context();
  await ctx.addCookies((await owner.context().cookies()).filter((c) => c.name === 'vlx_staff'));
  await cashier.goto(BASE + '/caja');
  await cashier.click('button:has-text("Escribir")');
  await cashier.fill('#manual-id', code);
  await cashier.click('button:has-text("Buscar tarjeta")');
  await cashier.waitForSelector('[data-testid=card-panel]');
  ok('T37b la caja pide el servicio antes de registrar', await cashier.isDisabled('[data-testid=register-operation]') && /Registrar servicio/.test(await cashier.textContent('[data-testid=register-operation]')));
  await cashier.click('[role=radiogroup][aria-label="Servicio realizado"] button >> nth=0');
  await cashier.click('[data-testid=register-operation]');
  await cashier.waitForSelector('[data-testid=staff-stamp-count] >> text=1');
  ok('T37c el servicio suma 1 en la caja', true);
  await cust.waitForSelector('[data-testid=stamp-count] >> text=/1 de 6 servicios/', { timeout: 15000 });
  ok('T37d el cliente ve +1 servicio sin recargar', true);
  const overflow = await cashier.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('T37e la caja no desborda a 390 px', overflow <= 0, String(overflow));
  await shot(cashier, 'T37-caja-servicio');
  await shot(cust, 'T37-cliente-servicios');

  // ---------- T38–T39 · ciclo de vida: archivar → declarar prueba → respaldo → eliminar ----------
  const bizId = (await sql('SELECT id FROM businesses WHERE slug = $1', [slug]))[0].id;
  await vlux.goto(`${BASE}/vlux-admin/negocios/${bizId}`);
  await vlux.waitForSelector('[data-testid=manage-business]');
  await vlux.click('[data-testid=manage-business] button:has-text("Archivar")');
  await vlux.fill('#ar-reason', 'Prueba E2E del ciclo de vida');
  await vlux.click('button.cc-btn-danger:has-text("Archivar")').catch(() => undefined);
  const archiveDisabled = await vlux.isDisabled('form button[type=submit]:has-text("Archivar")');
  await vlux.fill('#ar-confirm', name);
  ok('T38a archivar exige escribir el nombre exacto', archiveDisabled);
  await vlux.click('form button[type=submit]:has-text("Archivar")');
  await vlux.waitForSelector('[data-testid=archived-banner]');
  ok('T38b el negocio queda archivado y el aviso lo indica', true);
  const ownerAfter = await owner.evaluate(() => fetch('/api/owner/dashboard').then((r) => r.status));
  ok('T38c archivar revoca las sesiones del personal', ownerAfter === 401, String(ownerAfter));
  await vlux.click('[data-testid=manage-business] button:has-text("Eliminar")');
  await vlux.waitForSelector('[data-testid=delete-flow]');
  ok('T39a la vista previa muestra conteos y bloquea un negocio con clientes reales', /cliente/i.test(await vlux.textContent('[data-testid=delete-blockers]')));
  await shot(vlux, 'T39-eliminar-bloqueado');
  await vlux.fill('#del-phrase', 'DATOS DE PRUEBA');
  await vlux.fill('#del-code1', await freshCode(secret));
  await vlux.click('button:has-text("Declarar datos de prueba")');
  await vlux.waitForSelector('button:has-text("Descargar respaldo")');
  ok('T39b sin respaldo no se puede eliminar', await vlux.isDisabled('button:has-text("Eliminar definitivamente")'));
  const [dl] = await Promise.all([vlux.waitForEvent('download'), vlux.click('button:has-text("Descargar respaldo")')]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  ok('T39c el respaldo trae los datos del negocio y no trae contraseñas ni tokens', backup.format === 'vlux-business-export/1' && backup.data?.customers?.length === 1 && !/password_hash|token_hash/.test(JSON.stringify(backup)));
  await vlux.fill('#del-slug', slug);
  await vlux.fill('#del-reason', 'Prueba E2E de eliminación');
  await vlux.fill('#del-code', await freshCode(secret));
  await shot(vlux, 'T39-eliminar-listo');
  await vlux.click('button:has-text("Eliminar definitivamente")');
  await vlux.waitForSelector('text=/Negocio eliminado/');
  const left = (await sql('SELECT count(*)::int AS n FROM businesses WHERE slug = $1', [slug]))[0].n;
  const tomb = (await sql('SELECT count(*)::int AS n FROM business_deletions WHERE slug = $1', [slug]))[0].n;
  const audit = (await sql("SELECT count(*)::int AS n FROM platform_audit_events WHERE action = 'business.deleted' AND business_id = $1", [bizId]))[0].n;
  ok('T39d el negocio se elimina y quedan constancia y bitácora', left === 0 && tomb === 1 && audit === 1, JSON.stringify({ left, tomb, audit }));

  // ---------- T40 · sin errores de consola ----------
  ok('T40 sin errores de consola ni de página', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
