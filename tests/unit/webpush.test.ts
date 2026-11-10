// V0.4.6 · Cifrado Web Push (RFC 8291) y VAPID (RFC 8292). Se valida contra la implementación de referencia
// http_ece (autor: M. Thomson, coautor del RFC 8188/8291) en ambos sentidos: lo que ciframos lo descifra ella
// y lo que ella cifra lo desciframos con nuestro receptor independiente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, createHmac, createDecipheriv, createPublicKey, verify, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { b64u, encryptPayload, generateVapidKeys, isAllowedPushEndpoint, sendPush, vapidAuthorization, vapidFromEnv } from '../../server/push/webpush';
import { inQuietHours } from '../../server/services/notifications';

const require = createRequire(import.meta.url);
const ece = require('http_ece');

function newReceiver() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  return { ua, keys: { p256dh: b64u.enc(ua.getPublicKey()), auth: b64u.enc(auth) }, auth };
}

/** Receptor escrito a partir del RFC 8291 §3.4 (independiente de encryptPayload). */
function decryptAsBrowser(msg: Buffer, ua: ReturnType<typeof createECDH>, auth: Buffer) {
  const salt = msg.subarray(0, 16);
  const rs = msg.readUInt32BE(16);
  const idlen = msg[20];
  const asPublic = msg.subarray(21, 21 + idlen);
  const ct = msg.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const h = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();
  const ecdh = ua.computeSecret(asPublic);
  const ikm = h(h(auth, ecdh), Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic, Buffer.from([1])]));
  const prk = h(salt, ikm);
  const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const padded = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let end = padded.length - 1;
  while (padded[end] === 0) end--;
  assert.equal(padded[end], 2, 'delimitador de último registro');
  return padded.subarray(0, end).toString('utf8');
}

test('U-PUSH-1 · lo cifrado lo descifra la implementación de referencia (http_ece aes128gcm)', () => {
  const r = newReceiver();
  const body = JSON.stringify({ title: 'Café Aurora: recompensa lista', body: 'Ya tienes tu café gratis.', url: '/n/cafe-aurora' });
  const msg = encryptPayload(Buffer.from(body), r.keys);
  const out = ece.decrypt(msg, { version: 'aes128gcm', privateKey: r.ua, authSecret: b64u.enc(r.auth) });
  assert.equal(Buffer.from(out).toString('utf8'), body);
  assert.equal(decryptAsBrowser(msg, r.ua, r.auth), body);
});

test('U-PUSH-2 · lo que cifra http_ece lo descifra nuestro receptor (mismas derivaciones del RFC 8291)', () => {
  const r = newReceiver();
  const sender = createECDH('prime256v1');
  sender.generateKeys();
  const msg: Buffer = ece.encrypt(Buffer.from('hola'), { version: 'aes128gcm', privateKey: sender, dh: r.keys.p256dh, authSecret: r.keys.auth, rs: 4096 });
  assert.equal(decryptAsBrowser(msg, r.ua, r.auth), 'hola');
});

test('U-PUSH-3 · cada mensaje usa sal y llave efímera nuevas; se rechazan llaves inválidas y mensajes enormes', () => {
  const r = newReceiver();
  const a = encryptPayload(Buffer.from('x'), r.keys), b = encryptPayload(Buffer.from('x'), r.keys);
  assert.notDeepEqual(a.subarray(0, 16), b.subarray(0, 16));
  assert.notDeepEqual(a.subarray(21, 86), b.subarray(21, 86));
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: b64u.enc(Buffer.alloc(65, 1)), auth: r.keys.auth }));
  assert.throws(() => encryptPayload(Buffer.from('x'), { p256dh: r.keys.p256dh, auth: b64u.enc(Buffer.alloc(8)) }), /auth/);
  assert.throws(() => encryptPayload(Buffer.alloc(4090), r.keys), /grande/);
});

test('U-PUSH-4 · VAPID: JWT ES256 verificable con la llave pública, audiencia = origen del servicio push, vigencia ≤ 24 h', () => {
  const k = generateVapidKeys();
  const v = vapidFromEnv({ VAPID_PUBLIC_KEY: k.publicKey, VAPID_PRIVATE_KEY: k.privateKey, VAPID_SUBJECT: 'mailto:accesos@vlux.com.mx' });
  assert.ok(v);
  const now = 1_800_000_000;
  const auth = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', v!, now);
  const m = auth.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
  assert.ok(m);
  assert.equal(m![4], k.publicKey);
  const claims = JSON.parse(b64u.dec(m![2]).toString());
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.sub, 'mailto:accesos@vlux.com.mx');
  assert.ok(claims.exp - now <= 24 * 3600 && claims.exp > now);
  const pub = b64u.dec(k.publicKey);
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.subarray(1, 33)), y: b64u.enc(pub.subarray(33)) }, format: 'jwk' });
  assert.ok(verify('sha256', Buffer.from(`${m![1]}.${m![2]}`), { key, dsaEncoding: 'ieee-p1363' }, b64u.dec(m![3])));
});

test('U-PUSH-5 · configuración VAPID inválida desactiva push (llaves que no corresponden, asunto inválido)', () => {
  const a = generateVapidKeys(), b = generateVapidKeys();
  assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: b.privateKey, VAPID_SUBJECT: 'mailto:a@b.mx' }), null);
  assert.equal(vapidFromEnv({ VAPID_PUBLIC_KEY: a.publicKey, VAPID_PRIVATE_KEY: a.privateKey, VAPID_SUBJECT: 'http://inseguro.mx' }), null);
  assert.equal(vapidFromEnv({}), null);
});

test('U-PUSH-6 · solo servicios push conocidos (evita SSRF)', () => {
  for (const ok of ['https://fcm.googleapis.com/fcm/send/x', 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/QG', 'https://wns2-by3p.notify.windows.com/w/?token=x'])
    assert.ok(isAllowedPushEndpoint(ok), ok);
  for (const bad of ['http://fcm.googleapis.com/x', 'https://fcm.googleapis.com.evil.mx/x', 'https://169.254.169.254/latest', 'https://localhost/x', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'nada'])
    assert.ok(!isAllowedPushEndpoint(bad), bad);
  assert.ok(isAllowedPushEndpoint('https://push.test.local/x', ['push.test.local']));
});

test('U-PUSH-7 · sendPush: encabezados correctos y clasificación 201 / 410 / 429', async () => {
  const k = generateVapidKeys();
  const v = { ...k, subject: 'mailto:a@b.mx' };
  const r = newReceiver();
  const seen: { headers: Record<string, string>; body: Buffer }[] = [];
  const mk = (status: number) => (async (_u: string, init: RequestInit) => { seen.push({ headers: init.headers as Record<string, string>, body: Buffer.from(init.body as Uint8Array) }); return new Response(null, { status }); }) as unknown as typeof fetch;
  const ok = await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/z', ...r.keys }, { title: 't' }, v, { ttlSeconds: 3600, topic: 'reward_ready', fetchImpl: mk(201) });
  assert.deepEqual(ok, { ok: true, status: 201 });
  assert.equal(seen[0].headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen[0].headers.TTL, '3600');
  assert.equal(seen[0].headers.Topic, 'reward_ready');
  assert.equal(JSON.parse(decryptAsBrowser(seen[0].body, r.ua, r.auth)).title, 't');
  const gone = await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/z', ...r.keys }, {}, v, { ttlSeconds: 1, fetchImpl: mk(410) });
  assert.ok(!gone.ok && gone.gone && !gone.retryable);
  const busy = await sendPush({ endpoint: 'https://fcm.googleapis.com/fcm/send/z', ...r.keys }, {}, v, { ttlSeconds: 1, fetchImpl: mk(429) });
  assert.ok(!busy.ok && !busy.gone && busy.retryable);
});

test('U-PUSH-8 · horas de silencio (rango que cruza la medianoche y rango diurno)', () => {
  assert.ok(inQuietHours(22, 21, 9));
  assert.ok(inQuietHours(3, 21, 9));
  assert.ok(!inQuietHours(9, 21, 9));
  assert.ok(!inQuietHours(15, 21, 9));
  assert.ok(inQuietHours(14, 13, 15));
  assert.ok(!inQuietHours(12, 12, 12));
});

test('U-PUSH-9 · ventana del recordatorio de cita según la frecuencia de la tarea y texto del día', async () => {
  const { appointmentWindow, dayWord } = await import('../../server/services/notifications');
  assert.deepEqual(appointmentWindow(1), { from: 20, to: 28 });
  assert.deepEqual(appointmentWindow(24), { from: 12, to: 36 }, 'diario: ninguna cita queda fuera');
  const now = new Date('2026-11-07T18:00:00Z'); // 12:00 en el centro de México
  assert.equal(dayWord(new Date('2026-11-07T23:00:00Z'), now), 'hoy');
  assert.equal(dayWord(new Date('2026-11-08T17:00:00Z'), now), 'mañana');
  assert.equal(dayWord(new Date('2026-11-09T17:00:00Z'), now), 'el lunes');
});

test('U-PUSH-10 · llaves VAPID cuyo escalar empieza con 0x00 (≈1/256): se generan de 32 bytes y una de 31 se acepta normalizada', () => {
  let found = 0;
  for (let i = 0; i < 4000 && found < 3; i++) {
    const e = createECDH('prime256v1'); e.generateKeys();
    const raw = e.getPrivateKey();
    if (raw.length === 32) continue;
    found++;
    const short = { VAPID_PUBLIC_KEY: b64u.enc(e.getPublicKey()), VAPID_PRIVATE_KEY: b64u.enc(raw), VAPID_SUBJECT: 'mailto:a@b.mx' };
    const v = vapidFromEnv(short);
    assert.ok(v, 'llave de 31 bytes aceptada');
    assert.equal(b64u.dec(v!.privateKey).length, 32);
    assert.match(vapidAuthorization('https://fcm.googleapis.com/x', v!, 1_800_000_000), /^vapid t=/);
  }
  assert.ok(found > 0, 'en 4000 intentos debería aparecer al menos una');
  for (let i = 0; i < 2000; i++) assert.equal(b64u.dec(generateVapidKeys().privateKey).length, 32);
});
