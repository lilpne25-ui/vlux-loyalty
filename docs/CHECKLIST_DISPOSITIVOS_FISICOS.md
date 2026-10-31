# Checklist de prueba en teléfonos físicos · V0.2.1

**Estado: NO EJECUTADO.** Hasta ahora solo se ha probado con navegadores automatizados (Chromium/Playwright). Esta lista se llena a mano con teléfonos reales contra el Preview en HTTPS.

Equipo mínimo:
- iPhone con Safari, iOS 17 o superior (cliente).
- Android con Chrome (caja).
- Computadora (dueño).

Anota el modelo y la versión del sistema de cada equipo.

| # | Dispositivo | Prueba | Esperado | OK / Falla / Nota |
| -: | :- | :- | :- | :- |
| 1 | iPhone | Abrir el Preview (inicia sesión en Vercel si lo pide) | Carga en < 3 s, sin errores | |
| 2 | iPhone | Escanear con la cámara nativa el QR impreso del mostrador | Abre el registro del negocio | |
| 3 | iPhone | Crear tarjeta, aceptar el aviso | Tarjeta "0 de N" y enlace personal | |
| 4 | iPhone | Agregar a pantalla de inicio y abrir desde el ícono | Abre la tarjeta sin pedir datos | |
| 5 | Android | Iniciar sesión como empleado (contraseña temporal) | Pide cambiar la contraseña | |
| 6 | Android | Caja → Escanear con cámara (dar permiso) | Lee el QR del iPhone en < 2 s, con poca luz también | |
| 7 | Android | Registrar compra | El sello aparece en el iPhone en ≤ 5 s | |
| 8 | iPhone | Bloquear la pantalla 1 min y volver | La tarjeta se actualiza sola | |
| 9 | Android | Completar sellos y canjear | Celebración en el iPhone; el código no se acepta 2 veces | |
| 10 | Ambos | Modo avión durante una compra y volver a conectar | Mensaje claro; no se duplica el sello | |
| 11 | Android | Nuevo enlace de tarjeta → el iPhone escanea | Abre la tarjeta; el enlace viejo ya no sirve | |
| 12 | Computadora | Panel: resumen, anular la compra de la prueba 7 | Las métricas cambian y la anulación queda en el historial | |
| 13 | iPhone | Brillo de pantalla al mínimo, mostrar el QR en caja | Se lee igual | |
| 14 | Ambos | Texto grande del sistema (accesibilidad) | No se cortan botones | |
| 15 | Android | Chrome con "Ahorro de datos" o red 3G lenta | Funciona; no se registra dos veces | |

Al terminar: guarda capturas en `docs/evidencia/fisicos/` y anota quién probó y la fecha.
