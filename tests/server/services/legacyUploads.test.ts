import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyLegacyUploads,
  planLegacyUploads,
  readDatabaseUploadSnapshot,
  readUploadSnapshot,
  sha256,
  type LegacyUploadManifest,
  type UploadSnapshot,
} from '../../../src/server/services/legacyUploads';
import {
  tenantImageFilename,
  tenantImagePrefix,
} from '../../../src/server/services/tenantImageNames';
import { legacyUploadsMain } from '../../../scripts/plan-legacy-uploads';

const root = fs.realpathSync(process.env.DATA_DIR!);
const source = path.join(root, 'legacy');
const destination = path.join(root, 'private-uploads');
const snapshotPath = path.join(root, 'offline-snapshot.json');
const manifestPath = path.join(root, 'manifest.json');
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const imageName = 'legacy image.png';
const url = '/uploads/legacy%20image.png';
const options = () => ({
  sourceDirectory: source,
  destinationDirectory: destination,
  snapshotPath,
});
const snapshot = (): UploadSnapshot => ({
  schemaVersion: 1,
  companies: [
    { id: 'tenant-a', onay_durumu: 'AKTIF' },
    { id: 'tenant-b', onay_durumu: 'AKTIF' },
  ],
  orders: [
    {
      id: 'order-a',
      tenant_id: 'tenant-a',
      musteri_adi: 'Synthetic',
      gorsel_urlleri: [url],
      ek_veriler: { kanada_fatura_gorseli: '/api' + url },
      eksik_bilgiler: [
        'META:urunler=' + JSON.stringify([{ urun_gorseli: url }]).replaceAll('/', '\\/'),
      ],
      ham_mesaj: `Ə test ${url}?size=3 and ${url}`,
      external: `https://external.example${url}`,
    },
    { id: 'order-b', tenant_id: 'tenant-b', gorsel_urlleri: [url] },
  ],
  inbox: [{ id: 'inbox-a', tenant_id: 'tenant-a', oneri_siparis: { gorsel_urlleri: [url] } }],
});
function plan(value = snapshot()): LegacyUploadManifest {
  fs.writeFileSync(snapshotPath, JSON.stringify(value));
  return planLegacyUploads({
    sourceDirectory: source,
    snapshot: value,
    source: {
      kind: 'file',
      path: snapshotPath,
      snapshotHash: readUploadSnapshot(snapshotPath).bytesHash,
    },
  });
}
function approve(manifest: LegacyUploadManifest, tenants = ['tenant-a']) {
  manifest.mappings = tenants.map((tenantId) => ({
    sourceName: imageName,
    sourceSha256: sha256(png),
    tenantId,
  }));
  return manifest;
}
function destinationName(manifest: LegacyUploadManifest, tenant = 'tenant-a') {
  const nonce = sha256(`${manifest.operationId}\0${tenant}\0${sha256(png)}\0${imageName}`).slice(
    0,
    32
  );
  return tenantImageFilename(tenant, 'png', nonce);
}
const committed = () => readUploadSnapshot(snapshotPath).snapshot;
beforeEach(() => {
  vi.restoreAllMocks();
  for (const name of fs.readdirSync(root))
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, imageName), png);
});

describe('reviewable legacy image inventory', () => {
  it('lists SHA/magic and exact nested, inbox and escaped META references without guessing owners', () => {
    const manifest = plan();
    expect(manifest.mappings).toEqual([]);
    expect(manifest.files[0]).toMatchObject({
      name: imageName,
      sha256: sha256(png),
      mime: 'image/png',
      status: 'supported',
    });
    expect(
      manifest.records.map((record) => [record.table, record.id, record.references.length])
    ).toEqual([
      ['siparisler', 'order-a', 5],
      ['siparisler', 'order-b', 1],
      ['inbox_mesajlar', 'inbox-a', 1],
    ]);
    expect(
      manifest.records[0].references.some((reference) => reference.sourceUrl.includes('\\/'))
    ).toBe(true);
    expect(
      manifest.records[0].references.some((reference) => reference.path[0] === 'external')
    ).toBe(false);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('reports SVG and symlinks without reading or activating them', () => {
    fs.writeFileSync(path.join(source, 'legacy.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    fs.symlinkSync(path.join(source, imageName), path.join(source, 'linked.png'));
    const manifest = plan();
    expect(manifest.files.find((file) => file.name === 'legacy.svg')).toMatchObject({
      status: 'unsupported',
      sha256: expect.any(String),
    });
    expect(manifest.files.find((file) => file.name === 'linked.png')).toMatchObject({
      status: 'unsafe',
      sha256: null,
    });
    expect(fs.readdirSync(source)).toHaveLength(3);
  });
  it('streams an oversize file hash for inventory but prevents applying it', async () => {
    const descriptor = fs.openSync(path.join(source, 'oversize.png'), 'wx');
    fs.writeSync(descriptor, png);
    fs.ftruncateSync(descriptor, 10 * 1024 * 1024 + 1);
    fs.closeSync(descriptor);
    const manifest = plan();
    const item = manifest.files.find((file) => file.name === 'oversize.png')!;
    expect(item).toMatchObject({
      status: 'oversize',
      mime: 'image/png',
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    manifest.mappings = [
      { sourceName: item.name, sourceSha256: item.sha256!, tenantId: 'tenant-a' },
    ];
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'supported inventoried file'
    );
  });
  it('keeps unresolved tenant references explicitly unassigned', async () => {
    const data = snapshot();
    delete data.orders[0].tenant_id;
    const manifest = approve(plan(data));
    expect(manifest.records[0].tenantId).toBeNull();
    const result = await applyLegacyUploads(manifest, options());
    expect(result.rewrittenReferences).toBe(1);
    expect(result.unmappedReferences).toBe(6);
  });
  it('CLI plan creates a private manifest with no pre-approved mapping', async () => {
    plan();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await legacyUploadsMain([
      'plan',
      '--source-dir',
      source,
      '--snapshot',
      snapshotPath,
      '--out',
      manifestPath,
    ]);
    expect(JSON.parse(fs.readFileSync(manifestPath, 'utf8')).mappings).toEqual([]);
    expect(fs.statSync(manifestPath).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(destination)).toBe(false);
    log.mockRestore();
  });
  it('refuses ambiguous source flags and accidental plan apply', async () => {
    await expect(
      legacyUploadsMain([
        'plan',
        '--source-dir',
        source,
        '--snapshot',
        snapshotPath,
        '--database',
        '--out',
        manifestPath,
      ])
    ).rejects.toThrow('exactly one');
    await expect(
      legacyUploadsMain([
        'plan',
        '--source-dir',
        source,
        '--snapshot',
        snapshotPath,
        '--out',
        manifestPath,
        '--apply',
      ])
    ).rejects.toThrow('Apply options');
  });
});

describe('offline image migration integrity', () => {
  it('defaults to a dry run with no copies or reference changes', async () => {
    const manifest = approve(plan());
    const original = fs.readFileSync(snapshotPath, 'utf8');
    const result = await applyLegacyUploads(manifest, options());
    expect(result).toMatchObject({
      applied: false,
      copied: 1,
      rewrittenRows: 2,
      rewrittenReferences: 6,
      unmappedReferences: 1,
    });
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(original);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('copies privately, rewrites only the mapped tenant and preserves original bytes', async () => {
    const manifest = approve(plan());
    const result = await applyLegacyUploads(manifest, { ...options(), apply: true });
    const next = committed();
    const copiedName = destinationName(manifest);
    expect(result).toMatchObject({ applied: true, retry: false, unmappedReferences: 1 });
    expect(fs.readdirSync(destination)).toEqual([copiedName]);
    expect(fs.readFileSync(path.join(destination, copiedName))).toEqual(png);
    expect(fs.statSync(path.join(destination, copiedName)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(snapshotPath).mode & 0o777).toBe(0o600);
    expect(fs.readFileSync(path.join(source, imageName))).toEqual(png);
    expect(next.orders[0].gorsel_urlleri).toEqual([`/uploads/${copiedName}`]);
    expect(next.orders[0].ek_veriler.kanada_fatura_gorseli).toBe(`/uploads/${copiedName}`);
    expect(next.orders[0].ham_mesaj).toContain(`${copiedName}?size=3`);
    expect(next.orders[0].external).toBe(snapshot().orders[0].external);
    expect(next.orders[1]).toEqual(snapshot().orders[1]);
    expect(next.inbox[0].oneri_siparis.gorsel_urlleri).toEqual([`/uploads/${copiedName}`]);
    expect(
      JSON.parse(next.orders[0].eksik_bilgiler[0].slice('META:urunler='.length))[0].urun_gorseli
    ).toBe(`/uploads/${copiedName}`);
  });
  it('shared files require separate mappings and create a distinct copy for each tenant', async () => {
    const manifest = approve(plan(), ['tenant-a', 'tenant-b']);
    const result = await applyLegacyUploads(manifest, { ...options(), apply: true });
    expect(result).toMatchObject({ copied: 2, unmappedReferences: 0, rewrittenReferences: 7 });
    const names = fs.readdirSync(destination);
    expect(names.some((name) => name.startsWith(tenantImagePrefix('tenant-a')))).toBe(true);
    expect(names.some((name) => name.startsWith(tenantImagePrefix('tenant-b')))).toBe(true);
    expect(committed().orders[0].gorsel_urlleri).not.toEqual(committed().orders[1].gorsel_urlleri);
  });
  it('retries an applied manifest without overwriting intervening edits or duplicating copies', async () => {
    const manifest = approve(plan());
    await applyLegacyUploads(manifest, { ...options(), apply: true });
    const next = committed();
    next.orders[0].musteri_adi = 'Changed after migration';
    fs.writeFileSync(snapshotPath, JSON.stringify(next));
    const retry = await applyLegacyUploads(manifest, { ...options(), apply: true });
    expect(retry).toMatchObject({ applied: true, retry: true });
    expect(committed().orders[0].musteri_adi).toBe('Changed after migration');
    expect(fs.readdirSync(destination)).toHaveLength(1);
    expect(committed().legacyUploadMigrations).toHaveLength(1);
  });
  it('rejects changed source files and stale source snapshots', async () => {
    const manifest = approve(plan());
    fs.writeFileSync(path.join(source, imageName), Buffer.concat([png, Buffer.from([4])]));
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'SHA256'
    );
    fs.writeFileSync(path.join(source, imageName), png);
    const next = committed();
    next.orders[0].musteri_adi = 'Concurrent';
    fs.writeFileSync(snapshotPath, JSON.stringify(next));
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'changed after planning'
    );
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('reports a lost committed private copy and repairs it only on explicit apply', async () => {
    const manifest = approve(plan());
    await applyLegacyUploads(manifest, { ...options(), apply: true });
    fs.unlinkSync(path.join(destination, destinationName(manifest)));
    await expect(applyLegacyUploads(manifest, options())).rejects.toThrow('missing private copy');
    const repaired = await applyLegacyUploads(manifest, { ...options(), apply: true });
    expect(repaired).toMatchObject({ applied: true, retry: true });
    expect(fs.readFileSync(path.join(destination, destinationName(manifest)))).toEqual(png);
  });
  it.each(['../outside.png', '/absolute.png', '..\\outside.png'])(
    'rejects traversal mapping %s',
    async (sourceName) => {
      const manifest = approve(plan());
      manifest.mappings[0].sourceName = sourceName;
      await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
        'safe sourceName'
      );
      expect(fs.existsSync(destination)).toBe(false);
    }
  );
  it('rejects changed row hashes, absent approvals and inactive tenants', async () => {
    const manifest = plan();
    await expect(applyLegacyUploads(manifest, options())).rejects.toThrow('reviewed mapping');
    approve(manifest);
    manifest.records[0].before.musteri_adi = 'Tampered';
    await expect(applyLegacyUploads(manifest, options())).rejects.toThrow('source row hash');
    const inactive = approve(plan());
    inactive.companies[0].onay_durumu = 'REDDEDILDI';
    await expect(applyLegacyUploads(inactive, options())).rejects.toThrow('active');
  });
  it('refuses symlink source files and destination directories', async () => {
    const manifest = approve(plan());
    fs.symlinkSync(source, destination);
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'Symbolic links'
    );
    fs.unlinkSync(destination);
    const original = path.join(root, 'outside.png');
    fs.writeFileSync(original, png);
    fs.unlinkSync(path.join(source, imageName));
    fs.symlinkSync(original, path.join(source, imageName));
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'Symbolic links'
    );
  });
  it('refuses extension tampering and a conflicting private destination', async () => {
    const manifest = approve(plan());
    manifest.files[0].extension = 'jpg';
    await expect(applyLegacyUploads(manifest, options())).rejects.toThrow('magic');
    manifest.files[0].extension = 'png';
    fs.mkdirSync(destination);
    fs.writeFileSync(path.join(destination, destinationName(manifest)), 'existing different bytes');
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'different content'
    );
  });
  it('copy failure does not publish references or a success receipt', async () => {
    const manifest = approve(plan());
    const before = fs.readFileSync(snapshotPath, 'utf8');
    vi.spyOn(fs, 'linkSync').mockImplementationOnce(() => {
      throw Object.assign(new Error('Synthetic disk failure'), { code: 'EACCES' });
    });
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'Synthetic disk failure'
    );
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(before);
    expect(fs.readdirSync(source)).toEqual([imageName]);
  });
  it('snapshot write failure keeps references intact and reuses private orphans on retry', async () => {
    const manifest = approve(plan());
    const before = fs.readFileSync(snapshotPath, 'utf8');
    const spy = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw new Error('Synthetic rename failure');
    });
    await expect(applyLegacyUploads(manifest, { ...options(), apply: true })).rejects.toThrow(
      'Yerel veriler'
    );
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(before);
    expect(fs.readdirSync(destination)).toHaveLength(1);
    spy.mockRestore();
    expect((await applyLegacyUploads(manifest, { ...options(), apply: true })).applied).toBe(true);
    expect(fs.readdirSync(destination)).toHaveLength(1);
  });
});

describe('database image migration orchestration', () => {
  function databasePlan() {
    const manifest = approve(plan());
    manifest.source = { kind: 'database', snapshotHash: manifest.source.snapshotHash };
    return manifest;
  }
  const databaseOptions = (database: any) => ({
    sourceDirectory: source,
    destinationDirectory: destination,
    database,
  });
  function receipt(args: any, applied = false, retry = false) {
    return {
      operationId: args.p_operation_id,
      copied: args.p_mappings.length,
      rewrittenRows: args.p_changes.length,
      rewrittenReferences: args.p_changes.reduce(
        (n: number, item: any) => n + item.edits.length,
        0
      ),
      applied,
      retry,
    };
  }
  it('runs only a readonly preview by default', async () => {
    const database = { rpc: vi.fn(async (_name, args) => ({ data: receipt(args) })) };
    expect((await applyLegacyUploads(databasePlan(), databaseOptions(database))).applied).toBe(
      false
    );
    expect(database.rpc).toHaveBeenCalledTimes(1);
    expect(database.rpc.mock.calls[0][1].p_dry_run).toBe(true);
    expect(fs.existsSync(destination)).toBe(false);
  });
  it('copies before the commit RPC and sends exact CAS rows/replacements', async () => {
    const database = {
      rpc: vi.fn(async (_name, args) => {
        if (!args.p_dry_run) expect(fs.readdirSync(destination)).toHaveLength(1);
        return { data: receipt(args, !args.p_dry_run) };
      }),
    };
    const result = await applyLegacyUploads(databasePlan(), {
      ...databaseOptions(database),
      apply: true,
    });
    expect(result.applied).toBe(true);
    expect(database.rpc).toHaveBeenCalledTimes(2);
    const payload = database.rpc.mock.calls[1][1];
    expect(payload.p_changes.every((change: any) => change.tenant_id === 'tenant-a')).toBe(true);
    expect(payload.p_changes[0].before).toEqual(snapshot().orders[0]);
    expect(payload.p_mappings[0].source_sha256).toBe(sha256(png));
  });
  it('an ambiguous DB write leaves private copies for unchanged idempotent retry', async () => {
    let committedOnce = false;
    const database = {
      rpc: vi.fn(async (_name, args) => {
        if (committedOnce) return { data: receipt(args, true, true) };
        if (args.p_dry_run) return { data: receipt(args) };
        committedOnce = true;
        return { error: { message: 'Synthetic lost response' } };
      }),
    };
    const manifest = databasePlan();
    await expect(
      applyLegacyUploads(manifest, { ...databaseOptions(database), apply: true })
    ).rejects.toThrow('outcome is unknown');
    expect(fs.readdirSync(destination)).toHaveLength(1);
    expect(
      (await applyLegacyUploads(manifest, { ...databaseOptions(database), apply: true })).retry
    ).toBe(true);
    expect(database.rpc).toHaveBeenCalledTimes(3);
    expect(fs.readdirSync(destination)).toHaveLength(1);
  });
  it('DB failure has no memory/file snapshot fallback and no false success', async () => {
    const database = { rpc: vi.fn(async () => ({ error: { message: 'Synthetic outage' } })) };
    const manifest = databasePlan();
    const before = fs.readFileSync(snapshotPath, 'utf8');
    await expect(
      applyLegacyUploads(manifest, { ...databaseOptions(database), apply: true })
    ).rejects.toThrow('Database migration failed');
    await expect(readDatabaseUploadSnapshot(database)).rejects.toThrow('no local fallback');
    expect(fs.existsSync(destination)).toBe(false);
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(before);
  });
  it('rejects unverifiable receipts', async () => {
    const database = {
      rpc: vi.fn(async (_name, args) => ({ data: { ...receipt(args), rewrittenRows: 999 } })),
    };
    await expect(applyLegacyUploads(databasePlan(), databaseOptions(database))).rejects.toThrow(
      'receipt could not be verified'
    );
  });
});
