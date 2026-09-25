// Disposable PostgreSQL only. Run after canonical schema, all migrations and
// tests/sql/siparis-guncelle.sql. Proves the order edit RPC (Codex R3 F1/F2) under
// concurrency: a note edit based on a stale read never writes back the money of a
// payment or the AWB of an approval committed meanwhile, and a stale money or AWB
// edit is refused. Commits synthetic orders.
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
    'Order edit races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
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
  const check = session('duzenleme-check-' + randomUUID());
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
const tenant = 'duzenleme-race-' + suffix;
const user = tenant + '-patron';
const manifest = `{"dosyaAdi":"race.xlsx","sha256":"${'cd'.repeat(32)}"}`;
const hex = suffix.replace(/-/g, '').padEnd(12, '0').slice(0, 12);
const ORDER_1 = '76000000-0000-4000-8000-' + hex;
const ORDER_2 = '77000000-0000-4000-8000-' + hex;
const AWB = ('AWB' + hex.slice(0, 8)).toUpperCase();
const edit = (order, change, expected) =>
  `SELECT public.tomnap_siparis_guncelle('${tenant}','${order}','${JSON.stringify(change)}'::jsonb,'${JSON.stringify(expected)}'::jsonb);`;
const approve = (order, awb) =>
  `SELECT public.tomnap_approve_awb_matches('${tenant}','${user}','${manifest}'::jsonb,'[{"satirNo":1,"siparisId":"${order}","takipNo":"${awb}","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb);`;
// What the note editor read before the concurrent write committed.
const staleRead = { kurye_atama_surumu: 0, lojistik_durumu: 'ULUSLARARASI_KARGO' };
async function race(label, holderSql, waiterSql) {
  const holder = session(`duzenleme-${label}-1-${suffix}`);
  holder.send(`BEGIN; SET LOCAL ROLE service_role; ${holderSql}`);
  await until(async () => (await state(`duzenleme-${label}-1-${suffix}`, "state='idle in transaction'")) === '1', `${label}: the first write did not hold its transaction`);
  const waiter = session(`duzenleme-${label}-2-${suffix}`);
  waiter.end(`SET ROLE service_role; ${waiterSql}`);
  await until(async () => (await state(`duzenleme-${label}-2-${suffix}`, "wait_event_type='Lock'")) === '1', `${label}: the note edit did not wait for the order row`);
  holder.end('COMMIT;');
  return Promise.all([holder.done, waiter.done]);
}
const row = (order) =>
  query(`SELECT alinan_tutar || '|' || finans_durumu || '|' || coalesce(uluslararasi_kargo_kodu, '-') || '|' || baku_tahsilat_notu
    FROM public.siparisler WHERE id = '${order}';`);

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Edit race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES('${user}','${tenant}','Race patron','${user}@race.fixture','PATRON','AKTIF');
    INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,toplam_tutar,alinan_tutar,lojistik_durumu,baku_tahsilat_notu) VALUES
      ('${ORDER_1}','${tenant}','race','Edit race 1','Bag',100,0,'ULUSLARARASI_KARGO',''),
      ('${ORDER_2}','${tenant}','race','Edit race 2','Bag',100,0,'ULUSLARARASI_KARGO','');`);

  // 1. A payment holds the order; a note edit based on the stale read waits, then
  //    writes only the note: the payment survives.
  const [paid, noted] = await race(
    'odeme',
    edit(ORDER_1, { alinan_tutar: 60, finans_durumu: 'KISMI_ODEME' }, { ...staleRead, alinan_tutar: 0, toplam_tutar: 100 }),
    edit(ORDER_1, { baku_tahsilat_notu: 'Qapıda' }, staleRead)
  );
  assert.equal(paid.code, 0, paid.stderr);
  assert.equal(noted.code, 0, noted.stderr);
  assert.equal(await row(ORDER_1), '60.00|KISMI_ODEME|-|Qapıda');
  // A second payment still based on alinan_tutar = 0 is refused, nothing written.
  const stalePayment = session(`duzenleme-stale-odeme-${suffix}`);
  stalePayment.end(`SET ROLE service_role; ${edit(ORDER_1, { alinan_tutar: 100, finans_durumu: 'ODENDI' }, { ...staleRead, alinan_tutar: 0, toplam_tutar: 100 })}`);
  const refusedPayment = await stalePayment.done;
  assert.notEqual(refusedPayment.code, 0, 'a payment based on a stale amount was written');
  assert.match(refusedPayment.stderr, /Order changed meanwhile: alinan_tutar/);
  assert.equal(await row(ORDER_1), '60.00|KISMI_ODEME|-|Qapıda');

  // 2. An AWB approval holds the order; the note edit waits, then writes only the note:
  //    the AWB and the approval's extras survive.
  const [approved, noted2] = await race('awb', approve(ORDER_2, AWB), edit(ORDER_2, { baku_tahsilat_notu: 'Zəng edin' }, staleRead));
  assert.equal(approved.code, 0, approved.stderr);
  assert.equal(noted2.code, 0, noted2.stderr);
  assert.equal(await row(ORDER_2), `0.00|BEKLIYOR|${AWB}|Zəng edin`);
  assert.equal(await query(`SELECT ek_veriler ? 'guncellenme_tarihi' FROM public.siparisler WHERE id = '${ORDER_2}';`), 't');
  // An AWB edit still based on "no AWB" is refused.
  const staleAwb = session(`duzenleme-stale-awb-${suffix}`);
  staleAwb.end(`SET ROLE service_role; ${edit(ORDER_2, { uluslararasi_kargo_kodu: 'ELLE-1' }, { ...staleRead, uluslararasi_kargo_kodu: null })}`);
  const refusedAwb = await staleAwb.done;
  assert.notEqual(refusedAwb.code, 0, 'an AWB edit based on a stale read was written');
  assert.match(refusedAwb.stderr, /Order changed meanwhile: uluslararasi_kargo_kodu/);
  console.log('4/4 real PostgreSQL order edit races passed (note vs payment, note vs AWB approval, stale money and AWB refused).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
