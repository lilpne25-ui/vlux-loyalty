# VLUX Loyalty 1.0 · Guía del primer piloto comercial

> **Estado: preparada, NO ejecutada.** No hay negocio real ni resultados. Las duraciones son **objetivos a medir**, no mediciones. Las "dificultades previstas" salen de las pruebas automatizadas y de revisar el flujo; las reales se anotan durante el piloto.
> Requisito para empezar con un negocio real: `GO_NO_GO.md` en **READY FOR CONTROLLED PILOT**. Hasta entonces, esta guía se ensaya con un negocio sintético en Preview.

## Perfil del primer negocio
- Cafetería o barbería **independiente**, 1 sucursal, en Toluca/Metepec. Giro no regulado (nada de salud, alcohol como giro principal, ni menores como clientela principal).
- 30+ clientes recurrentes por semana; el dueño está en el local; tiene un teléfono o tableta Android para caja; acepta 4–8 semanas de piloto y una reunión de cierre.
- Ya usa tarjeta de cartón o quiere fidelizar: el valor se entiende sin explicar.

## Material previo
Logo en buena resolución (pedir por WhatsApp), colores, regla de recompensa ("10 cafés = 1 gratis"), nombre del dueño y de 1–2 empleados, contrato y aviso de privacidad **aprobados** (`LEGAL_DRAFTS.md`), QR impreso (carta, plastificado), este documento y una hoja de registro de tiempos.

## Los 10 pasos
Para cada paso anotar: **inicio/fin, quién, qué salió mal, qué preguntó el negocio.**

| # | Paso | Cómo (versión 1.0) | Objetivo de duración | Dificultades previstas |
|---|---|---|---|---|
| 1 | **Presentación** | Guion de 10 min de `docs/V042_GUIA_DEMO_COMERCIAL.md` en la demo pública. No prometer cifras de ventas. Aclarar que es app web instalable, **no** Apple/Google Wallet | 10–15 min | Expectativa de "Wallet"; preguntas de privacidad (respuesta en `LEGAL_DRAFTS.md` §0) |
| 2 | **Personalización de tarjeta** | `/personalizar` con el logo del negocio → colores automáticos → acabado → "Solicitar activar" | 5–10 min | Logos de baja resolución o con fondo; el motor recorta/ajusta, revisar a la vista con el dueño |
| 3 | **Alta de negocio** | Control Center → "Crear negocio desde un diseño" → giro, ciudad, dueño, plan, condiciones → confirmar | 10 min | Requiere sesión de Control Center (SSO + contraseña + 2FA) del equipo VLUX |
| 4 | **Entrega del panel** | Invitación del dueño por enlace/QR/WhatsApp o **código presencial** (10 caracteres, 30 min). El dueño crea su contraseña y entra a `/panel` | 5–10 min | Enlaces cortados en WhatsApp; el código presencial es más confiable en el local. El correo está apagado en 1.0 |
| 5 | **Instalación PWA** | En el teléfono de caja y del dueño: Chrome → Instalar app / Safari → Agregar a inicio | 5 min por equipo | iOS no muestra botón de instalar automático: hay que guiar a mano |
| 6 | **Configuración de empleados** | Panel → Equipo → invitar empleado → entregar código presencial → primer inicio cambia contraseña | 5–10 min por empleado | Empleados sin correo propio (el sistema pide correo como identificador; acordar uno) |
| 7 | **Generación de QR** | Panel → Accesos → descargar el QR de mostrador (PNG) → imprimir → probar a 50 cm y 1 m con 2 teléfonos | 10 min + impresión | Impresión pequeña o con reflejo; probar antes de plastificar |
| 8 | **Registro de operaciones** | Caja: escanear tarjeta del cliente → registrar compra/visita → canjear cuando corresponda. Hacer 3 operaciones de práctica con tarjetas de prueba y **anularlas** | 15 min (capacitación) | Doble toque (está protegido); poca luz al escanear; búsqueda por nombre como alterna |
| 9 | **Consulta de métricas** | Panel: Resumen (cifras y gráfica de 14 días), Clientes y Equipo. Explicar qué mirar cada semana | 10 min | Las métricas vacías la primera semana desaniman: fijar la revisión en la semana 2 |
| 10 | **Atención de incidencias** | Entregar el contacto de soporte y explicar `RUNBOOK.md` §3 C–G en lenguaje simple (papel si se cae, anular si se equivoca, nuevo enlace si el cliente cambia de teléfono) | 10 min | Registrar cada contacto de soporte con minutos (alimenta `FINANCIAL_MODEL.md`) |
**Objetivo total de onboarding: ≤ 2 h en el local** (+ preparación previa). Si pasa de 3 h, el plan de 299 no es viable (`FINANCIAL_MODEL.md` §5).

## Ensayo con negocio sintético (antes del real)
1. Ejecutar los 10 pasos completos en Preview con un negocio "Café Ensayo" y personas del equipo como dueño, caja y clientes, con **teléfonos físicos** (`DEVICE_TESTS.md`).
2. Cronometrar y anotar en la tabla de abajo.
3. Corregir el guion con lo aprendido. No hacer cambios de producto salvo bloqueo crítico.
Referencia automatizada (no es tiempo humano): la prueba E2E V0.4.6 recorre alta, invitación, caja, recompensa y panel con 27/27 PASS (`evidencia/e2e-v046.txt`).

## Registro (llenar durante el piloto)
| # | Fecha | Duración real | Quién | Dificultades | Preguntas del negocio | Acción |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |

## Seguimiento del piloto (4–8 semanas)
| Semana | Revisión | Métrica |
|---|---|---|
| 1 | Llamada de 10 min: ¿la caja lo usa? | Operaciones registradas/día |
| 2 | Visita: revisar panel con el dueño | Clientes con tarjeta, % que regresó |
| 4 | Revisión intermedia | Recompensas canjeadas, minutos de soporte acumulados |
| 8 | Cierre: ¿continúa? ¿pagaría 499/299? | Decisión, precio aceptado, testimonio (solo con permiso escrito) |
**Criterios de éxito propuestos:** la caja registra ≥ 70 % de las compras elegibles en la semana 4; ≥ 30 % de los clientes con tarjeta regresan en 30 días; soporte < 30 min/mes después de la semana 2; el dueño acepta pagar.

## Qué no hacer
- No prometer Apple/Google Wallet, avisos push, promociones ni citas (apagados en 1.0).
- No condicionar premios a reseñas en Google.
- No cargar clientes del negocio desde listas existentes: cada cliente se da de alta y acepta el aviso.
- No publicar nombre, logo ni resultados del negocio sin permiso por escrito.
