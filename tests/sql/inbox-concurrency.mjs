// Real two-connection row-lock regression. Requires a disposable local PostgreSQL
// database with the canonical schema and phase 3 migration already applied.
// PGHOST=/tmp/... PGPORT=... PGDATABASE=tomnap_phase3 node tests/sql/inbox-concurrency.mjs
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const socketDatabase =
  process.env.PGHOST?.startsWith('/tmp/') &&
  /^tomnap_(?:phase\d+|test)/.test(process.env.PGDATABASE || '');
const ciDatabase =
  process.env.CI === 'true' &&
  ['localhost', '127.0.0.1'].includes(process.env.PGHOST || '') &&
  /^tomnap_test[a-zA-Z0-9_-]*$/.test(process.env.PGDATABASE || '');
if (!socketDatabase && !ciDatabase) {
  throw new Error(
    'This fixture test requires a disposable tomnap_ Unix-socket database, or CI=true with a localhost/127.0.0.1 tomnap_test database.'
  );
}
const binary = process.env.PSQL_BIN || 'psql';
const processes = new Set();
function connection(name) {
  const child = spawn(binary, ['-X', '-A', '-t', '-q', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...process.env, PGAPPNAME: name },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  processes.add(child);
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (value) => {
    stdout += value;
  });
  child.stderr.on('data', (value) => {
    stderr += value;
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
  const session = connection(`inbox-check-${randomUUID()}`);
  session.child.stdin.end(sql + '\n');
  const result = await session.done;
  assert.equal(result.code, 0, result.stderr);
  return result.stdout.trim();
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, message) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(20);
  }
  throw new Error(message);
}
const suffix = randomUUID().slice(0, 12);
const tenant = `inbox-race-${suffix}`;
const payload = (amount) =>
  JSON.stringify({
    tenant_id: tenant,
    musteri_adi: 'Concurrent customer',
    urun_aciklamasi: 'Concurrent bag',
    adet: 1,
    toplam_tutar: amount,
    alinan_tutar: 0,
    para_birimi: 'AZN',
    finans_durumu: 'BEKLIYOR',
    lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
    eksik_bilgiler: [],
    ai_guven_skoru: 0.95,
  });
const approve = (inbox, order, amount) =>
  `SELECT public.tomnap_approve_inbox('${tenant}','${inbox}','${order}','${payload(amount)}'::jsonb);`;
const reject = (inbox) => `SELECT public.tomnap_reject_inbox('${tenant}','${inbox}');`;
const results = (output) =>
  output
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line));

async function race(firstAction, secondAction, ordinal) {
  const inbox = `${tenant}-${ordinal}`;
  const order = randomUUID();
  await query(
    `INSERT INTO public.inbox_mesajlar(id,tenant_id,kaynak,gonderen_kullanici,konusma_gecmisi,durum,oneri_siparis) VALUES('${inbox}','${tenant}','WHATSAPP','Synthetic','Concurrent message','BEKLEMEDE','{}');`
  );
  const sql = (action, amount) =>
    action === 'approve' ? approve(inbox, order, amount) : reject(inbox);
  const first = connection(`inbox-first-${suffix}-${ordinal}`);
  const secondName = `inbox-second-${suffix}-${ordinal}`;
  first.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; ${sql(firstAction, 125)} SELECT 'FIRST_LOCK_HELD';\n`
  );
  await until(
    () => first.output().includes('FIRST_LOCK_HELD'),
    'First decision did not obtain the row lock'
  );
  const second = connection(secondName);
  second.child.stdin.end(`SET ROLE service_role; ${sql(secondAction, 999)}\n`);
  await until(
    async () =>
      (await query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name='${secondName}' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid)) > 0;`
      )) === '1',
    'The competing RPC did not wait on the row lock'
  );
  first.child.stdin.end('COMMIT;\n');
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0, one.stderr);
  const state = JSON.parse(
    await query(
      `SELECT jsonb_build_object('durum',(SELECT durum FROM public.inbox_mesajlar WHERE id='${inbox}'),'orders',(SELECT count(*) FROM public.siparisler WHERE id='${order}'));`
    )
  );
  if (firstAction === secondAction) {
    assert.equal(two.code, 0, two.stderr);
    assert.equal(results(one.stdout)[0].tekrar, false);
    assert.equal(results(two.stdout)[0].tekrar, true);
    if (firstAction === 'approve') {
      assert.deepEqual(results(one.stdout)[0].siparis, results(two.stdout)[0].siparis);
      assert.equal(Number(results(two.stdout)[0].siparis.toplam_tutar), 125);
      assert.deepEqual(state, { durum: 'ONAYLANDI', orders: 1 });
    } else assert.deepEqual(state, { durum: 'REDDEDILDI', orders: 0 });
  } else {
    assert.notEqual(two.code, 0);
    assert.match(two.stderr, /PT409/);
    assert.deepEqual(
      state,
      firstAction === 'approve'
        ? { durum: 'ONAYLANDI', orders: 1 }
        : { durum: 'REDDEDILDI', orders: 0 }
    );
  }
}

async function maintenanceApprovalRace() {
  const inbox = `${tenant}-maintenance`;
  const order = randomUUID();
  const operation = randomUUID();
  const originalRows = JSON.parse(
    await query(
      `SELECT coalesce(jsonb_agg(to_jsonb(s) - 'kalan_tutar'),'[]'::jsonb) FROM public.siparisler s WHERE tenant_id='${tenant}';`
    )
  );
  const restoredRow = {
    ...JSON.parse(payload(225)),
    id: order,
    ham_mesaj: 'Restored authoritative order',
  };
  const restoreBody = JSON.stringify([...originalRows, restoredRow]).replaceAll("'", "''");
  await query(
    `INSERT INTO public.inbox_mesajlar(id,tenant_id,kaynak,gonderen_kullanici,konusma_gecmisi,durum,oneri_siparis) VALUES('${inbox}','${tenant}','WHATSAPP','Synthetic','Before restore','BEKLEMEDE','{}');`
  );
  const approval = connection(`inbox-approval-${suffix}`);
  approval.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; ${approve(inbox, order, 125)} SELECT 'APPROVAL_READY';\n`
  );
  await until(
    () => approval.output().includes('APPROVAL_READY'),
    'Approval did not hold its transactional locks'
  );
  const maintenanceName = `inbox-restore-${suffix}`;
  const maintenance = connection(maintenanceName);
  maintenance.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; SELECT public.tomnap_restore_orders('${tenant}','${operation}','replace','${restoreBody}'::jsonb); SELECT 'RESTORE_READY';\n`
  );
  await until(
    async () =>
      (await query(
        `SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='${maintenanceName}' AND l.relation='public.inbox_mesajlar'::regclass AND l.mode='ExclusiveLock' AND NOT l.granted;`
      )) === '1',
    'Restore did not wait for the inbox lock before touching orders'
  );
  assert.equal(
    await query(
      `SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='${maintenanceName}' AND l.relation='public.siparisler'::regclass AND l.mode='ShareRowExclusiveLock' AND l.granted;`
    ),
    '0',
    'Restore acquired the order lock before the inbox lock'
  );
  // An uncommitted approval exposes neither half of its decision.
  assert.equal(await query(`SELECT count(*) FROM public.siparisler WHERE id='${order}';`), '0');
  assert.equal(
    await query(`SELECT durum FROM public.inbox_mesajlar WHERE id='${inbox}';`),
    'BEKLEMEDE'
  );
  approval.child.stdin.end('COMMIT;\n');
  const approved = await approval.done;
  assert.equal(approved.code, 0, approved.stderr);
  await until(
    () => maintenance.output().includes('RESTORE_READY'),
    'Restore did not complete after the approval committed'
  );
  const readState = async () =>
    JSON.parse(
      await query(
        `SELECT jsonb_build_object('status',i.durum,'linked',i.onaylanan_siparis_id::text,'amount',s.toplam_tutar,'orders',(SELECT count(*) FROM public.siparisler WHERE id='${order}'),'receipts',(SELECT count(*) FROM public.order_maintenance_operations WHERE operation_id='${operation}')) FROM public.inbox_mesajlar i JOIN public.siparisler s ON s.id='${order}' WHERE i.id='${inbox}';`
      )
    );
  // Restore's upsert and receipt are still invisible until its single commit.
  assert.deepEqual(await readState(), {
    status: 'ONAYLANDI',
    linked: order,
    amount: 125,
    orders: 1,
    receipts: 0,
  });
  maintenance.child.stdin.end('COMMIT;\n');
  const restored = await maintenance.done;
  assert.equal(restored.code, 0, restored.stderr);
  assert.deepEqual(await readState(), {
    status: 'ONAYLANDI',
    linked: order,
    amount: 225,
    orders: 1,
    receipts: 1,
  });
  // Replacing a retained order must not DELETE/reinsert and null its inbox FK.
  const replay = JSON.parse(await query(`SET ROLE service_role; ${approve(inbox, order, 999)}`));
  assert.equal(replay.tekrar, true);
  assert.equal(replay.siparis.id, order);
  assert.equal(Number(replay.siparis.toplam_tutar), 225);
}

async function invitationQuotaRace() {
  const invitations = [1, 2].map((n) => `${tenant}-invite-${n}`);
  const users = [1, 2].map((n) => ({
    id: `${tenant}-user-${n}`,
    ad_soyad: `Synthetic invitee ${n}`,
    email: `${tenant}-${n}@fixture.test`,
    telefon: '',
    sifre_hash: 'test-hash',
    rol: 'SUPER_ADMIN',
    tenant_id: 'all',
  }));
  await query(
    `UPDATE public.firmalar SET onay_durumu='AKTIF',rol_limitleri='{"BAKU_KURYE":1}'::jsonb WHERE id='${tenant}';
     INSERT INTO public.davetler(id,token,firma_id,rol,durum,son_kullanma_tarihi) VALUES
     ('${invitations[0]}','${invitations[0]}','${tenant}','BAKU_KURYE','AKTIF',now()+interval '1 hour'),
     ('${invitations[1]}','${invitations[1]}','${tenant}','BAKU_KURYE','AKTIF',now()+interval '1 hour');`
  );
  const accept = (n) =>
    `SELECT public.tomnap_accept_invite('${invitations[n]}','${JSON.stringify(users[n])}'::jsonb);`;
  const first = connection(`inbox-invite-first-${suffix}`);
  first.child.stdin.write(
    `BEGIN; SET LOCAL ROLE service_role; ${accept(0)} SELECT 'INVITATION_READY';\n`
  );
  await until(
    () => first.output().includes('INVITATION_READY'),
    'The first invitation did not acquire its quota slot'
  );
  const secondName = `inbox-invite-second-${suffix}`;
  const second = connection(secondName);
  second.child.stdin.end(`SET ROLE service_role; ${accept(1)}\n`);
  await until(
    async () =>
      (await query(
        `SELECT count(*) FROM pg_stat_activity WHERE application_name='${secondName}' AND wait_event_type='Lock' AND cardinality(pg_blocking_pids(pid)) > 0;`
      )) === '1',
    'The competing invitation did not wait on the company quota lock'
  );
  first.child.stdin.end('COMMIT;\n');
  const [one, two] = await Promise.all([first.done, second.done]);
  assert.equal(one.code, 0, one.stderr);
  assert.notEqual(two.code, 0);
  assert.match(two.stderr, /PT409/);
  const accepted = results(one.stdout)[0].user;
  assert.equal(accepted.rol, 'BAKU_KURYE');
  assert.equal(accepted.tenant_id, tenant);
  const final = JSON.parse(
    await query(
      `SELECT jsonb_build_object(
       'users',(SELECT count(*) FROM public.kullanicilar WHERE tenant_id='${tenant}'),
       'couriers',(SELECT count(*) FROM public.kullanicilar WHERE tenant_id='${tenant}' AND rol='BAKU_KURYE'),
       'first',(SELECT durum FROM public.davetler WHERE id='${invitations[0]}'),
       'second',(SELECT durum FROM public.davetler WHERE id='${invitations[1]}'),
       'recorded',(SELECT aktif_kullanici_sayilari->'BAKU_KURYE' FROM public.firmalar WHERE id='${tenant}'));`
    )
  );
  assert.deepEqual(final, {
    users: 1,
    couriers: 1,
    first: 'KULLANILDI',
    second: 'AKTIF',
    recorded: 1,
  });
}

try {
  await query(
    `INSERT INTO public.firmalar(id,ad) VALUES('${tenant}','Disposable inbox race company');`
  );
  await race('approve', 'approve', 1);
  await race('reject', 'approve', 2);
  await race('approve', 'reject', 3);
  await race('reject', 'reject', 4);
  await maintenanceApprovalRace();
  await invitationQuotaRace();
  console.log('6/6 real PostgreSQL inbox, maintenance and invitation quota races passed.');
} finally {
  for (const child of processes) child.kill('SIGTERM');
  // Only this random test tenant is removed; all fixture rows cascade.
  await query(
    `DELETE FROM public.inbox_mesajlar WHERE tenant_id='${tenant}'; DELETE FROM public.siparisler WHERE tenant_id='${tenant}'; DELETE FROM public.firmalar WHERE id='${tenant}';`
  );
}
