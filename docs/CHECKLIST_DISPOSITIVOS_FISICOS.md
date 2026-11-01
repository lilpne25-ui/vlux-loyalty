# Checklist de prueba en teléfonos físicos · V0.2.2

**Estado: NO EJECUTADO.** Hasta ahora solo se ha probado con navegadores automatizados (Chromium, WebKit y Firefox de Playwright). WebKit automatizado **no equivale** a un iPhone físico. Esta lista se llena a mano con teléfonos reales.

URL para clientes (sin cuenta de Vercel): https://vlux-loyalty-demo-kk0lzkh1v-vlux-s-projects.vercel.app/n/cafe-demo-toluca

Valores de estado: **PASS**, **FAIL**, **BLOCKED** (no se pudo probar, anota por qué) o **NOT TESTED**. Nadie marca PASS una prueba que no se hizo en el teléfono.

Equipo mínimo:
- iPhone con Safari, iOS 17 o superior (cliente).
- Android con Chrome (caja).
- Computadora (dueño).

Anota el modelo y la versión del sistema de cada equipo.

| # | Dispositivo | Prueba | Esperado | OK / Falla / Nota |
| -: | :- | :- | :- | :- |
| 1 | iPhone | Abrir la demo pública (no debe pedir cuenta de Vercel) | Carga en < 3 s, sin errores | |
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


## V0.2.2 · Tarjeta en la pantalla de inicio (PWA)
Anota modelo, versión del sistema y navegador. Todas empiezan en NOT TESTED.

| # | Dispositivo | Prueba | Esperado | Estado | Nota |
| -: | :- | :- | :- | :- | :- |
| P1 | iPhone (Safari) | Crear tarjeta y ver "Guarda tu tarjeta" | Aparece la sección con "Agregar a mi teléfono" | NOT TESTED | |
| P2 | iPhone (Safari) | Tocar "Agregar a mi teléfono" | Guía de 3 pasos (Compartir → Agregar a pantalla de inicio → Agregar); no aparece ningún instalador automático | NOT TESTED | |
| P3 | iPhone (Safari) | Seguir los pasos | Ícono con la inicial y el color del negocio, nombre corto correcto | NOT TESTED | |
| P4 | iPhone | Abrir desde el ícono | Abre a pantalla completa, sin barra de Safari | NOT TESTED | |
| P5 | iPhone | Si pide código: escribir el código mostrado en Safari | Abre la misma tarjeta, mismos sellos | NOT TESTED | Anotar si pidió código o si abrió directo (dato clave: confirma si iOS comparte cookies) |
| P6 | iPhone | Usar el mismo código otra vez en otro equipo | "Ese código no es válido o ya caducó" | NOT TESTED | |
| P7 | iPhone (Chrome) | Agregar a pantalla de inicio desde Chrome para iOS | Guía para "otros navegadores en iPhone"; funciona si iOS ≥ 16.4 | NOT TESTED | |
| P8 | Android (Chrome) | Tocar "Agregar a mi teléfono" | Diálogo nativo "Instalar"; tras aceptar, la sección se oculta | NOT TESTED | |
| P9 | Android (Chrome) | Abrir desde el ícono | Abre la tarjeta directo, sin pedir código | NOT TESTED | |
| P10 | Android (Samsung Internet) | Instalar | Instala o muestra la guía | NOT TESTED | |
| P11 | Android (Firefox) | Agregar | Crea acceso directo (no app); la guía lo explica | NOT TESTED | |
| P12 | Ambos | Caja registra compra mientras la app instalada está abierta | El sello aparece en ≤ 5 s o al volver a la app | NOT TESTED | |
| P13 | Ambos | Modo avión y abrir la app instalada | Aviso "Sin conexión"; no muestra sellos inventados; no deja canjear | NOT TESTED | |
| P14 | Ambos | Publicar una versión nueva y abrir la app | Se actualiza sola y sigue la misma tarjeta | NOT TESTED | |
| P15 | iPhone | Agregar dos negocios distintos | Dos íconos, cada uno abre su negocio | NOT TESTED | |
| P16 | Ambos | Caja canjea premio; dueño revisa panel | El canje aparece en la app del cliente y en el panel | NOT TESTED | |
