# VLUX Loyalty 1.0 · Modelo financiero de lanzamiento

> Separa **precio oficial** (leído el 2026-11-07), **medido** e **hipótesis**. Precios de planes Start **MXN 299** y Premium **MXN 499** por sucursal al mes (+ IVA) siguen siendo **hipótesis**: ningún negocio los ha aceptado todavía. Reproducible: `python3 scripts/finanzas-rc1.py` (salida en `evidencia/finanzas-rc1.txt`). Costos de infraestructura por escala: `scripts/costos-v045.py`.

## 1. Costos fijos mensuales (producción mínima)
| Concepto | Monto | Tipo | Fuente |
|---|---|---|---|
| Vercel Pro (1 asiento, incluye USD 20 de uso) | USD 20 | Precio oficial | vercel.com/pricing |
| Supabase Pro (incluye USD 10 de cómputo = Micro, 8 GB, respaldo diario 7 días) | USD 25 | Precio oficial | supabase.com/pricing |
| Dominio | ≈ MXN 42 (500/año) | Hipótesis | Verificar al comprar |
| Monitoreo (UptimeRobot/Better Stack gratis) | 0 | Precio oficial del plan gratuito | |
| Respaldos en GitHub privado | 0 | Incluido en GitHub Free | |
| **Total** | **≈ MXN 874** (USD 45 × 18.5) | Tipo de cambio = hipótesis | |
Escala (de `costos-v045.py`, actividad media): hasta 50 negocios no cambia; ~100 negocios ≈ MXN 925 (cómputo Small); ~300 ≈ MXN 2,130 (Medium + correo).
**Opcional no incluido:** PITR USD 100/mes (recomendado ≥ 20 negocios de pago), Supabase cómputo mayor, Vercel asientos extra.

## 2. Costos variables por negocio al mes
| Concepto | Start 299 | Premium 499 | Tipo |
|---|---|---|---|
| IVA trasladado (16 %) | 47.84 | 79.84 | Se cobra al cliente y se entera al SAT; no es ingreso |
| Comisión de cobro con tarjeta (Stripe México 3.6 % + MXN 3, + IVA de la comisión) sobre el total con IVA | 17.96 | 27.65 | Precio oficial; +0.5 % si la tarjeta es extranjera |
| Infraestructura marginal | < 1 | < 1 | Medido/modelado (V0.4.5): despreciable hasta 50 negocios |
| Soporte (min/mes × MXN 250/h) | 15 min = 62.5 · 30 = 125 · 60 = 250 | igual | **Hipótesis principal: medir en el piloto** |
Alternativa sin comisión: transferencia SPEI con CFDI (costo 0, más trabajo de conciliación). Para los primeros 10 negocios probablemente conviene.

## 3. Costos únicos por negocio
| Concepto | Supuesto | Tipo |
|---|---|---|
| Onboarding (alta, logo, reglas, QR impreso, capacitación a caja) | 3 h × MXN 250 = 750 + impresión QR ≈ 50 | Hipótesis: el piloto mide el tiempo real |
| CAC (prospección, visitas, demo, transporte) | MXN 1,500 | Hipótesis: venta presencial en Toluca/Metepec |

## 4. Resultado: contribución antes de ISR y sueldos de VLUX
| Plan | Soporte/mes | Contribución por negocio | Equilibrio (cubre el fijo) | Recupera CAC + alta | 10 negocios | 50 negocios | 100 negocios |
|---|---|---|---|---|---|---|---|
| 299 | 15 min | 219 | 5 negocios | 10.3 meses | 1,311 (44 %) | 10,053 (67 %) | 20,887 (70 %) |
| 299 | 30 min | 156 | 6 | 14.4 meses | 686 (23 %) | 6,928 (46 %) | 14,637 (49 %) |
| 299 | 60 min | 31 | 29 | 72.5 meses | −564 | 678 (5 %) | 2,137 (7 %) |
| 499 | 15 min | 409 | 3 | 5.5 meses | 3,214 (64 %) | 19,568 (78 %) | 39,918 (80 %) |
| 499 | 30 min | 346 | 3 | 6.5 meses | 2,589 (52 %) | 16,443 (66 %) | 33,668 (67 %) |
| 499 | 60 min | 221 | 4 | 10.2 meses | 1,339 (27 %) | 10,193 (41 %) | 21,168 (42 %) |
Cifras mensuales en MXN sin IVA. % = sobre ingreso.

## 5. Lectura (recomendación)
1. **La infraestructura no es el problema; el tiempo de soporte sí.** A 299, una hora de soporte al mes por negocio deja el plan prácticamente sin margen (equilibrio 29 negocios, recuperar la venta tarda 6 años). A 499 el plan aguanta hasta 1 h/mes.
2. **Start 299 solo funciona si el soporte es < 30 min/mes** por negocio: autoservicio, sin funciones a medida, onboarding estandarizado de ≤ 1.5 h. Propuesta: Start = 1 sucursal, programa estándar, soporte por WhatsApp en horario hábil, sin capacitación presencial adicional.
3. **Premium 499 como precio de referencia del piloto.** Ofrecer el piloto gratis o con descuento (p. ej. 2 meses) y presentar 499 como precio de lista; medir disposición a pagar antes de bajar a 299.
4. El riesgo comercial real es el **CAC presencial**: con 1,500 por negocio y 299/mes, cada venta tarda un año en recuperarse. Medir horas reales por cierre en el piloto.
5. El fijo (≈ 874/mes) se cubre con 3–6 negocios de pago. **Antes del primer cliente real hay que pagarlo** (Vercel Hobby prohíbe uso comercial; Supabase Free no tiene respaldos): ≈ MXN 5,200 por 6 meses de piloto sin ingresos.

## 6. Impuestos (a validar con el contador)
- IVA 16 % sobre la suscripción: se traslada; la comisión de Stripe también causa IVA (acreditable si se tiene CFDI/comprobante).
- Los servicios de Vercel/Supabase son de proveedores extranjeros: revisar tratamiento de IVA por servicios digitales importados y deducibilidad.
- ISR según el régimen de VLUX (`[confirmar: RESICO / persona moral]`). No se modela.

## 7. Qué medir en el piloto para reemplazar hipótesis
| Hipótesis | Cómo medirla |
|---|---|
| Onboarding 3 h | Cronometrar cada paso (`PILOT_GUIDE.md`) |
| Soporte 15–60 min/mes | Registrar cada contacto: fecha, minutos, motivo |
| CAC 1,500 | Horas y gastos de cada prospecto hasta el cierre o la negativa |
| Precio aceptado | Preguntar al cierre del piloto: ¿pagarías 499? ¿299? ¿qué quitarías? |
| Retención | ¿Siguen usando la caja a las 4 y 8 semanas? (operaciones por semana) |
