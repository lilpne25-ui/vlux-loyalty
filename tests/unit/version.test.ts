// 1.0.0-rc.1 · La versión mostrada coincide con package.json y con la última migración.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_VERSION, SCHEMA_VERSION } from '../../server/version';

const root = join(import.meta.dirname, '..', '..');
test('APP_VERSION = package.json y package-lock.json', () => {
  assert.equal(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, APP_VERSION);
  assert.equal(JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).version, APP_VERSION);
});
test('SCHEMA_VERSION = última migración y cada .up.sql tiene su .down.sql', () => {
  const files = readdirSync(join(root, 'db', 'migrations'));
  const ups = files.filter((f) => f.endsWith('.up.sql')).sort();
  assert.equal(ups.at(-1)!.replace('.up.sql', ''), SCHEMA_VERSION);
  for (const u of ups) assert.ok(files.includes(u.replace('.up.sql', '.down.sql')), u);
});
