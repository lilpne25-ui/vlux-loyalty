// El programa awk de ops/backup-verify.sh compara conteos POR NOMBRE de tabla (corrección conservada de vlux-ops):
// las collations de Supabase y del contenedor pueden ordenar las tablas distinto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const sh = readFileSync(join(import.meta.dirname, '..', '..', 'ops', 'backup-verify.sh'), 'utf8');
const prog = sh.slice(sh.indexOf("'", sh.indexOf('awk -v a="$SRC_BEFORE"')) + 1, sh.indexOf("}' ||") + 1);
const run = (a: string, d: string, b: string) => spawnSync('awk', ['-v', `a=${a}`, '-v', `d=${d}`, '-v', `b=${b}`, prog], { encoding: 'utf8' });

test('el orden distinto de tablas no es un fallo', () => {
  assert.equal(run('businesses=2 cards=5', 'cards=5 businesses=2', 'businesses=2 cards=5').status, 0);
});
test('un conteo fuera de rango, una tabla ausente o una adicional sí fallan', () => {
  assert.notEqual(run('businesses=2 cards=5', 'businesses=2 cards=4', 'businesses=2 cards=5').status, 0);
  assert.notEqual(run('businesses=2 cards=5', 'businesses=2', 'businesses=2 cards=5').status, 0);
  assert.notEqual(run('businesses=2', 'businesses=2 cards=5', 'businesses=2').status, 0);
  assert.notEqual(run('businesses=2 cards=x', 'businesses=2 cards=5', 'businesses=2 cards=5').status, 0);
});
test('crecer durante el respaldo dentro de [antes, después] es válido', () => {
  assert.equal(run('cards=5', 'cards=6', 'cards=7').status, 0);
});
