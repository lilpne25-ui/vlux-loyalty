# VLUX Loyalty 1.0.0-rc.1 · Notas de la versión candidata

Rama `release/1.0.0-rc1` desde `v0.4.6` (`338c9dc`). Etiqueta propuesta: `v1.0.0-rc.1`. Objetivo: **estabilizar, no expandir**. No hay módulos nuevos.

## Cambios
| Área | Cambio | Commit |
|---|---|---|
| Base de datos | Migración aditiva `0015_release_hardening`: `search_path` fijo en 2 funciones, EXECUTE retirado a PUBLIC en 4, privilegios por omisión sin `anon`/`authenticated`, 12 índices de llaves foráneas | `e20c1b2` |
| Recuperación | `ops/grants.sql` al día con las 33 tablas y 6 funciones de la app | `e20c1b2` |
| Rendimiento | Serie diaria del tablero en una sola pasada (803 → 22 ms con un año de historial) | `4eef4cb` |
| Respaldos | Verificación tolerante a escrituras concurrentes, permisos, prueba funcional; el workflow se niega a correr en repositorio público; simulacro `ops/restore-drill.sh` | `e87f8e4` |
| Alcance | Web Push, promociones, recordatorios automáticos, citas y SMTP propio **apagados** en Vercel; solo se encienden con variable de servidor | `d19a2d6` |
| Versión | `1.0.0-rc.1` en `package.json`, `/api/health` y Control Center (esquema `0015_release_hardening`) | `202f0b1` |
| Documentación | `docs/release-1.0/` completo | este commit |

## Correcciones (con justificación)
| Defecto | Severidad | Por qué importaba |
|---|---|---|
| Restaurar un respaldo dejaba funciones de purga/exportación ejecutables por PUBLIC | Alta | Una base restaurada habría quedado con funciones peligrosas abiertas |
| Restaurar dejaba a la app sin permisos en 8 tablas y 3 funciones | Alta | La restauración "pasaba" pero la app no funcionaba |
| Respaldo cifrado publicado como artefacto de un repositorio público | Alta | Cualquiera podía descargarlo |
| Purga controlada tardaba 212 s | Media | Supera el límite de 15 s de Vercel; bloqueos largos |
| Tablero lento con historial (O(días × historial)) | Media | Sondeo cada 8 s; empeoraba cada día |
| `search_path` mutable (asesor de Supabase) | Media | Riesgo de suplantación de objetos |
| Verificación de respaldo con falsos negativos | Media | Alertas falsas → se ignoran las reales |

## Migraciones
0001–0014 verificadas en Preview (14/14 checksums). 0015 nueva, aditiva; el código del RC no depende de ella. Preview: pegar `0015_pegar_en_supabase.sql`. Detalle: `MIGRATIONS.md`.

## Riesgos y limitaciones conocidas
- Sin producción: Preview usa Vercel Hobby (no comercial) y Supabase Free (sin respaldos).
- Respaldo real de Supabase nunca restaurado (BLOCKED por secretos y destino privado).
- Sin pruebas en teléfonos físicos.
- Aviso de privacidad en borrador (`PRIVACY_NOTICE_VERSION=borrador-2026-10`).
- No es Apple/Google Wallet: es una app web instalable (PWA).
- Correo apagado: invitaciones y restablecimientos se entregan por enlace, QR o código presencial.
- KPIs del tablero cuentan todo el historial (58 ms con un año muy activo): aceptable para el piloto, revisar antes de GA.
- Sesiones vencidas y cola de avisos sin purga automática (crecimiento lento).
- Rectificación de datos del cliente sin pantalla (soporte manual).

## Procedimientos operativos
`PRODUCTION_ARCHITECTURE.md` (despliegue y reversión) · `RUNBOOK.md` (monitoreo e incidentes) · `BACKUP_RECOVERY.md` · `DEVICE_TESTS.md` · `PILOT_GUIDE.md`.

## Despliegue del candidato (solo Preview)
Ver la sección al final de este documento (se completa al desplegar).
