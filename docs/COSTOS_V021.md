# Costos de infraestructura · VLUX Loyalty (Vercel Pro + Supabase Pro)

Precios consultados el 2026-10-31 en vercel.com/pricing, vercel.com/docs/functions/usage-and-pricing y supabase.com/pricing. Todos los supuestos están marcados con **[S]**.

## Precios base (USD/mes)
- **Vercel Pro:** 20 por asiento de desarrollador, con 20 de crédito de uso incluido. Hobby **no sirve para cobrar**: es solo para uso personal no comercial.
- **Funciones en iad1:**
  - 0.60 por millón de invocaciones.
  - 0.128 por hora de CPU activa.
  - 0.0106 por GB-hora de memoria.
  - El CDN entra en la tarifa plana de Pro.
- **Supabase Pro:** 25, con 10 de crédito de cómputo. Con eso queda cubierta la instancia Micro (1 GB RAM, 200 conexiones vía pooler).
  - Disco: 8 GB incluidos.
  - Egress: 250 GB incluidos.
  - Respaldos diarios con 7 días de retención.
  - El proyecto no se pausa.

## Supuestos de uso
- **[S]** 40 visitas al día por negocio y unas 50 peticiones a la API por visita. El polling solo corre con la pantalla visible: tarjeta del cliente cada 4 s, caja cada 5 s. Total: unas **60 mil peticiones al mes por negocio**.
- **[S]** Cada petición usa unos 20 ms de CPU y unos 80 ms de reloj, con 2 GB de memoria por instancia. Vercel no publica la memoria por omisión, así que este dato es un supuesto. Con eso, el costo de funciones es de unos **1.8 USD por millón de peticiones**.
- **[S]** Tipo de cambio: **18.5 MXN por USD**. Verifícalo el día que presupuestes.
- **[S]** Precio de venta: 299 MXN al mes por negocio, sin IVA.
- No incluye:
  - Comisiones de cobro. Con Stripe en México son alrededor de 3.6% + 3 MXN + IVA por cargo; verifícalo.
  - Dominio, unos 15 USD al año.
  - Tiempo de soporte y alta de clientes.

## Escenarios (mensual)
| Negocios | Peticiones/mes | Funciones (dentro del crédito de 20) | Vercel | Supabase | **Infra USD** | **Infra MXN** | Ingreso MXN | Margen bruto infra | Infra por negocio |
| -: | -: | -: | -: | -: | -: | -: | -: | -: | -: |
| 2 | 0.12 M | ~0.2 | 20 | 25 | **45** | 833 | 598 | **−235** | 416 |
| 10 | 0.6 M | ~1.1 | 20 | 25 | **45** | 833 | 2,990 | 2,157 (72%) | 83 |
| 30 | 1.8 M | ~3.2 | 20 | 25 | **45** | 833 | 8,970 | 8,137 (91%) | 28 |
| 100 | 6 M | ~10.7 | 20 | 25 a 40 **[S]** | **45 a 60** | 833 a 1,110 | 29,900 | ~28,800 (96%) | 8 a 11 |

Notas:
- **Punto de equilibrio de infraestructura: 3 negocios.** Con 2 negocios el piloto pierde unos 235 MXN al mes, y eso es aceptable como costo de validación.
- Con 100 negocios conviene subir a cómputo Small. El precio estimado es de unos 15 USD al mes, menos 10 de crédito. Hay que verificarlo antes de cambiar.
- PITR (100 USD al mes) **no** se justifica en esta etapa.
- **El costo real no es la nube.** Lo que pesa es el alta de cada negocio, el soporte y la cobranza. Con 30 negocios, 2 horas de soporte al mes por negocio cuestan más que toda la infraestructura.
- Si un negocio tiene mucho más tráfico (más de 200 visitas al día), el costo de funciones crece de forma lineal. Aun así sigue dentro del crédito de Vercel hasta unos 10 millones de peticiones al mes.

## Qué contratar y cuándo (requiere tu autorización)
1. **Antes de la primera cafetería con datos reales:** Supabase Pro en un proyecto nuevo de producción y Vercel Pro (1 asiento). Son unos 45 USD al mes.
2. **Antes de cobrar:** dominio propio y aviso de privacidad revisado por un abogado.
3. **No contratar todavía:** PITR, cómputo mayor ni asientos adicionales.
