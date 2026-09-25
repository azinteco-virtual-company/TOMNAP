// Disposable PostgreSQL only. Run after canonical schema, all migrations,
// tests/sql/odemeler.sql and siparis-satirlari-concurrency.mjs. Proves the payment
// ledger under concurrency: two payments at once are both summed into the order
// (K20), a payment is reversed only once when two reversals race (K16), and the
// rollback refuses while payments exist. Commits synthetic orders and payments.
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
    'Payment ledger races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
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
  const check = session('odeme-check-' + randomUUID());
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
const tenant = 'odeme-race-' + suffix;
const patron = tenant + '-patron';
const finans = tenant + '-finans';
const pay = (order, amount, user = patron) =>
  `SELECT public.tomnap_v2_odeme_kaydet('${tenant}','${user}',jsonb_build_object('siparis_id','${order}','tutar_azn',${amount},'yontem','NAKIT','kaynak','BUTIK'));`;
const reverse = (payment, user) =>
  `SELECT public.tomnap_v2_odeme_ters_kayit('${tenant}','${user}','${payment}','Race reversal');`;
const summary = (order) =>
  query(`SELECT s.alinan_tutar || '|' || s.finans_durumu || '|' || (SELECT coalesce(sum(o.tutar_azn), 0) FROM public.odemeler o WHERE o.siparis_id = s.id)
    FROM public.siparisler s WHERE s.id = '${order}';`);

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Payment race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
      ('${patron}','${tenant}','Race patron','${patron}@race.fixture','PATRON','AKTIF'),
      ('${finans}','${tenant}','Race finans','${finans}@race.fixture','BAKU_FINANS','AKTIF');
    SELECT public.tomnap_v2_siparis_olustur('${tenant}','${patron}','{"musteri_adi":"Payment race"}'::jsonb,
      '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]'::jsonb);`);
  const order = await query(`SELECT id FROM public.siparisler WHERE tenant_id='${tenant}' AND model_surumu=2;`);

  // 1. Two payments at once: the second waits for the order row, then sees the first.
  const first = session(`odeme-first-${suffix}`);
  first.send(`BEGIN; SET LOCAL ROLE service_role; ${pay(order, 30)}`);
  await until(async () => (await state(`odeme-first-${suffix}`, "state='idle in transaction'")) === '1', 'the first payment did not hold its transaction');
  const second = session(`odeme-second-${suffix}`);
  second.end(`SET ROLE service_role; ${pay(order, 20, finans)}`);
  await until(async () => (await state(`odeme-second-${suffix}`, "wait_event_type='Lock'")) === '1', 'the second payment did not wait for the order');
  first.end('COMMIT;');
  for (const result of await Promise.all([first.done, second.done])) assert.equal(result.code, 0, result.stderr);
  assert.equal(await summary(order), '50.00|KISMI_ODEME|50.00');

  // 2. Eight payments at once, no waiting choreography: the order still sums all of them.
  const runs = Array.from({ length: 8 }, (_, i) => {
    const s = session(`odeme-many-${i}-${suffix}`);
    s.end(`SET ROLE service_role; ${pay(order, i + 1)}`);
    return s.done;
  });
  for (const result of await Promise.all(runs)) assert.equal(result.code, 0, result.stderr);
  assert.equal(await summary(order), '86.00|KISMI_ODEME|86.00');

  // 3. Two reversals of the same payment race: exactly one is written.
  const target = await query(`SELECT id FROM public.odemeler WHERE siparis_id='${order}' AND tutar_azn=30;`);
  const r1 = session(`odeme-rev1-${suffix}`);
  r1.send(`BEGIN; SET LOCAL ROLE service_role; ${reverse(target, finans)}`);
  await until(async () => (await state(`odeme-rev1-${suffix}`, "state='idle in transaction'")) === '1', 'the first reversal did not hold its transaction');
  const r2 = session(`odeme-rev2-${suffix}`);
  r2.end(`SET ROLE service_role; ${reverse(target, patron)}`);
  await until(async () => (await state(`odeme-rev2-${suffix}`, "wait_event_type='Lock'")) === '1', 'the second reversal did not wait');
  r1.end('COMMIT;');
  const [won, lost] = await Promise.all([r1.done, r2.done]);
  assert.equal(won.code, 0, won.stderr);
  assert.notEqual(lost.code, 0, 'a payment was reversed twice');
  assert.match(lost.stderr, /already reversed|odemeler_tek_ters_kayit/);
  assert.equal(await query(`SELECT count(*) FROM public.odemeler WHERE ters_kayit_odeme_id='${target}';`), '1');
  assert.equal(await summary(order), '56.00|KISMI_ODEME|56.00');

  // 4. With payments present, the rollback refuses and leaves the ledger in place.
  const rollback = session(`odeme-rollback-${suffix}`, ['-1', '-f', 'supabase/rollbacks/20260925110000_odemeler.down.sql']);
  rollback.end('');
  const refusedRollback = await rollback.done;
  assert.notEqual(refusedRollback.code, 0, 'the rollback ran although payments exist');
  assert.match(refusedRollback.stderr, /Rollback refused: payments exist/);
  assert.equal(await query(`SELECT count(*) FROM public.odemeler WHERE tenant_id='${tenant}';`), '11');
  console.log('4/4 real PostgreSQL payment ledger races passed (serialized sums, one reversal, guarded rollback).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
