// 1.0.0-rc.1 · Funciones opcionales congeladas: solo se encienden por variable de entorno del servidor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { featureEnabled, featureStates } from '../../server/features';
import { emailConfigFromEnv } from '../../server/email/provider';

test('en Vercel y en producción todas las funciones opcionales están APAGADAS por omisión', () => {
  for (const env of [{ VERCEL: '1' }, { NODE_ENV: 'production' }, { VERCEL: '1', NODE_ENV: 'production' }]) {
    assert.deepEqual(Object.values(featureStates(env as NodeJS.ProcessEnv)), [false, false, false, false, false], JSON.stringify(env));
  }
});

test('en desarrollo local están encendidas (la suite cubre el código) y FEATURE_X=0 las apaga', () => {
  assert.equal(featureEnabled('webPush', {} as NodeJS.ProcessEnv), true);
  assert.equal(featureEnabled('webPush', { FEATURE_WEB_PUSH: '0' } as NodeJS.ProcessEnv), false);
});

test('solo el valor exacto "1" las enciende en producción', () => {
  const prod = { NODE_ENV: 'production', VERCEL: '1' };
  assert.equal(featureEnabled('promotions', { ...prod, FEATURE_PROMOTIONS: '1' } as NodeJS.ProcessEnv), true);
  for (const v of ['true', 'yes', 'on', ' 1', '']) assert.equal(featureEnabled('promotions', { ...prod, FEATURE_PROMOTIONS: v } as NodeJS.ProcessEnv), false, v);
});

test('SMTP propio congelado: con EMAIL_PROVIDER=smtp y sin FEATURE_SMTP_EMAIL=1 no se configura en producción', () => {
  const smtp = { EMAIL_PROVIDER: 'smtp', SMTP_HOST: 'mail.ejemplo.test', SMTP_PORT: '465', SMTP_USER: 'u', SMTP_PASSWORD: 'p', EMAIL_FROM: 'VLUX <avisos@ejemplo.test>' };
  assert.equal(emailConfigFromEnv({ ...smtp, NODE_ENV: 'production' } as NodeJS.ProcessEnv).state, 'not_configured');
  assert.equal(emailConfigFromEnv({ ...smtp, NODE_ENV: 'production', FEATURE_SMTP_EMAIL: '1' } as NodeJS.ProcessEnv).state, 'configured');
});
