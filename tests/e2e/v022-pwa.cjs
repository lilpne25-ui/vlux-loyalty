// E2E V0.2.2 · PWA + escenario de producto con 3 roles, en Chromium, WebKit o Firefox.
//
// Escenario obligatorio: Cliente A crea su tarjeta y la "instala" → Empleado B lee el QR y registra
// compras → Cliente A ve el sello en la app instalada → Dueño C ve la operación → Empleado B canjea →
// Dueño C ve el canje. Además: manifiesto, íconos, service worker, caché segura, vinculación, sin conexión.
//
// Limitaciones (se reportan, no se ocultan):
//  - "App instalada" se EMULA: contexto de navegador nuevo (almacenamiento separado, como iPhone) con
//    display-mode: standalone forzado. No equivale a instalar en un teléfono físico.
//  - WebKit automatizado no equivale a Safari en iPhone.
//  - El evento beforeinstallprompt de Android se SIMULA (los navegadores headless no lo emiten).
//
// Uso local:  BASE=http://localhost:8788 BROWSER=webkit PLATFORM_ADMIN_TOKEN=... node tests/e2e/v022-pwa.cjs
// Contra un despliegue sin token de plataforma (negocio demo ya creado):
//   BASE=https://… SLUG=vlux-demo OWNER_EMAIL=… EMP_EMAIL=… STAFF_PASSWORD=… node tests/e2e/v022-pwa.cjs
// Despliegue protegido por Vercel: VERCEL_BYPASS=<secreto> (nunca en el repositorio).
const playwright = require('playwright');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const BASE = (process.env.BASE || 'http://localhost:8788').replace(/\/$/, '');
const BROWSER = process.env.BROWSER || 'chromium';
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const BYPASS = process.env.VERCEL_BYPASS;
const PASSWORD = process.env.STAFF_PASSWORD || 'contraseña-e2e-2026';
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const ok = (name, cond, extra = '') => { results.push([!!cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|429|Failed to load resource|net::ERR_INTERNET_DISCONNECTED|NetworkError|Load failed|offline/i) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const headers = BYPASS ? { 'x-vercel-protection-bypass': BYPASS, 'x-vercel-set-bypass-cookie': 'true' } : {};
const mobile = (ua) => ({ viewport: { width: 390, height: 844 }, userAgent: ua, extraHTTPHeaders: headers, ...(BROWSER === 'firefox' ? {} : { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }) });
const STANDALONE = () => {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : mm(q));
  Object.defineProperty(navigator, 'standalone', { get: () => true });
};
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `v022-${BROWSER}-${name}.png`) }).catch(() => undefined);

async function login(page, email, password) {
  await page.goto(BASE + '/acceso');
  await page.fill('#login-email', email);
  await page.fill('#login-password', password);
  await page.click('button:has-text("Entrar")');
}
const apiIn = (page, method, p, body) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch('/api' + u, { method: m, headers: b ? { 'content-type': 'application/json' } : undefined, body: b ? JSON.stringify(b) : undefined });
  return { s: r.status, j: await r.json().catch(() => null) };
}, [method, p, body]);

(async () => {
  const browserType = playwright[BROWSER];
  const browser = await browserType.launch();
  const run = crypto.randomBytes(3).toString('hex');
  let slug = process.env.SLUG, ownerEmail = process.env.OWNER_EMAIL, empEmail = process.env.EMP_EMAIL, empPassword = PASSWORD;
  const mode = slug ? 'despliegue (negocio demo existente)' : 'local (negocio creado para la prueba)';
  console.log(`# V0.2.2 · ${BROWSER} · ${BASE} · modo ${mode}`);

  // ---------- Preparación ----------
  if (!slug) {
    slug = `pwa-e2e-${run}`; ownerEmail = `dueno@${slug}.e2e.test`; empEmail = `caja@${slug}.e2e.test`;
    const r = await fetch(BASE + '/api/platform/businesses', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers },
      body: JSON.stringify({ slug, name: 'Café PWA E2E', city: 'Toluca', vertical: 'cafeteria', primaryColor: '#2B1B14', accentColor: '#C9A15B', rules: { stampsRequired: 4, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Una bebida de cortesía' }, owner: { email: ownerEmail, displayName: 'Dueña E2E', password: PASSWORD } }),
    });
    ok('00 alta del negocio de prueba', r.status === 201, String(r.status));
  }

  const ownerCtx = await browser.newContext({ viewport: { width: 1280, height: 860 }, extraHTTPHeaders: headers });
  const owner = await ownerCtx.newPage(); watch(owner, 'dueño');
  await login(owner, ownerEmail, PASSWORD);
  await owner.waitForSelector('[data-testid=kpi-customers-value]');
  if (!process.env.SLUG) {
    const e = await apiIn(owner, 'POST', '/owner/staff', { email: empEmail, displayName: 'Caja E2E', password: PASSWORD });
    ok('00b alta del empleado', e.s === 200 || e.s === 201, String(e.s));
  }
  const before = (await apiIn(owner, 'GET', '/owner/dashboard')).j.kpis;

  // ---------- Cliente A en el navegador ----------
  const safariCtx = await browser.newContext(mobile(IPHONE_UA));
  const cust = await safariCtx.newPage(); watch(cust, 'cliente-navegador');
  await cust.goto(`${BASE}/n/${slug}`);
  await cust.waitForSelector('text=Obtener mi tarjeta gratis');
  const head = await cust.evaluate(() => ({ manifest: document.querySelector('link[rel=manifest]')?.getAttribute('href'), apple: document.querySelector('link[rel=apple-touch-icon]')?.getAttribute('href'), theme: document.querySelector('meta[name=theme-color]')?.getAttribute('content') }));
  ok('P01 la página del negocio enlaza su manifiesto', head.manifest === `/api/pwa/${slug}/manifest.webmanifest`, head.manifest);
  const man = await cust.evaluate(async (u) => { const r = await fetch(u); return { s: r.status, ct: r.headers.get('content-type'), j: await r.json() }; }, head.manifest);
  const m = man.j;
  ok('P02 manifiesto válido (id, start_url dentro de scope, standalone, íconos 192/512/maskable)',
    man.s === 200 && /manifest\+json/.test(man.ct) && m.id === `/n/${slug}` && m.start_url.startsWith(m.scope) && m.display === 'standalone'
    && ['192x192', '512x512'].every((s) => m.icons.some((i) => i.sizes === s && i.purpose === 'any')) && m.icons.some((i) => i.purpose === 'maskable'), JSON.stringify({ name: m.name, short: m.short_name }));
  const icons = await cust.evaluate(async (list) => Promise.all(list.map(async (u) => { const r = await fetch(u); const b = new Uint8Array(await r.arrayBuffer()); return r.status === 200 && r.headers.get('content-type') === 'image/png' && b[1] === 0x50; })), [...m.icons.map((i) => i.src), head.apple]);
  ok('P03 íconos accesibles (PNG) incluido el de iPhone', icons.every(Boolean) && !!head.apple, head.apple);
  ok('P04 HTTPS o localhost (contexto seguro para service worker)', await cust.evaluate(() => window.isSecureContext));

  await cust.click('text=Obtener mi tarjeta gratis');
  await cust.fill('#reg-name', 'Ana Sintética');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  ok('A1 registro de cliente y tarjeta creada', /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(code), code);
  const goal = Number((await cust.textContent('[data-testid=stamp-count]')).match(/de (\d+)/)[1]);
  await cust.waitForSelector('text=/Tarjeta creada: /', { state: 'detached', timeout: 10000 }).catch(() => undefined);
  const qr = cust.locator('svg[aria-label^="Código QR de la tarjeta"]').locator('..');
  const qrPng = path.join(OUT, `v022-${BROWSER}-qr.png`);
  await qr.screenshot({ path: qrPng });

  // Service worker
  const sw = await cust.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return { supported: false };
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 10000))]);
    return { supported: true, active: !!reg?.active, scope: reg?.scope };
  });
  ok('P05 service worker registrado y activo con scope /', sw.supported && sw.active && sw.scope === BASE + '/', JSON.stringify(sw));
  await cust.reload();
  await cust.waitForSelector('[data-testid=card-code]');
  ok('P06 la página queda controlada por el service worker', await cust.evaluate(() => !!navigator.serviceWorker?.controller));
  const swHead = await cust.evaluate(async () => { const r = await fetch('/sw.js', { cache: 'no-store' }); return { cc: r.headers.get('cache-control'), body: await r.text() }; });
  ok('P07 /sw.js se revalida siempre (no-cache) y tiene versión de build', /no-cache/.test(swHead.cc || '') && /const BUILD_ID = "[0-9a-f]{12}"/.test(swHead.body), swHead.cc);

  // Guardar en el teléfono (iPhone): guía + código de vinculación
  ok('U1 sección "Guarda tu tarjeta" visible en el navegador', await cust.isVisible('[data-testid=save-card]'));
  await cust.click('[data-testid=add-to-phone]');
  await cust.waitForSelector('[data-testid=install-guide-ios-safari]');
  await cust.waitForSelector('[data-testid=pair-code]');
  const pairCode = (await cust.textContent('[data-testid=pair-code]')).replace(/\s/g, '');
  ok('U2 iPhone: guía de Safari (Compartir → Agregar a pantalla de inicio) con código de 8 dígitos', /^\d{8}$/.test(pairCode) && await cust.isVisible('text=Agregar a pantalla de inicio'));
  await shot(cust, 'U2-guia-iphone');
  await cust.click('button:has-text("Entendido")');

  // ---------- App instalada (emulada): almacenamiento separado, modo standalone ----------
  const appCtx = await browser.newContext(mobile(IPHONE_UA));
  await appCtx.addInitScript(STANDALONE);
  const app = await appCtx.newPage(); watch(app, 'app-instalada');
  await app.goto(`${BASE}${m.start_url}`);
  await app.waitForSelector('[data-testid=pair-screen]');
  ok('P08 app instalada sin cookie: pide vincular (no muestra registro ni datos ajenos)', await app.isVisible('[data-testid=pair-screen]'));
  await shot(app, 'P08-vincular');
  await app.fill('#pair-code-input', pairCode);
  await app.click('button:has-text("Abrir mi tarjeta")');
  await app.waitForSelector('[data-testid=card-code]');
  ok('P09 vinculada con el código: la app abre la MISMA tarjeta', (await app.textContent('[data-testid=card-code]')).trim() === code);
  ok('P10 en modo app no se ofrece "Agregar a mi teléfono"', !(await app.isVisible('[data-testid=save-card]')));
  const reuse = await (await browser.newContext(mobile(IPHONE_UA))).newPage();
  await reuse.goto(`${BASE}/n/${slug}`);
  const reuseStatus = await apiIn(reuse, 'POST', `/me/${slug}/pair`, { code: pairCode });
  ok('P11 el código de vinculación no se puede reutilizar', reuseStatus.s === 404, String(reuseStatus.s));
  await reuse.context().close();
  // Reabrir la app (cerrar y volver a abrir la pestaña en el mismo almacenamiento)
  await app.close();
  const app2 = await appCtx.newPage(); watch(app2, 'app-reabierta');
  await app2.goto(`${BASE}${m.start_url}`);
  await app2.waitForSelector('[data-testid=card-code]');
  ok('P12 persistencia: al reabrir la app sigue la tarjeta (cookie HttpOnly propia de la app)', (await app2.textContent('[data-testid=card-code]')).trim() === code);
  const jsCookies = await app2.evaluate(() => document.cookie);
  ok('S1 la cookie de la tarjeta no es legible desde JavaScript', !/vlx_card/.test(jsCookies));

  // ---------- Empleado B: lee el QR (foto) y registra compra ----------
  const empCtx = await browser.newContext(mobile(ANDROID_UA));
  const emp = await empCtx.newPage(); watch(emp, 'empleado');
  await login(emp, empEmail, empPassword);
  const first = await Promise.race([
    emp.waitForSelector('text=Cambia tu contraseña temporal').then(() => 'change'),
    emp.waitForSelector('text=Panel del empleado').then(() => 'panel'),
    emp.waitForSelector('[data-testid=kpi-customers-value]').then(() => 'owner'),
  ]);
  if (first === 'change') {
    empPassword = PASSWORD + '-propia';
    await emp.fill('#pwd-current', PASSWORD); await emp.fill('#pwd-new', empPassword); await emp.fill('#pwd-repeat', empPassword);
    await emp.click('button:has-text("Cambiar contraseña")');
    await emp.waitForSelector('text=Panel del empleado');
  }
  await emp.setInputFiles('#scan-file', qrPng);
  await emp.waitForSelector('[data-testid=card-panel]', { timeout: 15000 });
  ok('B1 lectura de QR (foto) identifica la tarjeta del cliente', (await emp.textContent('[data-testid=card-panel] h2')).includes('Ana Sintética'));
  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('[data-testid=staff-stamp-count]:has-text("1")');
  ok('B2 compra registrada y sello otorgado por el servidor', true);
  const t0 = Date.now();
  await app2.waitForSelector(`[data-testid=stamp-count]:has-text("1 de ${goal}")`, { timeout: 15000 });
  ok('A2 sincronización: la app instalada ve el sello sin recargar', true, `${Date.now() - t0} ms`);
  await shot(app2, 'A2-app-sello');
  await cust.waitForSelector(`[data-testid=stamp-count]:has-text("1 de ${goal}")`, { timeout: 15000 });
  ok('A3 el navegador original también se actualiza', true);
  await owner.waitForFunction(async (p) => { const r = await fetch('/api/owner/dashboard'); const j = await r.json(); return j.kpis.purchases === p; }, before.purchases + 1, { timeout: 15000, polling: 1000 });
  ok('C1 el dueño consulta la operación (compras +1)', true);

  await emp.click('button:has-text("Registrar compra")');
  await emp.waitForSelector('text=¿Otra compra?');
  ok('B3 prevención de duplicados: el doble toque pide confirmación y no suma', (await emp.textContent('[data-testid=staff-stamp-count]')).trim().startsWith('1'));
  await emp.click('button:has-text("Sí, registrar otra")');
  for (let n = 2; n <= goal; n++) {
    if (n > 2) { await emp.click('button:has-text("Registrar compra")'); await emp.click('button:has-text("Sí, registrar otra")'); }
    await emp.waitForSelector(`[data-testid=staff-stamp-count]:has-text("${n}")`);
  }
  await emp.waitForSelector('text=Recompensa disponible');
  await app2.waitForSelector('text=¡Felicidades!', { timeout: 15000 });
  ok('A4 la recompensa aparece en la app instalada', true);
  await shot(app2, 'A4-app-recompensa');
  await app2.keyboard.press('Escape').catch(() => undefined);

  const cardId = (await apiIn(emp, 'POST', '/staff/cards/lookup', { code })).j.cardId;
  const rewardId = (await apiIn(emp, 'GET', `/staff/cards/${cardId}`)).j.card.reward.id;
  await emp.click('button:has-text("Confirmar canje")');
  await emp.click('button:has-text("Sí, canjear")');
  await emp.waitForSelector('text=Canje confirmado');
  ok('B4 canje confirmado por el servidor', true);
  const dup = await apiIn(owner, 'POST', `/staff/rewards/${rewardId}/redeem`, {});
  ok('B5 canje duplicado rechazado', dup.s === 409, String(dup.s));
  const custForge = await apiIn(app2, 'POST', `/staff/cards/${cardId}/purchases`, { itemCount: 1, idempotencyKey: crypto.randomUUID().replace(/-/g, ''), confirmDuplicate: true });
  ok('S2 el cliente no puede sellarse desde su app (backend lo rechaza)', custForge.s === 401 || custForge.s === 403, String(custForge.s));
  await app2.waitForSelector(`[data-testid=stamp-count]:has-text("0 de ${goal}")`, { timeout: 15000 });
  ok('A5 la app instalada muestra el ciclo nuevo', true);
  await owner.waitForFunction(async (r) => { const j = await (await fetch('/api/owner/dashboard')).json(); return j.kpis.redemptions === r; }, before.redemptions + 1, { timeout: 15000, polling: 1000 });
  const after = (await apiIn(owner, 'GET', '/owner/dashboard')).j.kpis;
  ok('C2 el dueño consulta el canje; compras y visitas no se confunden', after.redemptions === before.redemptions + 1 && after.purchases === before.purchases + goal && after.visits === before.visits + 1, JSON.stringify({ compras: after.purchases - before.purchases, visitas: after.visits - before.visits, canjes: after.redemptions - before.redemptions }));

  // ---------- Caché del service worker: solo recursos públicos ----------
  const cached = await app2.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  ok('P13 la caché solo tiene index.html y /assets (sin /api, tokens ni datos del cliente)', cached.length > 0 && cached.every((p) => p === '/index.html' || p.startsWith('/assets/')), cached.join(','));

  // ---------- Sin conexión ----------
  await appCtx.setOffline(true);
  await app2.reload().catch(() => undefined);
  const offlineUi = await Promise.race([
    app2.waitForSelector('[data-testid=offline-screen]', { timeout: 10000 }).then(() => 'screen'),
    app2.waitForSelector('[data-testid=offline-banner]', { timeout: 10000 }).then(() => 'banner'),
  ]).catch(() => 'ninguno');
  ok('P14 sin conexión: la app abre desde caché y muestra un aviso claro (no inventa sellos)', offlineUi !== 'ninguno' && !(await app2.isVisible('text=¡Nuevo sello')), offlineUi);
  await shot(app2, 'P14-sin-conexion');
  await appCtx.setOffline(false);
  await app2.click('button:has-text("Reintentar")').catch(() => undefined);
  await app2.waitForSelector(`[data-testid=stamp-count]:has-text("0 de ${goal}")`, { timeout: 15000 });
  ok('P15 al reconectar vuelve a mostrar los datos del servidor', true);

  // ---------- Actualización: el SW nuevo borra cachés viejas ----------
  const upd = await app2.evaluate(async () => {
    await (await caches.open('vlux-shell-viejo')).put('/index.html', new Response('viejo'));
    // Simula una versión nueva: otra URL de script obliga a instalar y activar de nuevo.
    const nreg = await navigator.serviceWorker.register('/sw.js?version=nueva', { scope: '/' });
    await new Promise((res) => { const w = nreg.installing || nreg.waiting || nreg.active; if (w?.state === 'activated') return res(); w?.addEventListener('statechange', () => w.state === 'activated' && res()); setTimeout(res, 8000); });
    return (await caches.keys());
  });
  ok('P16 al activar una versión nueva se eliminan las cachés anteriores', !upd.includes('vlux-shell-viejo') && upd.some((k) => /^vlux-shell-[0-9a-f]{12}$/.test(k)), upd.join(','));

  // ---------- Android: instalación nativa (evento simulado) ----------
  const andCtx = await browser.newContext(mobile(ANDROID_UA));
  const and = await andCtx.newPage(); watch(and, 'android');
  await and.goto(`${BASE}/n/${slug}`);
  await and.click('text=Obtener mi tarjeta gratis');
  await and.fill('#reg-name', 'Beto Sintético');
  await and.check('#reg-privacy');
  await and.click('button:has-text("Crear mi tarjeta")');
  await and.waitForSelector('[data-testid=card-code]');
  await and.evaluate(() => {
    const ev = new Event('beforeinstallprompt');
    ev.prompt = () => { window.__prompted = true; return Promise.resolve(); };
    ev.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(ev);
  });
  await and.click('[data-testid=add-to-phone]');
  await and.waitForSelector('text=Agregada.');
  ok('U3 Android: el botón usa el diálogo nativo de instalación (evento simulado) y confirma', await and.evaluate(() => window.__prompted === true));
  const and2 = await (await browser.newContext(mobile(ANDROID_UA))).newPage();
  await and2.goto(`${BASE}/n/${slug}`);
  await and2.click('text=Obtener mi tarjeta gratis'); await and2.fill('#reg-name', 'Caro Sintética'); await and2.check('#reg-privacy');
  await and2.click('button:has-text("Crear mi tarjeta")'); await and2.waitForSelector('[data-testid=card-code]');
  await and2.click('[data-testid=add-to-phone]');
  await and2.waitForSelector('[data-testid=install-guide-android]');
  ok('U4 Android sin diálogo nativo: muestra instrucciones del menú del navegador', await and2.isVisible('text=Agregar a la pantalla principal'));
  await shot(and2, 'U4-guia-android');

  // ---------- Separación de negocios ----------
  if (!process.env.SLUG && TOKEN) {
    const otherSlug = `pwa-otro-${run}`;
    await fetch(BASE + '/api/platform/businesses', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...headers }, body: JSON.stringify({ slug: otherSlug, name: 'Barbería PWA E2E', city: 'Metepec', vertical: 'barberia', rules: { stampsRequired: 6, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Un corte' }, owner: { email: `dueno@${otherSlug}.e2e.test`, displayName: 'Dueño 2', password: PASSWORD } }) });
    const o2 = await (await browser.newContext({ extraHTTPHeaders: headers })).newPage();
    await login(o2, `dueno@${otherSlug}.e2e.test`, PASSWORD);
    await o2.waitForSelector('[data-testid=kpi-customers-value]');
    const cross = await apiIn(o2, 'POST', '/staff/cards/lookup', { code });
    const k2 = (await apiIn(o2, 'GET', '/owner/dashboard')).j.kpis;
    ok('S3 otro negocio no ve ni identifica la tarjeta', cross.s === 404 && k2.customers === 0, String(cross.s));
    const m2 = await o2.evaluate(async (s) => (await (await fetch(`/api/pwa/${s}/manifest.webmanifest`)).json()), otherSlug);
    ok('P17 cada negocio tiene su propio manifiesto (id y nombre distintos)', m2.id !== m.id && m2.name !== m.name, m2.name);
    const crossCard = await apiIn(app2, 'GET', `/me/${otherSlug}/card`);
    ok('S4 la cookie de una tarjeta no abre tarjetas de otro negocio', crossCard.s === 200 && crossCard.j.card === null);
  }

  ok('sin errores de consola ni de página', errors.length === 0, errors.slice(0, 5).join(' | '));
  await browser.close();
  const fails = results.filter(([c]) => !c).length;
  console.log(`\nTotal ${BROWSER}: ${results.length - fails} PASS, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('FAIL ERROR', e.message); console.log(`\nTotal ${BROWSER}: ${results.filter(([c]) => c).length} PASS, ${results.filter(([c]) => !c).length + 1} FAIL`); process.exit(1); });
