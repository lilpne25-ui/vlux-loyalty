# VLUX Loyalty V0.4.5 · Informe ejecutivo

Fecha: 2026-11-06 · Rama `v0.4.5` (desde `v0.4.4`), sin merge a `main`, sin Production.

## En una frase

VLUX Loyalty deja de ser un programa de sellos para cafeterías y pasa a ser **un motor de lealtad para 16 giros**: sellos por compra, por visita o por servicio, puntos por consumo y programas personalizados. Además, VLUX ya puede **administrar todo el ciclo de vida** de un negocio y **enviar invitaciones por correo**, con controles de seguridad de nivel operativo.

## Qué cambia para el negocio

| Antes (V0.4.4) | Ahora (V0.4.5) |
|---|---|
| 5 giros y solo sellos por compra | 16 giros con plantillas; 5 tipos de programa sobre un motor común |
| La caja siempre decía "Registrar compra" | La caja pide lo que hace falta: el servicio, el monto o nada (visita) |
| No había forma de dar de baja un negocio | Archivar y restaurar, más una eliminación segura con respaldo, 2FA y constancia |
| La invitación se copiaba a mano | Botón "Enviar invitación" con estados verificables. Hoy funciona con proveedor simulado; el real está **BLOCKED** |
| Sin guía para el dueño nuevo | "Primeros pasos" opcional de 5 pasos |
| Sin números de costo | Modelo reproducible por escenario y plan |

## Números clave

- **Infraestructura:** ~830 MXN/mes fijos (Supabase Pro + Vercel Pro) hasta ~100 negocios.
  - **Equilibrio:** 3 negocios a $299 o 2 negocios a $499.
  - **Margen bruto de infraestructura:** desde 72 % con 10 negocios a $299.
  - No incluye soporte, ventas, impuestos ni comisiones.
- **Carga local:** 100 negocios × 300 clientes, hasta 483 solicitudes/s con p95 de 52 ms y 0 errores. Eso es ~14× el pico estimado de 300 negocios.
  - **Esto no demuestra 300 negocios en la infraestructura real.** Falta repetirlo contra Supabase.
- **Pruebas:**
  - 56 unitarias y 120 de integración;
  - E2E nuevo con 26 checks (T31–T40);
  - la regresión E2E de V0.2 a V0.4.4 pasa completa (una falla intermitente del entorno en V0.4.3 pasó al repetirla).

## Recomendaciones (opinión, no hechos)

1. **Precio:** con estos costos, **$499 da margen de sobra** y $299 también es viable. La diferencia la decide el soporte, no la infraestructura. Sugiero que $299 sea el plan de entrada con autoservicio y $499 incluya el alta asistida y el envío de invitaciones.
2. **Antes del piloto**, en este orden:
   - respaldos verificados;
   - Supabase y Vercel en planes comerciales;
   - un proyecto de producción separado;
   - aviso de privacidad;
   - pruebas físicas F1–F10.
3. **Giros de salud:** venderlos solo con el aviso y la revisión del establecimiento. No conviene ser el primer giro del piloto.
4. **No optimizar todavía:** el sondeo automático es ~70 % de las solicitudes, pero subirlo 4× solo mueve el costo +19 %.

## Bloqueos (resumen; detalle en `V045_PRODUCCION.md`)

1. Respaldos: faltan los secretos en GitHub y una restauración comprobada.
2. Migraciones 0011–0013 sin aplicar en Supabase Preview. **Vlux pega el SQL**; después se despliega.
3. Correo real: falta autorizar Resend, el dominio y SPF, DKIM y DMARC.
4. Planes comerciales: Vercel Hobby no permite uso comercial y Supabase Free se pausa.
5. No hay entorno de producción separado.
6. Faltan las pruebas físicas en iPhone y Android.
7. Aviso de privacidad definitivo.
8. Capacidad en infraestructura real (prueba de carga en Supabase).
9. Política de retención del historial.

## Metodología

- **MSA · Edición Lud:** **no se usó** en esta sesión. El paquete no estaba instalado en el contenedor y no se reinstaló. Ningún material de MSA entró al repositorio.
- **Skills `frontend-design` y `apple-ui-design`:** **no están disponibles** en esta sesión.
- **Cómo se diseñó la UI en su lugar:** con el sistema visual existente (tema oscuro del Control Center, claro del panel, acabados metálicos de la tarjeta) y verificación con capturas automatizadas a 1360 px y 390 px.

## Entregables

1. Código en la rama `v0.4.5`, también en `claude/project-thread-s9fauc`.
2. Migraciones `0011_business_lifecycle`, `0012_email_outbox` y `0013_rewards_engine`, cada una con su reversa.
3. SQL combinado para Supabase Preview, con su reversa (en la carpeta compartida `vlux-loyalty-v045/`), probado con aplicar, revertir y reaplicar.
4. `docs/V045_CICLO_VIDA.md`
5. `docs/V045_CORREO.md` (incluye SPF, DKIM y DMARC).
6. `docs/V045_MOTOR_RECOMPENSAS.md` (incluye el catálogo y las reglas de salud).
7. `docs/V045_COSTOS_ESCALABILIDAD.md`
8. `scripts/costos-v045.py` y los CSV en `docs/evidencia/costos-v045/` (la hoja reproducible).
9. `docs/V045_PRUEBAS_CARGA.md`, `scripts/load/seed.ts` y `scripts/load/run.mjs`.
10. Resultados de carga en `docs/evidencia/load-d-*.json`.
11. `docs/V045_PRODUCCION.md` (bloqueos, seguridad, privacidad y lista física F1–F10).
12. `docs/V045_PRUEBAS.md` (matriz T01–T40 y regresión).
13. Pruebas de integración `tests/integration/v045-*.test.ts` (19).
14. Pruebas unitarias `tests/unit/catalog.test.ts` (5).
15. E2E `tests/e2e/v045-operacion.cjs` y `scripts/e2e-v045.sh`.
16. Capturas `docs/evidencia/capturas/v045-*.png`.
17. Plantilla de correo `server/email/templates.ts` y adaptador `server/email/provider.ts`.
18. Editor de programa reutilizable `src/components/ProgramFields.tsx` y `src/lib/program-form.ts`.
19. Variables de correo documentadas en `.env.example`.
20. Este informe.
