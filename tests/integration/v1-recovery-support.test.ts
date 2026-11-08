// 1.0.x · Recuperación de acceso del cliente (R2), WhatsApp del negocio y «Reportar problema» (R4). Migración 0017.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { resetRecoverySchemaCache, maskContact, retentionSweep } from '../../server/services/recovery';
import { Device, loggedIn, newBusiness, withEmployee } from './helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL, max: 2 });
after(async () => { await closePool(); await db.end(); });

async function setup() {
  const b = await newBusiness();
  const owner = await loggedIn('dueño', b.ownerEmail);
  return { ...b, owner };
}
async function register(slug: string, contact: string, name = 'Mariana') {
  const phone = new Device('cliente');
  const r = await phone.post(`/api/public/businesses/${slug}/register`, { displayName: name, contact, marketingConsent: false, privacyAccepted: true });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { phone, publicCode: r.json.publicCode as string, personalLink: r.json.personalLink as string };
}
const recover = (slug: string, body: unknown) => new Device('teléfono-nuevo').post(`/api/public/businesses/${slug}/recovery`, body);

test('R2-01: la respuesta es IDÉNTICA exista o no la tarjeta (sin enumeración de clientes)', async () => {
  const b = await setup();
  await register(b.slug, '722 111 2233');
  const yes = await recover(b.slug, { contact: '7221112233', name: 'Mariana' });
  const no = await recover(b.slug, { contact: '7229998877' });
  assert.equal(yes.status, 202);
  assert.equal(no.status, 202);
  assert.deepEqual(yes.json, no.json);
  assert.deepEqual(Object.keys(yes.json).sort(), ['businessWhatsapp', 'ok', 'queued']);
  assert.equal(yes.json.queued, true);
  assert.ok(!JSON.stringify(yes.json).includes('7221112233'));
});

test('R2-02: el dueño ve la solicitud con la coincidencia y la repetición suma en vez de duplicar', async () => {
  const b = await setup();
  const c = await register(b.slug, 'cliente.r2@ejemplo.test', 'Paola');
  await recover(b.slug, { contact: 'Cliente.R2@ejemplo.test ' });
  await recover(b.slug, { contact: 'cliente.r2@ejemplo.test', name: 'Paola R.' });
  await recover(b.slug, { contact: '5512345678' });
  const r = await b.owner.get('/api/owner/recovery');
  assert.equal(r.status, 200);
  assert.equal(r.json.available, true);
  assert.equal(r.json.pending, 2);
  const matched = r.json.requests.find((x: any) => x.contactType === 'email');
  assert.equal(matched.requestCount, 2);
  assert.equal(matched.nameHint, 'Paola R.');
  assert.equal(matched.match.publicCode, c.publicCode);
  assert.equal(matched.match.contactMatches, true);
  const unmatched = r.json.requests.find((x: any) => x.contactType === 'whatsapp');
  assert.equal(unmatched.match, null);
});

test('R2-03: generar enlace revoca el anterior, abre la tarjeta en otro teléfono y queda en bitácora', async () => {
  const b = await setup();
  const c = await register(b.slug, '7221110000');
  await recover(b.slug, { contact: '722-111-0000' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const link = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
  assert.equal(link.status, 200, JSON.stringify(link.json));
  assert.match(link.json.personalLink, /\/t#[A-Za-z0-9_-]{40,}$/);
  assert.equal(link.json.card.publicCode, c.publicCode);
  // Se entrega al contacto REGISTRADO (coincide con el de la solicitud).
  assert.deepEqual(link.json.deliverTo, { contact: '7221110000', contactType: 'whatsapp' });
  assert.equal(link.json.contact, undefined, 'la API ya no devuelve el contacto de la solicitud');
  // El enlace viejo deja de servir; el nuevo abre la tarjeta.
  const oldToken = c.personalLink.split('#')[1];
  assert.equal((await new Device('viejo').post('/api/card-access', { token: oldToken })).status, 404);
  const fresh = new Device('nuevo');
  assert.equal((await fresh.post('/api/card-access', { token: link.json.personalLink.split('#')[1] })).status, 200);
  assert.equal((await fresh.get(`/api/me/${b.slug}/card`)).json.card.publicCode, c.publicCode);
  // Cerrar y comprobar bitácora (sin contacto ni token en los detalles).
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'link_sent' })).json.status, 'resolved');
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'link_sent' })).status, 409);
  const audit = (await db.query("SELECT action, details::text AS d FROM audit_events WHERE business_id = $1 AND (action LIKE 'recovery.%' OR action = 'card.link_reissued') ORDER BY id", [b.businessId])).rows;
  assert.deepEqual(audit.map((a) => a.action), ['recovery.requested', 'card.link_reissued', 'recovery.link_issued', 'recovery.closed']);
  for (const a of audit) assert.ok(!a.d.includes('7221110000') && !a.d.includes(link.json.personalLink.split('#')[1]), 'sin datos sensibles en bitácora');
  // La solicitud nunca guarda el token.
  const row = (await db.query('SELECT to_jsonb(r)::text AS j FROM recovery_requests r WHERE id = $1', [reqId])).rows[0];
  assert.ok(!row.j.includes(link.json.personalLink.split('#')[1]));
});

test('R2-04: sin coincidencia, el dueño elige la tarjeta a mano y se le avisa que el contacto no coincide', async () => {
  const b = await setup();
  const c = await register(b.slug, '');
  await recover(b.slug, { contact: '7220001111', name: 'Sin contacto' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const noCard = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
  assert.equal(noCard.status, 422);
  assert.equal(noCard.json.error.code, 'card_required');
  const cardId = (await b.owner.post('/api/staff/cards/lookup', { code: c.publicCode })).json.cardId;
  // Contacto distinto al registrado: sin confirmación de identidad no se rota nada.
  const blocked = await b.owner.post(`/api/owner/recovery/${reqId}/link`, { cardId });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.json.error.code, 'identity_check_required');
  assert.equal((await new Device('viejo').post('/api/card-access', { token: c.personalLink.split('#')[1] })).status, 200, 'el enlace anterior sigue vivo');
  const r = await b.owner.post(`/api/owner/recovery/${reqId}/link`, { cardId, identityVerified: true });
  assert.equal(r.status, 200);
  assert.equal(r.json.card.contactMatches, false);
  // Sin contacto registrado: entrega en persona (nunca al 7220001111 que escribió el solicitante).
  assert.equal(r.json.deliverTo, null);
  assert.ok(!JSON.stringify(r.json).includes('7220001111'));
});

test('R2-05: aislamiento: un dueño no ve ni actúa sobre solicitudes de otro negocio', async () => {
  const a = await setup();
  const b = await setup();
  await register(a.slug, '7223334444');
  await recover(a.slug, { contact: '7223334444' });
  const reqId = (await a.owner.get('/api/owner/recovery')).json.requests[0].id;
  assert.equal((await b.owner.get('/api/owner/recovery')).json.requests.length, 0);
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/link`, {})).status, 404);
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'spam' })).status, 404);
});

test('R2-06: permisos: anónimo y empleado no ven la bandeja; datos inválidos se rechazan', async () => {
  const b = await setup();
  const emp = await withEmployee(b.owner);
  const e = await loggedIn('caja', emp.email);
  assert.equal((await new Device('anon').get('/api/owner/recovery')).status, 401);
  assert.equal((await e.get('/api/owner/recovery')).status, 403);
  assert.equal((await recover(b.slug, { contact: '123' })).status, 422);
  assert.equal((await recover(b.slug, { contact: '' })).status, 422);
  assert.equal((await recover(b.slug, { contact: 'no-es-correo@' })).status, 422);
  assert.equal((await recover('no-existe-xyz', { contact: '7221234567' })).status, 404);
});

test('R2-07: límite por IP: la sexta solicitud en una hora responde 429', async () => {
  const b = await setup();
  await resetRateLimits();
  const d = new Device('insistente');
  for (let i = 0; i < 5; i++) assert.equal((await d.post(`/api/public/businesses/${b.slug}/recovery`, { contact: `72200000${10 + i}` })).status, 202);
  assert.equal((await d.post(`/api/public/businesses/${b.slug}/recovery`, { contact: '7220000099' })).status, 429);
  await resetRateLimits();
});

test('R2-08: WhatsApp del negocio: el dueño lo configura y el cliente lo ve en la ayuda', async () => {
  const b = await setup();
  assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json, { recovery: true, businessWhatsapp: null });
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: '722 555 0101' })).json.businessWhatsapp, '7225550101');
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: '12345' })).status, 422);
  assert.equal((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json.businessWhatsapp, '7225550101');
  assert.equal((await recover(b.slug, { contact: '7220002222' })).json.businessWhatsapp, '7225550101');
  assert.equal((await b.owner.req('PUT', '/api/owner/contact', { whatsapp: null })).json.businessWhatsapp, null);
});

test('R2-09: vencidas a los 30 días se enmascaran; anonimizar al cliente enmascara y cierra sus solicitudes', async () => {
  const b = await setup();
  await register(b.slug, '7226667777', 'Vence');
  await recover(b.slug, { contact: '7226667777', name: 'Vence' });
  const c2 = await register(b.slug, 'borrar@ejemplo.test', 'Borrar');
  await recover(b.slug, { contact: 'borrar@ejemplo.test' });
  await db.query("UPDATE recovery_requests SET expires_at = now() - interval '1 minute' WHERE business_id = $1 AND contact_type = 'whatsapp'", [b.businessId]);
  const list = (await b.owner.get('/api/owner/recovery')).json.requests;
  const exp = list.find((x: any) => x.contactType === 'whatsapp');
  assert.equal(exp.status, 'expired');
  assert.equal(exp.contact, '******7777');
  assert.equal(exp.nameHint, null);
  const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c2.publicCode])).rows[0].customer_id;
  assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  const after = (await b.owner.get('/api/owner/recovery')).json.requests.find((x: any) => x.contactType === 'email');
  assert.equal(after.contact, 'b***@e***.test');
  assert.equal(after.status, 'dismissed');
  assert.equal(maskContact('ana@x.mx', 'email'), 'a***@x***.mx');
  // Misma regla en SQL y en TypeScript.
  const sqlMask = (await db.query("SELECT recovery_mask('ana@x.mx', 'email') AS e, recovery_mask('7226667777', 'whatsapp') AS w")).rows[0];
  assert.deepEqual([sqlMask.e, sqlMask.w], [maskContact('ana@x.mx', 'email'), maskContact('7226667777', 'whatsapp')]);
  // En la base ya no queda nada en claro de esas dos solicitudes.
  const raw = (await db.query('SELECT contact, name_hint FROM recovery_requests WHERE business_id = $1', [b.businessId])).rows;
  for (const x of raw) { assert.ok(x.contact.includes('***')); assert.equal(x.name_hint, null); }
});

test('R2-10: compatibilidad: sin 0017 la app sigue funcionando y estas rutas responden 503 / disponible=false', async () => {
  const b = await setup();
  // En una base SIN 0017 (matriz 0015 / 0016) se prueba el estado real; con 0017 se simula ocultando la tabla.
  const has0017 = (await db.query("SELECT to_regclass('public.recovery_requests') IS NOT NULL AS ok")).rows[0].ok as boolean;
  if (has0017) await db.query('ALTER TABLE recovery_requests RENAME TO recovery_requests_tmp');
  resetRecoverySchemaCache();
  try {
    assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json, { recovery: false, businessWhatsapp: null });
    const r = await recover(b.slug, { contact: '7221231234' });
    assert.equal(r.status, 503);
    assert.equal(r.json.error.code, 'recovery_unavailable');
    assert.equal((await b.owner.get('/api/owner/recovery')).json.available, false);
    // Lo existente no cambia: registro, tarjeta, anonimizar.
    const c = await register(b.slug, '7224445555');
    assert.equal((await c.phone.get(`/api/me/${b.slug}/card`)).json.card.publicCode, c.publicCode);
    const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
    assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  } finally {
    if (has0017) await db.query('ALTER TABLE recovery_requests_tmp RENAME TO recovery_requests');
    resetRecoverySchemaCache();
  }
});

// ---------- Correcciones 1.0.x (revisión independiente) ----------
const tokenOf = (link: string) => link.split('#')[1];
const activeTokens = async (publicCode: string) => (await db.query(
  'SELECT count(*)::int AS n FROM card_access_tokens t JOIN cards c ON c.id = t.card_id WHERE c.public_code = $1 AND t.revoked_at IS NULL', [publicCode])).rows[0].n as number;

test('R2-12: atomicidad: si falla el cierre de la solicitud, NO se revoca el enlace anterior ni queda token nuevo', async () => {
  const b = await setup();
  const c = await register(b.slug, '7225550001');
  await recover(b.slug, { contact: '7225550001' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const tokensBefore = (await db.query('SELECT count(*)::int AS n FROM card_access_tokens t JOIN cards c ON c.id = t.card_id WHERE c.public_code = $1', [c.publicCode])).rows[0].n;
  // Fallo inyectado DESPUÉS de revocar e insertar el token (el UPDATE de la solicitud es el último paso).
  await db.query(`CREATE OR REPLACE FUNCTION test_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                    IF NEW.status = 'link_issued' THEN RAISE EXCEPTION 'fallo inyectado'; END IF; RETURN NEW; END $$;
                  CREATE TRIGGER test_fail_link BEFORE UPDATE ON recovery_requests FOR EACH ROW EXECUTE FUNCTION test_fail_link();`);
  try {
    const r = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
    assert.equal(r.status, 500);
  } finally {
    await db.query('DROP TRIGGER test_fail_link ON recovery_requests; DROP FUNCTION test_fail_link();');
  }
  assert.equal((await new Device('viejo').post('/api/card-access', { token: tokenOf(c.personalLink) })).status, 200, 'el cliente conserva su acceso');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM card_access_tokens t JOIN cards c ON c.id = t.card_id WHERE c.public_code = $1', [c.publicCode])).rows[0].n, tokensBefore, 'no quedó token nuevo');
  assert.equal((await db.query('SELECT status FROM recovery_requests WHERE id = $1', [reqId])).rows[0].status, 'pending');
  const audit = (await db.query("SELECT action FROM audit_events WHERE business_id = $1 AND action IN ('card.link_reissued','recovery.link_issued')", [b.businessId])).rows;
  assert.equal(audit.length, 0, 'la bitácora no registra una rotación que no ocurrió');
  // Después del fallo, el reintento funciona normal.
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/link`, {})).status, 200);
});

test('R2-13: concurrencia: dos «Generar enlace» simultáneos → uno gana, el otro 409; queda UN solo enlace vigente y es el entregado', async () => {
  const b = await setup();
  const c = await register(b.slug, '7225550002');
  await recover(b.slug, { contact: '7225550002' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const results = await Promise.all([1, 2, 3].map(() => b.owner.post(`/api/owner/recovery/${reqId}/link`, {})));
  const ok = results.filter((r) => r.status === 200);
  assert.equal(ok.length, 1, JSON.stringify(results.map((r) => [r.status, r.json?.error?.code])));
  for (const r of results.filter((x) => x.status !== 200)) assert.equal(r.json.error.code, 'recovery_link_recent');
  assert.equal(await activeTokens(c.publicCode), 1);
  assert.equal((await new Device('nuevo').post('/api/card-access', { token: tokenOf(ok[0].json.personalLink) })).status, 200);
  // Cerrar y generar a la vez: el estado final es coherente (nunca «link_issued» tras un cierre exitoso posterior).
  await recover(b.slug, { contact: '7225550002' });
  const req2 = (await b.owner.get('/api/owner/recovery')).json.requests.find((x: any) => x.status === 'pending').id;
  const [l, cl] = await Promise.all([b.owner.post(`/api/owner/recovery/${req2}/link`, {}), b.owner.post(`/api/owner/recovery/${req2}/close`, { resolution: 'spam' })]);
  const final = (await db.query('SELECT status FROM recovery_requests WHERE id = $1', [req2])).rows[0].status;
  if (cl.status === 200 && l.status === 409) assert.equal(final, 'dismissed');
  else assert.ok(['dismissed', 'link_issued'].includes(final), `estado ${final} con link=${l.status} close=${cl.status}`);
  assert.equal(await activeTokens(c.publicCode), 1);
});

test('R2-14: suplantación: con contacto distinto, el enlace va al contacto REGISTRADO, nunca al del solicitante', async () => {
  const b = await setup();
  const c = await register(b.slug, 'maria@ejemplo.test', 'María López');
  await recover(b.slug, { contact: '7229990000', name: 'María López' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const cardId = (await b.owner.post('/api/staff/cards/lookup', { code: c.publicCode })).json.cardId;
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/link`, { cardId })).json.error.code, 'identity_check_required');
  assert.equal(await activeTokens(c.publicCode), 1);
  const r = await b.owner.post(`/api/owner/recovery/${reqId}/link`, { cardId, identityVerified: true });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.deliverTo, { contact: 'maria@ejemplo.test', contactType: 'email' });
  assert.ok(!JSON.stringify(r.json).includes('7229990000'));
  const ev = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'recovery.link_issued'", [b.businessId])).rows[0].details;
  assert.equal(ev.identityVerified, true);
  assert.equal(ev.contactMatches, false);
});

test('R2-15: retención verificable: cerrar enmascara y cambia el hash; la base rechaza cerradas en claro; el barrido vence y borra', async () => {
  const b = await setup();
  await register(b.slug, '7225550003');
  await recover(b.slug, { contact: '7225550003', name: 'Rita' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  const h0 = (await db.query('SELECT contact_hash FROM recovery_requests WHERE id = $1', [reqId])).rows[0].contact_hash as Buffer;
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'in_person' })).status, 200);
  const closed = (await db.query('SELECT contact, name_hint, contact_hash FROM recovery_requests WHERE id = $1', [reqId])).rows[0];
  assert.equal(closed.contact, '******0003');
  assert.equal(closed.name_hint, null);
  assert.ok(!h0.equals(closed.contact_hash), 'hash reemplazado: no se puede re-identificar');
  // Restricción de la base: una cerrada con contacto en claro es imposible (incluso para el dueño del esquema).
  await recover(b.slug, { contact: '7225550004' });
  const open = (await db.query("SELECT id FROM recovery_requests WHERE business_id = $1 AND status = 'pending'", [b.businessId])).rows[0].id;
  await assert.rejects(db.query("UPDATE recovery_requests SET status = 'resolved' WHERE id = $1", [open]), /recovery_requests_minimized/);
  // Barrido global: abierta caducada → vencida y enmascarada; cerrada de hace 91 días → borrada.
  await db.query("UPDATE recovery_requests SET expires_at = now() - interval '1 second' WHERE id = $1", [open]);
  await db.query("UPDATE recovery_requests SET resolved_at = now() - interval '91 days' WHERE id = $1", [reqId]);
  const sweep = await retentionSweep({ force: true });
  assert.ok(sweep && sweep.expired >= 1 && sweep.deleted >= 1, JSON.stringify(sweep));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM recovery_requests WHERE id = $1', [reqId])).rows[0].n, 0);
  const exp = (await db.query('SELECT status, contact FROM recovery_requests WHERE id = $1', [open])).rows[0];
  assert.deepEqual([exp.status, exp.contact], ['expired', '******0004']);
  // Verificación de solo lectura (la misma consulta que docs/release-1.0/0017_verificar_retencion.sql).
  const v = (await db.query(`SELECT count(*) FILTER (WHERE status IN ('pending','link_issued') AND expires_at < now())::int AS clear_expired,
                                    count(*) FILTER (WHERE status NOT IN ('pending','link_issued') AND position('***' in contact) = 0)::int AS clear_closed,
                                    count(*) FILTER (WHERE status NOT IN ('pending','link_issued') AND coalesce(resolved_at, expires_at) < now() - interval '90 days')::int AS overdue
                               FROM recovery_requests`)).rows[0];
  assert.deepEqual(v, { clear_expired: 0, clear_closed: 0, overdue: 0 });
  // Con 0016, el barrido exige alcance «worker» (orden de uso, no barrera: la función solo reduce datos).
  const has0016 = (await db.query("SELECT to_regprocedure('public.require_scope(text)') IS NOT NULL AS ok")).rows[0].ok;
  if (has0016) {
    const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await app.connect();
    try {
      await app.query('BEGIN'); await app.query("SELECT set_config('app.business_id', $1, true)", [b.businessId]);
      await assert.rejects(app.query('SELECT recovery_retention_sweep(10)'), /alcance de trabajo requerido/);
    } finally { await app.query('ROLLBACK').catch(() => undefined); await app.end(); }
  }
});

test('R2-16: generar enlace acorta la retención a 7 días; vencida no se puede usar para generar enlace', async () => {
  const b = await setup();
  await register(b.slug, '7225550005');
  await recover(b.slug, { contact: '7225550005' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  assert.equal((await b.owner.post(`/api/owner/recovery/${reqId}/link`, {})).status, 200);
  const days = (await db.query('SELECT extract(epoch FROM expires_at - now()) / 86400 AS d FROM recovery_requests WHERE id = $1', [reqId])).rows[0].d;
  assert.ok(days <= 7.01 && days > 6.9, String(days));
  await db.query("UPDATE recovery_requests SET expires_at = now() - interval '1 second', resolved_at = now() - interval '1 minute' WHERE id = $1", [reqId]);
  const r = await b.owner.post(`/api/owner/recovery/${reqId}/link`, {});
  assert.equal(r.status, 409);
  assert.equal(r.json.error.code, 'recovery_closed');
  const item = (await b.owner.get('/api/owner/recovery')).json.requests.find((x: any) => x.id === reqId);
  assert.equal(item.status, 'expired');
  assert.equal(item.contact, '******0005');
});

test('R2-17: anonimizar alcanza solicitudes SIN tarjeta vinculada (pedidas antes de registrarse o sin coincidencia)', async () => {
  const b = await setup();
  await recover(b.slug, { contact: 'tarde@ejemplo.test', name: 'Tardía' });
  const c = await register(b.slug, 'tarde@ejemplo.test', 'Tardía');
  const row0 = (await db.query('SELECT matched_card_id FROM recovery_requests WHERE business_id = $1', [b.businessId])).rows[0];
  assert.equal(row0.matched_card_id, null, 'la solicitud quedó sin vincular');
  const other = await register(b.slug, '7225550006');
  await recover(b.slug, { contact: '7225550006' });
  const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
  assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  const rows = (await db.query('SELECT contact, status, name_hint FROM recovery_requests WHERE business_id = $1 ORDER BY created_at', [b.businessId])).rows;
  assert.deepEqual(rows[0], { contact: 't***@e***.test', status: 'dismissed', name_hint: null });
  assert.equal(rows[1].contact, '7225550006', 'no toca solicitudes de otros clientes');
  assert.ok(other.publicCode);
});

test('R2-18: reversa de 0017 con la app encendida y caché caliente: 503 / disponible=false y anonimizar sigue funcionando', async () => {
  const b = await setup();
  const c = await register(b.slug, '7225550007');
  // Calienta la caché («sí, 0017 está»), SIN reiniciarla después: así queda una instancia real tras la reversa.
  assert.equal((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json.recovery, true);
  await recover(b.slug, { contact: '7225550007' });
  const reqId = (await b.owner.get('/api/owner/recovery')).json.requests[0].id;
  await db.query('ALTER TABLE recovery_requests RENAME TO recovery_requests_rev; ALTER TABLE businesses RENAME COLUMN contact_whatsapp TO contact_whatsapp_rev;');
  try {
    assert.deepEqual((await new Device('c').get(`/api/public/businesses/${b.slug}/help`)).json, { recovery: false, businessWhatsapp: null });
    // La caché se recalienta sola si algo la marca como lista: cada ruta debe degradar por sí misma.
    for (const call of [
      () => recover(b.slug, { contact: '7225550007' }),
      () => b.owner.post(`/api/owner/recovery/${reqId}/link`, {}),
      () => b.owner.post(`/api/owner/recovery/${reqId}/close`, { resolution: 'spam' }),
      () => b.owner.req('PUT', '/api/owner/contact', { whatsapp: '7225550000' }),
    ]) {
      const r = await call();
      assert.equal(r.status, 503, JSON.stringify(r.json));
      assert.equal(r.json.error.code, 'recovery_unavailable');
    }
    assert.equal((await b.owner.get('/api/owner/recovery')).json.available, false);
    const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
    assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200, 'la anonimización (ARCO) no depende de 0017');
    assert.equal((await db.query('SELECT anonymized_at IS NOT NULL AS ok FROM customers WHERE id = $1', [customerId])).rows[0].ok, true);
    assert.equal(await retentionSweep({ force: true }), null);
  } finally {
    await db.query('ALTER TABLE recovery_requests_rev RENAME TO recovery_requests; ALTER TABLE businesses RENAME COLUMN contact_whatsapp_rev TO contact_whatsapp;');
    resetRecoverySchemaCache();
  }
});

test('R2-19: caché con anonimizar: si la tabla falta a mitad de la transacción, SAVEPOINT y la anonimización termina', async () => {
  // Cubierto por R2-18 con caché caliente; aquí se fuerza la ruta del error (la comprobación ve la tabla pero el UPDATE no).
  const b = await setup();
  const c = await register(b.slug, '7225550008');
  const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
  await db.query('ALTER TABLE recovery_requests RENAME COLUMN contact_hash TO contact_hash_rev');
  try {
    assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
  } finally {
    await db.query('ALTER TABLE recovery_requests RENAME COLUMN contact_hash_rev TO contact_hash');
    resetRecoverySchemaCache();
  }
});

test('R2-20: restauración con permisos incompletos (grants.sql anterior a 0017): anonimizar sigue funcionando', async () => {
  const b = await setup();
  const c = await register(b.slug, '7225550009');
  await recover(b.slug, { contact: '7225550009' });
  const customerId = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [c.publicCode])).rows[0].customer_id;
  await db.query('REVOKE ALL ON recovery_requests FROM vlux_app');
  try {
    assert.equal((await b.owner.post(`/api/owner/customers/${customerId}/anonymize`, {})).status, 200);
    const ev = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'recovery.redact_failed'", [b.businessId])).rows;
    assert.equal(ev.length, 1, 'queda constancia de que no se pudo redactar');
  } finally {
    await db.query(`GRANT SELECT, INSERT ON recovery_requests TO vlux_app;
      GRANT UPDATE (contact, contact_hash, name_hint, matched_card_id, status, resolution, request_count, last_requested_at, resolved_by, resolved_at, expires_at) ON recovery_requests TO vlux_app`);
    resetRecoverySchemaCache();
  }
});

test('R2-21: anonimizar a un cliente no descarta la solicitud de OTRO cliente activo que comparte el contacto', async () => {
  const b = await setup();
  const a1 = await register(b.slug, '7225551111', 'Ana');
  await recover(b.slug, { contact: '7225551111' });
  // Se desvincula para simular una solicitud sin tarjeta, y otro cliente registra el mismo número (no es único).
  await db.query('UPDATE recovery_requests SET matched_card_id = NULL WHERE business_id = $1', [b.businessId]);
  await register(b.slug, '7225551111', 'Beto');
  const id1 = (await db.query('SELECT customer_id FROM cards WHERE public_code = $1', [a1.publicCode])).rows[0].customer_id;
  assert.equal((await b.owner.post(`/api/owner/customers/${id1}/anonymize`, {})).status, 200);
  const r = (await db.query('SELECT status, contact FROM recovery_requests WHERE business_id = $1', [b.businessId])).rows[0];
  assert.deepEqual([r.status, r.contact], ['pending', '7225551111'], 'la solicitud podría ser de Beto: no se toca');
});

test('R2-22: bandeja llena → queued=false (el cliente ve «pídelo en caja»), sin revelar si es cliente', async () => {
  const b = await setup();
  await register(b.slug, '7225552222');
  await db.query(`INSERT INTO recovery_requests (business_id, contact, contact_type, contact_hash)
                  SELECT $1::uuid, '72200' || lpad(g::text, 5, '0'), 'whatsapp', sha256(convert_to($2 || g::text, 'UTF8')) FROM generate_series(1, 200) g`, [b.businessId, b.businessId]);
  const known = await recover(b.slug, { contact: '7225552222' });
  const unknown = await recover(b.slug, { contact: '7225553333' });
  assert.equal(known.status, 202);
  assert.deepEqual(known.json, unknown.json);
  assert.equal(known.json.queued, false);
  assert.equal((await b.owner.get('/api/owner/recovery')).json.dropped24h, 2);
  await resetRateLimits();
});

test('R2-11: RLS: vlux_app sin negocio fijado no ve solicitudes y no puede borrarlas', async () => {
  const b = await setup();
  await register(b.slug, '7228889999');
  await recover(b.slug, { contact: '7228889999' });
  const app = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  try {
    assert.equal((await app.query('SELECT count(*)::int AS n FROM recovery_requests')).rows[0].n, 0);
    await assert.rejects(app.query('DELETE FROM recovery_requests'), /permission denied/);
    await assert.rejects(app.query('UPDATE recovery_requests SET business_id = business_id'), /permission denied/);
  } finally { await app.end(); }
});

test('R4-01: reportar problema deja evento en bitácora con contexto; referencia validada', async () => {
  const b = await setup();
  const ref = 'VLX-AB23CD';
  const r = await b.owner.post('/api/staff/support-report', { ref, view: 'Panel › Accesos', description: 'No imprime el QR', device: 'iPhone · Safari 18', appVersion: '1.0.0-rc.1' });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.recorded, true);
  const row = (await db.query("SELECT actor_type, details FROM audit_events WHERE business_id = $1 AND action = 'support.reported'", [b.businessId])).rows[0];
  assert.equal(row.actor_type, 'staff');
  assert.equal(row.details.ref, ref);
  assert.equal(row.details.view, 'Panel › Accesos');
  assert.equal(row.details.role, 'OWNER');
  assert.equal((await b.owner.post('/api/staff/support-report', { ref: 'x', view: 'Panel' })).status, 422);
  assert.equal((await new Device('anon').post('/api/staff/support-report', { ref, view: 'Panel' })).status, 401);
  // Caja también puede reportar.
  const emp = await withEmployee(b.owner);
  assert.equal((await (await loggedIn('caja', emp.email)).post('/api/staff/support-report', { ref: 'VLX-ZZ23CD', view: 'Caja' })).status, 201);
});

test('R4-02: la descripción se limita a 1000 caracteres y se quitan caracteres de control', async () => {
  const b = await setup();
  assert.equal((await b.owner.post('/api/staff/support-report', { ref: 'VLX-AB23CE', view: 'Panel', description: 'x'.repeat(1001) })).status, 422);
  const ok = await b.owner.post('/api/staff/support-report', { ref: 'VLX-AB23CF', view: 'Panel', description: 'hola\u0007mundo' });
  assert.equal(ok.status, 201);
  const d = (await db.query("SELECT details FROM audit_events WHERE business_id = $1 AND action = 'support.reported'", [b.businessId])).rows[0].details;
  assert.equal(d.description, undefined, 'la descripción no queda en la bitácora inmutable');
  assert.equal(d.descriptionLength, 'holamundo'.length);
});

