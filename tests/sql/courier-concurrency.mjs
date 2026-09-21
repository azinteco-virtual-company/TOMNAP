// Disposable PostgreSQL only. Run after canonical schema and all migrations.
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
    'Courier races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
  );
const processes = new Set();
function connection(name) {
  const child = spawn(
    process.env.PSQL_BIN || 'psql',
    ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'],
    { env: { ...process.env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'] }
  );
  processes.add(child);
  let stdout = '',
    stderr = '';
  child.stdout.on('data', (data) => {
    stdout += data;
  });
  child.stderr.on('data', (data) => {
    stderr += data;
  });
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
async function query(sql) {
  const con = connection('courier-check-' + randomUUID());
  con.child.stdin.end(sql + '\n');
  const result = await con.done;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
async function until(check, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(message);
}
const output = (value) =>
  value
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));
const suffix = randomUUID().slice(0, 12);
const tenant = 'courier-race-' + suffix;
const c1 = tenant + '-c1',
  c2 = tenant + '-c2',
  u1 = tenant + '-u1',
  u2 = tenant + '-u2';
const deliver = (order) =>
  `SELECT public.tomnap_deliver_courier_order('${tenant}','${u1}','${order}',1,'Original recipient');`;
const assign = (order) => `SELECT public.tomnap_assign_courier('${tenant}','${order}','${c2}',1);`;
const unbind = () => `SELECT public.tomnap_bind_courier('${tenant}','${c1}',NULL,'${u1}');`;
const cargo = (order) =>
  `SELECT public.tomnap_update_cargo_order('${tenant}','${order}','BAKU_DAGITIM_ARKADAS',1,'','{"lojistik_durumu":"ULUSLARARASI_KARGO","kargo_notu":"Stale cargo update"}');`;
const operations = { deliver, assign, unbind, cargo };
async function race(firstAction, secondAction, ordinal) {
  const order = randomUUID();
  await query(`SET ROLE service_role;
    SELECT public.tomnap_bind_courier('${tenant}','${c1}','${u1}',NULL);
    INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,lojistik_durumu,toplam_tutar,alinan_tutar,baku_kurye_id,kurye_atama_surumu)
    VALUES('${order}','${tenant}','Synthetic','Customer','Parcel','BAKU_DAGITIM_ARKADAS',100,20,'${c1}',1);`);
  const first = connection(`courier-first-${suffix}-${ordinal}`);
  first.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; ${operations[firstAction](order)} SELECT 'FIRST_READY';\n`
  );
  await until(
    () => first.output().includes('FIRST_READY'),
    'First courier transaction did not become ready'
  );
  const secondName = `courier-second-${suffix}-${ordinal}`;
  const second = connection(secondName);
  second.child.stdin.end(`SET ROLE service_role; ${operations[secondAction](order)}\n`);
  await until(
    async () =>
      (await query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name='${secondName}' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0;`
      )) === '1',
    'Competing courier operation did not wait for the authority/assignment row lock'
  );
  // No delivery or reassignment is visible until the first transaction commits.
  assert.equal(
    await query(
      `SELECT lojistik_durumu::text || ':' || kurye_atama_surumu::text FROM public.siparisler WHERE id='${order}';`
    ),
    'BAKU_DAGITIM_ARKADAS:1'
  );
  first.child.stdin.end('COMMIT;\n');
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0, one.stderr);
  const shouldSucceed = firstAction === 'deliver' && ['deliver', 'unbind'].includes(secondAction);
  if (shouldSucceed) {
    assert.equal(two.code, 0, two.stderr);
    if (secondAction === 'deliver') {
      assert.equal(output(two.stdout)[0].tekrar, true);
      assert.deepEqual(output(one.stdout)[0].gorev, output(two.stdout)[0].gorev);
    }
  } else {
    assert.notEqual(two.code, 0);
    assert.match(
      two.stderr,
      secondAction === 'cargo' ? /40001/ : firstAction === 'deliver' ? /PT409/ : /PT404/
    );
  }
  const state = JSON.parse(
    await query(
      `SELECT jsonb_build_object('status',s.lojistik_durumu,'courier',s.baku_kurye_id,'version',s.kurye_atama_surumu,'paid',s.alinan_tutar,'recipient',s.kurye_teslim_alan,'deliveredBy',s.kurye_teslim_kullanici_id,'bound',(SELECT kullanici_id FROM public.kuryeler WHERE id='${c1}')) FROM public.siparisler s WHERE id='${order}';`
    )
  );
  assert.equal(state.paid, 20);
  assert.equal(state.status, firstAction === 'deliver' ? 'TESLIM_EDILDI' : 'BAKU_DAGITIM_ARKADAS');
  assert.equal(state.courier, firstAction === 'assign' ? c2 : c1);
  assert.equal(state.version, firstAction === 'assign' ? 2 : 1);
  assert.equal(state.recipient, firstAction === 'deliver' ? 'Original recipient' : null);
  assert.equal(state.deliveredBy, firstAction === 'deliver' ? u1 : null);
  assert.equal(state.bound, firstAction === 'unbind' || secondAction === 'unbind' ? null : u1);
}

async function cargoSettingsRace() {
  const record = (label) =>
    JSON.stringify({
      tenant_id: tenant,
      revision: 1,
      settings: { saglayici: label },
      // Synthetic envelope satisfying the schema; never sent to a provider.
      encrypted_credentials: `enc:v2:fixture:${'0'.repeat(24)}:${'0'.repeat(32)}:aa`,
    });
  const save = (label) => `SELECT public.save_cargo_settings('${record(label)}'::jsonb,0);`;
  const first = connection(`courier-settings-first-${suffix}`);
  first.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; ${save('FIRST')} SELECT 'SETTINGS_READY';\n`
  );
  await until(
    () => first.output().includes('SETTINGS_READY'),
    'First cargo settings save did not become ready'
  );
  const secondName = `courier-settings-second-${suffix}`;
  const second = connection(secondName);
  second.child.stdin.end(`SET ROLE service_role; ${save('SECOND')}\n`);
  await until(
    async () =>
      (await query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name='${secondName}' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid))>0;`
      )) === '1',
    'Competing initial cargo save did not wait for the tenant lock'
  );
  assert.equal(
    await query(`SELECT count(*) FROM public.cargo_settings WHERE tenant_id='${tenant}';`),
    '0'
  );
  first.child.stdin.end('COMMIT;\n');
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0, one.stderr);
  assert.notEqual(two.code, 0);
  assert.match(two.stderr, /40001/);
  assert.deepEqual(
    JSON.parse(
      await query(
        `SELECT jsonb_build_object('revision',revision,'provider',settings->>'saglayici') FROM public.cargo_settings WHERE tenant_id='${tenant}';`
      )
    ),
    { revision: 1, provider: 'FIRST' }
  );
}
try {
  await query(`INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Disposable courier race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
    ('${u1}','${tenant}','Courier one','${u1}@fixture.test','BAKU_KURYE','AKTIF'),
    ('${u2}','${tenant}','Courier two','${u2}@fixture.test','BAKU_KURYE','AKTIF');
    INSERT INTO public.kuryeler(id,tenant_id,ad_soyad,telefon,bolge,kullanici_id) VALUES
    ('${c1}','${tenant}','Courier one','','',NULL),('${c2}','${tenant}','Courier two','','','${u2}');`);
  await race('deliver', 'assign', 1);
  await race('assign', 'deliver', 2);
  await race('unbind', 'deliver', 3);
  await race('deliver', 'unbind', 4);
  await race('deliver', 'deliver', 5);
  await race('deliver', 'cargo', 6);
  await race('assign', 'cargo', 7);
  await cargoSettingsRace();
  console.log('8/8 real PostgreSQL courier, cargo order and cargo settings races passed.');
} finally {
  for (const child of processes) child.kill('SIGTERM');
  await query(
    `DELETE FROM public.siparisler WHERE tenant_id='${tenant}'; DELETE FROM public.kuryeler WHERE tenant_id='${tenant}'; DELETE FROM public.kullanicilar WHERE tenant_id='${tenant}'; DELETE FROM public.firmalar WHERE id='${tenant}';`
  );
}
