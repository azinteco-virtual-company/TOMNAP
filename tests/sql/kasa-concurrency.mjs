// Disposable PostgreSQL only. Run after canonical schema, all migrations,
// tests/sql/kasa-teslimleri.sql and odemeler-concurrency.mjs. Proves the cash desk
// under concurrency: the same collections are handed over once, a hand-over and a
// reversal of the same payment never both succeed (either order), and the rollback
// refuses while hand-overs exist. Commits synthetic orders, payments and hand-overs.
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
    'Cash desk races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
  );

const processes = new Set();
function session(name, args = []) {
  const child = spawn(
    process.env.PSQL_BIN || 'psql',
    ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', ...args],
    { env: { ...process.env, PGAPPNAME: name }, stdio: ['pipe', 'pipe', 'pipe'] }
  );
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
  return { done, send: (sql) => child.stdin.write(sql + '\n'), end: (sql) => child.stdin.end(sql + '\n') };
}
async function query(sql) {
  const check = session('kasa-check-' + randomUUID());
  check.end(sql);
  const result = await check.done;
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
const state = (name, condition) =>
  query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND ${condition};`);

const suffix = randomUUID().slice(0, 12);
const tenant = 'kasa-race-' + suffix;
const patron = tenant + '-patron';
const finans = tenant + '-finans';
const kurye = tenant + '-kurye';
const line = '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]';
const handover = (ids, amount, user = finans) =>
  `SELECT public.tomnap_v2_kasa_teslimi('${tenant}','${user}','${kurye}',ARRAY[${ids.map((id) => `'${id}'`).join(',')}]::uuid[],${amount},'Race');`;
const reverse = (payment) =>
  `SELECT public.tomnap_v2_odeme_ters_kayit('${tenant}','${patron}','${payment}','Race reversal');`;
async function race(name, holderSql, waiterSql) {
  const holder = session(`kasa-${name}-1-${suffix}`);
  holder.send(`BEGIN; SET LOCAL ROLE service_role; ${holderSql}`);
  await until(async () => (await state(`kasa-${name}-1-${suffix}`, "state='idle in transaction'")) === '1', `${name}: the first did not hold its transaction`);
  const waiter = session(`kasa-${name}-2-${suffix}`);
  waiter.end(`SET ROLE service_role; ${waiterSql}`);
  await until(async () => (await state(`kasa-${name}-2-${suffix}`, "wait_event_type='Lock'")) === '1', `${name}: the second did not wait`);
  holder.end('COMMIT;');
  return Promise.all([holder.done, waiter.done]);
}

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Cash race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
      ('${patron}','${tenant}','Race patron','${patron}@race.fixture','PATRON','AKTIF'),
      ('${finans}','${tenant}','Race finans','${finans}@race.fixture','BAKU_FINANS','AKTIF'),
      ('${kurye}','${tenant}','Race kurye','${kurye}@race.fixture','BAKU_KURYE','AKTIF');
    INSERT INTO public.kuryeler(id,tenant_id,ad_soyad,telefon,bolge,aktif,kullanici_id)
      VALUES('${tenant}-k','${tenant}','Race kurye','1','Baku',true,'${kurye}');
    SELECT public.tomnap_v2_siparis_olustur('${tenant}','${patron}',jsonb_build_object('musteri_adi','R'||i),'${line}'::jsonb) FROM generate_series(1,3) i;
    UPDATE public.siparisler SET baku_kurye_id='${tenant}-k', lojistik_durumu='BAKU_DAGITIM_ARKADAS' WHERE tenant_id='${tenant}';
    SELECT public.tomnap_v2_kurye_tahsilati('${tenant}','${kurye}',s.id,(10 * row_number() OVER (ORDER BY s.musteri_adi))::numeric)
      FROM public.siparisler s WHERE s.tenant_id='${tenant}';`);
  const payment = (amount) =>
    query(`SELECT id FROM public.odemeler WHERE tenant_id='${tenant}' AND tutar_azn=${amount};`);
  const [p10, p20, p30] = [await payment(10), await payment(20), await payment(30)];

  // 1. The same collection handed over twice at once: one hand-over.
  const [first, second] = await race('double', handover([p10], 10), handover([p10], 10, patron));
  assert.equal(first.code, 0, first.stderr);
  assert.notEqual(second.code, 0, 'a collection was handed over twice');
  assert.match(second.stderr, /not open cash/);
  assert.equal(await query(`SELECT count(*) FROM public.kasa_teslimleri WHERE tenant_id='${tenant}';`), '1');

  // 2. A hand-over holds the payment; the reversal waits, then finds it handed over.
  const [held, lateReversal] = await race('hand-first', handover([p20], 20), reverse(p20));
  assert.equal(held.code, 0, held.stderr);
  assert.notEqual(lateReversal.code, 0, 'handed-over cash was reversed');
  assert.match(lateReversal.stderr, /handed over/);

  // 3. A reversal holds the payment; the hand-over waits, then finds it reversed.
  const [reversal, lateHandover] = await race('reverse-first', reverse(p30), handover([p30], 30));
  assert.equal(reversal.code, 0, reversal.stderr);
  assert.notEqual(lateHandover.code, 0, 'reversed cash was handed over');
  assert.match(lateHandover.stderr, /not open cash/);

  // Balance = Σ cash − Σ hand-overs = Σ open collections = 0.
  assert.equal(
    await query(`SELECT (b->>'tahsilat_toplami')::numeric - (b->>'teslim_toplami')::numeric || '|' || jsonb_array_length(b->'acik_tahsilatlar')
      FROM jsonb_array_elements(public.tomnap_v2_kurye_bakiyeleri('${tenant}')) b;`),
    '0.00|0'
  );

  // 4. With hand-overs present, the rollback refuses and leaves everything in place.
  const rollback = session(`kasa-rollback-${suffix}`, ['-1', '-f', 'supabase/rollbacks/20260925120000_kasa_teslimleri.down.sql']);
  rollback.end('');
  const refusedRollback = await rollback.done;
  assert.notEqual(refusedRollback.code, 0, 'the rollback ran although hand-overs exist');
  assert.match(refusedRollback.stderr, /Rollback refused: cash hand-overs exist/);
  assert.equal(await query(`SELECT count(*) FROM public.kasa_teslimleri WHERE tenant_id='${tenant}';`), '2');
  console.log('4/4 real PostgreSQL cash desk races passed (one hand-over, hand-over vs reversal both ways, guarded rollback).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
