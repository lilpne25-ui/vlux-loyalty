# VLUX Loyalty · V0.2 (MVP)

> Haz que tus clientes tengan una razón más para regresar.

Tarjeta de recompensas web para pequeños negocios (cafeterías, barberías, salones…). El cliente no instala nada: escanea el QR del mostrador y obtiene su tarjeta en el navegador. El personal registra compras desde su teléfono y el dueño ve los resultados en su panel. Un solo despliegue atiende a muchos negocios, con los datos aislados entre ellos.

**Estado:** MVP funcional verificado en entorno local. **No está desplegado en producción.** Apple Wallet y Google Wallet son la siguiente fase (ver `docs/PROPUESTA_V03_WALLET.md`).

## Qué hace
- Registro del cliente desde el QR del negocio (`/n/<negocio>`), sin contraseña; enlace personal para abrir su tarjeta en otro teléfono.
- Caja (`/caja`): identificar tarjeta con cámara en vivo, foto o código; registrar compra; canjear recompensa.
- Panel del dueño (`/panel`): clientes, visitas, compras, sellos, recurrentes, recompensas, canjes, reseñas; configuración del programa y de la marca; equipo; QR imprimible; exportar y eliminar datos de un cliente.
- Reglas: 1 sello por compra o por artículo (con tope); varias compras dentro de la ventana cuentan como **una visita**.
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

## Despliegue (no realizado)
Un proceso Node (`npm run build && npm start`) + PostgreSQL administrado. Ver `docs/INFORME_TECNICO.md`. Antes de producción: HTTPS, `NODE_ENV=production`, `TRUST_PROXY=1` si hay proxy, respaldos de BD y aviso de privacidad revisado por un abogado.

## Documentación
- `docs/INFORME_TECNICO.md` · arquitectura y decisiones
- `docs/INFORME_SEGURIDAD.md` · controles y pendientes
- `docs/REPORTE_MIGRACION.md` · qué se reutilizó de V0.1
- `docs/MANUAL_PILOTO.md` · uso para el negocio piloto
- `docs/PREPARACION_COMERCIAL.md` · qué está listo y qué no
- `docs/PROPUESTA_V03_WALLET.md` · Apple Wallet y Google Wallet
- `docs/calidad/compuertas.md` · compuertas de calidad por átomo

© VLUX — eTransformation Partner. Código propietario.
