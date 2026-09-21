// Real independent connections, synthetic tenants only. No live Supabase calls.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const local =
  process.env.PGHOST?.startsWith('/tmp/') &&
  /^tomnap_(?:phase\d+|test)/.test(process.env.PGDATABASE || '');
const ci =
  process.env.CI === 'true' &&
  ['localhost', '127.0.0.1'].includes(process.env.PGHOST || '') &&
  /^tomnap_test[a-zA-Z0-9_-]*$/.test(process.env.PGDATABASE || '');
if (!local && !ci)
  throw new Error(
    'Only disposable tomnap_ Unix-socket databases, or CI localhost tomnap_test databases, are allowed.'
  );
const binary = process.env.PSQL_BIN || 'psql';
const processes = new Set();
function connection() {
  const child = spawn(binary, ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  processes.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => (stdout += data));
  child.stderr.on('data', (data) => (stderr += data));
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) => {
      processes.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
  child.stdin.write('\\set VERBOSITY verbose\n');
  return { child, done, output: () => stdout };
}
async function query(sql, expected = 0) {
  const c = connection();
  c.child.stdin.end(sql + '\n');
  const r = await c.done;
  assert.equal(r.code, expected, r.stderr);
  return r;
}
const json = (r) =>
  JSON.parse(
    r.stdout
      .trim()
      .split('\n')
      .find((line) => line.startsWith('{'))
  );
async function until(check) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Reader did not reach its deterministic barrier.');
}
const suffix = randomUUID().slice(0, 12);
const tenant = `pagination-race-${suffix}`;
const other = `pagination-other-${suffix}`;
const a = randomUUID(),
  b = randomUUID(),
  c = randomUUID();
try {
  await query(`INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Synthetic','AKTIF'),('${other}','Synthetic','AKTIF');
    INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,toplam_tutar) VALUES('${a}','${tenant}','synthetic','One','Item',10),('${b}','${tenant}','synthetic','Two','Item',10),('${c}','${other}','synthetic','Other','Item',10);`);
  const reader = connection();
  reader.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; SELECT public.tomnap_list_page('${tenant}','siparisler',1); SELECT 'PAGE_READY';\n`
  );
  await until(() => reader.output().includes('PAGE_READY'));
  const first = json({ stdout: reader.output() });
  assert.equal(first.total, 2);
  // The writer commits after the reader's first page, on a different connection.
  await query(
    `SET ROLE service_role; UPDATE public.siparisler SET toplam_tutar=20 WHERE id='${b}';`
  );
  reader.child.stdin.end(
    `SELECT public.tomnap_list_page('${tenant}','siparisler',1,'${first.items[0].id}','${first.revision}'); COMMIT;\n`
  );
  const stale = await reader.done;
  assert.notEqual(stale.code, 0);
  assert.match(stale.stderr, /PT409/);
  console.log('PASS orders: committed concurrent write rejects old cursor');

  const crm = json(
    await query(`SET ROLE service_role; SELECT public.tomnap_customer_snapshot('${tenant}');`)
  );
  await query(
    `SET ROLE service_role; UPDATE public.siparisler SET alinan_tutar=5 WHERE id='${a}';`
  );
  const crmStale = await query(
    `SET ROLE service_role; SELECT public.tomnap_customer_snapshot('${tenant}','${crm.revision}');`,
    3
  );
  assert.match(crmStale.stderr, /PT409/);
  console.log('PASS CRM: concurrent payment cannot mix customer financial totals');

  const own = json(
    await query(
      `SET ROLE service_role; SELECT public.tomnap_list_page('${tenant}','siparisler',1);`
    )
  );
  const all = json(
    await query("SET ROLE service_role; SELECT public.tomnap_list_page('all','siparisler',1);")
  );
  await query(
    `SET ROLE service_role; UPDATE public.siparisler SET toplam_tutar=30 WHERE id='${c}';`
  );
  const ownNext = json(
    await query(
      `SET ROLE service_role; SELECT public.tomnap_list_page('${tenant}','siparisler',1,'${own.items[0].id}','${own.revision}');`
    )
  );
  assert.equal(ownNext.revision, own.revision);
  const allStale = await query(
    `SET ROLE service_role; SELECT public.tomnap_list_page('all','siparisler',1,NULL,'${all.revision}');`,
    3
  );
  assert.match(allStale.stderr, /PT409/);
  console.log('PASS scope: unrelated tenant write keeps own cursor but invalidates all');

  const beforeRollback = json(
    await query(
      `SET ROLE service_role; SELECT public.tomnap_list_page('${tenant}','siparisler',1);`
    )
  );
  await query(
    `BEGIN; SET LOCAL ROLE service_role; UPDATE public.siparisler SET toplam_tutar=999 WHERE id='${a}'; ROLLBACK;`
  );
  const afterRollback = json(
    await query(
      `SET ROLE service_role; SELECT public.tomnap_list_page('${tenant}','siparisler',1,NULL,'${beforeRollback.revision}');`
    )
  );
  assert.equal(afterRollback.revision, beforeRollback.revision);
  assert.equal(afterRollback.total, 2);
  console.log('PASS rollback: aborted concurrent write preserves cursor validity');
} finally {
  for (const child of processes) child.kill('SIGTERM');
  await query(
    `DELETE FROM public.siparisler WHERE tenant_id IN ('${tenant}','${other}'); DELETE FROM public.firmalar WHERE id IN ('${tenant}','${other}'); DELETE FROM public.list_revisions WHERE scope IN ('tenant:${tenant}','tenant:${other}');`
  );
}
