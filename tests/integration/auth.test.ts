// Átomo 04: autenticación y autorización.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { closePool } from '../../server/db';
import { Device, PASSWORD, loggedIn, newBusiness, withEmployee, registerCustomer } from './helpers';

after(closePool);

test('login correcto crea sesión con cookie HttpOnly; incorrecto devuelve 401 genérico', async () => {
  const b = await newBusiness();
  const d = new Device('x');
  const bad = await d.post('/api/staff/login', { email: b.ownerEmail, password: 'mala-contraseña-1' });
  assert.equal(bad.status, 401);
  const unknown = await d.post('/api/staff/login', { email: 'nadie@ejemplo.test', password: 'mala-contraseña-1' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.json.error.message, bad.json.error.message, 'no revela si el correo existe');
  const ok = await d.req('POST', '/api/staff/login', { email: b.ownerEmail, password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('set-cookie')!, /HttpOnly/i);
  assert.match(ok.headers.get('set-cookie')!, /SameSite=Lax/i);
  assert.equal(ok.json.session.role, 'OWNER');
});

test('bloqueo temporal tras 5 contraseñas incorrectas', async () => {
  const b = await newBusiness();
  const d = new Device('x');
  for (let i = 0; i < 5; i++) await d.post('/api/staff/login', { email: b.ownerEmail, password: 'incorrecta-' + i });
  const r = await d.post('/api/staff/login', { email: b.ownerEmail, password: PASSWORD });
  assert.equal(r.status, 429);
});

test('sin sesión no hay acceso a caja ni panel', async () => {
  const anon = new Device('anon');
  assert.equal((await anon.get('/api/staff/cards?q=')).status, 401);
  assert.equal((await anon.get('/api/owner/dashboard')).status, 401);
});

test('un empleado NO puede entrar al panel del dueño ni a su configuración', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const e = await withEmployee(owner);
  const emp = await loggedIn('empleado', e.email);
  assert.equal((await emp.get('/api/owner/dashboard')).status, 403);
  assert.equal((await emp.get('/api/owner/customers')).status, 403);
  assert.equal((await emp.req('PUT', '/api/owner/program', {})).status, 403);
  assert.equal((await emp.post('/api/owner/staff', { email: 'otro@ejemplo.test', displayName: 'Otro', password: PASSWORD })).status, 403);
  assert.equal((await emp.get('/api/staff/cards?q=')).status, 200, 'sí puede usar la caja');
});

test('un empleado no puede operar tarjetas de otro negocio', async () => {
  const a = await newBusiness();
  const b = await newBusiness();
  const ownerB = await loggedIn('dueño B', b.ownerEmail);
  const empB = await loggedIn('empleado B', (await withEmployee(ownerB)).email);
  const custA = await registerCustomer(a.slug);
  const look = await empB.post('/api/staff/cards/lookup', { code: custA.publicCode });
  assert.equal(look.status, 404, 'la tarjeta de A no existe para B');
  // Aun conociendo el UUID interno de la tarjeta de A, B no puede leerla ni sellarla.
  const ownerA = await loggedIn('dueño A', a.ownerEmail);
  const cardIdA = (await ownerA.post('/api/staff/cards/lookup', { code: custA.publicCode })).json.cardId;
  assert.equal((await empB.get(`/api/staff/cards/${cardIdA}`)).status, 404);
  assert.equal((await empB.post(`/api/staff/cards/${cardIdA}/purchases`, { itemCount: 1, idempotencyKey: 'clave-intrusa-001' })).status, 404);
});

test('desactivar a un empleado revoca su sesión de inmediato', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const e = await withEmployee(owner);
  const emp = await loggedIn('empleado', e.email);
  assert.equal((await emp.get('/api/staff/cards?q=')).status, 200);
  assert.equal((await owner.req('PATCH', `/api/owner/staff/${e.membershipId}`, { active: false })).status, 200);
  assert.equal((await emp.get('/api/staff/cards?q=')).status, 401);
  assert.equal((await emp.post('/api/staff/login', { email: e.email, password: PASSWORD })).status, 403);
});

test('logout invalida la sesión en el servidor', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const stolen = new Map(owner.cookies);
  await owner.post('/api/staff/logout');
  const thief = new Device('copia');
  thief.cookies = stolen;
  assert.equal((await thief.get('/api/owner/dashboard')).status, 401);
});

test('el cliente solo ve su tarjeta y no tiene acceso a caja', async () => {
  const b = await newBusiness();
  const c1 = await registerCustomer(b.slug, 'Ana Sintética');
  const c2 = await registerCustomer(b.slug, 'Beto Sintético');
  const v1 = await c1.phone.get(`/api/me/${b.slug}/card`);
  assert.equal(v1.json.card.customerName, 'Ana Sintética');
  assert.notEqual(v1.json.card.publicCode, c2.publicCode);
  assert.equal((await c1.phone.get('/api/staff/cards?q=')).status, 401);
  assert.equal((await c1.phone.post('/api/staff/cards/lookup', { code: c2.publicCode })).status, 401);
  const stranger = new Device('extraño');
  assert.equal((await stranger.get(`/api/me/${b.slug}/card`)).json.card, null);
});

test('el enlace personal abre la tarjeta en otro teléfono', async () => {
  const b = await newBusiness();
  const c = await registerCustomer(b.slug, 'Carla Sintética');
  // V0.2.1: el token va en el fragmento (#), que el navegador nunca envía al servidor.
  assert.match(c.personalLink, /\/t#[A-Za-z0-9_-]{43}$/);
  const token = c.personalLink.split('/t#')[1];
  const viaApi = new Device('tercer teléfono');
  const ok = await viaApi.post('/api/card-access', { token });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.slug, b.slug);
  assert.equal((await viaApi.get(`/api/me/${b.slug}/card`)).json.card.customerName, 'Carla Sintética');
  assert.equal((await new Device('y').post('/api/card-access', { token: 'A'.repeat(43) })).status, 404);
  // Compatibilidad: los enlaces antiguos /t/<token> siguen funcionando.
  const second = new Device('segundo teléfono');
  const r = await second.req('GET', `/t/${token}`);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), `/n/${b.slug}`);
  assert.equal((await second.get(`/api/me/${b.slug}/card`)).json.card.customerName, 'Carla Sintética');
  const bad = await new Device('x').req('GET', '/t/' + 'A'.repeat(43));
  assert.equal(bad.headers.get('location'), '/?enlace=invalido');
});

test('CSRF: mutaciones sin JSON u origen ajeno se rechazan', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const form = await owner.req('POST', '/api/staff/logout', undefined, { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 400);
  const foreign = await owner.req('POST', '/api/staff/logout', {}, { origin: 'https://sitio-malicioso.example' });
  assert.equal(foreign.status, 403);
});

test('alta de negocio de plataforma exige token', async () => {
  const d = new Device('x');
  assert.equal((await d.req('POST', '/api/platform/businesses', {}, { authorization: 'Bearer nope' })).status, 401);
});

test('solicitudes demasiado grandes se rechazan', async () => {
  const d = new Device('x');
  const r = await d.post('/api/staff/login', { email: 'a@b.co', password: 'x'.repeat(20_000) });
  assert.equal(r.status, 400);
  assert.equal(r.json.error.code, 'body_too_large');
});

test('registro masivo desde la misma IP se limita', async () => {
  const b = await newBusiness();
  const d = new Device('bot');
  let last = 0;
  for (let i = 0; i < 21; i++) last = (await d.post(`/api/public/businesses/${b.slug}/register`, { displayName: 'Bot ' + i, privacyAccepted: true })).status;
  assert.equal(last, 429);
});

test('sin aceptar el aviso de privacidad no hay registro', async () => {
  const b = await newBusiness();
  const r = await new Device('x').post(`/api/public/businesses/${b.slug}/register`, { displayName: 'Sin aviso', privacyAccepted: false });
  assert.equal(r.status, 422);
});

test('las respuestas no exponen hashes ni tokens de sesión', async () => {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  const me = JSON.stringify((await owner.get('/api/staff/me')).json);
  const staff = JSON.stringify((await owner.get('/api/owner/staff')).json);
  for (const body of [me, staff]) assert.doesNotMatch(body, /scrypt|password_hash|"password"|token_hash/i);
});
