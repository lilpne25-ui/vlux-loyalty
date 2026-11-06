# V0.4.5 · Pruebas (T01–T40 y regresión)

Corridas del 2026-11-06 en un entorno local: PostgreSQL 16 y el emulador de Vercel Output.

## Resumen

| Suite | Resultado |
|---|---|
| Unitarias (`npm run test:unit`) | **56/56** (eran 51; se agregaron las 5 del catálogo y del formulario) |
| Integración (`npm run test:integration`) | **120/120** (eran 101; se agregaron 19 de V0.4.5) |
| E2E V0.4.5 (`scripts/e2e-v045.sh`) | **26/26** checks (T31–T40) |
| Regresión E2E V0.2 (tres dispositivos) | 29/29 |
| Regresión E2E V0.2.1 (operación) | 14/14 |
| Regresión E2E V0.2.2 (PWA, Chromium) | 40/40 |
| Regresión E2E V0.3 (Control Center) | 24/24, 1 BLOCKED (Google Wallet sin credenciales, igual que antes) |
| Regresión E2E V0.4 (premium) | 35/35 |
| Regresión E2E V0.4.2 (comercial) | 36/36 |
| Regresión E2E V0.4.3 (metal) | 36/36. En la primera corrida falló T26 por un `ERR_CONNECTION_REFUSED` del emulador; pasó en las dos corridas siguientes. Se considera intermitente del entorno. |
| Regresión E2E V0.4.4 (alta unificada) | 42/42 |
| Typecheck y build | OK |

## Matriz T01–T40

| ID | Qué se prueba | Dónde | Resultado |
|---|---|---|---|
| T01–T04 | Crear, editar, suspender y reactivar siguen funcionando | integración `v045-lifecycle` | PASS |
| T05–T06 | Archivar saca de operación y de métricas; restaurar vuelve a suspendido | integración | PASS |
| T07 | Vista previa de eliminación: conteos, personal compartido, bloqueos y sin efectos | integración | PASS |
| T08–T09 | Eliminación de un negocio sintético; el personal compartido se conserva; bitácora y constancia | integración | PASS |
| T10–T11 | La invitación y su correo pendiente se guardan juntos; la plantilla no lleva contraseñas | integración `v045-email` | PASS |
| T12–T13 | Proveedor simulado → "aceptado por proveedor" (no "entregado"); webhook firmado (rechaza sin firma o con firma falsa) e idempotente | integración | PASS |
| T14 | Un fallo del proveedor queda "fallido"; el reintento usa el mismo enlace | integración | PASS |
| T15–T17 | Revocar borra el token; aceptar funciona una vez y no se reenvía después | integración | PASS |
| T18 | Sellos por compra (comportamiento de V0.4.4 intacto) | integración `v045-rewards` | PASS |
| T19 | Sellos por visita: varias compras en la misma visita cuentan una vez | integración | PASS |
| T20 | Sellos por servicio: solo servicios participantes y con tope | integración | PASS |
| T21–T22 | Versión nueva del programa sin invalidar premios; historial conservado | integración | PASS |
| T23–T24 | Sin doble acumulación ni doble canje (en paralelo) | integración | PASS |
| T25–T30 | Alta de los 16 giros con su plantilla sugerida | integración | PASS |
| T31 | El alta ofrece los 16 giros; el aviso de salud aparece en el dentista; se sugiere el tipo por visita | E2E `v045-operacion` | PASS |
| T32 | Cambiar de giro aplica su plantilla (barbería → servicios); el resumen usa la unidad | E2E | PASS |
| T33 | No afirma ningún envío antes de enviar; el simulado queda "Aceptado por el proveedor", nunca "Entregado" | E2E | PASS |
| T34 | El reenvío inmediato se frena y no crea otra invitación (1 invitación, 1 envío aceptado) | E2E + SQL | PASS |
| T35 | "Primeros pasos" del dueño visible y se puede ocultar | E2E | PASS |
| T36 | El editor del dueño muestra tipo y servicios; una meta fuera de rango se explica y no se guarda | E2E | PASS |
| T37 | Caja: pide el servicio, suma 1; el cliente ve "1 de 6 servicios" sin recargar; 390 px sin desborde | E2E | PASS |
| T38 | Archivar exige el nombre exacto, muestra el aviso y revoca la sesión del dueño (401) | E2E | PASS |
| T39 | Eliminar: bloqueo por clientes → declarar prueba con 2FA → respaldo sin secretos → slug, motivo y 2FA → constancia y bitácora | E2E + SQL | PASS |
| T40 | Sin errores de consola ni de página en las cuatro sesiones | E2E | PASS |

Extras sin número: puntos por consumo, límite diario y vigencia, bloqueo del cambio entre sellos y puntos con saldo, y eliminación de un negocio demo sin declaración.

## Fuera del alcance automatizado (a propósito)

- **Correo real:** BLOCKED (`V045_CORREO.md`).
- **Dispositivos físicos:** lista F1–F10 en `V045_PRODUCCION.md`.
- **Pruebas de usuarios reales:** no hubo sesiones con dueños ni clientes reales, así que **no se reportan resultados de UX con usuarios**. Las pruebas de UX automatizadas son T31–T37.

## Cómo correr

```bash
npm run typecheck && npm test                 # unitarias + integración (requiere .env.test con BD local)
npm run build:vercel && bash scripts/e2e-v045.sh   # E2E V0.4.5 (requiere .env con BD local)
```
