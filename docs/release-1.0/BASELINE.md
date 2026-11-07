# VLUX Loyalty 1.0 · Línea base (antes de cualquier cambio)

Fecha: 2026-11-07 · Medida en el contenedor de desarrollo (Linux, Node 22.23.4, PostgreSQL 16 local) y por lectura en Supabase Preview.

## Punto de partida
| Dato | Valor |
|---|---|
| Rama de partida | `v0.4.6` |
| Commit verificado indicado | `338c9dcb0ca9d26c0a5d8a1a0ef61c7996f0e492` (desplegado en ambos Preview) |
| Commit real de partida | `43ad49e` = `338c9dc` + 2 commits de solo documentación y capturas (`docs/V046_DESPLIEGUE_PREVIEW.md`); sin cambios de código |
| Rama de preparación | `release/1.0.0-rc1` |
| Versión declarada en `package.json` | `0.2.2` (desalineada; corregida a `1.0.0-rc.1`) |

## Stack y versiones (exactas en `package-lock.json`)
| Capa | Tecnología |
|---|---|
| Interfaz | React 18.3.1, TypeScript 5.9.3, Vite 8.3.5, Tailwind 3.4.17, lucide-react 0.447.0 |
| API | Hono 4.13.14 (+ @hono/node-server 2.1.5), zod 4.6.7, pg 8.23.1, nodemailer 10.2.1 |
| PWA | Service Worker propio (`src/sw/sw-template.js`, caché por `BUILD_ID`), manifiestos por negocio |
| Criptografía | `node:crypto` (scrypt, SHA-256, TOTP, Web Push RFC 8291/8292); sin dependencias externas |
| BD | PostgreSQL. Local 16; **Supabase Preview 17.11** (us-east-1, plan Free) |
| Hosting | Vercel (Build Output API v3, Node 22, región iad1), 2 proyectos Preview |
| Node requerido | 22.x (CI usa 22; `@types/node` 22) |

## Dependencias
- `npm audit`: **0 vulnerabilidades** (info 0, low 0, moderate 0, high 0, critical 0).
- `npm ci` reproducible (lockfile v3, 4.7 s con caché).
- Desactualizadas: solo parches (hono 4.13.17, @hono/node-server 2.1.6, nodemailer 10.3.1, vite 8.3.6, smtp-server 3.21.3) y mayores (React 19, Tailwind 4, TypeScript 7, lucide 1.x, qrcode-generator 2). **Decisión de cierre: no se actualiza nada** (ninguna tiene vulnerabilidad conocida; cambiar mayores durante el cierre agrega riesgo sin beneficio). Revisar parches después del piloto.

## Migraciones
- Archivos: `0001`–`0014` (`.up.sql` y `.down.sql`).
- Supabase Preview `schema_migrations`: **14 filas, 0001–0014, los 14 checksums idénticos** a los archivos (ver `MIGRATIONS.md`). La afirmación de que 0009/0010 ya estaban registradas **es correcta** (registradas 2026-11-07 06:03 UTC).
- Instalación desde cero (BD vacía) con todas las migraciones: OK.

## Entornos
| Entorno | Recurso | Estado |
|---|---|---|
| Local / CI | PostgreSQL 16 + emulador de Vercel Output | Pruebas |
| Preview interno | Vercel `vlux-loyalty` (Vercel Authentication, Control Center) | V0.4.6 READY |
| Preview público | Vercel `vlux-loyalty-demo` (`DEMO_ACCESS=1`, sin Control Center) | V0.4.6 READY |
| BD Preview | Supabase `kpcmxmmwcolcxhkiwmaq`, Free, 13 MB, 18 conexiones de 60 | Compartida por ambos Preview |
| Producción | — | **No existe** |

## Pruebas (línea base, código V0.4.6 sin cambios)
| Suite | Resultado |
|---|---|
| Typecheck (`tsc`) | OK |
| Unitarias | 65/65 |
| Integración (PostgreSQL real) | 141/141 (33 s) |
| Build `build:vercel` | OK (bundle JS 579 kB, 182 kB gzip) |
| E2E V0.4.6 / regresión V0.2–V0.4.5 | Verdes en la entrega de V0.4.6 (re-ejecutadas sobre el RC, ver `TEST_REPORT.md`) |

## Asesores de Supabase (antes)
- Seguridad: 2 WARN `function_search_path_mutable` (`forbid_mutation`, `businesses_set_logo_hash`).
- Rendimiento: 31 INFO llaves foráneas sin índice que las cubra; 9 INFO índices sin uso registrado.

## Riesgos conocidos al iniciar
1. Respaldo diario: **7 de 7 ejecuciones fallidas** desde 2026-11-01 (faltan secretos); issue #2 abierto. No existe ningún respaldo restaurable de Preview.
2. Vercel Hobby **prohíbe uso comercial**; Supabase Free **no tiene respaldos automáticos** y se pausa tras 1 semana sin actividad.
3. Nada probado en teléfonos físicos.
4. Aviso de privacidad en versión `borrador-2026-10`, sin revisión jurídica.
5. Repositorio público (decisión de Vlux): el código es visible.
