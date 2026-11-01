# VLUX Loyalty V0.4.1 · Informe ejecutivo

## Clasificación: **READY FOR DEMO**
No es READY FOR CLOSED PILOT ni, por supuesto, apto para clientes reales.

**Por qué sí es demostrable.** El recorrido comercial funciona con datos sintéticos y sin tocar la base: Estudio de marca (logo → paleta → tarjeta metálica con tres acabados) → vista de teléfono → alta del negocio → accesos para cliente, caja y dueño → registro del cliente → sello en caja → canje una sola vez → panel del dueño. Pruebas: unitarias 32/32, integración 86/86, E2E v04 35/35, v02 29/29, v021 14/14, v022 40/40, v03 24 + 1 bloqueada conocida (Google Wallet). Preview `v0.4.1` READY en los dos proyectos, verificado por HTTPS.

**Por qué no es piloto cerrado.** Faltan controles indispensables que no dependen de código:
1. **Respaldos: BLOCKED.** Faltan los secretos en GitHub; nunca hubo una corrida verde ni restauración probada.
2. **Dispositivos físicos: NOT TESTED** (iPhone y Android). La causa del código de vinculación en iPhone se explica, pero no está comprobada.
3. **Privacidad:** aviso y consentimientos sin revisión jurídica. No se declara cumplimiento.
4. **Entorno de producción inexistente.** Hoy demo y comercial compartirían base; un negocio real no debe darse de alta ahí.
5. Riesgo de seguridad abierto de disponibilidad (cálculo de hash del logo sin límite) y mejora de RLS de la tabla `businesses`.

## Qué cambió en V0.4.1
- Identidad oficial de VLUX (zip entregado) en Control Center, barra de la app, favicon y presentación. Lema oficial: AI Transformation Partner.
- Acabados de tarjeta: Color del negocio, Plata metálica y Negro premium; se guardan por negocio (migración 0007, aplicada también en Supabase Preview) y garantizan contraste.
- Estudio de marca: el acabado viaja al asistente de alta. La personalización del Estudio sigue siendo temporal; solo se guarda si el equipo pulsa «Crear negocio con esta marca».
- Validación en servidor de los bytes reales del logo (PNG/JPEG/WebP; SVG rechazado) al guardar y al servir.
- `PUBLIC_APP_URL` solo https en producción.
- Prueba de regresión corregida (el botón «Agregar panel…» colisionaba con «Agregar» empleado).

## Lo que no se hizo (con razón)
- Los 3 PNG de Drive no se pudieron bajar; se usaron los JPG del zip. Se necesitan originales con transparencia/SVG.
- WebKit/Firefox locales no corrieron (solo en CI).
- Sin carga de logos SVG ni almacenamiento en Supabase Storage: el logo sigue en la base con restricción de tipo y tamaño. Es una decisión de bajo riesgo para el piloto; Storage por negocio queda para producción.
- Un único guion de punta a punta de la demo no existe aún (dos guiones continuos).
- Apple/Google Wallet: no existe.

## Qué sigue (orden recomendado)
1. Vlux: cargar `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE`; correr el respaldo; restaurar en base aislada.
2. Probar en un iPhone y un Android (V041_PWA_IPHONE_ANDROID.md).
3. Hacer 2 demostraciones con el guion (V041_VALIDACION_TOLUCA.md).
4. Decidir precio (299 / 499) con lo que digan los dueños.
5. Crear entorno de producción separado, dominio, abogado.
6. Enviarme los logos con transparencia para pulir la identidad.
