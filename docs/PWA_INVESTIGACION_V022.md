# Investigación PWA y Wallet · V0.2.2

Fecha de consulta: 2026-10-31. Fuentes oficiales salvo donde se indica.

## 1. Pantalla de inicio ≠ Apple Wallet ≠ Google Wallet
| | PWA en pantalla de inicio (lo que hace V0.2.2) | Apple Wallet (.pkpass) | Google Wallet |
| :- | :- | :- | :- |
| Qué es | Un acceso directo a la web que abre en ventana propia | Un pase firmado que vive en la app Wallet | Un pase emitido por la API de Google Wallet |
| Requisitos | HTTPS + manifiesto + íconos | Cuenta Apple Developer (99 USD/año), Pass Type ID y certificado de firma | Cuenta de emisor en Google Pay & Wallet Console (requisitos no confirmados en esta versión) |
| Notificación en pantalla bloqueada | No | Sí | Sí |
| Costo | 0 | 99 USD/año | Sin costo conocido; no verificado |

Las librerías open source (passkit-generator, dotnet-passbook) **solo arman y firman** el archivo; necesitan el certificado oficial de Apple. **No sirven para evitar la cuenta de Apple Developer.** Por decisión de Vlux, V0.2.2 no contrata Apple Developer y no genera pases de Wallet.

## 2. Cómo se instala en cada plataforma
- **Android (Chrome, Edge, Samsung Internet):** el navegador dispara `beforeinstallprompt` cuando el sitio cumple los criterios (HTTPS, manifiesto con `name` o `short_name`, íconos 192 y 512, `start_url`, `display` standalone). VLUX muestra su propio botón y usa ese diálogo nativo. Si el evento no llega, se muestra la guía (menú ⋮ → *Instalar app* o *Agregar a pantalla principal*).
- **Firefox para Android:** crea un acceso directo del navegador, no una app instalada. Se explica en la guía.
- **iPhone/iPad:** iOS **no** tiene instalación automática ni `beforeinstallprompt`. El cliente usa *Compartir → Agregar a pantalla de inicio → Agregar*. Desde iOS 16.4 también funciona desde Chrome, Edge o Firefox en iPhone mediante su menú *Compartir*. VLUX muestra los pasos; nunca simula un instalador.
- **iOS usa `apple-touch-icon`** (180×180) antes que los íconos del manifiesto. VLUX genera uno por negocio.

## 3. ¿La app instalada comparte la tarjeta con Safari?
- En Android, una PWA del mismo origen comparte cookies con el navegador (documentación de web.dev): el cliente abre el ícono y ya ve su tarjeta.
- En iPhone **no está confirmado** que la app de pantalla de inicio comparta cookies con Safari; en la práctica suele tener almacenamiento propio. Por eso V0.2.2 no lo asume: si la app abre sin tarjeta, pide un **código de 8 dígitos de un solo uso** que el cliente genera en Safari (o su enlace personal). Ningún token va en el manifiesto, en `start_url`, en íconos ni en cachés.

## 4. Varias tarjetas en el mismo teléfono
Cada negocio tiene su propio manifiesto con `id` y `scope` = `/n/<negocio>`, nombre, color e ícono propios. Un cliente puede agregar a su pantalla la tarjeta de la cafetería y la de la barbería. **No prometemos** que todos los navegadores las traten como apps independientes: depende del navegador (Chrome en Android sí distingue por `id`; en iOS cada "Agregar a pantalla de inicio" crea su propio ícono).

## 5. Herramientas evaluadas para el service worker
| Opción | Estado | Decisión |
| :- | :- | :- |
| vite-plugin-pwa 2.x | Mantenido; soporta Vite 8 | No usado: genera un manifiesto estático y aquí se necesita uno por negocio. Añade Workbox como dependencia. |
| Workbox 7.4 | Mantenido por Google | No usado: para cachear solo `index.html` y `/assets` basta con unas 60 líneas propias, más fáciles de auditar. |
| **Service worker propio** (`src/sw/sw-template.js`) + plugin de Vite de 15 líneas | Sin dependencias nuevas | **Elegido.** Lista de precarga generada en el build y versión por hash. |

Si en el futuro se necesitan notificaciones push o sincronización en segundo plano, conviene reevaluar Workbox.

## 6. Fuentes
- web.dev, "Installation prompt" y "What does it take to be installable?"
- MDN, Web app manifest (`id`, `scope`, `start_url`, `display`, `icons`)
- Apple Developer, "Configuring Web Applications" y notas de Safari 16.4 (Add to Home Screen desde otros navegadores)
- Vercel Docs, Deployment Protection (Vercel Authentication, Shareable Links, Protection Bypass for Automation, Password Protection)
- npm: vite-plugin-pwa 2.0.0, workbox 7.4.1; GitHub: passkit-generator (requiere certificados de Apple)
