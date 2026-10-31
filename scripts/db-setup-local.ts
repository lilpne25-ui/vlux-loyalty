// SOLO desarrollo local: crea la base indicada en DATABASE_ADMIN_URL (si no existe)
// y habilita el login del rol vlux_app con APP_DB_PASSWORD. No usar contra bases productivas.
import pg from 'pg';

const adminUrl = process.env.DATABASE_ADMIN_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!adminUrl || !appPassword) { console.error('Faltan DATABASE_ADMIN_URL o APP_DB_PASSWORD'); process.exit(1); }
const host = new URL(adminUrl).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) { console.error(`Rechazado: db:setup solo corre contra localhost (recibí ${host}).`); process.exit(1); }

const target = new URL(adminUrl);
const dbName = target.pathname.slice(1);
if (!/^[a-z_][a-z0-9_]*$/.test(dbName)) { console.error('Nombre de base inválido'); process.exit(1); }
const server = new URL(adminUrl);
server.pathname = '/postgres';

const c = new pg.Client({ connectionString: server.toString() });
await c.connect();
const exists = (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName])).rowCount;
if (!exists) { await c.query(`CREATE DATABASE ${dbName}`); console.log(`base ${dbName} creada`); }
const role = (await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'vlux_app'")).rowCount;
const pw = appPassword.replace(/'/g, "''");
await c.query(role ? `ALTER ROLE vlux_app LOGIN NOBYPASSRLS PASSWORD '${pw}'` : `CREATE ROLE vlux_app LOGIN NOBYPASSRLS PASSWORD '${pw}'`);
await c.end();
console.log('rol vlux_app listo');
