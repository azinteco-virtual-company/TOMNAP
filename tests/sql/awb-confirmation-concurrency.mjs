// Disposable PostgreSQL only. Run after canonical schema and all migrations.
// Proves the per-tenant lock in tomnap_approve_awb_matches: concurrent
// approvals can neither put one AWB on two orders nor overwrite an AWB, and
// exactly one append-only approval row survives each race.
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
    'AWB confirmation races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
  );

const processes = new Set();
function session(name) {
  const child = spawn(process.env.PSQL_BIN || 'psql', ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...process.env, PGAPPNAME: name },
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
  return { done, send: (sql) => child.stdin.write(sql + '\n'), end: (sql) => child.stdin.end(sql + '\n') };
}
async function query(sql) {
  const check = session('awb-check-' + randomUUID());
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
const json = (stdout) => JSON.parse(stdout.split('\n').find((line) => line.startsWith('{')));
const state = (name, condition) =>
  query(`SELECT count(*) FROM pg_stat_activity WHERE application_name='${name}' AND ${condition};`);

const suffix = randomUUID().slice(0, 12);
const tenant = 'awb-race-' + suffix;
const user = tenant + '-owner';
const manifest = `{"dosyaAdi":"race.xlsx","sha256":"${'ab'.repeat(32)}"}`;
const confirm = (order, awb) =>
  `SELECT public.tomnap_approve_awb_matches('${tenant}','${user}','${manifest}'::jsonb,'[{"satirNo":1,"siparisId":"${order}","takipNo":"${awb}","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb);`;

async function race(label, firstOrder, firstAwb, secondOrder, secondAwb) {
  const nameA = `awb-race-a-${label}-${suffix}`;
  const nameB = `awb-race-b-${label}-${suffix}`;
  const a = session(nameA);
  a.send(`BEGIN; SET LOCAL ROLE service_role; ${confirm(firstOrder, firstAwb)}`);
  await until(async () => (await state(nameA, "state='idle in transaction'")) === '1', `${label}: first confirmation did not hold its transaction`);
  const b = session(nameB);
  b.end(`BEGIN; SET LOCAL ROLE service_role; ${confirm(secondOrder, secondAwb)} COMMIT;`);
  // The advisory lock must be the wait point: the list_revisions trigger also
  // serializes the UPDATEs, but only after the duplicate checks already ran.
  await until(
    async () => (await state(nameB, "wait_event_type='Lock' AND wait_event='advisory'")) === '1',
    `${label}: second confirmation did not wait for the tenant advisory lock`
  );
  a.end('COMMIT;');
  const [resultA, resultB] = await Promise.all([a.done, b.done]);
  assert.equal(resultA.code, 0, resultA.stderr);
  assert.equal(resultB.code, 0, resultB.stderr);
  return [json(resultA.stdout), json(resultB.stdout)];
}

try {
  const [one, two, three] = [randomUUID(), randomUUID(), randomUUID()];
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','AWB race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES('${user}','${tenant}','Race owner','${user}@race.fixture','PATRON','AKTIF');
    INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,lojistik_durumu) VALUES
      ('${one}','${tenant}','Synthetic','First','Parcel','KANADA_DEPO'),
      ('${two}','${tenant}','Synthetic','Second','Parcel','KANADA_DEPO'),
      ('${three}','${tenant}','Synthetic','Third','Parcel','KANADA_DEPO');`);

  const shared = `AWB-SHARED-${suffix}`.toUpperCase();
  const [sameAwbA, sameAwbB] = await race('same-awb', one, shared, two, shared);
  assert.equal(sameAwbA.basarili, true);
  assert.equal(sameAwbB.basarili, false);
  assert.equal(sameAwbB.reddedilenler[0].sebep, 'AWB_BASKA_SIPARISTE');
  assert.equal(
    await query(`SELECT count(*) FROM public.siparisler WHERE tenant_id='${tenant}' AND uluslararasi_kargo_kodu='${shared}';`),
    '1'
  );
  assert.equal(
    await query(`SELECT count(*) FROM public.awb_match_approvals WHERE tenant_id='${tenant}' AND awb='${shared}';`),
    '1'
  );

  const firstAwb = `AWB-FIRST-${suffix}`.toUpperCase();
  const secondAwb = `AWB-SECOND-${suffix}`.toUpperCase();
  const [sameOrderA, sameOrderB] = await race('same-order', three, firstAwb, three, secondAwb);
  assert.equal(sameOrderA.basarili, true);
  assert.equal(sameOrderB.basarili, false);
  assert.equal(sameOrderB.reddedilenler[0].sebep, 'MEVCUT_AWB');
  assert.equal(
    await query(`SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id='${three}';`),
    firstAwb
  );
  assert.equal(
    await query(`SELECT string_agg(awb, ',') FROM public.awb_match_approvals WHERE siparis_id='${three}';`),
    firstAwb
  );
  console.log('2/2 real PostgreSQL AWB approval races passed (no duplicate AWB, no overwrite, one log row each).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
