# VLUX Loyalty V0.4 · Auditoría UX, rutas y roles

| # | Hallazgo | Severidad | Estado |
|---|---|---|---|
| 1 | El dueño no tenía un lugar donde ver y compartir los enlaces de cliente, caja y dueño | Alta | Corregido: pestaña "Accesos" con QR, copiar, compartir, abrir, descargar PNG |
| 2 | Los enlaces generados apuntaban al proyecto interno tras login de Vercel | Crítica | Corregido en código (`PUBLIC_APP_URL`); ver V04_EXPOSICION_RUTAS.md |
| 3 | Caja y panel no eran instalables con su propio ícono/inicio | Media | Corregido: manifiestos por rol; guías honestas por plataforma |
| 4 | "Guardar tarjeta" podía sugerir Wallet | Alta (honestidad) | Corregido: dice "Llévala en tu teléfono" y aclara que no es Apple/Google Wallet |
| 5 | Tarjeta plana, poco memorable | Media | Rediseño metálico con inclinación y reflejo; respeta "reducir movimiento" |
| 6 | Marca del negocio solo con logo ya preparado | Media | Estudio de marca con extracción de color y vistas previas |
| 7 | Sin material para presentar en reunión | Media | Presentación de 6 láminas desde el Estudio |
| 8 | El botón "Agregar panel a mi teléfono" coincidía con el selector del botón "Agregar" empleado en pruebas | Baja | Prueba corregida; el texto del producto se mantiene |

## Checklist UX corregido
- [x] Cliente: abre el enlace, se registra, ve su tarjeta con logo y marca
- [x] Cliente: botón para llevarla al teléfono, con guía para iOS Safari, iOS otros, Android y escritorio
- [x] Caja: sella, instalable
- [x] Dueño: panel, accesos, instalable
- [x] Sin scroll horizontal en móvil (probado)
- [x] Sin errores de consola (probado)
- [ ] Pruebas en dispositivos físicos (docs/CHECKLIST_DISPOSITIVOS_FISICOS.md): pendiente de Vlux
- [ ] Probar con 2 negocios reales: pendiente
