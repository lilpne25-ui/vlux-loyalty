# Apple Wallet · Evaluación V0.3 (solo arquitectura)

**Estado: NO DISPONIBLE.** No se contrató Apple Developer y no hay certificados. No se emiten ni se simulan pases. En iPhone sigue funcionando la **PWA** (V0.2.2: tarjeta en la pantalla de inicio).

## 1. Librería evaluada: passkit-generator
Fuentes, consultadas el 2026-11-01:
- https://github.com/alexandercerutti/passkit-generator
- …/blob/master/LICENSE
- …/releases
- https://www.npmjs.com/package/passkit-generator

| Criterio | Resultado |
| :- | :- |
| Licencia | **MIT** (Copyright 2018 Alexander P. Cerutti). Es permisiva: se puede usar en un SaaS comercial y en un repo público; solo hay que conservar el aviso de licencia. No es AGPL. |
| Mantenimiento | Última versión en GitHub: **v3.7.0** (14 de octubre; la página no muestra el año). Versiones previas: v3.6.x en septiembre y v3.5.8 en agosto, con node-forge 1.4.0 y Joi 17. Unos 1,168 commits, 3 issues y 2 PR abiertos, 1.3k estrellas. ⚠ La página de npm mostraba **3.3.1**, una discrepancia que hay que comprobar con `npm view passkit-generator version` antes de instalar. |
| TypeScript | Incluye tipos. Ofrece versiones CJS y ESM. |
| Dependencias | node-forge y Joi. La lista completa no se revisó. |
| Node soportado | **Sin confirmar** (hay un `.nvmrc`, pero no se leyó). |
| Qué hace | Arma y firma el `.pkpass` (`PKPass.from({ model, certificates })`). Recibe `wwdr`, `signerCert`, `signerKey` y `signerKeyPassphrase`, y un modelo `.pass` con `icon` obligatorio. |
| Qué NO hace | El web service de actualización ni el push por APNs. El mismo autor los ofrece en paquetes aparte (*Passkit Webservice Toolkit*, *hapns*). |

**Recomendación:** usar passkit-generator para emitir el pase y escribir nosotros el web service, con nuestra BD y bitácora. Sigue válida la decisión anterior de evitar `@walletpass/pass-js` (AGPL).

## 2. Lo que exige Apple (por confirmar en developer.apple.com al iniciar)
La página de Apple no se pudo leer (está renderizada con JavaScript). Lo siguiente es conocimiento previo, **no confirmado** en esta sesión:
- **Apple Developer Program de organización** (pago anual, D-U-N-S de VLUX). Es necesario para crear el **Pass Type ID** y su certificado.
- Pase tipo `storeCard` (tarjeta de lealtad), con `passTypeIdentifier`, `teamIdentifier`, `serialNumber`, `webServiceURL` y `authenticationToken`.
- Certificado intermedio **Apple WWDR**. Hay que confirmar qué generación usar.
- Web service con 5 endpoints:
  - registrar dispositivo
  - pedir los seriales actualizados
  - pedir el pase más reciente
  - dar de baja el dispositivo
  - `log`
  
  Todos se autentican con `Authorization: ApplePass <token>`.
- Push por **APNs** con el certificado del Pass Type ID para avisar del cambio. El teléfono pide el pase nuevo.

## 3. Arquitectura propuesta (sin implementar)
```
registerPurchase ──► motor (fuente de verdad) ──► AppleWalletProvider.pushUpdate(snapshot)
                                                     ├─ marca pase "actualizado" (updated_at)
                                                     └─ APNs push a dispositivos registrados
iPhone ──► GET /wallet/apple/v1/passes/{type}/{serial} ──► passkit-generator genera .pkpass con la instantánea
```
- Tablas nuevas (en una migración futura): `apple_pass_registrations` (dispositivo, token de push, serial) y `apple_passes` (serial, tarjeta, token de autenticación con hash).
- Los certificados irían como variables sensibles (`APPLE_PASS_CERT_PEM`, `APPLE_PASS_KEY_PEM`, `APPLE_WWDR_CERT_PEM`), nunca en el repo.
- `server/wallet/apple.ts` ya implementa la interfaz y hoy siempre responde «no configurado».

## 4. Decisión para el piloto
La PWA cubre iPhone sin costo. Apple Wallet se activa cuando haya un cliente que lo pida y pague la diferencia, porque implica la cuota anual de Apple y el trabajo del web service con APNs.
