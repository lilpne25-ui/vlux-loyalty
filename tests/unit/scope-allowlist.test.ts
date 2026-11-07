// Guardia estática: solo estos archivos pueden declarar un alcance de BD (migración 0016). Un alcance nuevo exige
// revisar la matriz de políticas y actualizar esta lista a propósito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', 'server');
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const uses = (re: RegExp) => walk(root).filter((f) => f.endsWith('.ts') && re.test(readFileSync(f, 'utf8'))).map((f) => f.slice(root.length + 1)).sort();

test('runWithScope solo se usa en los puntos de entrada revisados', () => {
  const files = walk(root).filter((f) => f.endsWith('.ts'));
  const found: Record<string, string[]> = {};
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/runWithScope\(\s*'([a-z]+)'/g)) (found[m[1]] ??= []).push(f.slice(root.length + 1));
  }
  const uniq = (a: string[] = []) => [...new Set(a)].sort();
  assert.deepEqual(uniq(found.platform), ['admin-routes.ts'], 'platform nace solo en requireAdmin');
  assert.deepEqual(uniq(found.webhook), ['services/email-invitations.ts']);
  assert.deepEqual(uniq(found.worker), ['services/notifications.ts']);
  assert.deepEqual(uniq(found.auth), ['services/auth.ts', 'services/customers.ts', 'services/demo.ts', 'services/invitations.ts', 'services/operations.ts']);
  assert.deepEqual(Object.keys(found).sort(), ['auth', 'platform', 'webhook', 'worker']);
});

test('nada fija app.scope fuera de db.ts', () => {
  assert.deepEqual(uses(/set_config\(\s*'app\.scope'/), ['db.ts']);
});

test('runWithScope siempre recibe un alcance literal (no variables ni expresiones)', () => {
  for (const f of walk(root).filter((x) => x.endsWith('.ts') && !x.endsWith('db.ts'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/runWithScope\(\s*([^,)]*)/g)) {
      assert.match(m[1].trim(), /^'(auth|platform|webhook|worker)'$/, `${f.slice(root.length + 1)}: ${m[1]}`);
    }
  }
});

test('nada fuera de db.ts toca el almacén de alcance ni usa SET [LOCAL] app.*', () => {
  assert.deepEqual(uses(/scopeStore\./), ['db.ts']);
  assert.deepEqual(uses(/\bSET\s+(LOCAL\s+|SESSION\s+)?app\.(scope|business_id)/i), []);
  // Alta de negocio: fija el contexto del negocio recién creado, siempre con is_local = true.
  assert.deepEqual(uses(/set_config\(\s*'app\.business_id'/), ['db.ts', 'services/businesses.ts', 'services/platform.ts']);
  for (const f of ['services/businesses.ts', 'services/platform.ts']) assert.match(readFileSync(join(root, f), 'utf8'), /set_config\('app\.business_id', \$1, true\)/);
});

test('las nueve tablas con aislamiento no se consultan con getPool().query / pool.query (sin transacción ni contexto)', () => {
  const nine = 'business_deletions|business_subscriptions|card_access_tokens|email_events|email_outbox|platform_audit_events|staff_invitations|staff_memberships|staff_sessions';
  const bad: string[] = [];
  for (const f of walk(root).filter((x) => x.endsWith('.ts') && !x.endsWith('db.ts'))) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:getPool\(\)|\bpool)\.query\(\s*([`'"])([\s\S]*?)\1/g)) {
      if (new RegExp(`\\b(${nine})\\b`).test(m[2])) bad.push(`${f.slice(root.length + 1)}: ${m[2].slice(0, 60)}`);
    }
  }
  assert.deepEqual(bad, []);
});
