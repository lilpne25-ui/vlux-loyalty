# Propuesta técnica V0.3 · Apple Wallet y Google Wallet

Fuente de requisitos: análisis verificado por el equipo el 2026-10-30 (spec v0.3 del proyecto). Revalidar con la documentación oficial al iniciar V0.3.

## Objetivo
Que el cliente agregue su tarjeta a Wallet desde la tarjeta web y que los sellos se actualicen solos en el pase cuando la caja registre una compra. La tarjeta web sigue siendo el canal principal y de respaldo.

## Lo que V0.2 ya deja preparado
- Código público opaco por tarjeta (`cards.public_code`) que puede ir en el código de barras del pase.
- Libro mayor y `updated_at` por tarjeta: base para saber qué pases cambiaron.
- Bitácora de auditoría para registrar emisión y actualizaciones.
- Un solo backend multiempresa: un emisor (VLUX) para todos los negocios.

## Apple Wallet
| Requisito | Detalle |
| :- | :- |
| Cuenta | Apple Developer Program de organización (99 USD/año, requiere D-U-N-S de la razón social de VLUX). |
| Certificado | Pass Type ID + certificado de firma; guardarlo como secreto (nunca en el repo). |
| Emisión | Generar `.pkpass` firmado. Librería sugerida: `passkit-generator` (MIT, Node). Evitar librerías AGPL. |
| Actualización | Web service propio (5 endpoints: registrar/desregistrar dispositivo, lista de pases actualizados, último pase, log) + notificación push APNs al registrar una compra. |
| Revocación | Marcar el pase como inválido y responder 401/410 al pedirlo. |

## Google Wallet
| Requisito | Detalle |
| :- | :- |
| Cuenta | Google Wallet API en Google Pay & Wallet Console; la cuenta nace en modo demo: **pedir acceso de publicación en la semana 1** (camino crítico). |
| Modelo | `LoyaltyClass` por negocio y `LoyaltyObject` por tarjeta; enlace "Guardar en Google Wallet" con JWT firmado por cuenta de servicio. |
| Actualización | `PATCH` del objeto al registrar compra; límite de notificaciones visibles (3 por pase cada 24 h). |
| Agregador | Los términos permiten que VLUX emita en nombre de negocios con su autorización: incluirlo en el contrato. |

## Cambios en VLUX Loyalty
1. Tablas `wallet_passes` (tarjeta, proveedor, serial, estado) y `wallet_devices` (Apple).
2. Servicio `wallet` que tras cada compra o canje encola la actualización (tabla de trabajos en Postgres; sin infraestructura nueva).
3. Botones reales en la tarjeta web; mantener la vista previa solo mientras no haya credenciales.
4. Secretos: certificado Apple y cuenta de servicio Google en el gestor de secretos del hosting.

## Plan por átomos
1. Cuentas y credenciales (Vlux; bloqueante).
2. Google: clase + objeto + enlace de guardar (en modo demo).
3. Google: actualización al registrar compra.
4. Apple: emisión `.pkpass` firmada.
5. Apple: web service + APNs.
6. Revocación al eliminar datos del cliente.
7. Pruebas en iPhone y Android reales.

## Decisiones que necesita Vlux
- Razón social y D-U-N-S para la cuenta Apple.
- Cuenta de Google para la consola de Wallet.
- Si los pases llevan la marca del negocio, la de VLUX o ambas.
