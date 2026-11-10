# VLUX Loyalty 1.0.0-rc.1 · Respaldos y recuperación

> Estado: **procedimiento probado de punta a punta en local con datos sintéticos; BLOCKED contra Supabase** hasta configurar el destino privado y los secretos. No hay ningún respaldo restaurable de Preview hoy.

## Situación encontrada
- `.github/workflows/respaldo-diario.yml` en `main`: **7 de 7 ejecuciones fallidas** (2026-11-01 → 2026-11-06) porque faltan `SUPABASE_BACKUP_URL` y `BACKUP_PASSPHRASE`. La alerta sí funciona: abrió el issue #2 y lo comenta en cada falla.
- El workflow vive en un **repositorio público**: sus artefactos y registros los puede ver cualquiera. Aunque el respaldo va cifrado, publicar la base de clientes cifrada en un lugar público no es un "destino con acceso restringido".
- `ops/grants.sql` estaba desactualizado (S2/S3 en `SECURITY_REVIEW.md`): una restauración habría "pasado" con la app rota y funciones peligrosas abiertas.
- La verificación comparaba conteos exactos con el origen vivo: cualquier compra durante el respaldo la habría hecho fallar (falso negativo).

## Correcciones del RC
| Cambio | Archivo |
|---|---|
| Conteos: cada tabla restaurada debe quedar entre el conteo del origen **antes** y **después** del respaldo (`pg_dump` usa una sola instantánea) | `ops/backup-verify.sh` |
| Permisos de `vlux_app` idénticos al origen y 0 funciones ejecutables por PUBLIC | `ops/backup-verify.sh` + `ops/grants.sql` |
| Prueba funcional en la copia: como `vlux_app` (RLS activa) lee un negocio y registra una visita, luego deshace | `ops/backup-verify.sh` |
| El workflow se detiene **antes de leer la base** si el repositorio es público | `respaldo-diario.yml` |
| Simulacro de restauración desde el archivo cifrado, con tiempos | `ops/restore-drill.sh` (nuevo) |

## Evidencia (local, 2026-11-07, BD sintética de 300 negocios × 100 clientes)
| Prueba | Resultado |
|---|---|
| Respaldo + restauración aislada + verificación **con 300 negocios escribiendo a la vez** | PASS en 9.5 s; dump 18–20 MB. El origen recibió ~700 operaciones durante el respaldo y la verificación no falló (con la regla anterior sí habría fallado: 37,750 vs 37,759) |
| Libro mayor (saldo = suma de sellos) en la copia | 0 diferencias |
| Tablas sin RLS en la copia | 0 |
| Permisos de `vlux_app` vs origen | Idénticos |
| Funciones ejecutables por PUBLIC en la copia | 0 |
| Prueba funcional como `vlux_app` | `rls-ok escritura-ok` |
| Cifrado AES-256 (gpg) y verificación de descifrado contra el hash original | PASS; frase incorrecta rechazada |
| Simulacro desde `.gpg`: integridad → descifrado → restauración → verificación | PASS en **3 s** (15 migraciones, 30,000 tarjetas, 69,278 compras) |
| Protección: el simulacro se niega a restaurar sobre un host de Supabase | PASS |
Archivos de evidencia: `docs/release-1.0/evidencia/` (salidas sin datos personales).

## Diseño objetivo
```
GitHub Actions (repo PRIVADO "vlux-ops")  ── 03:17 MX diario ──►  pg_dump (instantánea) de Supabase PROD
        │                                                              │
        │  restaura en Postgres 17 efímero del runner ◄────────────────┘
        │  verifica: conteos, libro mayor, RLS, permisos, PUBLIC, prueba funcional
        │  cifra AES-256 con BACKUP_PASSPHRASE y verifica el descifrado
        ▼
Artefacto privado (retención 30 días)        Falla en cualquier paso ─► issue "Respaldo diario FALLÓ" (correo de GitHub)
        + Supabase Pro: respaldo diario propio, 7 días (independiente)
```

## Pasos para desbloquear (Vlux)
> La versión detallada y verificable está en [`BACKUP_PRIVATE_SETUP.md`](BACKUP_PRIVATE_SETUP.md) (incluye cómo apagar el workflow público de `main` y un paquete `vlux-ops` ya probado). Lo de abajo es el resumen original.
1. Crear un repositorio **privado** `vlux-ops` (gratis en GitHub). Copiar `ops/backup-verify.sh`, `ops/grants.sql` y `.github/workflows/respaldo-diario.yml`. El repo público puede conservar los archivos; su workflow se detendrá solo.
2. En `vlux-ops` → Settings → Secrets → Actions:
   - `SUPABASE_BACKUP_URL`: conexión del **dueño del esquema** por Session Pooler (puerto 5432, usuario `postgres.<ref>`), terminada en `?sslmode=require`. Nunca la pegues en un chat, issue o archivo.
   - `BACKUP_PASSPHRASE`: frase aleatoria de 40+ caracteres. Guárdala **también fuera de GitHub** (gestor de contraseñas): sin ella los respaldos no sirven.
3. Ejecutar el workflow a mano (`workflow_dispatch`) y revisar que termine verde.
4. Descargar el artefacto y correr el simulacro en una máquina propia:
   ```bash
   BACKUP_FILE=vlux-AAAAMMDDTHHMMSSZ.dump.gpg BACKUP_PASSPHRASE='…' \
   RESTORE_ADMIN_URL=postgres://postgres:…@localhost:5432/postgres ./ops/restore-drill.sh
   ```
5. Anotar en `GO_NO_GO.md` la fecha y la salida: solo entonces el requisito "respaldos con restauración comprobada" pasa a PASS.
6. Cerrar el issue #2 cuando la primera ejecución sea verde.

## Objetivos iniciales de recuperación
| | Piloto controlado (1–2 negocios) | Disponibilidad general |
|---|---|---|
| **RPO** (pérdida máxima) | **24 h** (respaldo diario propio + respaldo diario de Supabase Pro) | 24 h; evaluar PITR (USD 100/mes por 7 días) cuando haya ≥ 20 negocios de pago |
| **RTO** (servicio restaurado) | **4 h** en horario hábil | 2 h |
| Medido | Simulacro local: 3 s para 30,000 tarjetas. El tiempo real lo dominan: crear/elegir el destino, cambiar `DATABASE_URL` en Vercel y redesplegar (~15–30 min estimado, **no medido**) | |
Compensación operativa del RPO: la caja conserva la operación en pantalla y el negocio lleva un registro manual de respaldo durante una caída (ver `RUNBOOK.md`).

## Restauración real (incidente)
1. Declarar incidente (RUNBOOK §I-1). Congelar escrituras: quitar `DATABASE_URL` de Vercel Production o desplegar en modo mantenimiento.
2. Elegir el respaldo: el último verde de `vlux-ops` o el de Supabase (Dashboard → Database → Backups).
3. Restaurar **primero en una base aislada** con `ops/restore-drill.sh` y revisar.
4. Para volver a servicio: proyecto Supabase nuevo (o el mismo tras restauración de Supabase), `pg_restore` + `ops/grants.sql`, crear `vlux_app` con contraseña nueva, actualizar `DATABASE_URL` en Vercel, redesplegar, `GET /api/health?db=1`.
5. Comunicar a los negocios la ventana de datos perdida (RPO) y registrar el incidente.
