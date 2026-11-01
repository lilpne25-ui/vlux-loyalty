# Informe de seguridad · V0.2.2 (PWA)

Alcance: cambios de V0.2.1 a V0.2.2 (`git diff v0.2.1..v0.2.2`). Revisión de código: subagente **msa-lud-dev** (solo lectura, 2026-10-31) más pruebas automáticas. No es una auditoría externa ni declara cumplimiento legal completo.

## Controles nuevos
| Tema | Control | Evidencia |
| :- | :- | :- |
| Tokens fuera de recursos públicos | Manifiesto e íconos solo con datos públicos del negocio; `start_url` sin token; prueba que busca patrones de token en el manifiesto | `tests/integration/v022.test.ts`, H5 por HTTPS |
| Vinculación de la app instalada | Código de 8 dígitos, un solo uso (UPDATE atómico), 15 min, se guarda solo el hash con el negocio como sal, un código nuevo anula los anteriores | Pruebas de integración 2–4 |
| Fuerza bruta del código | 10 intentos por IP cada 10 min y 300 por negocio cada 10 min; 10 códigos por tarjeta por hora | Prueba de límite (10×404 → 429) |
| Aislamiento por negocio | `card_pair_codes` con RLS `tenant_isolation` (`business_id = current_business_id()`), sin permisos para `anon` ni `authenticated` | Prueba RLS + advisors de Supabase sin alertas |
| Cookie de la tarjeta | HttpOnly, SameSite=Lax, Secure en producción, una por negocio | Sin cambios respecto a V0.2.1 |
| Service worker | Solo GET del mismo origen; nunca `/api`, `/t`, `/restablecer` ni `/sw.js`; caché solo de `index.html` y `/assets`; navegación primero a la red; versiones viejas se borran | E2E S1–S4 y H15 (caché con 3 entradas, todas públicas) |
| Sin conexión | Pantalla o aviso claro; no se inventan sellos; sellar y canjear requieren red | E2E U1–U4 |
| Costo/abuso de íconos | Ícono dibujado una vez por instancia (caché en memoria, máx. 200), `s-maxage` para la CDN, límite de 60 por minuto por IP cuando no está en caché | H6 (`x-vercel-cache: HIT`) |
| Entornos | Demo pública sin `PLATFORM_ADMIN_TOKEN`; proyecto interno sigue con Vercel Authentication; Production bloqueado en ambos | `docs/ACCESO_VERCEL_V022.md`, H1–H2 |

## Hallazgos de la revisión msa-lud-dev y su estado
| # | Severidad | Hallazgo | Estado |
| -: | :- | :- | :- |
| 1 | Media | Íconos dibujados en cada petición (≈560 ms de CPU el de 512), sin caché de CDN ni límite | **Corregido** (caché en memoria + `s-maxage` + límite por IP) |
| 2a | Media | `code_hash` UNIQUE global y sin limpieza: un número repetido daría error 500; la tabla crece sin límite | **Corregido** (índice único solo entre códigos abiertos del negocio, reintento ante choque, limpieza de códigos vencidos hace más de 1 día) |
| 2b | Media | Política `app_only` sin separación por negocio | **Corregido** (`tenant_isolation`) |
| 3 | Media | Cupo por negocio (300/10 min) permite que ~30 IPs bloqueen la vinculación de ese negocio por 10 min; probabilidad de acierto por fuerza bruta ≈ códigos activos × 4.3e-4 al día | **Aceptado con riesgo** para el piloto: el efecto es temporal y el cliente siempre puede usar su enlace personal. Mejora propuesta para V0.3: bloqueo por número de fallos y códigos de 10 dígitos |
| 4 | Baja | Abrir y cerrar la guía generaba códigos nuevos y agotaba el cupo | **Corregido** (se reutiliza el código vigente en memoria de la página) |
| 5 | Baja | En modo enlace, `/card-access` pone la cookie antes de validar que el enlace sea del mismo negocio | **Pendiente** (efecto menor: la cookie es del otro negocio, no da acceso nuevo) |
| 6 | Baja | `scope` sin `/` final: `/n/cafe` también abarca `/n/cafe-demo` | **Aceptado**: solo afecta qué páginas abren dentro de la ventana instalada; no da acceso a datos |
| 7 | Baja | En la app instalada, "Crear una" puede duplicar la tarjeta de quien ya tiene una | **Mitigado** con aviso bajo el botón |
| 8 | Baja | Si falla un archivo precargado, el SW no se instala (sin aviso) | **Aceptado**: la app sigue funcionando sin SW |

## Riesgos abiertos
- **iPhone físico no probado.** El comportamiento de cookies de la app instalada en iOS no está confirmado; el código de vinculación cubre ambos casos.
- **Demo pública con la base del Preview.** Solo datos sintéticos. Cargar datos reales ahí sería una exposición.
- **Respaldos del Preview no operativos** (ver `docs/RESPALDOS.md`).
- **Repositorio público** (decisión de Vlux): no hay secretos en el código; los secretos viven en Vercel y GitHub Secrets. Los artefactos de Actions de un repo público son descargables por cualquier usuario de GitHub con sesión iniciada, por eso el respaldo se cifra.
