import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, newCardCode, newRewardCode, newToken, parseScannedCode } from '../../server/security';

test('scrypt: verifica la correcta y rechaza la incorrecta; sal distinta cada vez', async () => {
  const h1 = await hashPassword('una-contraseña-larga');
  const h2 = await hashPassword('una-contraseña-larga');
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword('una-contraseña-larga', h1), true);
  assert.equal(await verifyPassword('otra', h1), false);
  assert.equal(await verifyPassword('x', 'basura'), false);
});

test('códigos opacos con el formato esperado y sin caracteres ambiguos', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(newCardCode(), /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    assert.match(newRewardCode(), /^R-[2-9A-HJKMNP-Z]{6}$/);
  }
  assert.equal(Buffer.from(newToken(), 'base64url').length, 32);
});

test('lectura de QR y captura manual', () => {
  assert.deepEqual(parseScannedCode('https://loyalty.vlux.mx/caja?tarjeta=ABCD-EFGH'), { kind: 'card', code: 'ABCD-EFGH' });
  assert.deepEqual(parseScannedCode(' abcdefgh '), { kind: 'card', code: 'ABCD-EFGH' });
  assert.deepEqual(parseScannedCode('r-abc234'), { kind: 'reward', code: 'R-ABC234' });
  assert.deepEqual(parseScannedCode('https://loyalty.vlux.mx/caja?premio=R-ABC234'), { kind: 'reward', code: 'R-ABC234' });
  assert.equal(parseScannedCode('ABCD-EFG0'), null, 'el 0 no existe en el alfabeto');
  assert.equal(parseScannedCode('hola'), null);
  assert.equal(parseScannedCode(''), null);
  assert.equal(parseScannedCode('x'.repeat(500)), null);
});
