// E2E 1.0.x · Pulido UX operativo: cartel QR (impresión/descargas), recuperación de acceso, ayuda VLUX y reporte de
// problemas. Chromium de escritorio y móvil EMULADO: «iPhone» = Chromium con viewport/UA de iPhone (NO es el motor
// WebKit de Safari) y «Android» = Chromium con viewport/UA de Pixel 7 (mismo motor que Chrome Android, sin el sistema
// de impresión de Android). No sustituye pruebas en teléfonos e impresoras reales.
// Verifica que el QR se LEE después de «imprimir»: PDF de impresión de Chromium y PDF/PNG descargados se rasterizan
// (pdftoppm + Pillow) y se decodifican con jsQR.
// Uso local (BD desechable): scripts/e2e-v1-ux.sh
const { chromium } = require('playwright');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const jsQR = require('jsqr');

const BASE = (process.env.BASE || 'http://localhost:8792').replace(/\/$/, '');
const TOKEN = process.env.PLATFORM_ADMIN_TOKEN;
const PASSWORD = 'contraseña-e2e-2026';
const OUT = process.env.OUT || path.join(__dirname, '..', '..', 'docs', 'evidencia', 'capturas-v1-ux');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'v1ux-'));
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const ok = (name, cond, extra = '') => { results.push([!!cond, name]); console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const errors = [];
const watch = (page, who, allowed = /40[1349]|429|503/) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !allowed.test(m.text())) errors.push(`${who}: ${m.text()}`); });
};
// En las capturas se ocultan enlaces personales y sus QR (son llaves de la tarjeta).
const MASK = (p) => [p.locator('[data-testid=recovery-link]'), p.locator('[data-testid=recovery-issued] svg')];
const shot = async (page, name) => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true, mask: MASK(page) }); };
async function sql(q, params = []) {
  const url = process.env.DATABASE_ADMIN_URL || '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('SQL de prueba solo contra una BD local');
  const pg = require('pg'); const c = new pg.Client({ connectionString: url }); await c.connect();
  try { return (await c.query(q, params)).rows; } finally { await c.end(); }
}
async function login(page, email) {
  await page.goto(BASE + '/acceso');
  await page.fill('#login-email', email);
  await page.fill('#login-password', PASSWORD);
  await page.click('button:has-text("Entrar")');
  await page.waitForURL(/\/panel/);
}
/** Imagen (PNG) → RGBA con Pillow (reducida si es muy grande) → jsQR. */
function decodePng(file, maxSide = 1400) {
  const raw = path.join(TMP, path.basename(file) + '.rgba');
  const py = `import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('RGBA')\nw,h=im.size\ns=min(1.0,${maxSide}/max(w,h))\nif s<1: im=im.resize((int(w*s),int(h*s)), Image.NEAREST)\nopen(sys.argv[2],'wb').write(im.tobytes())\nprint(w,h,im.size[0],im.size[1])`;
  const r = spawnSync('python3', ['-I', '-c', py, file, raw], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  const [w, h, dw, dh] = r.stdout.trim().split(' ').map(Number);
  const qr = jsQR(new Uint8ClampedArray(fs.readFileSync(raw)), dw, dh, { inversionAttempts: 'attemptBoth' });
  return { w, h, data: qr?.data ?? null };
}
/** PDF → PNG a `dpi` (como una impresión) → jsQR. Devuelve también el número de páginas. */
function decodePdf(file, dpi = 100) {
  const prefix = path.join(TMP, path.basename(file, '.pdf') + '-r');
  const r = spawnSync('pdftoppm', ['-r', String(dpi), '-png', file, prefix]);
  if (r.status !== 0) throw new Error(String(r.stderr));
  const pages = fs.readdirSync(TMP).filter((f) => f.startsWith(path.basename(prefix)) && f.endsWith('.png')).sort();
  return { pages: pages.length, ...decodePng(path.join(TMP, pages[0]), 3000) };
}
async function download(page, testid) {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(`[data-testid=${testid}]`)]);
  const f = path.join(TMP, d.suggestedFilename());
  await d.saveAs(f);
  return f;
}

(async () => {
  // Los límites por IP (5 solicitudes de recuperación por hora) se comparten entre corridas en localhost.
  await sql('DELETE FROM rate_limits'); // BD local desechable: las llaves están cifradas (hash) y todo sale de 127.0.0.1
  const run = crypto.randomBytes(3).toString('hex');
  const slug = `ux-e2e-${run}`;
  const name = 'Café Ñandú del Centro Histórico';
  const ownerEmail = `dueno@${slug}.e2e.test`;
  const r = await fetch(BASE + '/api/platform/businesses', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ slug, name, city: 'Toluca', vertical: 'cafeteria', rules: { stampsRequired: 8, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Una bebida de cortesía' }, owner: { email: ownerEmail, displayName: 'Dueña E2E', password: PASSWORD } }),
  });
  ok('00 alta del negocio de prueba', r.status === 201, String(r.status));
  const customerUrl = `${BASE}/n/${slug}`;

  const browser = await chromium.launch();
  const mobile = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1' };
  const android = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' };
  const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const desk = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })).newPage(); watch(desk, 'dueño-escritorio');
  const phoneOwnerCtx = await browser.newContext(mobile);
  const phoneOwner = await phoneOwnerCtx.newPage(); watch(phoneOwner, 'dueño-móvil');
  // Ningún enlace a wa.me sale a internet en la prueba.
  for (const ctx of [desk.context(), phoneOwnerCtx]) await ctx.route(/wa\.me/, (route) => route.fulfill({ status: 200, body: 'wa' }));

  // ---------------- R1 · Cartel QR ----------------
  await login(desk, ownerEmail);
  await desk.click('button[role=tab]:has-text("Accesos")');
  await desk.waitForSelector('[data-testid=counter-qr]');
  ok('R1-01 panel: botones Imprimir, PDF, PNG y QR solo visibles', await desk.isVisible('[data-testid=poster-open-print]') && await desk.isVisible('[data-testid=poster-pdf]') && await desk.isVisible('[data-testid=poster-png]') && await desk.isVisible('[data-testid=poster-qr-only]'));
  await shot(desk, 'R1-panel-cartel-escritorio');

  const pdfLetter = await download(desk, 'poster-pdf');
  const dl = decodePdf(pdfLetter, 100);
  const head = fs.readFileSync(pdfLetter).subarray(0, 8).toString();
  ok('R1-02 PDF carta descargado: 1 página, QR legible a 100 ppp', head.startsWith('%PDF') && dl.pages === 1 && dl.data === customerUrl, `${path.basename(pdfLetter)} · ${dl.w}×${dl.h} · ${dl.data}`);
  ok('R1-03 PDF carta mide 8.5×11 in', dl.w === 850 && dl.h === 1100, `${dl.w}×${dl.h} a 100 ppp`);
  const pngLetter = await download(desk, 'poster-png');
  const pl = decodePng(pngLetter);
  ok('R1-04 PNG carta 1700×2200 (200 ppp) con QR legible', pl.w === 1700 && pl.h === 2200 && pl.data === customerUrl, `${pl.w}×${pl.h}`);
  const qrOnly = await download(desk, 'poster-qr-only');
  const qo = decodePng(qrOnly);
  ok('R1-05 QR solo: PNG ≥ 2000 px legible', qo.w >= 2000 && qo.data === customerUrl, `${qo.w}×${qo.h}`);
  await desk.click('[data-testid=poster-size-a5]');
  const pdfA5 = await download(desk, 'poster-pdf');
  const da5 = decodePdf(pdfA5, 100);
  ok('R1-06 PDF A5: 148×210 mm y QR legible', Math.abs(da5.w - 583) <= 1 && Math.abs(da5.h - 827) <= 1 && da5.data === customerUrl, `${da5.w}×${da5.h}`);
  // Impresión del QR más pequeño posible (A5 a 72 ppp ≈ impresora mala): aún se lee.
  const lowA5 = decodePdf(pdfA5, 72);
  ok('R1-07 PDF A5 rasterizado a 72 ppp (impresión pobre) sigue legible', lowA5.data === customerUrl);

  // Ruta de impresión en el TELÉFONO del dueño: imprime a carta, 1 hoja, sin barra ni pestañas, QR legible.
  await login(phoneOwner, ownerEmail);
  await phoneOwner.click('button[role=tab]:has-text("Accesos")');
  await phoneOwner.waitForSelector('[data-testid=counter-qr]');
  await shot(phoneOwner, 'R1-panel-cartel-movil');
  await phoneOwner.click('[data-testid=poster-open-print]');
  await phoneOwner.waitForURL(/\/panel\/cartel\?negocio=.*tam=carta/);
  await phoneOwner.waitForSelector('[data-testid=poster-image]');
  await phoneOwner.waitForFunction(() => { const i = document.querySelector('[data-testid=poster-image]'); return i && i.complete && i.naturalWidth > 0; });
  await shot(phoneOwner, 'R1-ruta-impresion-movil');
  ok('R1-08 ruta /panel/cartel sin barra superior ni pestañas', !(await phoneOwner.isVisible('.topbar')) && !(await phoneOwner.isVisible('[role=tablist]')));
  await phoneOwner.emulateMedia({ media: 'print' });
  const printBox = await phoneOwner.locator('[data-testid=poster-image]').boundingBox();
  const toolbarHidden = !(await phoneOwner.isVisible('.no-print'));
  const printPdf = path.join(TMP, 'impresion-movil-carta.pdf');
  await phoneOwner.pdf({ path: printPdf, preferCSSPageSize: true, printBackground: true });
  await phoneOwner.emulateMedia({ media: 'screen' });
  const pp = decodePdf(printPdf, 100);
  ok('R1-09 imprimir desde móvil: 1 hoja carta, QR legible, barra oculta', pp.pages === 1 && pp.w === 850 && pp.h === 1100 && pp.data === customerUrl && toolbarHidden, `${pp.pages} pág · ${pp.w}×${pp.h}`);
  ok('R1-10 en impresión el cartel ocupa el ancho de la hoja (≈ 816 px CSS = 215.9 mm), no el del teléfono', printBox && Math.abs(printBox.width - 816) < 3, `${printBox && Math.round(printBox.width)} px`);
  // Zoom del navegador: la impresión no cambia (la imagen tiene tamaño físico).
  await phoneOwner.evaluate(() => { document.body.style.zoom = '1.6'; });
  await phoneOwner.emulateMedia({ media: 'print' });
  const zoomPdf = path.join(TMP, 'impresion-zoom.pdf');
  await phoneOwner.pdf({ path: zoomPdf, preferCSSPageSize: true, printBackground: true });
  await phoneOwner.emulateMedia({ media: 'screen' });
  await phoneOwner.evaluate(() => { document.body.style.zoom = ''; });
  const zp = decodePdf(zoomPdf, 100);
  ok('R1-11 con zoom 160 % sigue saliendo 1 hoja y el QR se lee', zp.pages === 1 && zp.data === customerUrl, `${zp.pages} pág`);
  // A5 desde la ruta.
  await phoneOwner.click('[data-testid=poster-size-a5]');
  await phoneOwner.waitForURL(/tam=a5/);
  await phoneOwner.waitForFunction(() => { const i = document.querySelector('[data-testid=poster-image]'); return i && i.complete && i.naturalWidth > 0; });
  const a5Print = path.join(TMP, 'impresion-movil-a5.pdf');
  await phoneOwner.emulateMedia({ media: 'print' });
  await phoneOwner.pdf({ path: a5Print, preferCSSPageSize: true, printBackground: true });
  await phoneOwner.emulateMedia({ media: 'screen' });
  const pa5 = decodePdf(a5Print, 100);
  ok('R1-12 imprimir A5 desde móvil: 1 hoja A5 y QR legible', pa5.pages === 1 && Math.abs(pa5.w - 583) <= 1 && pa5.data === customerUrl, `${pa5.w}×${pa5.h}`);
  const mobilePdf = await download(phoneOwner, 'poster-pdf');
  ok('R1-13 descargar PDF desde el teléfono funciona', decodePdf(mobilePdf).data === customerUrl);

  // ---------------- R3 · Ayuda VLUX en vistas del cliente ----------------
  const custCtx = await browser.newContext(mobile);
  await custCtx.route(/wa\.me/, (route) => route.fulfill({ status: 200, body: 'wa' }));
  const cust = await custCtx.newPage(); watch(cust, 'cliente');
  await cust.goto(customerUrl);
  await cust.waitForSelector('[data-testid=vlux-help]');
  const waHref = await cust.getAttribute('[data-testid=vlux-help-wa]', 'href');
  const expected = `https://wa.me/527441452048?text=${encodeURIComponent(`Hola, necesito ayuda con mi tarjeta de lealtad de ${name}.`)}`;
  ok('R3-01 bienvenida: soporte WhatsApp con número y mensaje correctos', waHref === expected, waHref);
  const landHref = await cust.getAttribute('[data-testid=vlux-help-landing]', 'href');
  // Compilado SIN VITE_VLUX_LANDING_URL: nunca una ruta interna; abre la conversación comercial con VLUX.
  const landKind = await cust.getAttribute('[data-testid=vlux-help-landing]', 'data-kind');
  const landRel = await cust.getAttribute('[data-testid=vlux-help-landing]', 'rel');
  ok('R3-02 «Conocer VLUX Loyalty» sin landing configurada → WhatsApp comercial de VLUX (no ruta interna), noreferrer',
    landKind === 'whatsapp' && landHref.startsWith('https://wa.me/527441452048?text=') && decodeURIComponent(landHref).includes(`vi VLUX Loyalty en la tarjeta de ${name}`) && /noreferrer/.test(landRel), landHref);
  const [land] = await Promise.all([custCtx.waitForEvent('page'), cust.click('[data-testid=vlux-help-landing]')]);
  await land.waitForLoadState();
  ok('R3-03 se abre en otra pestaña y la tarjeta sigue abierta', land.url().startsWith('https://wa.me/') && cust.url() === customerUrl, land.url());
  await land.close();
  ok('R7-01 iPhone emulado: bienvenida del cliente sin desplazamiento horizontal', await noHScroll(cust));
  const box = await cust.locator('[data-testid=vlux-help-wa]').boundingBox();
  ok('R3-04 botón de soporte cómodo de tocar en móvil (≥ 40 px de alto)', box && box.height >= 40, `${box && Math.round(box.height)} px`);
  await cust.locator('[data-testid=vlux-help]').scrollIntoViewIfNeeded();
  await shot(cust, 'R3-bienvenida-ayuda-vlux');

  // Registro con WhatsApp; la tarjeta también muestra la ayuda.
  await cust.click('button:has-text("Obtener mi tarjeta")');
  await cust.fill('#reg-name', 'Lucía');
  await cust.fill('#reg-contact', '722 555 0199');
  await cust.check('#reg-privacy');
  await cust.click('button:has-text("Crear mi tarjeta")');
  await cust.waitForSelector('[data-testid=card-code]');
  const code = (await cust.textContent('[data-testid=card-code]')).trim();
  ok('R3-05 la tarjeta del cliente muestra la ayuda VLUX', await cust.isVisible('[data-testid=vlux-help]'));

  // ---------------- R2 · Recuperación ----------------
  const lostCtx = await browser.newContext(mobile);
  const lost = await lostCtx.newPage(); watch(lost, 'cliente-sin-acceso');
  await lost.goto(customerUrl);
  await lost.click('[data-testid=recover-open]');
  await lost.waitForSelector('[data-testid=recover-screen]');
  await shot(lost, 'R2-cliente-recuperar');
  await lost.fill('#rec-contact', '7225550199');
  await lost.fill('#rec-name', 'Lucía');
  await lost.click('[data-testid=recover-submit]');
  await lost.waitForSelector('[data-testid=recover-sent]');
  const sentText = await lost.textContent('[data-testid=recover-sent]');
  ok('R2-01 cliente: «Tu solicitud fue enviada al negocio» sin revelar si existe', /solicitud fue enviada/.test(sentText) && /no te confirmamos/.test(sentText));
  await shot(lost, 'R2-cliente-solicitud-enviada');
  const stranger = await (await browser.newContext(mobile)).newPage(); watch(stranger, 'desconocido');
  await stranger.goto(customerUrl);
  await stranger.click('[data-testid=recover-open]');
  await stranger.fill('#rec-contact', 'nadie@ejemplo.test');
  await stranger.click('[data-testid=recover-submit]');
  await stranger.waitForSelector('[data-testid=recover-sent]');
  ok('R2-02 contacto inexistente: mismo mensaje exacto (sin enumeración)', (await stranger.textContent('[data-testid=recover-sent]')) === sentText);

  // Dueño: banner, insignia y bandeja.
  await desk.goto(`${BASE}/panel?negocio=${slug}`);
  await desk.waitForSelector('[data-testid=recovery-banner]');
  ok('R2-03 dueño: aviso en el panel y número en la pestaña Accesos', (await desk.textContent('[data-testid=recovery-tab-badge]')).trim() === '2');
  await desk.click('[data-testid=recovery-banner]');
  await desk.waitForSelector('[data-testid=recovery-inbox]');
  const items = desk.locator('[data-testid=recovery-item]');
  ok('R2-04 bandeja: 2 solicitudes, una con coincidencia de tarjeta', (await items.count()) === 2 && (await desk.textContent('[data-testid=recovery-inbox]')).includes(code));
  await desk.fill('#biz-wa', '722 100 2000');
  await desk.click('[data-testid=business-whatsapp] button[type=submit]');
  await desk.waitForTimeout(500);
  await shot(desk, 'R2-dueno-bandeja');
  const matchedItem = items.filter({ hasText: code });
  await matchedItem.locator('[data-testid=recovery-issue]').click();
  await desk.waitForSelector('[data-testid=recovery-issued]');
  const newLink = (await desk.textContent('[data-testid=recovery-link]')).trim();
  const sendWa = await desk.getAttribute('[data-testid=recovery-send-wa]', 'href');
  ok('R2-05 enlace nuevo + WhatsApp al número del cliente con el enlace', /\/t#/.test(newLink) && sendWa.startsWith('https://wa.me/527225550199?text=') && decodeURIComponent(sendWa).includes(newLink));
  await shot(desk, 'R2-dueno-enlace-generado');
  // El cliente abre el enlace nuevo en su teléfono nuevo.
  await lost.goto(newLink);
  await lost.waitForSelector('[data-testid=card-code]');
  ok('R2-06 el enlace nuevo abre la tarjeta en el teléfono nuevo', (await lost.textContent('[data-testid=card-code]')).trim() === code);
  await desk.click('[data-testid=recovery-mark-sent]');
  await desk.waitForTimeout(600);
  ok('R2-07 la solicitud queda resuelta y la otra sigue pendiente', (await items.count()) === 1);
  await items.first().locator('[data-testid=recovery-dismiss]').click();
  await desk.waitForSelector('[data-testid=recovery-empty]');
  ok('R2-08 descartar la solicitud sin coincidencia', await desk.isVisible('[data-testid=recovery-empty]'));
  const actions = (await sql("SELECT action FROM audit_events a JOIN businesses b ON b.id = a.business_id WHERE b.slug = $1 AND (action LIKE 'recovery.%' OR action IN ('card.link_reissued','business.contact_updated')) ORDER BY a.id", [slug])).map((x) => x.action);
  ok('R2-09 bitácora completa', JSON.stringify(actions) === JSON.stringify(['recovery.requested', 'recovery.requested', 'business.contact_updated', 'card.link_reissued', 'recovery.link_issued', 'recovery.closed', 'recovery.closed']), actions.join(','));
  // WhatsApp del negocio visible para el siguiente cliente que pida recuperar.
  const third = await (await browser.newContext(mobile)).newPage(); watch(third, 'cliente-3');
  await third.goto(customerUrl);
  await third.click('[data-testid=recover-open]');
  await third.fill('#rec-contact', '7220000001');
  await third.click('[data-testid=recover-submit]');
  await third.waitForSelector('[data-testid=recover-wa-business]');
  ok('R2-10 con WhatsApp configurado, el cliente puede escribir al negocio', (await third.getAttribute('[data-testid=recover-wa-business]', 'href')).startsWith('https://wa.me/527221002000?text='));
  await shot(third, 'R2-cliente-whatsapp-negocio');

  // Suplantación: alguien escribe OTRO número diciendo ser Lucía. El dueño elige la tarjeta de Lucía a mano:
  // se exige confirmar identidad en persona y el enlace solo puede ir al número REGISTRADO de Lucía.
  const impostor = await (await browser.newContext(mobile)).newPage(); watch(impostor, 'suplantador');
  await impostor.goto(customerUrl);
  await impostor.click('[data-testid=recover-open]');
  await impostor.fill('#rec-contact', '7229998888');
  await impostor.fill('#rec-name', 'Lucía');
  await impostor.click('[data-testid=recover-submit]');
  await impostor.waitForSelector('[data-testid=recover-sent]');
  await desk.reload();
  await desk.click('button[role=tab]:has-text("Accesos")');
  await desk.waitForSelector('[data-testid=recovery-inbox]');
  const impItem = desk.locator('[data-testid=recovery-item]').filter({ hasText: '722 999 8888' });
  await impItem.locator('[data-testid=recovery-pick]').click();
  await desk.fill('#pick-q', code);
  await desk.click("form:has(#pick-q) button[type=submit]");
  await desk.click('button:has-text("Usar esta")');
  await desk.waitForSelector('[data-testid=recovery-confirm]');
  const goDisabled = await desk.isDisabled('[data-testid=recovery-confirm-go]');
  const tokensBefore = (await sql("SELECT count(*)::int AS n FROM card_access_tokens t JOIN cards c ON c.id = t.card_id WHERE c.public_code = $1 AND t.revoked_at IS NULL", [code]))[0].n;
  ok('R2-11 contacto distinto: se pide confirmar identidad en persona antes de rotar (nada revocado aún)', goDisabled && tokensBefore >= 1);
  await shot(desk, 'R2-dueno-confirmar-identidad');
  await desk.check('[data-testid=recovery-confirm-check]');
  await desk.click('[data-testid=recovery-confirm-go]');
  await desk.waitForSelector('[data-testid=recovery-issued]');
  const impWa = await desk.getAttribute('[data-testid=recovery-send-wa]', 'href');
  ok('R2-12 el enlace se envía al número REGISTRADO de Lucía, nunca al del solicitante', impWa.startsWith('https://wa.me/527225550199?text=') && !(await desk.textContent('[data-testid=recovery-issued]')).includes('999 8888'), impWa.slice(0, 40));
  await desk.click('[data-testid=recovery-mark-sent]');
  await desk.waitForTimeout(600);
  const impAudit = await sql("SELECT details FROM audit_events a JOIN businesses b ON b.id = a.business_id WHERE b.slug = $1 AND action = 'recovery.link_issued' ORDER BY a.id DESC LIMIT 1", [slug]);
  ok('R2-13 bitácora: identidad verificada y contacto no coincidente', impAudit[0].details.identityVerified === true && impAudit[0].details.contactMatches === false);
  const closedRow = await sql("SELECT r.contact, r.name_hint FROM recovery_requests r JOIN businesses b ON b.id = r.business_id WHERE b.slug = $1 AND r.status = 'resolved'", [slug]);
  ok('R2-14 al cerrar, la base ya no guarda contactos en claro', closedRow.length >= 2 && closedRow.every((x) => x.contact.includes('***') && x.name_hint === null), closedRow.map((x) => x.contact).join(','));

  // ---------------- R7 · Android (Chromium emulado como Pixel 7) ----------------
  const andCtx = await browser.newContext(android);
  await andCtx.route(/wa\.me/, (route) => route.fulfill({ status: 200, body: 'wa' }));
  const andOwner = await andCtx.newPage(); watch(andOwner, 'dueño-android');
  await login(andOwner, ownerEmail);
  await andOwner.click('button[role=tab]:has-text("Accesos")');
  await andOwner.waitForSelector('[data-testid=counter-qr]');
  ok('R7-02 Android emulado: panel Accesos sin desplazamiento horizontal', await noHScroll(andOwner));
  await shot(andOwner, 'R7-android-panel-accesos');
  await andOwner.click('[data-testid=poster-open-print]');
  await andOwner.waitForSelector('[data-testid=poster-image]');
  await andOwner.waitForFunction(() => { const i = document.querySelector('[data-testid=poster-image]'); return i && i.complete && i.naturalWidth > 0; });
  await andOwner.emulateMedia({ media: 'print' });
  const andPdf = path.join(TMP, 'impresion-android-carta.pdf');
  await andOwner.pdf({ path: andPdf, preferCSSPageSize: true, printBackground: true });
  await andOwner.emulateMedia({ media: 'screen' });
  const ap = decodePdf(andPdf, 100);
  const ap72 = decodePdf(andPdf, 72);
  ok('R7-03 Android emulado: imprimir cartel = 1 hoja carta y QR legible (100 y 72 ppp)', ap.pages === 1 && ap.w === 850 && ap.data === customerUrl && ap72.data === customerUrl, `${ap.pages} pág · ${ap.w}×${ap.h}`);
  const andDl = await download(andOwner, 'poster-png');
  ok('R7-04 Android emulado: descargar PNG funciona y el QR se lee', decodePng(andDl).data === customerUrl);
  const andCust = await andCtx.newPage(); watch(andCust, 'cliente-android');
  await andCust.goto(customerUrl);
  await andCust.waitForSelector('[data-testid=vlux-help]');
  await andCust.click('[data-testid=recover-open]');
  await andCust.waitForSelector('[data-testid=recover-screen]');
  ok('R7-05 Android emulado: «Perdí mi acceso» sin desplazamiento horizontal y botón ≥ 44 px', await noHScroll(andCust) && ((await andCust.locator('[data-testid=recover-submit]').boundingBox())?.height ?? 0) >= 44);
  await shot(andCust, 'R7-android-recuperar');

  // ---------------- R4 · Reportar problema ----------------
  await phoneOwner.goto(`${BASE}/panel?negocio=${slug}`);
  await phoneOwner.click('button[role=tab]:has-text("Clientes")');
  const t0 = Date.now();
  await phoneOwner.click('[data-testid=report-open]');
  await phoneOwner.waitForSelector('[data-testid=report-modal]');
  await phoneOwner.fill('#report-desc', 'Prueba E2E: el QR no imprime');
  await phoneOwner.waitForFunction(() => !document.querySelector('[data-testid=report-context]')?.textContent?.includes('…'));
  await shot(phoneOwner, 'R4-reportar-problema-movil');
  const ref = (await phoneOwner.textContent('[data-testid=report-ref]')).trim();
  const href = await phoneOwner.getAttribute('[data-testid=report-wa]', 'href');
  const msg = decodeURIComponent(href.split('text=')[1]);
  ok('R4-01 botón visible en el panel y WhatsApp a 527441452048', href.startsWith('https://wa.me/527441452048?text='));
  ok('R4-02 el mensaje lleva negocio, vista, descripción, usuario/rol, fecha, dispositivo, versión y ref',
    msg.includes(`Negocio: ${name} (${slug})`) && msg.includes('Vista: Panel › Clientes') && msg.includes('Descripción: Prueba E2E: el QR no imprime') && msg.includes('Usuario: Dueña E2E · Dueño') && msg.includes('iPhone · iOS 18 · Safari 18') && /Versión: \d/.test(msg) && msg.includes(`Ref: ${ref}`), msg.replace(/\n/g, ' | '));
  const [wa] = await Promise.all([phoneOwnerCtx.waitForEvent('page'), phoneOwner.click('[data-testid=report-wa]')]);
  await wa.close();
  ok('R4-03 se inicia en 2 toques (abrir + enviar)', Date.now() - t0 < 15000);
  await phoneOwner.waitForTimeout(800);
  const rep = await sql("SELECT details FROM audit_events a JOIN businesses b ON b.id = a.business_id WHERE b.slug = $1 AND action = 'support.reported'", [slug]);
  ok('R4-04 ticket interno en bitácora con la misma referencia', rep.length === 1 && rep[0].details.ref === ref && rep[0].details.view === 'Panel › Clientes' && rep[0].details.role === 'OWNER', JSON.stringify(rep[0]?.details));

  ok('ZZ sin errores de JavaScript en consola', errors.length === 0, errors.join(' || '));
  await browser.close();
  const failed = results.filter(([c]) => !c);
  console.log(`\n${results.length - failed.length}/${results.length} PASS`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
