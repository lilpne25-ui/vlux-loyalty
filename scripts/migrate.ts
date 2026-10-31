// Migraciones SQL versionadas. Uso: tsx scripts/migrate.ts up | down | status
// Usa DATABASE_ADMIN_URL (dueño del esquema), nunca la conexión de la app.
import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import pg from 'pg';

const dir = join(import.meta.dirname, '..', 'db', 'migrations');
const url = process.env.DATABASE_ADMIN_URL;
if (!url) { console.error('Falta DATABASE_ADMIN_URL'); process.exit(1); }

const ups = readdirSync(dir).filter((f) => f.endsWith('.up.sql')).sort();
const versionOf = (f: string) => f.replace('.up.sql', '');

async function main(cmd: string) {
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Map((await db.query('SELECT version, checksum FROM schema_migrations')).rows.map((r) => [r.version, r.checksum]));
    if (cmd === 'status') {
      for (const f of ups) console.log(`${applied.has(versionOf(f)) ? 'aplicada ' : 'pendiente'}  ${versionOf(f)}`);
      return;
    }
    if (cmd === 'up') {
      for (const f of ups) {
        const v = versionOf(f);
        const sql = readFileSync(join(dir, f), 'utf8');
        const sum = createHash('sha256').update(sql).digest('hex');
        if (applied.has(v)) {
          if (applied.get(v) !== sum) throw new Error(`La migración ${v} cambió después de aplicarse. Crea una nueva en lugar de editarla.`);
          continue;
        }
        await db.query('BEGIN');
        await db.query(sql);
        await db.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [v, sum]);
        await db.query('COMMIT');
        console.log(`aplicada ${v}`);
      }
      return;
    }
    if (cmd === 'down') {
      const last = (await db.query('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')).rows[0]?.version;
      if (!last) return console.log('No hay migraciones aplicadas.');
      await db.query('BEGIN');
      await db.query(readFileSync(join(dir, `${last}.down.sql`), 'utf8'));
      await db.query('DELETE FROM schema_migrations WHERE version = $1', [last]);
      await db.query('COMMIT');
      console.log(`revertida ${last}`);
      return;
    }
    throw new Error('Comando desconocido. Usa up, down o status.');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await db.end();
  }
}

main(process.argv[2] || 'status').catch((e) => { console.error(e.message); process.exit(1); });
