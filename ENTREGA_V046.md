# Entrega V0.4.6 · VLUX Loyalty: Smart Access · Owner PWA · Communications · Customer Engagement

Rama `v0.4.6` (desde V0.4.5 `22cc1c1`), sin merge a main, sin Production. Migración nueva: `db/migrations/0014_access_push` (aditiva).
Documentos: `docs/V046_ACCESOS_PWA.md`, `V046_CORREO_STALWART.md`, `V046_NOTIFICACIONES.md`, `V046_UBICACION.md`, `V046_PRIVACIDAD.md`, `V046_COSTOS.md`, `V046_PRUEBAS.md`, `V046_DESPLIEGUE_PREVIEW.md`. Capturas: `docs/evidencia/capturas/v046-*.png`.

## IMPLEMENTADO
- **P0 Centro de accesos** (Control Center → negocio): propietario, caja y clientes; enlaces permanentes sin credenciales (`/panel?negocio=`, `/caja?negocio=`, `/acceso?negocio=`); restablecer contraseña con enlace de un solo uso; renovar/revocar invitaciones; sin duplicados; empleados nunca dueños.
- **Entrega sin correo**: enlace temporal, QR descargable, WhatsApp (sin afirmar que se envió; «Ya lo envié» queda en bitácora) y **activación presencial** con código de 10 caracteres, 30 min, un solo uso, con detección en vivo en el Control Center.
- **P1 PWA del dueño**: bienvenida con 3 acciones (abrir panel, instalar, QR), pantalla de instalación por dispositivo con ícono propio del negocio, manifiestos por negocio para panel y caja, aviso cuando un enlace es de otro negocio. Se corrigió un error real: el botón «instalar caja» desde el panel instalaba el manifiesto del panel.
- **P2 Correo**: adaptador `EMAIL_PROVIDER=smtp|stalwart` con TLS obligatorio y verificación de certificado; scripts de auditoría de solo lectura para el servidor.
- **P3 Avisos Web Push** propios (sin Firebase SDK): recompensa lista, casi lo logras, te extrañamos, recordatorio de cita genérico y promociones (2 cada 30 días). Consentimiento por categoría, horas de silencio, tope semanal, deduplicación, reintentos, desactivación automática. Pestaña «Comunicación» del dueño y «Mis notificaciones» del cliente.
- **P4 «¿Estoy cerca?»**: ubicación una sola vez, calculada en el teléfono, nunca enviada.

## VERIFICADO (local, emulado)
Unitarias 65/65 · integración 141/141 (T01–T31) · E2E V0.4.6 27/27 · regresiones E2E V0.2 → V0.4.5 en verde · migración 0014 aplicar/revertir/reaplicar · cifrado push contra implementación de referencia · benchmark 10/50/100/300 negocios × 300 clientes (~125 avisos/s, 0 pendientes).

## BLOQUEADO
- Auditoría del servidor Stalwart: sin DNS público, SSH ni panel desde este entorno. Scripts listos en `scripts/stalwart-auditoria.{sh,ps1}`.
- Aplicar la migración 0014 en Supabase Preview desde aquí: el sistema bloqueó el conector por tratarse de un recurso compartido. Vlux la pega en el SQL Editor.

## NO COMPATIBLE CON LA PWA
- Avisos al pasar cerca del negocio (geovallas / ubicación en segundo plano): requieren app nativa. Comparativa en `V046_UBICACION.md`.
- Instalación automática en iPhone: solo manual (Compartir → Agregar a inicio).
- Avisos en iPhone desde una pestaña de Safari: solo desde la app agregada a inicio (iOS 16.4+).

## PENDIENTE DE VALIDACIÓN LEGAL
Aviso de privacidad (push, proveedor técnico, promociones, ubicación); citas en consultorios y nombre neutro en avisos; promociones (PROFECO/REPEP); contrato encargado/responsable. Ver `V046_PRIVACIDAD.md`.

## REQUIERE AUTORIZACIÓN
Llaves VAPID, `CRON_SECRET` y tarea programada en Vercel; primer envío push real; correos reales por Stalwart; DNS; cualquier contratación.

## Pendiente en dispositivos físicos
Instalación real del panel (Android/iPhone), recepción de un aviso real, «¿Estoy cerca?» con GPS real. Nada de esto se probó en un teléfono.
