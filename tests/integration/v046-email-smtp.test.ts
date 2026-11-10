// V0.4.6 · Adaptador SMTP (EMAIL_PROVIDER=smtp | stalwart), T14–T19. Servidor SMTP LOCAL de pruebas (smtp-server)
// con certificados generados al vuelo: ningún correo sale a Internet. Nunca se desactiva la verificación TLS:
// el servidor de confianza se valida agregando SU CA (SMTP_CA_PEM), igual que se haría con un certificado propio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { SMTPServer } from 'smtp-server';
import { closePool } from '../../server/db';
import { resetRateLimits } from '../../server/ratelimit';
import { emailConfigFromEnv, SmtpProvider, smtpSettingsFromEnv } from '../../server/email/provider';
import { Device } from './helpers';
import { adminWithMfa, closeAdminHelpers } from './admin-helpers';

const db = new pg.Pool({ connectionString: process.env.DATABASE_ADMIN_URL });
const dir = mkdtempSync(join(tmpdir(), 'vlux-smtp-'));
const received: { from: string; to: string[]; raw: string }[] = [];
let ca = '', otherCa = '';
let port = 0;
let server: SMTPServer;
let rcptReply: { code: number; msg: string } | null = null;
const USER = 'accesos@vlux.test', PASS = 'clave-smtp-pruebas-' + randomUUID().slice(0, 8);

function makeCa(name: string) {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-days', '2', '-subj', `/CN=${name}`, '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.crt`)], { stdio: 'ignore' });
  return readFileSync(join(dir, `${name}.crt`), 'utf8');
}
function makeServerCert(caName: string, host: string) {
  const key = join(dir, `srv-${host}.key`), csr = join(dir, `srv-${host}.csr`), crt = join(dir, `srv-${host}.crt`), ext = join(dir, `srv-${host}.ext`);
  writeFileSync(ext, `subjectAltName=DNS:${host}\nextendedKeyUsage=serverAuth\n`);
  execFileSync('openssl', ['req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes', '-subj', `/CN=${host}`, '-keyout', key, '-out', csr], { stdio: 'ignore' });
  execFileSync('openssl', ['x509', '-req', '-in', csr, '-CA', join(dir, `${caName}.crt`), '-CAkey', join(dir, `${caName}.key`), '-CAcreateserial', '-days', '2', '-extfile', ext, '-out', crt], { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(crt) };
}

before(async () => {
  ca = makeCa('vlux-ca-pruebas');
  otherCa = makeCa('ca-ajena');
  const { key, cert } = makeServerCert('vlux-ca-pruebas', 'localhost');
  server = new SMTPServer({
    secure: false, key, cert, // STARTTLS en un puerto alto (en producción: 587 con STARTTLS o 465)
    authMethods: ['PLAIN', 'LOGIN'], allowInsecureAuth: false, // no acepta contraseña sin TLS
    onAuth(auth, _s, cb) { if (auth.username === USER && auth.password === PASS) cb(null, { user: USER }); else cb(new Error('Credenciales inválidas')); },
    onRcptTo(_a, _s, cb) {
      if (rcptReply) { const e = new Error(rcptReply.msg) as Error & { responseCode: number }; e.responseCode = rcptReply.code; cb(e); } else cb();
    },
    onData(stream, session, cb) {
      let raw = '';
      stream.on('data', (d: Buffer) => { raw += d.toString('utf8'); });
      stream.on('end', () => { received.push({ from: String(session.envelope.mailFrom && (session.envelope.mailFrom as { address: string }).address), to: session.envelope.rcptTo.map((r) => r.address), raw }); cb(); });
    },
    logger: false,
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.server.address() as AddressInfo).port;
});
after(async () => {
  for (const k of ['EMAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_CA_PEM', 'EMAIL_FROM', 'SMTP_TLS_SERVERNAME']) delete process.env[k];
  await new Promise<void>((r) => server.close(() => r()));
  rmSync(dir, { recursive: true, force: true });
  await closePool(); await db.end(); await closeAdminHelpers();
});

const env = (over: Record<string, string> = {}) => ({ NODE_ENV: 'test', EMAIL_PROVIDER: 'stalwart', SMTP_HOST: 'localhost', SMTP_PORT: String(port), SMTP_USER: USER, SMTP_PASSWORD: PASS, SMTP_CA_PEM: ca, EMAIL_FROM: 'VLUX Accesos <accesos@vlux.test>', ...over });
const mail = (to = 'dueno@ejemplo.test') => ({ to, subject: 'Prueba', html: '<p>Hola</p>', text: 'Hola', idempotencyKey: `vlux-inv-${randomUUID()}-1`, tags: { kind: 'staff_invitation' } });

test('T14: configuración por variables de entorno; incompleta = no configurado (sin valores fijos en el código)', () => {
  assert.equal(emailConfigFromEnv({ EMAIL_PROVIDER: 'stalwart' }).state, 'not_configured');
  assert.equal(emailConfigFromEnv(env({ SMTP_PASSWORD: '' })).state, 'not_configured', 'usuario sin contraseña');
  assert.equal(emailConfigFromEnv(env({ EMAIL_FROM: 'sin-arroba' })).state, 'not_configured');
  assert.equal(emailConfigFromEnv({ ...env(), NODE_ENV: 'production', SMTP_PORT: '2526' }).state, 'not_configured', 'en producción solo 465/587/2525');
  const c = emailConfigFromEnv(env());
  assert.equal(c.state, 'configured');
  assert.equal(c.provider?.name, 'smtp');
  assert.equal(smtpSettingsFromEnv(env({ SMTP_PORT: '465' }))?.secure, true, '465 = TLS implícito');
  assert.equal(emailConfigFromEnv(env({ EMAIL_PROVIDER: 'smtp' })).provider?.name, 'smtp');
});

test('T15: TLS con verificación real: CA desconocida o nombre de host distinto = rechazo (no se reintenta)', async () => {
  const unknownCa = new SmtpProvider(smtpSettingsFromEnv(env({ SMTP_CA_PEM: otherCa }))!);
  const r1 = await unknownCa.send(mail());
  assert.equal(r1.ok, false);
  assert.ok(!r1.ok && !r1.retryable && /Certificado TLS/.test(r1.error), JSON.stringify(r1));
  const wrongName = new SmtpProvider(smtpSettingsFromEnv(env({ SMTP_TLS_SERVERNAME: 'mail.otro-dominio.test' }))!);
  const r2 = await wrongName.send(mail());
  assert.ok(!r2.ok && !r2.retryable, JSON.stringify(r2));
  const noCa = new SmtpProvider(smtpSettingsFromEnv(env({ SMTP_CA_PEM: '' }))!);
  assert.equal((await noCa.send(mail())).ok, false, 'sin CA el certificado autofirmado no se acepta');
  assert.equal(received.length, 0, 'nada se entregó por canales no verificados');
  assert.match(readFileSync(new URL('../../server/email/provider.ts', import.meta.url), 'utf8'), /rejectUnauthorized: true/);
});

test('T16: con la CA correcta: STARTTLS + autenticación, Message-ID determinista y estado "aceptado por el servidor"', async () => {
  const p = new SmtpProvider(smtpSettingsFromEnv(env())!);
  assert.deepEqual(await p.verify(), { ok: true });
  const m = mail();
  const r = await p.send(m);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(received.length, 1);
  assert.equal(received[0].from, 'accesos@vlux.test');
  assert.deepEqual(received[0].to, ['dueno@ejemplo.test']);
  assert.match(received[0].raw, new RegExp(`Message-ID: <${m.idempotencyKey}@vlux.test>`, 'i'));
  assert.match(received[0].raw, /Auto-Submitted: auto-generated/i);
  const bad = new SmtpProvider(smtpSettingsFromEnv(env({ SMTP_PASSWORD: 'incorrecta' }))!);
  const rb = await bad.send(mail());
  assert.ok(!rb.ok && !rb.retryable && /Autenticación/.test(rb.error), JSON.stringify(rb));
});

test('T17–T18: rechazo temporal (4xx) se reintenta; rechazo permanente (5xx) no; servidor caído = reintento', async () => {
  const p = new SmtpProvider(smtpSettingsFromEnv(env())!);
  rcptReply = { code: 450, msg: 'Buzón ocupado, intenta después' };
  const t = await p.send(mail());
  assert.ok(!t.ok && t.retryable, JSON.stringify(t));
  rcptReply = { code: 550, msg: 'No existe el buzón' };
  const f = await p.send(mail());
  assert.ok(!f.ok && !f.retryable, JSON.stringify(f));
  rcptReply = null;
  const down = new SmtpProvider(smtpSettingsFromEnv(env({ SMTP_PORT: '59999' }))!);
  const d = await down.send(mail());
  assert.ok(!d.ok && d.retryable, JSON.stringify(d));
});

test('T19: invitación por SMTP desde el Control Center: queda "aceptado", la entrega final no se inventa', async () => {
  Object.assign(process.env, env());
  await resetRateLimits();
  const A = (await adminWithMfa(`smtp-${randomUUID().slice(0, 6)}@vlux.test`, 'clave-admin-smtp-2026-xx')).d;
  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@ejemplo.test`;
  const b = await A.post('/api/admin/businesses', {
    name: 'Estética SMTP ' + randomUUID().slice(0, 4), vertical: 'salon', city: 'Toluca', ownerName: 'Dueña SMTP', ownerEmail,
    primaryColor: '#2B1B14', accentColor: '#C9A15B', rules: { stampsRequired: 5, stampMode: 'per_purchase', maxStampsPerPurchase: 1, visitWindowMinutes: 120, rewardDescription: 'Mascarilla de cortesía' }, plan: 'piloto',
  });
  assert.equal(b.status, 201, JSON.stringify(b.json));
  assert.equal(b.json.email.provider, 'smtp');
  const n = received.length;
  const r = await A.post(`/api/admin/businesses/${b.json.businessId}/invitations/${b.json.ownerInvitation.invitationId}/send-email`);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.status, 'accepted');
  assert.equal(received.length, n + 1);
  assert.ok(received[n].raw.includes(b.json.ownerInvitation.link.split('#')[1].slice(0, 20)) || /invitacion/.test(received[n].raw), 'lleva el enlace de activación');
  const row = (await db.query('SELECT provider, status, delivered_at FROM email_outbox WHERE invitation_id = $1', [b.json.ownerInvitation.invitationId])).rows[0];
  assert.deepEqual(row, { provider: 'smtp', status: 'accepted', delivered_at: null });
  const st = (await A.get('/api/admin/overview')).json;
  assert.match(JSON.stringify(st), /SMTP propio configurado/);
  void Device;
});
