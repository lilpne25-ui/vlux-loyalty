// V0.4.5 · Invitaciones por correo (T10–T17) con proveedor SIMULADO: nunca sale un correo a la red.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { MockProvider, verifyWebhookSignature } from '../../server/email/provider';
import { invitationEmail } from '../../server/email/templates';
import { Device, PASSWORD } from './helpers';
import { adminWithMfa, closeAdminHelpers } from './admin-helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const WH_SECRET = 'whsec_' + randomBytes(24).toString('base64');
let A: Device;
before(async () => {
  process.env.EMAIL_PROVIDER = 'mock';
  process.env.EMAIL_WEBHOOK_SECRET = WH_SECRET;
  A = (await adminWithMfa(`mail-${randomUUID().slice(0, 6)}@vlux.test`, 'clave-admin-correo-2026-x')).d;
});
after(async () => { delete process.env.EMAIL_PROVIDER; delete process.env.EMAIL_WEBHOOK_SECRET; await closePool(); await db.end(); await closeAdminHelpers(); });

async function newBiz() {
  await resetRateLimits();
  MockProvider.reset();
  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@ejemplo.test`;
  const r = await A.post('/api/admin/businesses', {
    name: 'Taller Correo ' + randomUUID().slice(0, 4), vertical: 'otro', city: 'Toluca', ownerName: 'Dueño Correo', ownerEmail,
    primaryColor: '#2B1B14', accentColor: '#C9A15B', rules: { stampsRequired: 5, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Lavado de cortesía' }, plan: 'piloto',
  });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return { ...r.json, ownerEmail };
}
const invs = async (id: string) => (await A.get(`/api/admin/businesses/${id}`)).json.invitations as any[];
const signed = (body: string, id = 'msg_' + randomUUID()) => {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = createHmac('sha256', Buffer.from(WH_SECRET.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
  return { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` };
};

test('T10–T11: la invitación y su correo pendiente se guardan juntos; la plantilla no lleva contraseñas', async () => {
  const b = await newBiz();
  assert.equal(b.email.state, 'mock');
  assert.ok(b.ownerInvitation.invitationId);
  const row = (await db.query('SELECT status, link_enc, to_email FROM email_outbox WHERE invitation_id = $1', [b.ownerInvitation.invitationId])).rows[0];
  assert.equal(row.status, 'pending');
  assert.equal(row.to_email, b.ownerEmail);
  const token = b.ownerInvitation.link.split('#')[1];
  assert.ok(!row.link_enc.includes(token), 'el token se guarda cifrado');
  assert.equal(MockProvider.sent.length, 0, 'crear el negocio NO envía correo por sí solo');
  const mail = invitationEmail({ businessName: 'Café <b>', inviteeName: 'Ana', role: 'OWNER', link: 'https://x.test/invitacion#abc', expiresAt: new Date('2026-12-01T18:00:00Z'), assetBase: 'https://x.test', supportEmail: 'soporte@vlux.test' });
  assert.match(mail.html, /Activar mi cuenta/);
  assert.match(mail.html, /Café &lt;b&gt;/, 'escapa HTML');
  assert.match(mail.html, /vlux-logo-full\.png/);
  assert.match(mail.text, /vence el/);
  assert.match(mail.text, /nunca te la enviaremos/);
  assert.ok(!/password/i.test(mail.html + mail.text));
});

test('T12–T13: envío con proveedor simulado registra "aceptado por proveedor" (no "entregado")', async () => {
  const b = await newBiz();
  const r = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.status, 'accepted');
  assert.equal(MockProvider.sent.length, 1);
  const m = MockProvider.sent[0];
  assert.equal(m.to, b.ownerEmail);
  assert.ok(m.html.includes(b.ownerInvitation.link.split('#')[1]), 'el correo lleva el mismo enlace de un solo uso');
  const inv = (await invs(b.businessId)).find((x) => x.id === b.ownerInvitation.invitationId);
  assert.equal(inv.emailDelivery.status, 'accepted');
  assert.equal(inv.emailDelivery.deliveredAt, null);
  // Doble clic inmediato: no duplica.
  const again = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
  assert.equal(again.status, 429);
  assert.equal(MockProvider.sent.length, 1);

  // Webhook firmado: entregado. Sin firma o firma falsa: rechazado. Repetido: idempotente.
  const body = JSON.stringify({ type: 'email.delivered', data: { email_id: r.json.messageId } });
  const d = new Device('resend');
  assert.equal((await d.req('POST', '/api/webhooks/email', JSON.parse(body))).status, 401);
  const h = signed(body);
  assert.equal((await d.req('POST', '/api/webhooks/email', JSON.parse(body), { ...h, 'svix-signature': 'v1,AAAA' })).status, 401);
  const ok = await d.req('POST', '/api/webhooks/email', JSON.parse(body), h);
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal((await d.req('POST', '/api/webhooks/email', JSON.parse(body), h)).json.duplicate, true);
  assert.equal((await invs(b.businessId)).find((x) => x.id === b.ownerInvitation.invitationId).emailDelivery.status, 'delivered');
  // Un rebote posterior prevalece.
  const bounce = JSON.stringify({ type: 'email.bounced', data: { email_id: r.json.messageId } });
  assert.equal((await d.req('POST', '/api/webhooks/email', JSON.parse(bounce), signed(bounce))).status, 200);
  assert.equal((await invs(b.businessId)).find((x) => x.id === b.ownerInvitation.invitationId).emailDelivery.status, 'bounced');
  // Firma vieja (más de 5 min) no vale.
  assert.equal(verifyWebhookSignature(WH_SECRET, { id: 'x', timestamp: String(Math.floor(Date.now() / 1000) - 600), signature: 'v1,x' }, '{}'), false);
});

test('T14: un fallo del proveedor queda "fallido" y el reintento usa el MISMO enlace sin crear otra invitación', async () => {
  const b = await newBiz();
  MockProvider.failNext.push({ retryable: true, error: 'Proveedor respondió 503' });
  const f = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
  assert.equal(f.json.status, 'failed');
  assert.match(f.json.error, /503/);
  await db.query("UPDATE email_outbox SET requested_at = now() - interval '2 minutes' WHERE invitation_id = $1", [b.ownerInvitation.invitationId]);
  const ok = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
  assert.equal(ok.json.status, 'accepted');
  assert.equal(ok.json.attempt, 2);
  assert.equal((await db.query('SELECT count(*)::int n FROM staff_invitations WHERE business_id = $1', [b.businessId])).rows[0].n, 1, 'sin invitaciones duplicadas');
  assert.ok(MockProvider.sent[0].html.includes(b.ownerInvitation.link.split('#')[1]));
  // Límite por invitación.
  for (let i = 0; i < 2; i++) {
    await db.query("UPDATE email_outbox SET requested_at = now() - interval '2 minutes' WHERE invitation_id = $1", [b.ownerInvitation.invitationId]);
    assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`)).status, 200);
  }
  await db.query("UPDATE email_outbox SET requested_at = now() - interval '2 minutes' WHERE invitation_id = $1", [b.ownerInvitation.invitationId]);
  const lim = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
  assert.equal(lim.status, 429);
  assert.equal(lim.json.error.code, 'send_limit');
});

test('T15–T17: revocar borra el token guardado; aceptar funciona una vez y no se reenvía después', async () => {
  const b = await newBiz();
  await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/revoke`);
  assert.equal((await db.query('SELECT link_enc FROM email_outbox WHERE invitation_id = $1', [b.ownerInvitation.invitationId])).rows[0].link_enc, null);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`)).status, 409);

  const ne = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: b.ownerEmail, displayName: 'Dueño Correo', role: 'OWNER' });
  assert.equal(ne.status, 201);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${ne.json.invitationId}/send-email`)).json.status, 'accepted');
  const token = MockProvider.sent.at(-1)!.html.match(/invitacion#([A-Za-z0-9_-]+)/)![1];
  const d = new Device('dueño');
  assert.equal((await d.post('/api/invitations/accept', { token, password: PASSWORD })).status, 200);
  assert.equal((await new Device('otro').post('/api/invitations/accept', { token, password: PASSWORD })).status, 409, 'T17: no se reutiliza');
  assert.equal((await db.query('SELECT link_enc FROM email_outbox WHERE invitation_id = $1', [ne.json.invitationId])).rows[0].link_enc, null);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${ne.json.invitationId}/send-email`)).status, 409);
  // Vencida: no se envía.
  const exp = await A.post(`/api/admin/businesses/${b.businessId}/invitations`, { email: `e-${randomUUID().slice(0, 6)}@ejemplo.test`, displayName: 'Vencida', role: 'EMPLOYEE' });
  await db.query("UPDATE staff_invitations SET expires_at = now() - interval '1 minute', created_at = now() - interval '4 days' WHERE id = $1", [exp.json.invitationId]);
  assert.equal((await A.post(`/api/admin/businesses/${b.businessId}/invitations/${exp.json.invitationId}/send-email`)).status, 410);
});

test('sin proveedor configurado: no se envía nada y la UI conserva el enlace para copiar', async () => {
  const b = await newBiz();
  process.env.EMAIL_PROVIDER = '';
  try {
    const r = await A.post(`/api/admin/businesses/${b.businessId}/invitations/${b.ownerInvitation.invitationId}/send-email`);
    assert.equal(r.json.status, 'not_configured');
    assert.equal(MockProvider.sent.length, 0);
    assert.equal((await A.get('/api/admin/email/status')).json.state, 'not_configured');
  } finally { process.env.EMAIL_PROVIDER = 'mock'; }
});
