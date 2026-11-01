# V0.4.2 · PWA y Wallet

- Agregar tarjeta, agregar panel (dueño) y agregar caja (empleado) siguen disponibles; cada manifest tiene su propio `start_url` y `scope` (`/n/<slug>`, `/panel`, `/caja`).
- Origen: los enlaces del Centro de accesos usan `PUBLIC_APP_URL` (alias público) y solo se aceptan https en producción. En el proyecto interno apunta al alias público.
- iPhone: Safari → Compartir → «Agregar a pantalla de inicio». La app instalada guarda cookies aparte: se vincula con el código de 8 dígitos de un solo uso («Vincular tarjeta»).
- Android: Chrome ofrece **Instalar app** (PWA) o «Agregar a pantalla principal».
- **No equivale a Apple Wallet ni Google Wallet.** La portada lo dice. Las vistas de Wallet siguen separadas y marcadas como fase futura.
- Pruebas: manifest verificado en E2E; instalación en iPhone/Android físicos: **NOT TESTED** (protocolo en `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md`).
