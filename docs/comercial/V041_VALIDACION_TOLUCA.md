# Validación comercial en Toluca y Metepec

**Regla:** este documento es un protocolo. No hay entrevistas realizadas, ni clientes interesados, ni tasas de conversión. Todo lo que se registre debe etiquetarse: **E** evidencia observada, **O** opinión del entrevistado, **H** hipótesis, **R** recomendación. Ningún contacto externo se hace sin autorización de Vlux. Usar solo datos sintéticos en la demo.

Prioridad: cafeterías, barberías, salones de uñas. Meta del primer ciclo: 6 conversaciones (2 por giro).

## 1. Guion de demostración (10 minutos)
| Min | Qué se hace | Qué se dice (idea, no libreto) | Debe verse |
|---|---|---|---|
| 0–1 | Abrir VLUX Loyalty (identidad VLUX) | «¿Hoy cómo logras que tus clientes regresen?» Escuchar | Logo oficial, Control Center |
| 1–2 | Pedir su logo (foto o archivo) | «Dame tu logo y te enseño cómo quedaría tu tarjeta» | — |
| 2–4 | Estudio de marca: subir logo | Se detectan sus colores; elegir acabado (color, plata, negro) | Tarjeta metálica con su logo |
| 4–5 | Vista de teléfono | «Así la ve tu cliente» | Vistas del teléfono y QR |
| 5–6 | Cliente escanea el QR (otro teléfono) y se registra | «Sin descargar nada» | Registro y tarjeta |
| 6–7 | Agregar a pantalla de inicio | Honesto: «no es Apple Wallet; es un ícono con tu marca» | Guía de instalación |
| 7–8 | Caja: registrar compra | El empleado sella en segundos | Sello aparece en la tarjeta |
| 8–9 | Completar la tarjeta y canjear | Recompensa lista, canje una sola vez | Premio y canje |
| 9–10 | Panel del dueño | Quién regresa; cierre: precio y piloto | KPIs (sintéticos) |
No prometer aumento de ventas. No usar testimonios.

## 2. Formulario breve para el dueño
1. Giro, años abierto, número de empleados que atienden. **(E)**
2. ¿Hoy tienes tarjeta de sellos, papel, WhatsApp o nada? **(E)**
3. ¿Cuántos clientes habituales tienes, a ojo? ¿Cómo sabes quién regresa? **(O)**
4. Después de la demo: «En tus palabras, ¿qué hace esto?» (comprensión) **(E)**
5. Del 1 al 5: ¿qué tan atractiva te parece tu tarjeta? ¿Por qué? **(O)**
6. ¿Tu empleado podría sellar con su teléfono? ¿Quién lo haría? **(O)**
7. ¿Aceptarías que tus clientes la usen como ícono en el teléfono (sin Wallet)? **(O)**
8. Precio: sin darle un número, ¿cuánto pagarías al mes? Luego mostrar 299 y 499 MXN y anotar la reacción. **(O)**
9. ¿Qué te falta? (avisos por WhatsApp, varias sucursales, impresión de QR, otro) **(O)**
10. ¿Podemos hacer un piloto de 30 días con tus clientes? ¿Cuándo? **(E: compromiso explícito)**

## 3. Checklist de observación
- [ ] Entendió la idea antes del minuto 3
- [ ] Tomó el teléfono por iniciativa propia
- [ ] Reaccionó (sonrió, pidió cambiar algo) al ver su tarjeta
- [ ] El cliente de prueba completó el registro sin ayuda
- [ ] El empleado selló sin preguntar
- [ ] Preguntó por Wallet / por app
- [ ] Preguntó por precio sin que lo mencionáramos
- [ ] Hubo una objeción concreta (anotarla textual)

## 4. Métricas del piloto (30 días por negocio)
| Métrica | Cómo se mide | Meta del piloto |
|---|---|---|
| Tarjetas creadas | Panel, clientes | Definir con cada negocio antes de empezar |
| Clientes con ≥2 sellos | Panel | — |
| Visitas de regreso | Panel (visitas por cliente) | — |
| Premios canjeados | Panel | — |
| Sellos por empleado por día | Bitácora | Sin fricción en caja |
| Tiempo promedio por sello en caja | Observación | < 10 s |
| Incidencias de soporte | Registro propio | Anotar todas |
Las metas numéricas se fijan con el dueño; no existen datos previos de VLUX.

## 5. Propuesta de precio inicial (H, a validar)
- Piloto de 30 días sin costo, con acompañamiento. **(R)**
- Mensualidad a probar: **299 MXN** (una sucursal, tarjeta con marca, caja, panel) y **499 MXN** (con soporte prioritario e impresión del QR). La hipótesis de V0.4 mencionaba 499/899 por sucursal más alta; decide Vlux.
- Referencias de precio verificadas (USD/mes, 2026-11-01): Loopy 25/69/95; Stamp Me 49/79/199; PassKit desde 39.50 + por pase; Square 49 por local. Ninguno publica precio en pesos.
- No hay cobro automático implementado.

## 6. Registro de objeciones
| Fecha | Negocio (código, sin datos personales) | Objeción textual | Tipo (precio, confianza, uso, falta función) | Respuesta dada | ¿Se resolvió? |
Respuestas honestas sugeridas: «No es Apple Wallet; hoy es un acceso con tu marca desde el teléfono»; «No pedimos datos que no necesitamos; el cliente acepta un aviso de privacidad»; «El piloto es de 30 días».

## 7. Criterios para iniciar un piloto
Se inicia con un negocio solo si: (1) el dueño lo pide explícitamente; (2) hay un empleado responsable; (3) hay entorno de producción separado (ver V041_ENTORNO_COMERCIAL.md); (4) respaldos operativos; (5) aviso de privacidad revisado por abogado; (6) pruebas en iPhone y Android físicos; (7) Vlux autoriza. Mientras falte alguno de (3)–(6): solo demostraciones con datos sintéticos.
