// Disposable PostgreSQL only. Run after canonical schema, all migrations and
// tests/sql/odeme-islem-anahtari.sql. Proves the payment operation key (Codex R3 F15)
// under concurrency: two requests of the same payment intent at once record one
// payment; the one that waited gets the first payment back. Commits synthetic data.
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
    'Payment key races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
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
  const check = session('anahtar-check-' + randomUUID());
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
const tenant = 'anahtar-race-' + suffix;
const patron = tenant + '-patron';
const key = randomUUID();
const pay = (order) =>
  `SELECT (r->>'tekrar') || '|' || (r->'odeme'->>'id') FROM public.tomnap_v2_odeme_kaydet('${tenant}','${patron}',jsonb_build_object('siparis_id','${order}','tutar_azn',30,'yontem','NAKIT','kaynak','BUTIK','islem_anahtari','${key}')) AS r;`;

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Key race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
      ('${patron}','${tenant}','Race patron','${patron}@race.fixture','PATRON','AKTIF');
    SELECT public.tomnap_v2_siparis_olustur('${tenant}','${patron}','{"musteri_adi":"Key race"}'::jsonb,
      '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]'::jsonb);`);
  const order = await query(`SELECT id FROM public.siparisler WHERE tenant_id='${tenant}' AND model_surumu=2;`);

  // The first request records and holds its transaction; the retry waits for the order
  // row, then finds the first payment by its key and records nothing.
  const first = session(`anahtar-first-${suffix}`);
  first.send(`BEGIN; SET LOCAL ROLE service_role; ${pay(order)}`);
  await until(async () => (await state(`anahtar-first-${suffix}`, "state='idle in transaction'")) === '1', 'the first request did not hold its transaction');
  const retry = session(`anahtar-retry-${suffix}`);
  retry.end(`SET ROLE service_role; ${pay(order)}`);
  await until(async () => (await state(`anahtar-retry-${suffix}`, "wait_event_type='Lock'")) === '1', 'the retry did not wait for the order');
  first.end('COMMIT;');
  const [a, b] = await Promise.all([first.done, retry.done]);
  assert.equal(a.code, 0, a.stderr);
  assert.equal(b.code, 0, b.stderr);
  const [firstTekrar, firstId] = a.stdout.trim().split('|');
  const [retryTekrar, retryId] = b.stdout.trim().split('|');
  assert.deepEqual([firstTekrar, retryTekrar], ['false', 'true']);
  assert.equal(retryId, firstId);
  assert.equal(await query(`SELECT count(*) || '|' || (SELECT alinan_tutar FROM public.siparisler WHERE id='${order}') FROM public.odemeler WHERE siparis_id='${order}';`), '1|30.00');
  console.log('1/1 real PostgreSQL payment key race passed (one payment, the retry gets it back).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
