// V0.2.2 · Verificación HTTPS de la demo pública en Vercel (sin cuenta de Vercel, sin credenciales).
// Cubre la parte del cliente: acceso público, PWA instalable según Chromium real sobre HTTPS,
// service worker, manifiesto, íconos, registro de tarjeta sintética y vinculación con código.
// La parte de Empleado B y Dueño C necesita las contraseñas de la demo y se corre aparte
// (tests/e2e/v022-pwa.cjs en modo despliegue). Uso:
//   DEMO=https://…vercel.app INTERNO=https://…vercel.app SLUG=cafe-demo-toluca node tests/e2e/v022-demo-publica.cjs
const { chromium } = require('playwright');

const DEMO = (process.env.DEMO || '').replace(/\/$/, '');
const INTERNO = (process.env.INTERNO || '').replace(/\/$/, '');
const SLUG = process.env.SLUG || 'cafe-demo-toluca';
const results = [];
const check = (id, name, ok, detail = '') => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}${detail ? ' · ' + detail : ''}`); };

class Jar {
  constructor() { this.c = new Map(); }
  async req(method, path, body) {
    const h = { origin: DEMO };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (this.c.size) h.cookie = [...this.c].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(DEMO + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const sc of res.headers.getSetCookie()) { const [p] = sc.split(';'); const i = p.indexOf('='); this.c.set(p.slice(0, i), p.slice(i + 1)); }
    const t = await res.text(); let json = null; try { json = JSON.parse(t); } catch { json = t; }
    return { status: res.status, json, headers: res.headers };
  }
}

(async () => {
  if (!DEMO.startsWith('https://')) throw new Error('DEMO debe ser https://');
  // H1 · Acceso público sin login de Vercel
  const home = await fetch(`${DEMO}/n/${SLUG}`, { redirect: 'manual' });
  check('H1', 'demo abre sin login de Vercel', home.status === 200, `status ${home.status}`);
  // H2 · El proyecto interno sigue protegido
  if (INTERNO) {
    const r = await fetch(`${INTERNO}/api/health`, { redirect: 'manual' });
    check('H2', 'proyecto interno sigue protegido', r.status === 401 || (r.status >= 300 && r.status < 400 && /vercel\.com/.test(r.headers.get('location') || '')), `status ${r.status}`);
  }
  const anon = new Jar();
  const health = await anon.req('GET', '/api/health?db=1');
  check('H3', 'API y base de datos responden por HTTPS', health.status === 200 && health.json.db === true);
  const hsts = home.headers.get('strict-transport-security') || '';
  check('H4', 'HSTS y CSP presentes', /max-age=/.test(hsts) && !!home.headers.get('content-security-policy'));
  // H5-H8 · Manifiesto, íconos, service worker
  const man = await anon.req('GET', `/api/pwa/${SLUG}/manifest.webmanifest`);
  check('H5', 'manifiesto válido y sin tokens', man.status === 200 && man.json.display === 'standalone' && man.json.icons.length === 3 && !/token|\/t#|cookie/i.test(JSON.stringify(man.json)));
  const ico = await fetch(`${DEMO}/api/pwa/${SLUG}/icon/512.png`);
  const buf = Buffer.from(await ico.arrayBuffer());
  // Vercel consume s-maxage en su CDN y no lo reenvía al navegador: se verifica con x-vercel-cache.
  const ico2 = await fetch(`${DEMO}/api/pwa/${SLUG}/icon/512.png`);
  const hit = ico2.headers.get('x-vercel-cache') || '';
  check('H6', 'ícono 512 PNG servido desde la caché de la CDN', ico.status === 200 && buf.readUInt32BE(16) === 512 && /HIT|STALE/.test(hit), `x-vercel-cache ${ico.headers.get('x-vercel-cache')} → ${hit}`);
  const sw = await fetch(`${DEMO}/sw.js`);
  const swText = await sw.text();
  check('H7', 'sw.js sin caché y con lista de exclusión', sw.status === 200 && /no-cache/.test(sw.headers.get('cache-control') || '') && /isPrivatePath/.test(swText));
  const api = await anon.req('GET', `/api/me/${SLUG}/card`);
  check('H8', 'respuestas de API privadas (no-store)', /no-store/.test(api.headers.get('cache-control') || ''));

  // H9-H12 · Chromium real sobre HTTPS: instalabilidad y service worker
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
  const page = await ctx.newPage();
  await page.goto(`${DEMO}/n/${SLUG}`, { waitUntil: 'networkidle' });
  const swReady = await page.evaluate(async () => { const r = await Promise.race([navigator.serviceWorker.ready, new Promise((res) => setTimeout(() => res(null), 10000))]); return !!(r && r.active); });
  check('H9', 'service worker activo en HTTPS', swReady);
  const cdp = await ctx.newCDPSession(page);
  const appMan = await cdp.send('Page.getAppManifest');
  check('H10', 'Chromium lee el manifiesto sin errores', !!appMan.url && appMan.errors.length === 0, appMan.url);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  check('H11', 'Chromium no reporta errores de instalabilidad', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors.map((e) => e.errorId)));
  // Registro de tarjeta sintética desde el navegador (API con la cookie del contexto)
  const reg = await page.evaluate(async (slug) => {
    const r = await fetch(`/api/public/businesses/${slug}/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: 'Cliente Sintético E2E HTTPS', contact: '', marketingConsent: false, privacyAccepted: true }) });
    return r.status;
  }, SLUG);
  await page.reload({ waitUntil: 'networkidle' });
  const visible = await page.getByTestId('save-card').isVisible().catch(() => false);
  check('H12', 'Cliente A crea su tarjeta y ve "Guarda tu tarjeta"', reg === 201 && visible, `registro ${reg}`);
  // Vinculación: código desde el navegador → app "instalada" (contexto nuevo sin cookies)
  const code = await page.evaluate(async (slug) => { const r = await fetch(`/api/me/${slug}/pair-code`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); return r.status === 201 ? (await r.json()).code : null; }, SLUG);
  const app = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await app.addInitScript(() => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => (q.includes('standalone') ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q)); });
  const ap = await app.newPage();
  await ap.goto(`${DEMO}/n/${SLUG}?fuente=app`, { waitUntil: 'networkidle' });
  const asksCode = await ap.getByTestId('pair-screen').isVisible().catch(() => false);
  await ap.fill('#pair-code-input', code || '');
  await ap.getByRole('button', { name: /Abrir mi tarjeta/ }).click();
  await ap.waitForTimeout(2500);
  const sameCard = await ap.evaluate(async (slug) => { const r = await fetch(`/api/me/${slug}/card`); const j = await r.json(); return !!j.card; }, SLUG);
  check('H13', 'app instalada pide código y abre la misma tarjeta', !!code && asksCode && sameCard);
  const reuse = await (await new Jar().req('POST', `/api/me/${SLUG}/pair`, { code })).status;
  check('H14', 'el código no se puede reutilizar', reuse === 404, `status ${reuse}`);
  const caches = await page.evaluate(async () => { const out = []; for (const n of await caches.keys()) { const c = await caches.open(n); for (const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; });
  check('H15', 'caché del SW solo con index.html y /assets', caches.length > 0 && caches.every((p) => p === '/index.html' || p.startsWith('/assets/')), `${caches.length} entradas`);
  await page.screenshot({ path: 'demo-https-cliente.png' });
  await ap.screenshot({ path: 'demo-https-app.png' });
  await browser.close();
  const fail = results.filter((r) => !r.ok).length;
  console.log(`Total HTTPS demo: ${results.length - fail} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
