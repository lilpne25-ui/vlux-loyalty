# Clasifica las fallas de la matriz: ¿cada prueba que falla es una afirmación PROPIA de 0016 o de 0017 que no aplica
# a ese esquema? Cualquier otra falla es una regresión real. Uso: python3 -I scripts/classify-matrix.py <dir de logs>
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
def titles(f):
    return set(re.findall(r"^test\('([^']+)'", (root / 'tests/integration' / f).read_text(), re.M))
t0016 = titles('tenant-isolation.test.ts')
# R2-10 NO es propia de 0017: verifica justamente el comportamiento SIN 0017 y debe pasar en todas las combinaciones.
t0017 = {t for t in titles('v1-recovery-support.test.ts') if t.startswith('R2-') and not t.startswith('R2-10')}
tenant_dyn = re.compile(r'^[a-z_]+: (con el contexto del negocio A|sin contexto ni alcance|un identificador de negocio inválido)')
bad_total = 0
for log in sorted(pathlib.Path(sys.argv[1]).glob('*/*.tests.log')):
    combo = log.name.replace('.tests.log', '')
    has16 = '0016' in combo; has17 = '0017' in combo
    fails = [m.group(1) for m in re.finditer(r'^not ok \d+ - (.+)$', log.read_text(), re.M)]
    p = re.search(r'^# pass (\d+)', log.read_text(), re.M); f = re.search(r'^# fail (\d+)', log.read_text(), re.M)
    exp16 = [x for x in fails if not has16 and (x in t0016 or tenant_dyn.match(x))]
    exp17 = [x for x in fails if not has17 and x in t0017]
    other = [x for x in fails if x not in exp16 and x not in exp17]
    bad_total += len(other)
    print(f"{combo}: pass={p and p.group(1)} fail={f and f.group(1)} → propias de 0016 sin 0016={len(exp16)} · propias de 0017 sin 0017={len(exp17)} · REGRESIONES={len(other)}")
    for x in other: print('   REGRESIÓN:', x)
print('SIN REGRESIONES' if bad_total == 0 else f'{bad_total} REGRESIONES')
