// Disposable PostgreSQL only. Run after canonical schema, all migrations and
// tests/sql/v2-asama-koprusu.sql. Proves the v2 stage bridge (20260927100000) under
// concurrency: two users advance the same order from the same stage at once; the order
// row lock makes the second wait, then its expected stage no longer matches (PT409).
// The order moves exactly one stage. Commits synthetic data.
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
    'Stage bridge races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
  );

const processes = new Set();
function session(name, args = []) {
  const child = spawn(
    process.env.PSQL_BIN || 'psql',
    ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...args],
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
  const check = session('asama-check-' + randomUUID());
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
const tenant = 'asama-race-' + suffix;
const patron = tenant + '-patron';
const kanada = tenant + '-kanada';
const step = (user, order) =>
  `SELECT r->'siparis'->>'lojistik_durumu' FROM public.tomnap_v2_asama_ilerlet('${tenant}','${user}','${order}','KANADA_SATINALIM_BEKLIYOR') AS r;`;

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Stage race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
      ('${patron}','${tenant}','Race patron','${patron}@race.fixture','PATRON','AKTIF'),
      ('${kanada}','${tenant}','Race buyer','${kanada}@race.fixture','KANADA_SATINALMA','AKTIF');
    SELECT public.tomnap_v2_siparis_olustur('${tenant}','${patron}','{"musteri_adi":"Stage race"}'::jsonb,
      '[{"urun_aciklamasi":"Canta","adet":1,"birim_satis_fiyati_azn":10,"kaynak_ulke":"CA"}]'::jsonb);`);
  const order = await query(`SELECT id FROM public.siparisler WHERE tenant_id='${tenant}' AND model_surumu=2;`);

  // The first step holds its transaction; the second waits for the order row, then
  // finds the stage moved and refuses.
  const first = session(`asama-first-${suffix}`);
  first.send(`BEGIN; SET LOCAL ROLE service_role; ${step(patron, order)}`);
  await until(async () => (await state(`asama-first-${suffix}`, "state='idle in transaction'")) === '1', 'the first step did not hold its transaction');
  const second = session(`asama-second-${suffix}`);
  second.end(`SET ROLE service_role; ${step(kanada, order)}`);
  await until(async () => (await state(`asama-second-${suffix}`, "wait_event_type='Lock'")) === '1', 'the second step did not wait for the order');
  first.end('COMMIT;');
  const [a, b] = await Promise.all([first.done, second.done]);
  assert.equal(a.code, 0, a.stderr);
  assert.equal(a.stdout.trim(), 'KANADA_DEPO');
  assert.notEqual(b.code, 0, 'the second step succeeded');
  assert.match(b.stderr, /PT409/);
  assert.equal(
    await query(`SELECT lojistik_durumu || '|' || jsonb_array_length(ek_veriler->'islem_gecmisi') FROM public.siparisler WHERE id='${order}';`),
    'KANADA_DEPO|1'
  );
  console.log('1/1 real PostgreSQL stage bridge race passed (one step, the other 409).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
