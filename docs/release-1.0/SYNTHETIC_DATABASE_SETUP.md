# Base sintética aislada · cómo se construye y se reproduce

Fecha: 2026-11-07 · Commit base `c15afbc` (+ cambios de esta auditoría) · PostgreSQL **17.11** (imagen `postgres:17`)

## Qué es y qué no es
Una base PostgreSQL **local, en contenedor, efímera**, generada **desde cero**. No se copió, extrajo ni anonimizó nada de Supabase Preview. No usa secretos reales (las contraseñas y la frase de cifrado se generan al azar en cada ejecución y mueren con el proceso). Los puertos se publican solo en `127.0.0.1`; no hay túneles ni exposición a internet.

## Contenido (determinista; mismo resultado en cada ejecución)
| Elemento | Cantidad |
|---|---:|
| Negocios (`synth-01`…`synth-10`, `is_demo=true`, `synthetic_declared_at` fijado) | 10 |
| Clientes sintéticos (300 por negocio) | 3 000 |
| Personal (1 dueño + 2 cajas por negocio) | 30 |
| Tarjetas / tokens de acceso | 3 000 / 3 000 |
| Visitas = compras | 32 945 |
| Eventos del libro mayor de sellos | 34 838 |
| Recompensas (1 893 canjeadas · 955 disponibles) | 2 848 |
| Reglas, suscripciones, ajustes de aviso, bitácora | 10 de cada una |

Datos de contacto: correos `cliente-N-M@example.com` / `duenoN@example.com ` (dominio reservado RFC 2606) y teléfonos `+52000000xxxxx` (inexistentes). Nombres `Cliente Sintético NNN`. Hay clientes sin contacto, con consentimiento de marketing y 30 anonimizados (ARCO) para cubrir esos caminos. Los `password_hash` son texto fijo que **no** es un hash válido (nadie puede iniciar sesión con ellos; la prueba funcional pone una contraseña de prueba solo en la copia restaurada).

Integridad de origen (verificada): saldo = libro mayor en 3 000/3 000 tarjetas, 0 llaves foráneas sin validar, 0 contactos fuera de dominio reservado, RLS en 34/34 tablas.

## Reproducir (≈ 18 s en este entorno)
```bash
npm ci
scripts/synthetic/run-drill.sh ./evidencia-local
```
El script: levanta dos contenedores (origen y destino) → `db-setup-local` + `migrate up` (0001→0015) → `seed-synthetic.sql` → `ops/backup-verify.sh` → cifra con AES-256 y verifica → `ops/restore-drill.sh` desde el `.gpg` → prueba funcional (`restore-functional-check.ts`) → borra los contenedores. Solo escribe la evidencia (sin datos personales ni secretos) en la carpeta indicada.

Guardas: `seed-synthetic.sql` aborta si la base no se llama `vlux_synth*` o ya contiene negocios; `restore-functional-check.ts` solo acepta `localhost` y bases `vlux_drill*|vlux_restore*|vlux_synth*`.

## Límites honestos
- 5 MB de volumen: los tiempos de abajo no extrapolan a una base de producción grande.
- Es PostgreSQL 17 estándar, no Supabase: no se prueban las extensiones, roles de plataforma (`anon`, `authenticated`, `supabase_admin`) ni el Session Pooler. El esquema `public` sí es idéntico (mismas migraciones).
- Estado: **BACKUP SYNTHETIC VERIFIED** (ver `BACKUP_TEST_REPORT.md` y `RESTORE_TEST_REPORT.md`).
