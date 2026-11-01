# V0.4.1 · Resultados de pruebas

Ejecutadas el 2026-11-01 sobre el commit de la rama `v0.4.1`, contra el emulador local de Vercel con PostgreSQL local (Chromium). Las capturas están en `docs/evidencia/capturas/`.

## Suites
| Suite | Resultado |
|---|---|
| `tsc --noEmit` | limpio |
| Unitarias | 32/32 |
| Integración | 86/86 |
| E2E v021 (operación) | 14/14 |
| E2E v022 (PWA, Chromium) | 40/40 |
| E2E v02 (tres dispositivos) | 29/29 |
| E2E v03 (Control Center) | 24 PASS, 1 BLOCKED (K: Google Wallet sin cuenta de emisor) |
| E2E v04 premium | 35/35 |
| WebKit y Firefox | NOT TESTED en local (no hay navegadores adicionales); los ejecuta el workflow `pwa-navegadores.yml` en GitHub Actions |

## Casos solicitados
| ID | Resultado | Evidencia |
|---|---|---|
| T01 logos oficiales se muestran | PASS | v04 S1 (imágenes de `/brand` cargadas en el Control Center); capturas S2/S3 |
| T02 el Estudio carga una imagen válida | PASS | v04 L3–L5 |
| T03 extrae paleta | PASS | v04 L3, L4 (+5 pruebas unitarias) |
| T04 la tarjeta cambia sin afectar el programa | PASS | v04 S2–S4 (sellos y premio intactos) |
| T05 contraste y legibilidad | PASS | v04 S2: texto 16.5:1, acento 9.9:1; S3: 11.1:1 y 6.6:1 |
| T06 PWA del cliente conserva identidad | PASS (Chromium) / NOT TESTED (iPhone, Android físicos) | v022; v04 P1–P3 |
| T07 PWA del dueño abre su sección | PASS (manifiesto `/panel`, Chromium) / NOT TESTED físico | v04 O1–O2 |
| T08 PWA de caja abre su sección | PASS (manifiesto `/caja`, prueba de integración) / NOT TESTED físico | integración v04 |
| T09 enlaces públicos sin cuenta de Vercel | PASS en Preview | ver «Despliegue» |
| T10 Control Center conserva protecciones | PASS | v04 Q3; v03; en Vercel sigue la protección SSO |
| T11 aislamiento entre negocios | PASS | integración (RLS, FK compuesta, tarjeta de otro negocio 404), v02 13b |
| T12 sellos sincronizan | PASS | v02 08 |
| T13 recompensa no se canjea dos veces | PASS | integración «canje concurrente: 10 intentos, 1 sola vez» |
| T14 movimiento reducido | PASS | v04 S5 (animación del brillo = none) |
| T15 respaldo restaurable | **BLOCKED** | faltan secretos; ver V041_RESPALDOS.md |
| T16 demostración sin tocar la BD | PASS parcial | Dos guiones continuos: v04 (Estudio → crear negocio → dueño → cliente) y v02 (caja → sello → canje → panel). No existe un único guion de punta a punta |
