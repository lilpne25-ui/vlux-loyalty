// 1.0.0-rc.1 · Compara la serie diaria del tablero (consulta anterior vs. nueva): mismo resultado y tiempo. SOLO BD local.
// Uso: node scripts/perf/dashboard-series.mjs postgres://vlux_app:...@127.0.0.1/vlux_load <business_id>
import pg from 'pg';
if (!/@(127\.0\.0\.1|localhost)[:/]/.test(process.argv[2] || "")) { console.error("Rechazado: solo BD local."); process.exit(1); }
const [url, biz] = process.argv.slice(2);
const c = new pg.Client({ connectionString: url }); await c.connect();
const OLD = `SELECT d::date AS day,
 (SELECT count(*) FROM visits v WHERE (v.started_at AT TIME ZONE $2)::date = d::date)::int AS visits,
 (SELECT count(*) FROM purchases p WHERE p.voided_at IS NULL AND (p.created_at AT TIME ZONE $2)::date = d::date)::int AS purchases
 FROM generate_series((now() AT TIME ZONE $2)::date - ($1::int - 1), (now() AT TIME ZONE $2)::date, interval '1 day') d ORDER BY d`;
const src = (await import('node:fs')).readFileSync('server/services/owner.ts','utf8');
const NEW = src.slice(src.indexOf('`WITH v AS')+1, src.indexOf('ORDER BY d`')+10);
await c.query('BEGIN'); await c.query("SELECT set_config('app.business_id',$1,true)", [biz]);
for (const days of [7, 14, 30, 90]) {
  const t0 = performance.now(); const a = (await c.query(OLD, [days, 'America/Mexico_City'])).rows; const t1 = performance.now();
  const b = (await c.query(NEW, [days, 'America/Mexico_City'])).rows; const t2 = performance.now();
  console.log(`días=${days} iguales=${JSON.stringify(a)===JSON.stringify(b)} filas=${b.length} visitas=${b.reduce((s,r)=>s+r.visits,0)} antes=${(t1-t0).toFixed(0)}ms después=${(t2-t1).toFixed(0)}ms`);
}
const plan = (await c.query('EXPLAIN (ANALYZE) ' + NEW.replace(/\$1/g,'14').replace(/\$2/g,"'America/Mexico_City'"))).rows.map(r=>r['QUERY PLAN']).filter(l=>/Index|Execution/.test(l));
console.log(plan.join('\n')); await c.query('ROLLBACK'); await c.end();
