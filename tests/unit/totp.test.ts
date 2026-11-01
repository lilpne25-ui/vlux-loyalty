import { test } from 'node:test';
import assert from 'node:assert/strict';
import { base32Decode, base32Encode, decryptSecret, encryptSecret, totpAt, verifyTotp } from '../../server/totp';

test('TOTP: vectores de RFC 6238 (SHA1, 8→6 dígitos)', () => {
  // Secreto ASCII "12345678901234567890"; RFC 6238 da 94287082 en T=59 s → últimos 6 dígitos 287082.
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totpAt(secret, Math.floor(59 / 30)), '287082');
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), '081804');
  assert.equal(totpAt(secret, Math.floor(1234567890 / 30)), '005924');
});

test('TOTP: tolera ±1 paso y rechaza códigos viejos o con formato inválido', () => {
  const secret = base32Encode(Buffer.from('abcdefghijklmnopqrst'));
  const now = 1_800_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyTotp(secret, totpAt(secret, step), now), step);
  assert.equal(verifyTotp(secret, totpAt(secret, step - 1), now), step - 1);
  assert.equal(verifyTotp(secret, totpAt(secret, step - 3), now), null);
  assert.equal(verifyTotp(secret, '12345', now), null);
  assert.equal(verifyTotp(secret, 'abcdef', now), null);
});

test('base32 ida y vuelta', () => {
  const b = Buffer.from([0, 1, 2, 250, 255, 128, 64]);
  assert.deepEqual(base32Decode(base32Encode(b)), b);
});

test('cifrado de secretos: ida y vuelta, IV aleatorio y detección de manipulación', () => {
  const a = encryptSecret('JBSWY3DPEHPK3PXP');
  const b = encryptSecret('JBSWY3DPEHPK3PXP');
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a), 'JBSWY3DPEHPK3PXP');
  const parts = a.split('.');
  parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('A') ? 'BB' : 'AA');
  assert.throws(() => decryptSecret(parts.join('.')));
});
