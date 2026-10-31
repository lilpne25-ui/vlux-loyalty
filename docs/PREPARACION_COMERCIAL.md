# Preparación comercial · VLUX Loyalty V0.2

## Veredicto
**Apto para un piloto cerrado con datos sintéticos o con 1–2 negocios de confianza**, una vez desplegado con HTTPS y respaldos. **No apto todavía para venta abierta ni para datos personales reales** sin el aviso de privacidad revisado por un abogado y sin las funciones de soporte de la lista "Antes del piloto con clientes reales".

## Listo y verificado (local)
- Tarjeta web sin app ni contraseña, registro desde QR del mostrador.
- Caja en el teléfono del empleado con cámara en vivo, foto o código.
- Sellos autorizados por el servidor, sin duplicados ni doble canje (probado con concurrencia).
- Panel del dueño con métricas reales que distinguen visitas, compras y sellos.
- Multiempresa con aislamiento en aplicación y en base de datos.
- Configurable por giro: cafetería y barbería probadas.
- Exportar y eliminar datos de un cliente.

## Antes del piloto con clientes reales
| Pendiente | Responsable sugerido | Por qué |
| :- | :- | :- |
| Aviso de privacidad por negocio y contrato de encargado VLUX–negocio | Abogado + Vlux | Ley mexicana de datos personales; el texto actual es borrador. |
| Despliegue con HTTPS y dominio | VLUX | La cámara no funciona sin HTTPS. |
| Respaldos automáticos y prueba de restauración | VLUX | Hoy solo está documentado. |
| Cambio y recuperación de contraseña del personal | Desarrollo | Hoy lo hace VLUX a mano. |
| Prueba en iPhone y Android reales | VLUX | Solo se probó con Chromium. |
| Anular una compra registrada por error | Desarrollo | Evita llamadas de soporte. |

## Costos y precio
- Infraestructura: un servicio Node + un PostgreSQL administrado para todos los negocios. El costo marginal por negocio es bajo; las cifras exactas se deben cotizar con el proveedor elegido (no se verificaron precios en esta sesión).
- Precio de 299 MXN/mes: **hipótesis**, no confirmada. El spec anterior proponía 499/899 por sucursal. Recomendación: validar en el piloto la disposición a pagar con al menos 2 negocios antes de fijarlo.
- Soporte: lo más costoso hoy es manual (altas, contraseñas). Automatizarlo es prioridad si el precio será bajo.

## Cómo demostrarlo
Ver el guion de 10 minutos en `docs/MANUAL_PILOTO.md` (3 dispositivos, Café Demo Toluca y Barbería Demo Metepec).
