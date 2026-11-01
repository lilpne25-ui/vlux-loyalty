# Plan de piloto comercial · VLUX Loyalty V0.3

**Hechos:** el producto corre en Preview (Vercel + Supabase), con alta de negocios desde el Control Center, sin tocar la base. **Hipótesis:** precios, conversión y tiempos de este plan; se validan con el piloto. **Sin decidir:** precio final (299 vs 499 MXN/mes).

## 1. Objetivo
Probar con **2 a 3 negocios reales de Toluca y Metepec** (cafeterías, barberías o salones) que:
1. VLUX los da de alta en menos de 15 minutos sin ayuda técnica.
2. Sus clientes se registran y regresan (visitas repetidas medibles).
3. Al menos 1 negocio acepta pagar al terminar el piloto.

## 2. Precondiciones (antes de llevar datos reales)
| # | Requisito | Estado hoy |
| -: | :- | :- |
| 1 | Respaldos **operativos** (merge a `main`, secretos, ejecución y restauración verificadas) | Pendiente: decisión de Vlux |
| 2 | Entorno de producción separado de la demo (no compartir base con datos sintéticos) | Pendiente |
| 3 | Aviso de privacidad revisado (borrador `borrador-2026-10`) | Pendiente: revisión legal |
| 4 | Primer administrador VLUX con 2FA en el Control Center | Pendiente: Vlux con `PLATFORM_ADMIN_TOKEN` |
| 5 | Prueba en iPhone y Android físicos (`CHECKLIST_DISPOSITIVOS_FISICOS.md`) | Pendiente |

Mientras 1–3 no estén listos, el piloto se hace **solo con la demo y datos sintéticos** (demostración de venta), no con clientes reales.

## 3. Precios a probar (hipótesis)
| Plan | MXN/mes por sucursal | Para quién |
| :- | -: | :- |
| Piloto | 0 (60 días) | Primeros 3 negocios a cambio de retroalimentación y testimonio |
| Inicio | 299 | Un local, un programa, hasta 2 empleados |
| Crecimiento | 499 | Más empleados, marca personalizada, reporte mensual |

Están cargados en *Planes* del Control Center y se pueden editar. No hay cobro automático: se factura a mano y el estado se marca en *Suscripción*.

## 4. Pasos (6 semanas)
1. **Semana 0.** Cerrar precondiciones 1–4. Imprimir material del mostrador (QR + cartel).
2. **Semana 1.** Visitar 8–10 negocios con la demo pública en el teléfono. Meta: 3 «sí» para piloto.
3. **Semana 1.** Alta de cada negocio en el Control Center (asistente) y entrega del enlace al dueño en persona.
4. **Semanas 2–7.** Acompañamiento: visita a la semana 1, mensaje a la semana 3, revisión de métricas a la semana 5.
5. **Semana 7.** Propuesta de conversión con sus números reales.

## 5. Métricas (las da el panel y el Control Center)
- Clientes registrados por semana.
- % de clientes con 2 o más visitas (meta hipótesis: 25% a 30 días).
- Compras registradas por empleado (adopción en caja).
- Premios canjeados.
- Tiempo de alta del negocio (cronometrado).
- Conversión piloto → pago.

## 6. Riesgos
- El empleado olvida registrar la compra → sin datos. Mitigación: QR visible en caja y capacitación de 10 min.
- Google prohíbe premiar reseñas: el programa premia **visitas**, nunca reseñas.
- Wallet nativo no está disponible; se vende la tarjeta PWA. No prometer Apple/Google Wallet.
