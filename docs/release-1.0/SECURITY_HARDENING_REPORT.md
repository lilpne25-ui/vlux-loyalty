# Informe de endurecimiento · VLUX Loyalty 1.0

## Cambios
- `db/migrations/0016_tenant_isolation.{up,down}.sql` (única 0016 existente). Checksum del `up`: `b55d29db99d1fdbaa3b26534d86730d83d74b2df265adcbf409d006e31396459`.
- `server/db.ts`: alcance por transacción (`runWithScope`, `q`), `begin()` fija siempre `app.scope` y `app.business_id` locales.
- Servicios adaptados: `auth`, `customers`, `operations`, `owner`, `invitations`, `email-invitations`, `businesses`, `notifications`, `platform`, `lifecycle`, `platform-auth`, `demo`; `admin-routes.ts` abre el alcance `platform` tras la 2FA.
- `ops/grants.sql` alineado (permisos por columna; `GRANT EXECUTE app_scope()` condicional para restaurar respaldos anteriores a 0016).
- Pruebas nuevas: aislamiento SQL, API e invariantes estáticas.

## Auditoría adicional (código)
| Tema | Resultado |
|---|---|
| SQL injection | consultas parametrizadas; el único SQL interpolado es el alcance, validado contra una lista fija |
| IDOR | 7 pruebas HTTP cruzadas: 404/403 sin efecto |
| Escalada de privilegios | `vlux_app` sin superusuario/BYPASSRLS/propiedad; sin DELETE; UPDATE por columnas; funciones de plataforma tras alcance |
| Tokens y sesiones | solo hashes en BD; ahora aislados por RLS; revocación limitada a `revoked_at` |
| `SECURITY DEFINER` | 5 funciones envueltas; `search_path` fijo; sin EXECUTE para PUBLIC/anon/authenticated |
| Secretos | escaneo de lo añadido: sin credenciales |
| Pendientes | R-1, R-2, E-1 (ver auditoría RLS); limitación de tasa en memoria no distribuida (heredado, sin cambios) |

## Despliegue y reversa
Orden: **1)** desplegar el código (funciona con 0015 y 0016), **2)** pegar `0016_pegar_en_supabase.sql`. Al revés, el código anterior pierde acceso a sesiones y tokens. Reversa: `0016…down.sql` y redeploy del código previo. Nada de esto se ha ejecutado fuera de PostgreSQL local.
