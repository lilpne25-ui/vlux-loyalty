// V0.3 · Google Wallet (preparación): estructura de LoyaltyClass/LoyaltyObject y firma RS256 del JWT.
// Usa una llave RSA generada en la prueba; NO prueba contra Google (eso es el escenario K, BLOQUEADO).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { buildLoyaltyClass, buildLoyaltyObject, buildSaveJwt, GoogleWalletProvider, googleConfigFromEnv } from '../../server/wallet/google';
import { AppleWalletProvider } from '../../server/wallet/apple';
import { WalletNotConfiguredError, type WalletCardSnapshot } from '../../server/wallet/provider';

const card: WalletCardSnapshot = {
  cardId: '6f1c2b8e-1111-4222-8333-444455556666', publicCode: 'ABCD-EFGH', customerName: 'Clienta Sintética Con Nombre Largo',
  balance: 12, stampsRequired: 15, rewardDescription: 'Un café americano', rewardReady: false,
  business: { id: '0a0b0c0d-aaaa-4bbb-8ccc-ddddeeeeffff', slug: 'cafe-demo', name: 'Café Demo', city: 'Toluca', primaryColor: '#2B1B14', accentColor: '#C9A15B', logoUrl: 'https://ejemplo.test/icon-512.png' },
  cardUrl: 'https://ejemplo.test/n/cafe-demo',
};
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cfg = { issuerId: '3388000000000000000', saEmail: 'wallet@proyecto-sintetico.iam.gserviceaccount.com', privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), origins: ['https://ejemplo.test'], mode: 'demo' as const };

test('LoyaltyClass y LoyaltyObject: ids del emisor, campos obligatorios y límites de longitud', () => {
  const k = buildLoyaltyClass(cfg, card);
  const o = buildLoyaltyObject(cfg, card);
  assert.match(k.id, /^3388000000000000000\.[A-Za-z0-9._-]+$/);
  assert.match(o.id, /^3388000000000000000\.[A-Za-z0-9._-]+$/);
  assert.equal(o.classId, k.id);
  assert.ok(k.programName && k.programLogo.sourceUri.uri && k.issuerName.length <= 20 && k.reviewStatus);
  assert.equal(o.state, 'ACTIVE');
  assert.equal(o.barcode.value, card.publicCode, 'mismo código que lee la caja');
  assert.ok(o.accountName.length <= 20);
  assert.ok(o.loyaltyPoints.label.length <= 9);
  assert.ok(String(o.loyaltyPoints.balance.int).length <= 7);
});

test('JWT savetowallet firmado con RS256 y claims requeridos', () => {
  const jwt = buildSaveJwt(cfg, card, 1_790_000_000);
  const [h, b, sig] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(b, 'base64url').toString());
  assert.equal(claims.aud, 'google');
  assert.equal(claims.typ, 'savetowallet');
  assert.equal(claims.iss, cfg.saEmail);
  assert.equal(claims.iat, 1_790_000_000);
  assert.deepEqual(claims.origins, cfg.origins);
  assert.equal(claims.payload.loyaltyObjects[0].accountId, card.publicCode);
  assert.ok(createVerify('RSA-SHA256').update(`${h}.${b}`).verify(publicKey, Buffer.from(sig, 'base64url')));
});

test('sin credenciales: Google y Apple reportan "no configurado" y no generan enlaces', async () => {
  const { config, missing } = googleConfigFromEnv({});
  assert.equal(config, null);
  assert.deepEqual(missing, ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SA_EMAIL', 'GOOGLE_WALLET_SA_PRIVATE_KEY']);
  const g = new GoogleWalletProvider(null, missing);
  assert.equal(g.status().state, 'not_configured');
  await assert.rejects(g.saveLink(card), WalletNotConfiguredError);
  const a = new AppleWalletProvider();
  assert.equal(a.status().state, 'not_configured');
  await assert.rejects(a.saveLink(), WalletNotConfiguredError);
});
