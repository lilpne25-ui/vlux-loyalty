// E2E V0.4.6 · Centro de accesos, activación presencial con código, bienvenida e instalación del panel, comunicación
// con clientes, "Mis notificaciones" y "¿Estoy cerca?". Chromium de escritorio y móvil EMULADO: no son pruebas en
// dispositivos físicos. La suscripción push real NO se prueba aquí (Chromium sin red no obtiene un endpoint de FCM).
// Uso local (BD desechable): scripts/e2e-v046.sh
const playwright = require('playwright');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const BASE = (process.env.BASE || 'http://localhost:8791').replace(/\/$/, '');
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
// Se ocultan en las capturas: secreto 2FA, enlaces de invitación, código presencial y QR que los contienen.
const MASK = (p) => [p.locator('[data-testid=totp-secret]'), p.locator('svg[aria-label^="Código QR para la app"]'), p.locator('[data-testid=owner-invite-link]'), p.locator('[data-testid=in-person-code]'), p.locator('[data-testid=in-person-modal] svg'), p.locator('[data-testid=share-modal] svg'), p.locator('[data-testid=share-url]')];
const shot = async (page, name) => { await page.waitForTimeout(450); return page.screenshot({ path: path.join(OUT, `v046-${name}.png`), fullPage: true, mask: MASK(page) }); };

function b32decode(s) { const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0'); return Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2))); }
function totp(secret, step) { const msg = Buffer.alloc(8); msg.writeBigUInt64BE(BigInt(step)); const h = crypto.createHmac('sha1', b32decode(secret)).update(msg).digest(); const o = h[h.length - 1] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }
const step = () => Math.floor(Date.now() / 30000);
let lastStep = 0;
async function freshCode(secret) { while (step() <= lastStep) await new Promise((r) => setTimeout(r, 1000)); lastStep = step(); return totp(secret, lastStep); }
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
  const desktop = { viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true };
  const iphone = { ...playwright.devices['iPhone 13'] };
  const android = { ...playwright.devices['Pixel 7'] };
  const vlux = await (await browser.newContext(desktop)).newPage(); watch(vlux, 'VLUX');
  const ownerCtx = await browser.newContext(android);
  const owner = await ownerCtx.newPage(); watch(owner, 'dueño');

  // ---------- Administrador con 2FA y alta del negocio ----------
  await vlux.goto(BASE + '/vlux-admin');
  await vlux.waitForSelector('text=Instalación del Control Center');
  await vlux.fill('#cc-setup', TOKEN);
  await vlux.fill('#cc-bname', 'Accesos VLUX');
  await vlux.fill('#cc-bemail', `acc-${run}@vlux.e2e.test`);
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
  await vlux.goto(BASE + '/vlux-admin/negocios/nuevo');
  await vlux.waitForSelector('#wz-vertical');
  const name = `Café Accesos ${run}`;
  await vlux.fill('#wz-name', name);
  await vlux.selectOption('#wz-vertical', 'cafeteria');
  await vlux.fill('#wz-city', 'Metepec');
  await vlux.fill('#wz-owner', 'Dueña Sintética');
  await vlux.fill('#wz-email', `duena-${run}@ejemplo.e2e.test`);
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=program-fields]');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.click('button.cc-choice:has-text("Piloto")');
  await vlux.click('button:has-text("Siguiente")');
  await vlux.waitForSelector('[data-testid=wizard-summary]');
  await vlux.click('main button:text-is("Crear negocio")');
  await vlux.waitForSelector('[data-testid=owner-invite-link]');
  const regUrl = (await vlux.textContent('[data-testid=created-registration-url]')).trim();
  const slug = new URL(regUrl).pathname.split('/').pop();
  const bid = (await sql('SELECT id FROM businesses WHERE slug = $1', [slug]))[0].id;
  await sql('UPDATE businesses SET latitude = 19.2513, longitude = -99.6047 WHERE id = $1', [bid]);

  // ---------- A1–A3 · Centro de accesos ----------
  await vlux.goto(`${BASE}/vlux-admin/negocios/${bid}`);
  await vlux.click('button[role=tab]:has-text("Centro de accesos")');
  await vlux.waitForSelector('[data-testid=access-hub]');
  const ownerUrl = (await vlux.textContent('[data-testid=owner-permanent-url]')).trim();
  ok('A1 el enlace permanente del panel no lleva credenciales', ownerUrl.endsWith(`/panel?negocio=${slug}`) && !ownerUrl.includes('#'), ownerUrl);
  ok('A2 hay secciones de propietario, caja y clientes', await vlux.isVisible('[data-testid=hub-owner]') && await vlux.isVisible('[data-testid=hub-cashier]') && await vlux.isVisible('[data-testid=hub-customers]'));
  await shot(vlux, 'A-centro-de-accesos');
  // Renovar: token nuevo (el viejo deja de servir).
  const before = (await sql('SELECT count(*)::int AS n FROM staff_invitations WHERE business_id = $1', [bid]))[0].n;
  await vlux.click('[data-testid=invitation-owner] [data-testid=renew-invitation]');
  await vlux.waitForSelector('[data-testid=share-modal]');
  const shareUrl = (await vlux.textContent('[data-testid=share-url]')).trim();
  ok('A3 renovar entrega un enlace de un solo uso nuevo', /\/invitacion#.{20,}/.test(shareUrl));
  // WhatsApp: se abre con el mensaje preparado; la UI no afirma que se envió.
  const wa = await vlux.getAttribute('[data-testid=share-whatsapp]', 'href');
  await vlux.$eval('[data-testid=share-whatsapp]', (a) => a.addEventListener('click', (e) => e.preventDefault()));
  await vlux.click('[data-testid=share-whatsapp]');
  await vlux.waitForSelector('[data-testid=whatsapp-opened]');
  const waTxt = await vlux.textContent('[data-testid=whatsapp-opened]');
  ok('A4 WhatsApp abre con el mensaje y VLUX no afirma que se envió', wa.startsWith('https://wa.me/?text=') && /no puede confirmar/i.test(waTxt), waTxt.slice(0, 80));
  await shot(vlux, 'A-compartir-whatsapp');
  await vlux.click('[data-testid=confirm-sent]');
  await vlux.keyboard.press('Escape');
  const shares = await sql("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'invitation.shared' ORDER BY id", [bid]);
  ok('A5 la bitácora registra solo el método (abierto / confirmado), nunca el enlace', shares.length >= 2 && shares.every((s) => Object.keys(s.details).join() === 'method') && !JSON.stringify(shares).includes(shareUrl.split('#')[1]));

  // ---------- B · activación presencial con código ----------
  await vlux.click('[data-testid=invitation-owner] [data-testid=in-person-invitation]');
  await vlux.waitForSelector('[data-testid=in-person-code]');
  const code = (await vlux.textContent('[data-testid=in-person-code]')).trim();
  ok('B1 el código presencial tiene 10 caracteres sin ambiguos', /^[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/.test(code));
  await shot(vlux, 'B-activacion-presencial');
  const live = await sql('SELECT count(*)::int AS n FROM staff_invitations WHERE business_id = $1 AND accepted_at IS NULL AND revoked_at IS NULL', [bid]);
  ok('B2 solo queda una invitación vigente (las anteriores se revocan)', live[0].n === 1, `${before}→vigentes ${live[0].n}`);
  await owner.goto(BASE + '/activar');
  await owner.waitForSelector('#act-code');
  await owner.fill('#act-code', code.toLowerCase());
  await owner.click('button:has-text("Continuar")');
  await owner.waitForSelector('#inv-pass');
  await shot(owner, 'B-activar-con-codigo');
  await owner.fill('#inv-pass', PASSWORD);
  await owner.fill('#inv-pass2', PASSWORD);
  await owner.click('button:has-text("Crear cuenta y entrar")');
  await owner.waitForSelector('[data-testid=owner-welcome]');
  ok('B3 tras activar, el dueño ve la bienvenida con 3 acciones', (await owner.$$('[data-testid=owner-welcome] .welcome-action')).length === 3);
  ok('B4 la URL queda en el panel de ESE negocio', new URL(owner.url()).searchParams.get('negocio') === slug, owner.url());
  await shot(owner, 'C-bienvenida-dueno');
  await vlux.waitForSelector('[data-testid=in-person-accepted]', { timeout: 15000 }).catch(() => undefined);
  ok('B5 el Control Center detecta la activación sin recargar', await vlux.isVisible('[data-testid=in-person-accepted]'));
  await vlux.keyboard.press('Escape');

  // ---------- C · instalación del panel (Android emulado: sin aviso nativo en Chromium headless) ----------
  await owner.click('[data-testid=welcome-install]');
  await owner.waitForSelector('[data-testid=install-screen-panel]');
  await owner.waitForFunction(() => { const i = document.querySelector('[data-testid=install-icon]'); return i && i.complete; });
  const iconOk = await owner.$eval('[data-testid=install-icon]', (img) => img.naturalWidth >= 192 && img.src.includes('/api/pwa/'));
  ok('C1 la pantalla de instalación muestra el ícono del panel del negocio', iconOk);
  ok('C2 instrucciones de Android y aclaración de que es opcional', await owner.isVisible('[data-testid=install-steps-android]') && /opcional/i.test(await owner.textContent('[data-testid=install-screen-panel]')));
  await shot(owner, 'C-instalar-panel-android');
  const manifestHref = await owner.getAttribute('link[rel=manifest]', 'href');
  ok('C3 el panel usa el manifiesto del negocio', manifestHref === `/api/pwa/${slug}/staff/panel/manifest.webmanifest`, manifestHref);
  await owner.keyboard.press('Escape');
  // Cerrar la instalación regresa a la bienvenida (puede descargar el QR); de ahí abre su panel.
  await owner.click('[data-testid=welcome-open-panel]');
  await owner.waitForSelector('[data-testid=owner-welcome]', { state: 'detached' });

  // iPhone emulado: nunca promete instalación automática.
  const ip = await (await browser.newContext(iphone)).newPage(); watch(ip, 'iPhone');
  await ip.goto(`${BASE}/acceso?negocio=${slug}`);
  await ip.waitForSelector('[data-testid=login-business]');
  ok('C4 el enlace permanente muestra el negocio en el inicio de sesión', (await ip.textContent('[data-testid=login-business]')).includes(name));
  await shot(ip, 'C-acceso-permanente-iphone');
  await ip.fill('#login-email', `duena-${run}@ejemplo.e2e.test`);
  await ip.fill('#login-password', PASSWORD);
  await ip.click('button:has-text("Entrar")');
  await ip.waitForSelector('[data-testid=install-panel]');
  await ip.click('[data-testid=install-panel]');
  await ip.waitForSelector('[data-testid=install-steps-ios]');
  ok('C5 en iPhone se explica Compartir → Agregar a pantalla de inicio, sin botón automático', !(await ip.isVisible('[data-testid=install-now]')));
  await shot(ip, 'C-instalar-panel-iphone');

  // ---------- D · comunicación con clientes ----------
  await owner.click('button[role=tab]:has-text("Comunicación")');
  await owner.waitForSelector('[data-testid=communication]');
  ok('D1 la sección de comunicación muestra suscriptores y límites', await owner.isVisible('[data-testid=comm-kpi-subs]') && /2 de 2 disponibles/.test(await owner.textContent('[data-testid=comm-promotion]')));
  await owner.check('[data-testid=set-return]');
  await owner.click('[data-testid=save-comm-settings]');
  await owner.waitForSelector('text=/Ajustes de avisos guardados/');
  ok('D2 el dueño activa "Te extrañamos" y se guarda', (await sql('SELECT return_enabled FROM notification_settings WHERE business_id = $1', [bid]))[0]?.return_enabled === true);
  await owner.fill('[data-testid=promo-title]', 'Café 2x1 el jueves');
  await owner.fill('[data-testid=promo-body]', 'Muestra tu tarjeta en caja.');
  ok('D3 sin clientes que aceptaron promociones no se puede enviar', await owner.isDisabled('[data-testid=promo-send]'));
  await shot(owner, 'D-comunicacion-clientes');

  // ---------- E · cliente: tarjeta, "Mis notificaciones" y "¿Estoy cerca?" ----------
  const custCtx = await browser.newContext({ ...android, geolocation: { latitude: 19.2545, longitude: -99.6020 }, permissions: ['notifications'] });
  const cust = await custCtx.newPage(); watch(cust, 'cliente');
  let promptedEarly = false;
  await cust.exposeFunction('__vluxPermAsked', () => { promptedEarly = true; });
  await cust.addInitScript(() => { if (window.Notification) { const o = Notification.requestPermission.bind(Notification); Notification.requestPermission = (...a) => { window.__vluxPermAsked(); return o(...a); }; } });
  await cust.goto(`${BASE}/n/${slug}`);
  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Clienta Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  await cust.waitForTimeout(1200);
  ok('E1 no se pide permiso de notificaciones al cargar la tarjeta', !promptedEarly);
  await cust.click('[data-testid=my-notifications] button[aria-expanded]');
  const STATES = ['offer', 'unavailable', 'denied', 'unsupported', 'ios-install-first', 'active'];
  await cust.waitForSelector(STATES.map((x) => `[data-testid=push-${x}]`).join(', '));
  let pushState = 'desconocido';
  for (const x of STATES) if (await cust.isVisible(`[data-testid=push-${x}]`)) { pushState = x; break; }
  ok('E2 "Mis notificaciones" explica primero y ofrece categorías (Recompensas activa, Promociones no)', pushState === 'offer' ? (await cust.isChecked('[data-testid=push-choose-rewards]')) && !(await cust.isChecked('[data-testid=push-choose-promotions]')) : pushState !== 'active', `estado en Chromium sin interfaz: ${pushState}`);
  await shot(cust, 'E-mis-notificaciones');
  await custCtx.grantPermissions(['geolocation']);
  await cust.click('[data-testid=nearby-check]');
  await cust.waitForSelector('[data-testid=nearby-result]');
  const near = await cust.textContent('[data-testid=nearby-result]');
  ok('E3 "¿Estoy cerca?" calcula la distancia en el teléfono', /Estás a unos 4\d0 m/.test(near), near);
  await shot(cust, 'E-estoy-cerca');
  const geoCalls = [];
  cust.on('request', (r) => { if (/latitude|lat=|19\.25/.test(r.url() + (r.postData() || ''))) geoCalls.push(r.url()); });
  await cust.click('[data-testid=nearby-check]').catch(() => undefined);
  await cust.waitForTimeout(800);
  ok('E4 la ubicación del cliente no se envía al servidor', geoCalls.length === 0, geoCalls.join(','));
  const iCust = await (await browser.newContext(iphone)).newPage(); watch(iCust, 'iPhone cliente');
  await iCust.goto(`${BASE}/n/${slug}`);
  await iCust.click('text=Obtener mi tarjeta gratis');
  await iCust.fill('#reg-name', 'Cliente iPhone');
  await iCust.check('#reg-privacy');
  await iCust.click('button:has-text("Crear mi tarjeta")');
  await iCust.waitForSelector('[data-testid=card-code]');
  await iCust.click('[data-testid=my-notifications] button[aria-expanded]');
  await iCust.waitForSelector('[data-testid=push-ios-install-first], [data-testid=push-unavailable]');
  ok('E5 en iPhone (Safari, sin instalar) se explica agregar a inicio primero', await iCust.isVisible('[data-testid=push-ios-install-first]') || await iCust.isVisible('[data-testid=push-unavailable]'));
  await shot(iCust, 'E-notificaciones-iphone');

  // ---------- F · aislamiento: el panel de otro negocio no se abre por accidente ----------
  await owner.goto(`${BASE}/panel?negocio=vlux-demo-inexistente-${run}`);
  await owner.waitForSelector('[data-testid=business-gate], [data-testid=communication], h1', { timeout: 8000 }).catch(() => undefined);
  ok('F1 un enlace de otro negocio muestra el aviso y no su panel', await owner.isVisible('[data-testid=business-gate]'));
  await shot(owner, 'F-otro-negocio');

  // ---------- G · móvil sin scroll horizontal ----------
  for (const [p, n] of [[owner, 'panel'], [cust, 'tarjeta']]) {
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(`G ${n} sin scroll horizontal en móvil`, over <= 1, String(over));
  }
  ok('Z sin errores de consola ni de página', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal: ${results.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
