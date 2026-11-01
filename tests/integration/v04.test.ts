// V0.4 · Accesos por rol, logotipo versionado y manifiestos de Panel y Caja.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { closePool } from '../../server/db';
import { accessLinks } from '../../server/access-links';
import { Device, newBusiness, registerCustomer } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
after(async () => { await closePool(); await db.end(); });

// PNG de 1x1 píxel (sintético).
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('accessLinks arma las tres direcciones y no incluye credenciales', () => {
  const l = accessLinks('https://app.ejemplo.mx/', 'cafe-x');
  assert.deepEqual(l, { base: 'https://app.ejemplo.mx', customerUrl: 'https://app.ejemplo.mx/n/cafe-x', cashierUrl: 'https://app.ejemplo.mx/caja', ownerUrl: 'https://app.ejemplo.mx/panel', loginUrl: 'https://app.ejemplo.mx/acceso' });
});

test('endpoint público de accesos: tres direcciones por negocio, sin tokens', async () => {
  const b = await newBusiness();
  const d = new Device('visitante');
  const r = await d.get(`/api/public/businesses/${b.slug}/access`);
  assert.equal(r.status, 200);
  assert.match(r.json.customerUrl, new RegExp(`/n/${b.slug}$`));
  assert.match(r.json.cashierUrl, /\/caja$/);
  assert.match(r.json.ownerUrl, /\/panel$/);
  assert.ok(!/token|#/.test(JSON.stringify(r.json)), 'ninguna dirección lleva secretos');
  assert.equal((await d.get('/api/public/businesses/no-existe-123/access')).status, 404);
});

test('logotipo: se sirve versionado y en caché largo; sin logo no hay URL', async () => {
  const b = await newBusiness();
  const d = new Device('cliente');
  const sin = await d.get(`/api/public/businesses/${b.slug}`);
  assert.equal(sin.json.business.logoUrl, null);
  assert.equal((await d.get(`/api/public/businesses/${b.slug}/logo`)).status, 404);

  await db.query('UPDATE businesses SET logo_data_url = $2 WHERE slug = $1', [b.slug, PNG_1PX]);
  const con = await d.get(`/api/public/businesses/${b.slug}`);
  const url: string = con.json.business.logoUrl;
  assert.match(url, new RegExp(`^/api/public/businesses/${b.slug}/logo\\?v=[0-9a-f]{12}$`));
  const img = await d.req('GET', url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control') ?? '', /immutable/);
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  // Versión equivocada: se sirve igual pero sin caché inmutable.
  const old = await d.get(`/api/public/businesses/${b.slug}/logo?v=000000000000`);
  assert.equal(old.status, 200);
  assert.doesNotMatch(old.headers.get('cache-control') ?? '', /immutable/);
  // Al cambiar el logo cambia la URL.
  await db.query('UPDATE businesses SET logo_data_url = $2 WHERE slug = $1', [b.slug, PNG_1PX.replace('AAAADUlEQVR42mP8', 'AAAADUlEQVR42mP9')]);
  const otro = (await d.get(`/api/public/businesses/${b.slug}`)).json.business.logoUrl;
  assert.notEqual(otro, url);
});

test('logotipo: la base rechaza SVG y un negocio suspendido no sirve el suyo', async () => {
  const b = await newBusiness();
  const d = new Device('cliente');
  await assert.rejects(db.query("UPDATE businesses SET logo_data_url = 'data:image/svg+xml;base64,PHN2Zy8+' WHERE slug = $1", [b.slug]), /businesses_logo_data_url_check/);
  await db.query('UPDATE businesses SET logo_data_url = $2 WHERE slug = $1', [b.slug, PNG_1PX]);
  await db.query("UPDATE businesses SET status = 'suspended' WHERE slug = $1", [b.slug]);
  assert.equal((await d.get(`/api/public/businesses/${b.slug}/logo`)).status, 404);
});

test('la tarjeta del cliente incluye la URL del logotipo', async () => {
  const b = await newBusiness();
  await db.query('UPDATE businesses SET logo_data_url = $2 WHERE slug = $1', [b.slug, PNG_1PX]);
  const c = await registerCustomer(b.slug);
  const card = await c.phone.get(`/api/me/${b.slug}/card`);
  assert.equal(card.status, 200);
  assert.match(card.json.business.logoUrl, /\/logo\?v=/);
});

test('manifiestos de Panel y Caja: acceso directo con la marca, sin permisos', async () => {
  const b = await newBusiness();
  const d = new Device('teléfono');
  const panel = await d.get(`/api/pwa/${b.slug}/staff/panel/manifest.webmanifest`);
  assert.equal(panel.status, 200);
  assert.equal(panel.json.start_url, '/panel?fuente=app');
  assert.match(panel.json.name, /Panel/);
  assert.equal(panel.json.display, 'standalone');
  assert.equal(panel.json.scope, '/');
  const caja = await d.get(`/api/pwa/${b.slug}/staff/caja/manifest.webmanifest`);
  assert.equal(caja.json.start_url, '/caja?fuente=app');
  assert.notEqual(panel.json.id, caja.json.id, 'Panel y Caja se instalan como apps distintas');
  assert.ok(!/token|session|cookie/i.test(JSON.stringify(panel.json)));
  assert.equal((await d.get(`/api/pwa/${b.slug}/staff/admin/manifest.webmanifest`)).status, 404);
  assert.equal((await d.get('/api/pwa/no-existe-123/staff/panel/manifest.webmanifest')).status, 404);
});
