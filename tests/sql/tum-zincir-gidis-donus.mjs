// Disposable PostgreSQL only. Run right after the canonical schema and all migrations,
// before any test commits v2 data (the ledger rollbacks refuse while data exists).
// Codex R3 F17: the whole rollback chain, in the order docs/DEPLOY_1.md gives (section
// "e) Geri alma"), then every migration again. Proves that
//   1. the documented order runs as one transaction and leaves nothing that a rolled
//      back migration created (no function, table, index or column);
//   2. re-applying the migrations gives back exactly the schema it started from
//      (functions and their bodies, grants, tables, columns, indexes, triggers,
//      constraints, policies);
//   3. DEPLOY_1's read-only status query answers true for every row afterwards.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const local =
  process.env.PGHOST?.startsWith('/tmp/') &&
  /^tomnap_(?:phase\d+|test)/.test(process.env.PGDATABASE || '');
const ci =
  process.env.CI === 'true' &&
  ['localhost', '127.0.0.1'].includes(process.env.PGHOST || '') &&
  /^tomnap_test[a-zA-Z0-9_-]*$/.test(process.env.PGDATABASE || '');
if (!local && !ci)
  throw new Error('The rollback chain test requires an isolated tomnap_ DB (local socket or CI).');

function psql(args, input) {
  const result = spawnSync(
    process.env.PSQL_BIN || 'psql',
    ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...args],
    { input, encoding: 'utf8' }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

// The rollback order as DEPLOY_1 documents it: every down file named in section e),
// in the order of first mention.
const deploy = fs.readFileSync('docs/DEPLOY_1.md', 'utf8');
const section = deploy.slice(deploy.indexOf('## e) Geri alma'), deploy.indexOf('## Çıkış sırası'));
assert.ok(section.length > 100, 'DEPLOY_1 has no "e) Geri alma" section');
const order = [
  ...new Set([...section.matchAll(/(\d{14}_[a-z0-9_]+)\.down\.sql/g)].map((m) => m[1])),
];
const rollbacks = fs
  .readdirSync('supabase/rollbacks')
  .filter((f) => f.endsWith('.down.sql'))
  .map((f) => f.replace('.down.sql', ''))
  .sort();
assert.deepEqual([...order].sort(), rollbacks, 'DEPLOY_1 must name every down file exactly once');

// What each rolled-back migration created (plain CREATE, not OR REPLACE; ADD COLUMN).
const created = { functions: new Set(), tables: new Set(), indexes: new Set(), columns: new Set() };
for (const name of order) {
  const sql = fs.readFileSync(path.join('supabase/migrations', name + '.sql'), 'utf8');
  for (const m of sql.matchAll(/\bCREATE FUNCTION public\.(\w+)\s*\(/g))
    created.functions.add(m[1]);
  for (const m of sql.matchAll(/\bCREATE TABLE (?:IF NOT EXISTS )?public\.(\w+)/g))
    created.tables.add(m[1]);
  for (const m of sql.matchAll(/\bCREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+)/g))
    created.indexes.add(m[1]);
  for (const stmt of sql.matchAll(/\bALTER TABLE (?:IF EXISTS )?public\.(\w+)([^;]*);/g))
    for (const col of stmt[2].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?(\w+)/g))
      if (!created.tables.has(stmt[1])) created.columns.add(`${stmt[1]}.${col[1]}`);
}

const snapshot = () =>
  psql(
    [],
    `SELECT md5(string_agg(x, E'\\n' ORDER BY x COLLATE "C")) || '|' || count(*) FROM (
    SELECT 'f:' || p.oid::regprocedure::text || ':' || md5(p.prosrc) || ':' || coalesce(array_to_string(p.proacl, ','), '')
           || ':' || coalesce(array_to_string(p.proconfig, ','), '') || ':' || p.prosecdef || ':' || p.provolatile::text
      FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
    UNION ALL SELECT 'r:' || c.relname || ':' || c.relkind::text || ':' || coalesce(array_to_string(c.relacl, ','), '')
           || ':' || c.relrowsecurity || ':' || c.relforcerowsecurity
      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'a:' || c.relname || '.' || a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull
           || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') || ':' || coalesce(array_to_string(a.attacl, ','), '')
      FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
    UNION ALL SELECT 't:' || t.tgname || ':' || pg_get_triggerdef(t.oid)
      FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relnamespace = 'public'::regnamespace AND NOT t.tgisinternal
    UNION ALL SELECT 'i:' || pg_get_indexdef(i.indexrelid)
      FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid WHERE c.relnamespace = 'public'::regnamespace
    UNION ALL SELECT 'c:' || conrelid::regclass::text || '.' || conname || ':' || pg_get_constraintdef(oid)
      FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    UNION ALL SELECT 'p:' || polrelid::regclass::text || '.' || polname || ':' || polcmd::text || ':' || coalesce(pg_get_expr(polqual, polrelid), '')
      FROM pg_policy
  ) s(x);`
  );

const before = snapshot();

// 1. The whole documented chain in one transaction, then: nothing it rolled back is left.
const chain = [
  'BEGIN;',
  ...order.map((n) => `\\ir supabase/rollbacks/${n}.down.sql`),
  'COMMIT;',
].join('\n');
psql([], chain);
const left = psql(
  [],
  `SELECT string_agg(x, ', ' ORDER BY x COLLATE "C") FROM (
    SELECT 'function ' || proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
       AND proname = ANY (ARRAY[${[...created.functions].map((f) => `'${f}'`).join(',') || "''"}]::name[])
    UNION ALL SELECT 'relation ' || relname FROM pg_class WHERE relnamespace = 'public'::regnamespace
       AND relname = ANY (ARRAY[${[...created.tables, ...created.indexes].map((t) => `'${t}'`).join(',') || "''"}]::name[])
    UNION ALL SELECT 'column ' || c.relname || '.' || a.attname FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
       AND c.relname || '.' || a.attname = ANY (ARRAY[${[...created.columns].map((c) => `'${c}'`).join(',') || "''"}])
  ) s(x);`
);
assert.equal(left, '', `The documented rollback order leaves objects behind: ${left}`);

// 2. Every rolled-back migration again, oldest first: the schema is exactly as before.
for (const name of [...order].sort()) psql(['-f', path.join('supabase/migrations', name + '.sql')]);
assert.equal(snapshot(), before, 'down -> up of the whole chain changed the schema');

// 3. DEPLOY_1's read-only status query: every row true.
const status = deploy.slice(deploy.indexOf('### Salt okunur kontrol'));
const query = status.slice(
  status.indexOf('```sql') + 6,
  status.indexOf('```', status.indexOf('```sql') + 6)
);
const rows = psql(['-c', 'begin transaction read only', '-f', '-', '-c', 'rollback'], query)
  .split('\n')
  .filter((line) => /\|[tf]$/.test(line));
const falses = rows.filter((line) => line.endsWith('|f'));
assert.ok(rows.length > order.length, 'the status query returned too few rows');
assert.deepEqual(falses, [], 'status query rows not true after the round trip');
console.log(
  `whole rollback chain passed: ${order.length} down files in the documented order, ` +
    `${created.functions.size + created.tables.size + created.indexes.size + created.columns.size} created objects gone, ` +
    `schema identical after up (${before.split('|')[1]} catalog entries), ${rows.length} status rows true.`
);
