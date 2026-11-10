# V0.4.1 · PWA en iPhone y Android

## Pregunta: ¿el iPhone vuelve a pedir un código al abrir la tarjeta desde la pantalla de inicio?
**Causa probable (documentada en V0.2.2, no verificada en un iPhone físico):** en iOS, la app agregada a la pantalla de inicio tiene un almacenamiento de cookies separado del de Safari. La tarjeta se guarda con una cookie HttpOnly creada en Safari; al abrir el ícono, esa cookie no está. Por diseño la app pide entonces un **código de 8 dígitos de un solo uso** que el cliente genera en Safari, o su enlace personal.
**No se desactivó ninguna medida de seguridad.** Se descartaron por inseguras: poner el token en `start_url`, en el manifiesto o en cachés.
**Solución candidata segura, NO implementada (no se puede comprobar sin iPhone):** generar, justo antes de mostrar la guía «Agregar a pantalla de inicio», un código de vinculación de un solo uso y vida corta, y mostrarlo a la vez que la instrucción («al abrir la app escribe este código») para que el paso sea esperado y no una sorpresa. El flujo del código ya existe; falta comprobar con un dispositivo real cuánta fricción causa.

## Pruebas
| Prueba | Resultado |
|---|---|
| Chromium: manifiesto, service worker, instalación, portal, caja, panel (suite v022, 40 pruebas) | Ver V041_PRUEBAS.md |
| WebKit y Firefox automatizados | Se ejecutan en GitHub Actions (`pwa-navegadores.yml`); resultado en V041_PRUEBAS.md |
| iPhone físico: Safari, agregar a inicio, ícono, sesión, reapertura | **NOT TESTED** |
| Android físico: Chrome, instalar, standalone, cámara | **NOT TESTED** |
WebKit automatizado no equivale a un iPhone.

## Guía reproducible (10 min por teléfono)
Usar `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md` y añadir:
1. iPhone, Safari: abrir `/n/<negocio>` de la demo pública; registrar «Cliente Demo».
2. Compartir → Agregar a pantalla de inicio. Abrir el ícono. Anotar: ¿pide código? ¿muestra la tarjeta?
3. Caja: abrir `/caja`, iniciar sesión, Agregar a inicio; el ícono debe abrir `/caja` (no la tarjeta ni el Control Center).
4. Dueño: igual con `/panel`.
5. Android Chrome: menú → Instalar aplicación; abrir; permitir cámara en caja; escanear.
6. Cerrar la app desde el selector y reabrirla; modo avión (debe avisar sin inventar sellos).
7. Anotar resultados en la tabla con PASS/FAIL y foto.
