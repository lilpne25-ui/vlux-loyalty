// E2E V0.4.4 · Alta unificada: Landing → Personalizar → Control Center (otro origen) → login + 2FA → diseño recuperado →
// asistente prellenado → negocio creado → pantalla de activación → dueño, caja y cliente operan con ese negocio.
// Dos orígenes distintos (como los dos proyectos de Vercel): PUBLIC (cards, demo) y ADMIN (Control Center).
// Uso local: scripts/e2e-v044.sh  (arranca los dos emuladores, reinicia admins de la BD local y ejecuta esto).
// Contra Preview: PUBLIC=… ADMIN=… (el Control Center está tras Vercel SSO: solo la parte pública se puede automatizar).
const playwright = require('playwright');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const PUBLIC = (process.env.PUBLIC || 'http://localhost:8788').replace(/\/$/, '');
const ADMIN = (process.env.ADMIN || 'http://127.0.0.1:8790').replace(/\/$/, '');
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
const FIX = path.join(__dirname, '..', 'fixtures', 'logos');
fs.mkdirSync(OUT, { recursive: true });
const PASSWORD = 'contraseña-e2e-2026';
const ADMIN_PASSWORD = 'clave-admin-e2e-sintetica';
const results = [];
const ok = (name, cond, extra = '') => { results.push([cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|410|429|404/) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const MASK = (p) => [p.locator('[data-testid=totp-secret]'), p.locator('svg[aria-label^="Código QR para la app"]'), p.locator('[data-testid=owner-invite-link]'), p.locator('[data-testid=activate-ref]'), p.locator('[data-testid=draft-code]')];
const shot = async (page, name, full = true) => { await page.waitForTimeout(500); return page.screenshot({ path: path.join(OUT, `v044-${name}.png`), fullPage: full, mask: MASK(page) }); };

function b32decode(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); }
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }
const step = () => Math.floor(Date.now() / 30000);

const jfetch = (page, p, method = 'GET', body) => page.evaluate(async ([p, method, body]) => {
  const r = await fetch(p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
}, [p, method, body]);

async function sql(q, params = []) {
  const url = process.env.DATABASE_ADMIN_URL || '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('SQL de prueba solo contra una BD local');
  const pg = require('pg'); const c = new pg.Client({ connectionString: url }); await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}

/** Visitante: personaliza una tarjeta con un logo ficticio y prepara el borrador. Devuelve ref y enlace. */
async function visitorPrepares(browser, name, finish = 'black', shots = false) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage(); watch(page, 'visitante');
  await page.goto(PUBLIC + '/personalizar');
  await page.waitForSelector('[data-testid=public-studio]');
  await page.click('[role=tab]:has-text("Mi negocio")');
  await page.fill('#st-name', name);
  await page.setInputFiles('#st-logo', path.join(FIX, '1-horizontal-transparente.png'));
  await page.waitForSelector('[data-testid=logo-analysis]');
  await page.waitForFunction(() => { const i = document.querySelector('[data-testid=studio-card] [data-testid=logo-plate] img'); return i && i.complete && i.naturalWidth > 0; });
  await page.click(`[data-testid=finish-${finish}]`);
  await page.fill('#st-reward', 'Un café americano');
  await page.fill('#st-stamps', '6');
  if (shots) await shot(page, 'A1-personalizar');
  await page.click('[data-testid=studio-request]');
  await page.click('[data-testid=activate-prepare]');
  await page.waitForSelector('[data-testid=activate-ready]');
  const ref = (await page.textContent('[data-testid=activate-ref]')).trim();
  const href = await page.getAttribute('[data-testid=activate-continue]', 'href');
  if (shots) await shot(page, 'A2-borrador-preparado');
  return { ctx, page, ref, href };
}

(async () => {
  if (process.env.E2E_RESET_ADMINS === '1') await sql('TRUNCATE platform_admins CASCADE');
  const run = crypto.randomBytes(3).toString('hex');
  const browser = await playwright.chromium.launch();
  const desktop = { viewport: { width: 1360, height: 900 } };
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
  const NAME = `Prueba Activación ${run}`;

  // ---------- A · el visitante personaliza sin iniciar sesión (T01–T03) ----------
  const v = await visitorPrepares(browser, NAME, 'black', true);
  const card = await v.page.evaluate(() => { const c = document.querySelector('[data-testid=studio-card]'); const i = c.querySelector('[data-testid=logo-plate] img'); return { hasLogo: !!i && i.naturalWidth > 0, bg: getComputedStyle(c.firstElementChild).getPropertyValue('--c-bg').length > 10 }; });
  ok('T01 el visitante personaliza su tarjeta sin iniciar sesión', await v.page.isVisible('[data-testid=public-studio]'));
  ok('T02 la tarjeta conserva su logotipo y acabado al preparar el diseño', card.hasLogo && card.bg);
  ok('T03 se genera un borrador con referencia de 43 caracteres', /^[A-Za-z0-9_-]{43}$/.test(v.ref), v.ref.length + ' caracteres');
  ok('T04a el enlace de transferencia apunta al Control Center (otro origen) y la referencia viaja en la consulta', v.href.startsWith(ADMIN + '/vlux-admin/negocios/desde-diseno?activar='), v.href.split('?')[0]);
  ok('T04b el texto aclara que la activación la hace el equipo de VLUX y que nada se activó', /lo hace el equipo de VLUX/.test(await v.page.textContent('[data-testid=activate-panel]')) && /Aún no se ha activado ningún negocio/.test(await v.page.textContent('[data-testid=activate-ready]')));
  const sent = await v.page.isVisible('[data-testid=activate-contact]');
  ok('T04c sin canal de contacto configurado NO finge un envío', sent || /no se envió ninguna solicitud/.test(await v.page.textContent('[data-testid=activate-no-contact]')));

  // ---------- B · seguridad sin sesión (T05, T19, T23) ----------
  const anon = await (await browser.newContext(desktop)).newPage(); watch(anon, 'anónimo');
  await anon.goto(PUBLIC + '/');
  const pubAdmin = await jfetch(anon, '/api/admin/businesses');
  const pubRead = await jfetch(anon, `/api/public/activation-drafts/${v.ref}`);
  const pubCreate = await jfetch(anon, '/api/public/businesses', 'POST', { name: 'x' });
  ok('T23 el proyecto público no expone /api/admin', pubAdmin.status === 404, String(pubAdmin.status));
  ok('T19a el visitante no puede leer un borrador con su referencia (no da permisos)', [404, 405].includes(pubRead.status), String(pubRead.status));
  ok('T19b no existe ninguna ruta pública para crear negocios', [404, 405].includes(pubCreate.status), String(pubCreate.status));
  await anon.goto(ADMIN + '/');
  const noSess = await jfetch(anon, `/api/admin/activation-drafts/${v.ref}`);
  const noCreate = await jfetch(anon, '/api/admin/businesses', 'POST', { name: 'Intruso', draftRef: v.ref });
  ok('T05a sin sesión no se puede leer el borrador en el Control Center', noSess.status === 401, String(noSess.status));
  ok('T05b sin sesión no se puede crear un negocio', noCreate.status === 401, String(noCreate.status));
  await anon.close();

  // ---------- C · VLUX sigue el enlace, instala/entra con 2FA y vuelve al proceso de activación (T04, T06) ----------
  const vctx = await browser.newContext(desktop);
  const vlux = await vctx.newPage(); watch(vlux, 'VLUX');
  await vlux.goto(v.href);
  await vlux.waitForSelector('text=Instalación del Control Center');
  ok('T04 el enlace abre el Control Center y pide autenticación (la URL conserva el destino)', vlux.url().includes('/negocios/desde-diseno'), vlux.url().split('?')[0]);
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
  await vlux.waitForSelector('[data-testid=from-design]');
  ok('T06 tras login + 2FA vuelve al proceso de activación (no al panel general) y recupera el diseño', await vlux.isVisible('[data-testid=draft-card]'));
  const urlAfter = vlux.url();
  ok('T06b la referencia ya no está en la barra de direcciones', !urlAfter.includes('activar='), urlAfter);
  const summary = await vlux.textContent('[data-testid=draft-summary]');
  ok('T06c el resumen del diseño recuperado muestra nombre, acabado, sellos y logotipo', summary.includes(NAME) && /Black Titanium/.test(summary) && /6/.test(summary) && /Incluido/.test(summary));
  await shot(vlux, 'C1-diseno-recuperado');

  // ---------- D · asistente prellenado, editable y con una sola creación (T07–T10, T14) ----------
  await vlux.click('[data-testid=draft-use]');
  await vlux.waitForSelector('h1:has-text("Nuevo negocio")');
  await vlux.waitForSelector('[data-testid=draft-note]');
  const w0 = await vlux.evaluate(() => ({ name: document.querySelector('#wz-name').value, finish: document.querySelector('#wz-finish').value, primary: document.querySelector('#wz-primary')?.value ?? null }));
  ok('T07 el asistente llega prellenado (nombre, acabado Black Titanium) con aviso de diseño recuperado', w0.name === NAME && w0.finish === 'black' && /Diseño recuperado/.test(await vlux.textContent('[data-testid=draft-note]')), JSON.stringify(w0));
  await shot(vlux, 'D1-asistente-prellenado');
  await vlux.fill('#wz-name', NAME + ' Centro');
  await vlux.fill('#wz-city', 'Toluca');
  await vlux.fill('#wz-owner', 'Dueña Sintética Activación');
  await vlux.fill('#wz-email', `duena-${run}@ejemplo.e2e.test`);
  ok('T08 VLUX puede modificar el diseño antes de confirmar', (await vlux.inputValue('#wz-name')).endsWith('Centro'));
  await vlux.click('button:has-text("Siguiente")');
  const st = await vlux.inputValue('#wz-stamps'); const rw = await vlux.inputValue('#wz-reward');
  ok('T07b sellos y recompensa del diseño llegan al paso del programa', st === '6' && rw === 'Un café americano', `${st}/${rw}`);
  await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button.cc-choice:has-text("Piloto")');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=wizard-summary]');
  ok('T09a antes de confirmar hay un resumen y todavía no existe el negocio', (await sql('select count(*)::int n from businesses where name = $1', [NAME + ' Centro']))[0].n === 0);
  await shot(vlux, 'D2-resumen');
  // Doble clic rápido: debe crearse un único negocio.
  const btn = vlux.locator('main button:text-is("Crear negocio")');
  await Promise.allSettled([btn.click({ timeout: 3000 }), btn.click({ timeout: 3000, force: true })]);
  await vlux.waitForSelector('[data-testid=activation-screen]', { timeout: 15000 }).catch(async (e) => { console.log('DIAG alert:', await vlux.locator('[role=alert], .text-\\[\\#FDA29B\\]').allTextContents()); await shot(vlux, 'diag'); throw e; });
  const cnt = (await sql('select count(*)::int n from businesses where name = $1', [NAME + ' Centro']))[0].n;
  ok('T09 la confirmación crea el negocio', cnt >= 1);
  ok('T10 doble clic / reintento no duplica el negocio', cnt === 1, String(cnt));

  // ---------- E · pantalla de activación (T11, T12) ----------
  const body = await vlux.textContent('[data-testid=activation-screen]');
  ok('E1 la pantalla dice "Tu negocio está configurado" y estado "Configuración creada"', /Tu negocio está configurado/.test(body) && /Configuración creada/.test(body));
  ok('E2 no afirma envío de correo ni operación comercial', /No se envió ningún correo/.test(body) && /Todavía no opera/.test(body));
  const invite = (await vlux.textContent('[data-testid=owner-invite-link]')).trim();
  const regUrl = (await vlux.textContent('[data-testid=created-registration-url]')).trim();
  const cashUrl = (await vlux.textContent('[data-testid=created-cashier-url]')).trim();
  ok('T11 se genera la invitación del propietario (un solo uso)', /\/invitacion#[A-Za-z0-9_-]{43}$/.test(invite));
  ok('T12 los enlaces de cliente/caja/invitación usan el origen PÚBLICO', [invite, regUrl, cashUrl].every((u) => u.startsWith(PUBLIC + '/')), [regUrl, cashUrl].join(' '));
  const act = await vlux.evaluate(() => { const c = document.querySelector('[data-testid=activation-card]'); const i = c.querySelector('[data-testid=logo-plate] img'); return { logo: !!i && i.naturalWidth > 0, name: c.textContent.includes('Prueba') }; });
  ok('T14a la tarjeta de la pantalla de activación conserva logo y nombre', act.logo && act.name);
  const [dl] = await Promise.all([vlux.waitForEvent('download', { timeout: 8000 }).catch(() => null), vlux.click('[data-testid^=qr-download-]:first-of-type').catch(() => null)]);
  ok('E3 el QR de clientes se descarga como PNG', !!dl && /\.png$/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  await shot(vlux, 'E1-activacion');
  // Móvil (la misma pantalla)
  await vlux.setViewportSize({ width: 390, height: 844 });
  await vlux.waitForTimeout(400);
  const overflow = await vlux.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('E4 la pantalla de activación no desborda a 390 px', overflow <= 1, String(overflow));
  await shot(vlux, 'E2-activacion-movil');
  await vlux.setViewportSize({ width: 1360, height: 900 });

  // T22: el borrador consumido no vuelve a crear nada
  const again = await jfetch(vlux, '/api/admin/businesses', 'POST', { name: NAME + ' Duplicado', vertical: 'cafeteria', city: 'Toluca', ownerName: 'Otro Dueño', ownerEmail: `dup-${run}@ejemplo.e2e.test`, draftRef: v.ref, primaryColor: '#1E6F5C', accentColor: '#F2B134', cardFinish: 'silver', rules: { stampsRequired: 6, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Premio' }, reviewUrl: null, plan: 'piloto', priceCents: 0, pilotDays: 30, isDemo: false });
  ok('T22 un borrador consumido no puede repetir la creación', [409, 410].includes(again.status) && (await sql('select count(*)::int n from businesses where name = $1', [NAME + ' Duplicado']))[0].n === 0, String(again.status));

  // ---------- F · el dueño acepta su invitación; la caja y el cliente operan (T13, T15–T17) ----------
  const owner = await (await browser.newContext(desktop)).newPage(); watch(owner, 'dueño');
  await owner.goto(invite);
  await owner.waitForSelector('#inv-pass');
  await owner.fill('#inv-pass', PASSWORD); await owner.fill('#inv-pass2', PASSWORD);
  await owner.click('button:has-text("Crear cuenta y entrar")');
  await owner.waitForSelector('[data-testid=kpi-purchases-value]');
  ok('T13 el dueño abre su panel con la invitación generada', owner.url().endsWith('/panel'), owner.url());
  await owner.click('button[role=tab]:has-text("Equipo")');
  await owner.fill('#emp-name', 'Caja Activación');
  await owner.fill('#emp-email', `caja-${run}@ejemplo.e2e.test`);
  await owner.click('form >> button:has-text("Generar invitación")');
  await owner.waitForSelector('[data-testid=employee-invite-link]');
  const empInvite = (await owner.textContent('[data-testid=employee-invite-link]')).trim();
  const emp = await (await browser.newContext(mobile)).newPage(); watch(emp, 'empleado');
  await emp.goto(empInvite);
  await emp.fill('#inv-pass', PASSWORD); await emp.fill('#inv-pass2', PASSWORD);
  await emp.click('button:has-text("Crear cuenta y entrar")');
  await emp.waitForSelector('text=Panel del empleado');
  const cust = await (await browser.newContext(mobile)).newPage(); watch(cust, 'cliente');
  await cust.goto(regUrl);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Mariana Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  const cid = await cust.evaluate(() => { const c = document.querySelector('[data-testid=loyalty-card]'); const i = c.querySelector('[data-testid=logo-plate] img'); const bg = getComputedStyle(c).getPropertyValue('--c-bg') || getComputedStyle(c.parentElement).getPropertyValue('--c-bg'); return { logo: !!i && i.naturalWidth > 0, metal: bg.length > 10 }; });
  ok('T15 el cliente obtiene una tarjeta con la identidad diseñada (logo y metal)', cid.logo, JSON.stringify(cid));
  ok('T14b el acabado y el programa persisten (6 sellos)', !!(await cust.$('[data-testid=stamp-count] >> text=/0 de 6/')));
  await shot(cust, 'F1-tarjeta-cliente', false);
  await emp.click('button:has-text("Escribir")');
  await emp.fill('#manual-id', code);
  await emp.click('button:has-text("Buscar tarjeta")');
  await emp.waitForSelector('[data-testid=card-panel]');
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count] >> text=1');
  ok('T16 el empleado registra una compra', true);
  await cust.waitForSelector('[data-testid=stamp-count] >> text=/1 de 6/', { timeout: 15000 });
  ok('T17 el cliente ve el sello actualizado', true);

  // ---------- G · Control Center muestra el negocio; aislamiento (T18, T20) ----------
  await vlux.goto(ADMIN + '/vlux-admin/negocios');
  await vlux.waitForSelector(`[data-testid=directory] >> text=${NAME} Centro`);
  ok('T18 Control Center lista el nuevo negocio', true);
  const oc = await jfetch(owner, '/api/owner/customers');
  const foreign = (await sql('select c.public_code from cards c join businesses b on b.id = c.business_id where b.name <> $1 limit 1', [NAME + ' Centro']))[0];
  const lookup = await jfetch(owner, '/api/staff/cards/lookup', 'POST', { code: foreign ? foreign.public_code : code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A') });
  const adminTry = await jfetch(owner, '/api/admin/businesses');
  ok('T20a el dueño solo ve a sus clientes (1)', oc.status === 200 && oc.json.customers.length === 1, String(oc.json && oc.json.customers && oc.json.customers.length));
  ok('T20b una tarjeta de otro negocio no se encuentra', lookup.status === 404, String(lookup.status));
  ok('T20c el dueño no accede al Control Center', adminTry.status === 401 || adminTry.status === 404, String(adminTry.status));

  // ---------- H · borrador vencido (T21) y regreso tras login con un administrador existente ----------
  const v2 = await visitorPrepares(browser, `Vence ${run}`, 'silver');
  await sql(`update activation_drafts set created_at = now() - interval '2 days', expires_at = now() - interval '1 day' where ref_hash = encode(sha256($1::bytea), 'hex')`, [v2.ref]);
  await v2.ctx.close();
  const ctx2 = await browser.newContext(desktop); const vlux2 = await ctx2.newPage(); watch(vlux2, 'VLUX 2');
  await vlux2.goto(v2.href);
  await vlux2.waitForSelector('#cc-email');
  await vlux2.fill('#cc-email', `ops-${run}@vlux.e2e.test`); await vlux2.fill('#cc-pass', ADMIN_PASSWORD);
  await vlux2.click('button:has-text("Continuar")');
  await vlux2.waitForSelector('#cc-code');
  await vlux2.fill('#cc-code', totp(secret, step() + 1));
  await vlux2.click('button:has-text("Verificar")');
  await vlux2.waitForSelector('[data-testid=draft-error]');
  const errTxt = await vlux2.textContent('[data-testid=draft-error]');
  ok('T21 un borrador vencido no se puede activar y se explica con claridad (sin crear nada)', /ya no se puede usar/.test(errTxt) && /No se creó ningún negocio/.test(errTxt) && /Preparar el diseño de nuevo/.test(errTxt));
  ok('T06d con un administrador existente: login normal + 2FA regresan al proceso de activación', vlux2.url().includes('/negocios/desde-diseno'));
  await shot(vlux2, 'H1-borrador-vencido');
  await ctx2.close();

  // ---------- I · demo sigue ficticia (T24) ----------
  const demo = await (await browser.newContext(desktop)).newPage(); watch(demo, 'demo');
  await demo.goto(PUBLIC + '/');
  const demoText = await demo.textContent('body');
  ok('T24 la portada pública sigue siendo VLUX Loyalty con demo ficticia', /VLUX Loyalty/.test(demoText) && !(await demo.$('[data-testid=activation-screen]')));

  ok('Z sin errores de consola ni de página', errors.length === 0, errors.join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
