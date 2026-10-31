# Reporte de migración V0.1 → V0.2

V0.1 original intacto en `legacy/v01/` y en el tag Git `v0.1-baseline`.

## Reutilizado
| Pieza de V0.1 | En V0.2 | Cambio |
| :- | :- | :- |
| `components/ui.tsx` (Button, Badge, Modal, Toast, QRCode, Field, marcas) | igual | `BusinessLogo` dibuja el grano de café solo en cafeterías. |
| `components/LoyaltyCard.tsx` (StampGrid, LoyaltyCardFace) | igual | Marca de sello genérica fuera de cafeterías. |
| `styles.css`, `tailwind.config` | igual | + utilidades de impresión y de marca por giro. |
| `lib/qr.ts` (generación y lectura por foto) | igual | + escaneo con cámara en vivo. |
| `views/Customer.tsx` | adaptada | Datos desde la API; registro con aceptación del aviso; enlace personal; textos por giro; sin selector de tarjetas de demo. |
| `views/Employee.tsx` | adaptada | Cámara en vivo, búsqueda en servidor, compras con cantidad e idempotencia, confirmación de doble toque, canje con confirmación. |
| `views/Owner.tsx` | adaptada | KPIs reales (visitas ≠ compras ≠ sellos), equipo, QR del mostrador, ARCO, más reglas configurables. Mismos gráficos y estilo. |
| `views/ForBusiness.tsx` | adaptada | Sin formulario que guardaba en el navegador; enlaces a demos y acceso. |
| `domain/model.ts` (`execute`, validaciones, reglas) | migrada al servidor | Reglas → `shared/rules.ts` y `server/services/*`; formato de fechas → `src/lib/format.ts`. |
| Alfabeto sin caracteres ambiguos, código `R-XXXXXX` | igual | El código de tarjeta deja de tener prefijo del negocio (`CDT-`): ahora `XXXX-XXXX` opaco. |

## Retirado (y por qué)
| Pieza | Motivo |
| :- | :- |
| `lib/store.ts` (estado en `localStorage`) | La fuente de verdad es PostgreSQL. Solo queda memoria de interfaz para animaciones (`lib/seen.ts`). |
| `domain/seed.ts` (clientes de ejemplo mezclados) | Inflaba métricas. Las demos ahora son negocios marcados `is_demo` y se crean con `npm run db:seed:demo`. |
| Selector "Soy cliente / empleado / dueño" | Permitía cambiar de perspectiva sin autenticación. Ahora cada rol entra por su ruta y el servidor decide. |
| "Modo de prueba" y "Completar hasta la recompensa" | Generaban operaciones simuladas que contaban en estadísticas. |
| Bloqueo fijo de 60 s entre sellos | Impedía registrar una segunda compra legítima. Se sustituye por idempotencia + confirmación de doble toque (20 s). |
| Recorrido de demostración (8 pasos) | Dependía del estado local; el manual del piloto lo sustituye. |

## Hallazgos de la auditoría verificados contra el código de V0.1
El archivo `VLUX_LOYALTY_V01_AUDITORIA_COMPLETA.md` no estaba en la carpeta del proyecto; se verificó directamente en el código:
- `localStorage` como almacenamiento principal: **confirmado** (`src/lib/store.ts`).
- Sin backend, auth ni multiempresa: **confirmado** (un solo `business` en `State`).
- Cliente puede cambiar de perspectiva: **confirmado** (`App.tsx` TopBar y `CardPicker`).
- Sellos confundidos con visitas: **confirmado** (`addStamp` incrementa `totalVisits`; `metrics.visits = stampOps.length`).
- Estadísticas con operaciones simuladas: **parcialmente**: las de ejemplo se podían excluir con un interruptor, pero las del "modo de prueba" contaban como reales (`testMode` no se filtraba en `metrics`).
- Wallet no integrado: **confirmado** (solo vista previa con aviso).
- Sin cámara en vivo: **confirmado** (solo foto con jsQR).
