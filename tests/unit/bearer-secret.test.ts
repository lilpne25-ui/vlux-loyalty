// 1.0.x · Autenticación de tareas de servidor (retención 0017): bearerMatchesAny.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bearerMatchesAny } from '../../server/security';

const A = 'a'.repeat(40), B = 'secreto-b-de-prueba-con-mas-de-32-caracteres';

test('U-BEARER-1: acepta cualquiera de los secretos configurados, solo con «Bearer »', () => {
  assert.equal(bearerMatchesAny(`Bearer ${A}`, [A, B]), true);
  assert.equal(bearerMatchesAny(`Bearer ${B}`, [A, B]), true);
  assert.equal(bearerMatchesAny(`Bearer ${B}`, [undefined, B]), true);
  for (const h of [A, `bearer ${A}`, `Bearer  ${A}`, `Basic ${A}`, `Bearer ${A} `, `Bearer ${A}x`, `Bearer ${A.slice(1)}`, '', undefined]) {
    assert.equal(bearerMatchesAny(h, [A, B]), false, String(h));
  }
});

test('U-BEARER-2: secretos ausentes o de menos de 32 caracteres = cerrado', () => {
  const short = 'x'.repeat(31);
  assert.equal(bearerMatchesAny(`Bearer ${short}`, [short]), false);
  assert.equal(bearerMatchesAny(`Bearer ${A}`, []), false);
  assert.equal(bearerMatchesAny(`Bearer ${A}`, [undefined, '']), false);
  assert.equal(bearerMatchesAny('Bearer ', ['']), false);
});

test('U-BEARER-3: rechaza caracteres de control y tokens enormes sin comparar', () => {
  assert.equal(bearerMatchesAny(`Bearer ${A}\n`, [A]), false);
  assert.equal(bearerMatchesAny(`Bearer ${'z'.repeat(600)}`, ['z'.repeat(600)]), false);
});
