# Google Wallet · Preparación V0.3

**Estado: BLOQUEADO.** No hay cuenta de emisor ni service account. El código construye y firma los objetos, pero **no se ha probado contra Google**, así que no se puede decir que funcione.

Fuentes oficiales consultadas el 2026-11-01:
- https://developers.google.com/wallet/retail/loyalty-cards
- …/getting-started/issuer-onboarding
- …/use-cases/jwt
- …/use-cases/updates
- https://developers.google.com/wallet/reference/rest/v1/loyaltyclass
- …/loyaltyobject
- …/Jwt

## 1. Arquitectura
```
Motor de lealtad (BD, RLS) ──► instantánea WalletCardSnapshot ──► WalletProvider (google | apple)
        (fuente de verdad)            (sellos ya calculados)        solo representa, no calcula
```
- `server/wallet/provider.ts` define la interfaz `WalletProvider`: `status()`, `saveLink(card)` y `pushUpdate(card)`.
- `server/wallet/google.ts` contiene `buildLoyaltyClass`, `buildLoyaltyObject`, `buildSaveJwt` (RS256 con `node:crypto`, sin dependencias) y `GoogleWalletProvider`.
- La tarjeta web sigue siendo la fuente de verdad. No existe una segunda lógica de sellos: el pase recibe un número ya calculado.
- El código del pase es el mismo `publicCode` que ya lee la caja.
- El estado se muestra en el Control Center (Resumen → Infraestructura). Ahí dice «no configurado», o «credenciales cargadas; sin verificar con Google». Nunca dice «funciona».

## 2. Mapeo
| Google | VLUX |
| :- | :- |
| `LoyaltyClass` (una por negocio) | `id = <issuerId>.vlux_<businessId>`, `programName` = nombre del negocio, `programLogo` = logo o ícono PWA público (obligatorio), `hexBackgroundColor` = color principal, `issuerName` = «VLUX» (≤ 20) |
| `LoyaltyObject` (uno por tarjeta) | `id = <issuerId>.card_<cardId>`, `accountId` = código público, `accountName` = nombre recortado a 20, `barcode` QR = código público, `loyaltyPoints.balance.int` = sellos (la etiqueta «Sellos» tiene ≤ 9 caracteres y el valor ≤ 7), módulo de texto con la meta y el premio, enlace a la tarjeta web |
| JWT «Agregar a Google Wallet» | `iss` = correo de la service account, `aud` = `google`, `typ` = `savetowallet`, `iat`, `origins` (sin ellos el botón no se muestra) y `payload` con la clase y el objeto. Enlace: `https://pay.google.com/gp/v/save/<jwt>` |
| Actualización | `PATCH https://walletobjects.googleapis.com/walletobjects/v1/loyaltyObject/{id}` después de cada compra o canje. Un 404 significa que el cliente aún no lo guardó, y no es error. |

**Puntos sin confirmar en la documentación leída:**
- El alcance OAuth exacto (`wallet_object.issuer`).
- El límite de tamaño del JWT.
- Si las actualizaciones por API llegan solas al teléfono. La documentación habla de `notifyPreference` por cada actualización.

Todo esto se valida en la prueba K.

## 3. Variables (nunca en el repositorio)
`GOOGLE_WALLET_ISSUER_ID`, `GOOGLE_WALLET_SA_EMAIL`, `GOOGLE_WALLET_SA_PRIVATE_KEY` (PEM, sensible), `GOOGLE_WALLET_ORIGINS`, `GOOGLE_WALLET_MODE=demo|production`.
Van como variables **sensibles** del proyecto interno de Vercel. El archivo JSON de la service account no se sube a Git ni se pega en issues.

## 4. Procedimiento en modo demo (7 pasos)
1. **Cuenta de emisor.** Crea la cuenta de Google Wallet API en Google Pay & Wallet Console (https://pay.google.com/business/console) con la cuenta de Google de VLUX. Nace en **modo demo** y quien la crea queda como Admin.
2. **Proyecto de Google Cloud.** Crea un proyecto (por ejemplo `vlux-wallet`) y habilita la **Google Wallet API**.
3. **Service account.** En ese proyecto crea una service account y descarga su llave JSON. Guárdala en tu gestor de contraseñas, nunca en el repositorio.
4. **Autoriza la service account** en Wallet Console (*Users*) para que pueda emitir pases a nombre del emisor. Agrega como **usuarios de prueba** los correos de Google que usarán el piloto, porque en modo demo solo ellos pueden guardar pases.
5. **Variables en Vercel** (proyecto interno, Preview): las 5 de la sección 3. Vuelve a desplegar. El Control Center debe mostrar «credenciales cargadas (modo demo); sin verificar con Google».
6. **Prueba K.** Con una tarjeta sintética, genera el enlace, ábrelo en un Android con una cuenta de prueba, guarda el pase, registra una compra en la caja y comprueba que el pase cambia de 1 a 2 sellos. Guarda capturas como evidencia. Hasta entonces K queda **BLOCKED**.
7. **Publicación.** Desde el Dashboard de la Wallet API, en «Get publishing access», solicita el acceso de publicación con la marca y las capturas. Hazlo en la **semana 1 del piloto**, porque es el camino crítico. Hasta que lo aprueben, solo los usuarios de prueba pueden guardar pases.

## 5. Pruebas actuales
`tests/unit/wallet.test.ts` (PASS) usa una llave RSA generada en la prueba y verifica:
- Los ids del emisor.
- Los campos obligatorios y los límites de longitud.
- Los claims del JWT.
- La firma RS256, comprobada con la llave pública.
- Que, sin credenciales, Google y Apple respondan «no configurado» y no generen enlaces.

**Lo que NO se probó:** ninguna llamada a Google, ni la instalación de un pase en un teléfono. Prueba K: **BLOCKED**.

## 6. Siguiente átomo (cuando existan credenciales)
1. Ruta `GET /api/me/:slug/wallet/google`, que arma la instantánea de la tarjeta y devuelve el enlace.
2. Botón «Agregar a Google Wallet» en la tarjeta, solo si `status = configured`.
3. Llamar a `pushUpdate` después de `registerPurchase`, `redeemReward`, `voidPurchase` y del cambio de programa. Debe ser asíncrono y tolerante a fallas: si Google falla, la tarjeta web no se ve afectada.
