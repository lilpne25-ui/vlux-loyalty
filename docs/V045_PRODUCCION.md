# V0.4.5 · Revisión de preparación para producción

**Veredicto: lista para seguir haciendo DEMOS. No lista para un PILOTO con clientes reales.** Los bloqueos están en la tabla de abajo. Ninguno se resuelve con código: todos dependen de credenciales, de decisiones o de pruebas físicas que hace Vlux.

## Bloqueos antes de producción

| # | Bloqueo | Estado | Quién / qué falta |
|---|---|---|---|
| 1 | **Respaldos automáticos verificados** | BLOCKED | Vlux debe crear en GitHub los secretos `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE` (procedimiento en `V042_RESPALDOS.md`) y luego comprobar una restauración. **No se afirma que los respaldos funcionen.** |
| 2 | **Migraciones 0011–0013 en Supabase Preview** | Pendiente | Vlux pega `0011-0013_aplicar_en_supabase_preview.sql`, que ya se probó con aplicar, revertir y reaplicar en una copia local. Hasta entonces no se despliega V0.4.5 en Preview. |
| 3 | **Correo real** | BLOCKED | Falta autorizar Resend (plan gratuito), un dominio de envío y SPF, DKIM y DMARC (`V045_CORREO.md`). Mientras tanto se usa "copiar enlace". |
| 4 | **Planes comerciales de infraestructura** | Decisión de Vlux | Vercel Hobby no permite uso comercial y Supabase Free se pausa sin actividad. Un piloto con clientes que pagan requiere **Supabase Pro (25 USD) y Vercel Pro (20 USD)**. No se contrató nada. |
| 5 | **Entornos separados** | Pendiente | Hoy solo existe Preview, con datos sintéticos. Producción debe ser **otro proyecto Supabase** y otro conjunto de variables en Vercel. Nunca hay que reutilizar la BD de Preview ni poner `DATABASE_ADMIN_URL` en Vercel. |
| 6 | **Pruebas físicas en iPhone y Android** | Pendiente | La lista de abajo. No se sustituyen con WebKit ni Chromium automatizados. |
| 7 | **Aviso de privacidad definitivo** | Pendiente legal | La versión actual es `borrador-2026-10`. Antes del piloto: responsable, finalidades, derechos ARCO y plazo de conservación (LFPDPPP). |
| 8 | **Capacidad en infraestructura real** | No comprobada | La prueba de carga es local (`V045_PRUEBAS_CARGA.md`). Repetirla en un proyecto Supabase de pruebas requiere autorización, porque cuesta dinero. |
| 9 | **Política de retención del historial** | Decisión | Cuánto tiempo se conservan compras y bitácora. Sin decisión no se borra nada. |

## Seguridad (revisión de V0.4.5)

**Controles nuevos:**
- 2FA otra vez (step-up) para declarar datos de prueba y para eliminar, con límite de intentos y bloqueo.
- Respaldo con huella obligatoria antes de eliminar.
- Purga en una sola transacción, con verificaciones repetidas dentro de la BD.
- Bitácora que sobrevive a la eliminación.

**Correo:**
- El token de la invitación se guarda cifrado y se borra al terminar.
- El webhook se verifica con firma HMAC, ventana de 5 min, idempotencia y un cuerpo de máximo 64 KB.
- La plantilla escapa todos los valores y no lleva contraseñas.

**Se mantienen:**
- RLS por negocio y el rol `vlux_app` sin BYPASSRLS ni DELETE.
- El Control Center vive en un proyecto aparte, detrás de Vercel SSO.
- El público no expone `/api/admin` (lo prueba la E2E V0.4.4, T23).

**Datos de salud:** la UI avisa en los giros regulados y el servicio participante admite como máximo 40 caracteres.

## Privacidad

- **El respaldo de eliminación contiene datos personales** (nombres y contactos opcionales de clientes). La UI lo advierte; hay que guardarlo cifrado y borrarlo cuando ya no haga falta.
- **La constancia de eliminación** (`business_deletions`) guarda solo conteos y la huella del respaldo.
- **Las capturas de las pruebas** tapan los secretos TOTP y los enlaces con token.

## Lista de pruebas físicas (Vlux, en dispositivos reales)

Usa un negocio demo en Preview, **después** de aplicar el SQL y desplegar.

| # | Dispositivo | Prueba | Resultado esperado |
|---|---|---|---|
| F1 | iPhone (Safari, iOS reciente) | Escanear el QR del mostrador con la cámara nativa y crear la tarjeta | Abre la tarjeta con la unidad del programa (sellos, visitas, servicios o puntos) |
| F2 | iPhone | Compartir → "Agregar a inicio" y abrir desde el ícono | Abre sin barra de Safari y conserva la tarjeta |
| F3 | Android (Chrome) | Escanear el QR e instalar la app desde el aviso | Igual que F1 y F2 |
| F4 | Teléfono de caja (Android o iPhone) | Escanear el QR de la tarjeta del cliente con la cámara de la caja | Identifica la tarjeta en menos de 2 s con buena luz |
| F5 | Caja con programa **por servicio** | Elegir el servicio y registrar | +1 servicio; el botón no se activa sin servicio |
| F6 | Caja con programa **de puntos** | Escribir el monto con el teclado numérico | La vista previa de puntos coincide con lo registrado |
| F7 | Cliente | Mantener la tarjeta abierta mientras la caja registra | Se actualiza sola en unos segundos |
| F8 | Caja sin red (modo avión) | Intentar registrar | Aviso claro, no inventa sellos; al volver la red, nada se duplicó |
| F9 | Dueño en teléfono | Panel, "Primeros pasos" y QR del mostrador | Legible a 390 px y el QR se descarga |
| F10 | Cualquiera, con brillo bajo | Leer la tarjeta Black Titanium y la Signature Silver | El contraste es suficiente |

Cada prueba se registra con: modelo, versión del sistema, fecha y resultado (PASS, FAIL o comentario). Se puede usar `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md` como formato.
