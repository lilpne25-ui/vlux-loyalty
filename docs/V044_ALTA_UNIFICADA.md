# VLUX Loyalty V0.4.4 · Alta unificada de negocio

## Recorrido
Landing → Personalizar tarjeta → "Solicitar activar mi tarjeta" → **Preparar mi diseño** (borrador de 24 h) →
"Continuar en Control Center" (otro proyecto de Vercel) → Vercel SSO → login admin + 2FA → regreso automático a
`/vlux-admin/negocios/desde-diseno` → diseño recuperado → asistente prellenado y editable → resumen → confirmar →
pantalla **Tu negocio está configurado** (cliente, propietario, empleados, VLUX).

## Arquitectura (Brand Activation Draft)
- Tabla `activation_drafts` (migración 0010, aditiva; reversión: `0010_activation_drafts.down.sql`). RLS activo, solo `vlux_app`.
- Referencia: 32 bytes aleatorios (43 caracteres base64url). En BD solo se guarda su SHA-256. La referencia **no concede permisos**.
- Datos permitidos (zod estricto): nombre, logo procesado + original, logoFit, colores, acabado, sellos, recompensa, giro. Máx. 256 KB en la solicitud, 300 KB en BD; el logo se valida por bytes (PNG/JPEG/WebP).
- Vence a las 24 h (tope duro de 7 días por CHECK). Uso único: se consume **dentro de la transacción** de `POST /api/admin/businesses`, con `SELECT … FOR UPDATE` al inicio; el doble clic recibe 409, no duplica.
- Creación pública: 10/h por IP, tope de 2000 borradores vivos. Lectura admin con límite de tasa. Vencido → 410, consumido → 409/410, desconocido → 404.
- Entre proyectos: el proyecto público devuelve `controlCenterUrl` a partir de `ADMIN_APP_URL`; la referencia viaja en `?activar=`, se guarda en `sessionStorage` y se quita de la barra con `history.replaceState`. El login y el 2FA se muestran en la misma URL, por lo que la ruta se conserva.
- El proyecto público no expone `/api/admin`; el frontend público solo puede crear **borradores**, nunca negocios.
- Sin motor de alta nuevo: se reutilizan `Wizard.tsx` y `POST /api/admin/businesses` (transaccional, auditado).

## Qué dice y qué no dice la interfaz
- Sin canal de contacto configurado (`VITE_CONTACT_URL`) la página pública dice expresamente que **no se envió ninguna solicitud**.
- La pantalla de activación dice "Configuración creada", "Todavía no opera" y "No se envió ningún correo" (la invitación es un enlace de entrega manual).

## Pruebas
- Unitarias 51/51, integración 101/101 (incluye borradores: expiración, consumo, concurrencia, límites, validación, aislamiento).
- E2E `tests/e2e/v044-activacion.cjs` (`scripts/e2e-v044.sh`, dos orígenes: `localhost:8788` público y `127.0.0.1:8790` Control Center): 42/42, cubre T01–T24.
- Regresiones verdes: v02, v021, v03, v04, v042, v043 (los selectores de v03/v04 se afinaron porque ahora existe el botón "Crear negocio desde un diseño").
- T25 (Production intacta): verificado en Vercel, ver informe.

## Límites conocidos
- Sin pruebas en teléfonos físicos. Respaldos siguen BLOCKED (faltan secretos). Revisión legal pendiente.
- Vercel SSO no se puede automatizar desde el entorno de pruebas: el tramo "Vercel login" se valida a nivel aplicación (misma URL tras login/2FA) y manualmente por Vlux.
- La referencia en la URL queda en el historial/registros de Vercel hasta que se consume o vence; por eso vence en 24 h y no da permisos.

## Guía de uso para VLUX
1. El cliente prepara su tarjeta en `/personalizar` y pulsa **Solicitar activar mi tarjeta → Preparar mi diseño**.
2. Si no hay canal de contacto, el cliente te comparte el código (o el enlace); abre Control Center → **Crear negocio desde un diseño**.
3. Inicia sesión (SSO de Vercel, contraseña, 2FA). Verás el diseño; **Usar este diseño**.
4. Completa giro, ciudad, propietario y correo, plan y condiciones; revisa el resumen y confirma.
5. En la pantalla de activación descarga el QR, copia la invitación del propietario y entrégala por un canal seguro.
