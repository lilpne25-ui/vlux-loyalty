# VLUX Loyalty · V0.2.2 (tarjeta instalable en el teléfono)

> Haz que tus clientes tengan una razón más para regresar.

Tarjeta de recompensas web para pequeños negocios (cafeterías, barberías, salones…). El cliente no instala nada: escanea el QR del mostrador y obtiene su tarjeta en el navegador. El personal registra compras desde su teléfono y el dueño ve los resultados en su panel. Un solo despliegue atiende a muchos negocios, con los datos aislados entre ellos.

**Estado:** V0.2.2 en Vercel (solo Preview) + Supabase. El cliente puede guardar su tarjeta en la pantalla de inicio del iPhone o Android (PWA, sin tienda de apps). Demo pública para clientes sin cuenta de Vercel y entorno interno protegido (ver `docs/ACCESO_VERCEL_V022.md`). **No hay despliegue en Production.** La PWA **no es** Apple Wallet ni Google Wallet; esas siguen como fase futura (`docs/PROPUESTA_V03_WALLET.md`). Pruebas en teléfonos físicos: pendientes.

## Qué hace
- Registro del cliente desde el QR del negocio (`/n/<negocio>`), sin contraseña; enlace personal para abrir su tarjeta en otro teléfono.
- Caja (`/caja`): identificar tarjeta con cámara en vivo, foto o código; registrar compra; canjear recompensa.
- Panel del dueño (`/panel`): clientes, visitas, compras, sellos, recurrentes, recompensas, canjes, reseñas; configuración del programa y de la marca; equipo; QR imprimible; exportar y eliminar datos de un cliente.
- Reglas: 1 sello por compra o por artículo (con tope); varias compras dentro de la ventana cuentan como **una visita**.
- Tarjeta instalable (V0.2.2): "Guarda tu tarjeta" con instalación nativa en Android y guía en iPhone; manifiesto e ícono por negocio; si la app instalada no tiene la tarjeta, se vincula con un código de un solo uso.
- Seguridad: sesiones en cookies HttpOnly, roles en servidor, Row Level Security en PostgreSQL, idempotencia y bloqueo transaccional en sellos y canjes.

## Requisitos
- Node.js 22 (probado con 22.23)
- PostgreSQL 13 o superior (probado con 16.15)

## Instalación local
```bash
npm ci
cp .env.example .env          # llena DATABASE_URL, DATABASE_ADMIN_URL, APP_DB_PASSWORD, PLATFORM_ADMIN_TOKEN
npm run db:setup              # SOLO local: crea la base y el rol vlux_app
npm run db:migrate
DEMO_PASSWORD='elige-una-de-10+' npm run db:seed:demo   # Café Demo Toluca y Barbería Demo Metepec (datos sintéticos)
npm run build
npm start                     # http://localhost:8787
```
En Windows PowerShell: `$env:DEMO_PASSWORD='...'; npm run db:seed:demo`.

Desarrollo con recarga: `npm run dev:api` y, en otra terminal, `npm run dev:web` (http://localhost:5173).

### Probar con teléfonos reales en la misma red
La cámara del navegador exige HTTPS fuera de `localhost`. Opciones: un túnel HTTPS (por ejemplo Tailscale Funnel o Cloudflare Tunnel) apuntando al puerto 8787, y `PUBLIC_BASE_URL` con esa URL. Ver `docs/MANUAL_PILOTO.md`.

## Pruebas
```bash
cp .env .env.test             # y cambia el nombre de la base a vlux_loyalty_test
npm run db:setup:test         # crea y migra la base de pruebas
npm test                      # unitarias + integración (API real contra PostgreSQL)
npm run test:e2e              # 3 navegadores independientes contra el servidor en marcha (requiere Playwright/Chromium y ffmpeg)
npm run build:vercel && npm run preview:vercel   # salida de Vercel emulada en :8788
npm run test:e2e:v021         # recuperación de contraseña, nuevo enlace, anular compra
node tests/e2e/v022-pwa.cjs           # V0.2.2: PWA + escenario A/B/C (BROWSER=chromium|webkit|firefox)
```
Resultados guardados en `docs/evidencia/`.

## Estructura
```
shared/rules.ts            reglas puras: compra, visita, sello, recompensa
server/                    API Hono (app.ts), servicios, seguridad, acceso a BD
db/migrations/             SQL versionado con reversa (ver db/README.md)
src/                       frontend React (vistas de V0.1 adaptadas)
scripts/                   migraciones, alta local, datos de demostración
tests/unit|integration|e2e pruebas
legacy/v01/                V0.1 original (referencia; no se compila)
docs/                      informes, manuales, evidencia
```

## Despliegue (Vercel + Supabase)
`npm run build:vercel` genera `.vercel/output` (Build Output API v3): estáticos + una Function Node 22 con Hono. Base: Supabase vía Transaction Pooler con el rol `vlux_app` (sin privilegios de dueño). Production está bloqueado a propósito. Paso a paso, variables y recuperación en `docs/DESPLIEGUE_VERCEL_SUPABASE.md`.

## Documentación
- `docs/INFORME_TECNICO.md` · arquitectura y decisiones
- `docs/INFORME_SEGURIDAD.md` · controles y pendientes (V0.2)
- `docs/INFORME_SEGURIDAD_V021.md` · seguridad en Vercel + Supabase
- `docs/INFORME_SEGURIDAD_V022.md` · seguridad de la PWA y revisión MSA
- `docs/ACCESO_VERCEL_V022.md` · acceso de clientes sin cuenta de Vercel
- `docs/PWA_INVESTIGACION_V022.md` · PWA vs Wallet, instalación por plataforma
- `docs/DIFF_V021_V022.md` · qué cambió desde V0.2.1
- `docs/calidad/atomos-v022.md` · átomos V0.2.2 y estado
- `docs/DESPLIEGUE_VERCEL_SUPABASE.md` · manual técnico de despliegue
- `docs/RESPALDOS.md` · respaldos y restauración
- `docs/COSTOS_V021.md` · costos para 2/10/30/100 negocios
- `docs/MANUAL_COMERCIAL_CAFETERIA.md` · alta comercial de una cafetería
- `docs/CHECKLIST_DISPOSITIVOS_FISICOS.md` · prueba manual en iPhone y Android
- `docs/REPORTE_MIGRACION.md` · qué se reutilizó de V0.1
- `docs/MANUAL_PILOTO.md` · uso para el negocio piloto
- `docs/PREPARACION_COMERCIAL.md` · qué está listo y qué no
- `docs/PROPUESTA_V03_WALLET.md` · Apple Wallet y Google Wallet
- `docs/calidad/compuertas.md` · compuertas de calidad por átomo (V0.2)
- `docs/calidad/compuertas-v021.md` · átomos V0.2.1 y estado final

© VLUX — eTransformation Partner. Código propietario.
