// V0.2.1: configuración de conexión para Supabase (TLS, URL sin secretos en logs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pgSsl, redactUrl, stripSslParams } from '../../server/pgssl';

test('TLS: sin variables no usa TLS (PostgreSQL local)', () => {
  delete process.env.DATABASE_SSL; delete process.env.DATABASE_SSL_CA;
  assert.equal(pgSsl(), false);
});

test('TLS: DATABASE_SSL=supabase verifica con el certificado raíz de Supabase', () => {
  process.env.DATABASE_SSL = 'supabase';
  const s = pgSsl() as { ca: string; rejectUnauthorized: boolean };
  assert.equal(s.rejectUnauthorized, true);
  assert.match(s.ca, /BEGIN CERTIFICATE/);
  delete process.env.DATABASE_SSL;
});

test('TLS: la URL pierde sslmode para que manden las opciones explícitas', () => {
  assert.equal(stripSslParams('postgres://u:p@h:6543/postgres?sslmode=require&application_name=x'), 'postgres://u:p@h:6543/postgres?application_name=x');
});

test('logs: la URL se describe sin contraseña', () => {
  const r = redactUrl('postgres://vlux_app.ref:secreto123@aws-0-us-east-1.pooler.supabase.com:6543/postgres');
  assert.doesNotMatch(r, /secreto123/);
  assert.equal(r, 'postgres://vlux_app.ref@aws-0-us-east-1.pooler.supabase.com:6543/postgres');
});
