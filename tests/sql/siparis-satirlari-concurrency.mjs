// Disposable PostgreSQL only. Run after canonical schema, all migrations and
// tests/sql/siparis-satirlari.sql. Proves tomnap_v2_siparis_olustur under
// concurrency: an owner deactivated at the same time either stops the order or
// waits for it (FOR SHARE), concurrent orders never mix their lines, and the
// rollback refuses to run while v2 orders exist. Commits synthetic v2 orders.
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
    'Order line races require an isolated tomnap_ Unix-socket DB or CI localhost tomnap_test DB.'
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
  const check = session('satir-check-' + randomUUID());
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
const tenant = 'satir-race-' + suffix;
const patron = tenant + '-patron';
const salesA = tenant + '-sales-a';
const salesB = tenant + '-sales-b';
const line = (text, adet, price) =>
  `{"urun_aciklamasi":"${text}","adet":${adet},"birim_satis_fiyati_azn":${price},"kaynak_ulke":"CA"}`;
const create = (name, owner, lines) =>
  `SELECT public.tomnap_v2_siparis_olustur('${tenant}','${patron}','{"musteri_adi":"${name}","sahip_kullanici_id":"${owner}"}'::jsonb,'[${lines.join(',')}]'::jsonb);`;

try {
  await query(`SET ROLE service_role;
    INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('${tenant}','Order line race','AKTIF');
    INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
      ('${patron}','${tenant}','Race patron','${patron}@race.fixture','PATRON','AKTIF'),
      ('${salesA}','${tenant}','Race sales A','${salesA}@race.fixture','SATIS_SORUMLUSU','AKTIF'),
      ('${salesB}','${tenant}','Race sales B','${salesB}@race.fixture','SATIS_SORUMLUSU','AKTIF');`);

  // 1. The deactivation commits while the order waits for the owner's row: the order is refused.
  const deactivate = session(`satir-deactivate-${suffix}`);
  deactivate.send(`BEGIN; SET LOCAL ROLE service_role; UPDATE public.kullanicilar SET durum='PASIF' WHERE id='${salesA}';`);
  await until(async () => (await state(`satir-deactivate-${suffix}`, "state='idle in transaction'")) === '1', 'deactivation did not hold its transaction');
  const late = session(`satir-late-${suffix}`);
  late.end(`SET ROLE service_role; ${create('Late order', salesA, [line('late', 1, 10)])}`);
  await until(async () => (await state(`satir-late-${suffix}`, "wait_event_type='Lock'")) === '1', 'the order did not wait for the owner row');
  deactivate.end('COMMIT;');
  const [deactivated, refused] = await Promise.all([deactivate.done, late.done]);
  assert.equal(deactivated.code, 0, deactivated.stderr);
  assert.notEqual(refused.code, 0, 'an order for a deactivated owner was created');
  assert.match(refused.stderr, /Owner is not an active sales user/);
  assert.equal(await query(`SELECT count(*) FROM public.siparisler WHERE tenant_id='${tenant}' AND musteri_adi='Late order';`), '0');
  assert.equal(await query(`SELECT count(*) FROM public.siparis_satirlari WHERE tenant_id='${tenant}';`), '0');

  // 2. The order holds the owner's row first: the deactivation waits until it commits.
  const first = session(`satir-first-${suffix}`);
  first.send(`BEGIN; SET LOCAL ROLE service_role; ${create('Held order', salesB, [line('held', 2, 5)])}`);
  await until(async () => (await state(`satir-first-${suffix}`, "state='idle in transaction'")) === '1', 'the order did not hold its transaction');
  const blocked = session(`satir-blocked-${suffix}`);
  blocked.end(`SET ROLE service_role; UPDATE public.kullanicilar SET durum='PASIF' WHERE id='${salesB}';`);
  await until(async () => (await state(`satir-blocked-${suffix}`, "wait_event_type='Lock'")) === '1', 'the deactivation did not wait for the order');
  first.end('COMMIT;');
  const [held, afterwards] = await Promise.all([first.done, blocked.done]);
  assert.equal(held.code, 0, held.stderr);
  assert.equal(afterwards.code, 0, afterwards.stderr);
  assert.equal(
    await query(`SELECT sahip_kullanici_id || ':' || toplam_tutar FROM public.siparisler WHERE tenant_id='${tenant}' AND musteri_adi='Held order';`),
    `${salesB}:10.00`
  );

  // 3. Eight orders at once, each with its own lines and totals.
  const runs = Array.from({ length: 8 }, (_, i) => {
    const s = session(`satir-many-${i}-${suffix}`);
    s.end(`SET ROLE service_role; ${create(`Many ${i}`, patron, [line(`m${i}-a`, i + 1, 10), line(`m${i}-b`, 1, i)])}`);
    return s.done;
  });
  for (const result of await Promise.all(runs)) assert.equal(result.code, 0, result.stderr);
  const rows = (
    await query(`SELECT s.musteri_adi || '|' || s.toplam_tutar || '|' || s.adet || '|' || string_agg(l.urun_aciklamasi, ',' ORDER BY l.sira)
      FROM public.siparisler s JOIN public.siparis_satirlari l ON l.siparis_id = s.id AND l.tenant_id = s.tenant_id
      WHERE s.tenant_id='${tenant}' AND s.musteri_adi LIKE 'Many %' GROUP BY s.id ORDER BY s.musteri_adi;`)
  ).split('\n');
  assert.deepEqual(
    rows,
    Array.from({ length: 8 }, (_, i) => `Many ${i}|${((i + 1) * 10 + i).toFixed(2)}|${i + 2}|m${i}-a,m${i}-b`)
  );

  // 4. With v2 orders present, the rollback refuses and leaves everything in place.
  const rollback = session(`satir-rollback-${suffix}`, ['-1', '-f', 'supabase/rollbacks/20260924150000_siparis_satirlari.down.sql']);
  rollback.end('');
  const refusedRollback = await rollback.done;
  assert.notEqual(refusedRollback.code, 0, 'the rollback ran although v2 orders exist');
  assert.match(refusedRollback.stderr, /Rollback refused: v2 orders exist/);
  assert.equal(await query(`SELECT to_regclass('public.siparis_satirlari') IS NOT NULL;`), 't');
  assert.equal(await query(`SELECT count(*) FROM public.siparisler WHERE tenant_id='${tenant}' AND model_surumu=2;`), '9');
  console.log('4/4 real PostgreSQL order line races passed (owner lock both ways, no mixed lines, guarded rollback).');
} finally {
  for (const child of processes) child.kill('SIGTERM');
}
