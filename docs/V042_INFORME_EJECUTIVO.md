# V0.4.2 · Informe ejecutivo

**Clasificación: READY FOR DEMO** (público, comercial). **No** READY FOR CLOSED PILOT ni para clientes reales.

## Qué cambió
- La URL principal ya no es el Café: es **VLUX Loyalty** (hero, tarjeta metálica 3D, tres acabados vivos, cómo funciona, negocio, demostración guiada, accesos, solicitud y FAQ).
- Logos oficiales PNG de Drive integrados; JPG provisionales fuera.
- **Estudio de marca público** (`/personalizar`) con datos temporales: no crea negocios ni sube archivos.
- **Demostración sin contraseñas** para dueño y caja (sesión de 2 h, limitada) sobre el negocio sintético «VLUX Demo».
- Seguridad: hash de logo almacenado (riesgo de disponibilidad) y RLS de `businesses` por operación (con pruebas cruzadas).

## Riesgos abiertos
| Riesgo | Nivel |
|---|---|
| Respaldos no operativos (faltan 2 secretos) | Alto antes de datos reales |
| Sin producción separada ni revisión legal | Alto antes de clientes reales |
| Repo público: artefactos de Actions | Medio (respaldo va cifrado) |
| Sesión demo no probada con POST remoto desde la nube | Bajo (probada local y con datos verificados) |
| Sin pruebas en teléfonos físicos | Medio |
| Lema oficial sin confirmar; contacto comercial sin definir | Bajo |

Detalle: `V042_SEGURIDAD.md`, `V042_PRUEBAS.md`, `V042_PLAN_PILOTO.md`.
