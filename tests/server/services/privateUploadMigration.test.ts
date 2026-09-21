import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyPrivateUploads,
  planPrivateUploads,
  readPrivateUploadManifest,
  writePrivateUploadManifest,
  privateUploadsMain,
} from '../../../scripts/migrate-private-uploads';
import { tenantImageFilename } from '../../../src/server/services/tenantImageNames';
import { sha256 } from '../../../src/server/services/legacyUploads';
import { MAX_IMAGE_BYTES, PublicResourceError } from '../../../src/server/services/publicFetch';
import { PRIVATE_IMAGE_NAME } from '../../../src/server/services/privateImageStorage';

const root = fs.realpathSync(process.env.DATA_DIR!);
const source = path.join(root, 'source');
const manifestPath = path.join(root, 'manifest.json');
const name = tenantImageFilename('synthetic-tenant', 'png', 'a'.repeat(32));
const name2 = tenantImageFilename('synthetic-tenant', 'png', 'b'.repeat(32));
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const modified = Buffer.concat([png, Buffer.from([4])]);
function destination() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    verifyPrivateBucket: vi.fn(async () => undefined),
    readPrivateImage: vi.fn(async (filename: string) => {
      if (!objects.has(filename)) throw new PublicResourceError('Missing', 404);
      return { buffer: objects.get(filename)! };
    }),
    writePrivateImage: vi.fn(async (filename: string, bytes: Buffer) => {
      if (objects.has(filename)) throw new Error('No upsert');
      objects.set(filename, Buffer.from(bytes));
    }),
  };
}
beforeEach(() => {
  vi.restoreAllMocks();
  process.env.UPLOAD_STORAGE_BACKEND = 'supabase';
  for (const entry of fs.readdirSync(root))
    fs.rmSync(path.join(root, entry), { recursive: true, force: true });
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, name), png);
});

describe('private canonical image migration', () => {
  it('plans deterministic file hashes offline and defaults to no cloud operations', async () => {
    expect(PRIVATE_IMAGE_NAME.test(name)).toBe(true);
    const manifest = planPrivateUploads(source);
    expect(manifest.files).toEqual([
      { name, sha256: sha256(png), bytes: png.length, mimeType: 'image/png' },
    ]);
    const remote = destination();
    const result = await applyPrivateUploads(manifest, { apply: false, destination: remote });
    expect(result.applied).toBe(false);
    expect(result.completed).toBe(false);
    expect(remote.verifyPrivateBucket).not.toHaveBeenCalled();
    expect(remote.writePrivateImage).not.toHaveBeenCalled();
  });
  it('writes a private exclusive manifest and verifies its exact reviewed hash', () => {
    const manifest = planPrivateUploads(source);
    const hash = writePrivateUploadManifest(manifestPath, manifest);
    expect(fs.statSync(manifestPath).mode & 0o777).toBe(0o600);
    expect(readPrivateUploadManifest(manifestPath, hash)).toEqual(manifest);
    expect(() => writePrivateUploadManifest(manifestPath, manifest)).toThrow();
    fs.appendFileSync(manifestPath, ' ');
    expect(() => readPrivateUploadManifest(manifestPath, hash)).toThrow(/SHA256/);
  });
  it('never includes malformed JSON content in the operator error', () => {
    const malformed = Buffer.from('PRIVATE-CANARY-CREDENTIAL malformed JSON');
    fs.writeFileSync(manifestPath, malformed);
    expect(() => readPrivateUploadManifest(manifestPath, sha256(malformed))).toThrow(
      'Invalid private upload manifest JSON.'
    );
    expect(() => readPrivateUploadManifest(manifestPath, sha256(malformed))).not.toThrow(
      'PRIVATE-CANARY-CREDENTIAL'
    );
  });
  it('refuses missing SHA, traversing manifest entries and manifest inside inventory', () => {
    const manifest = planPrivateUploads(source);
    expect(() => writePrivateUploadManifest(path.join(source, 'manifest.json'), manifest)).toThrow(
      /outside/
    );
    writePrivateUploadManifest(manifestPath, manifest);
    expect(() => readPrivateUploadManifest(manifestPath, '')).toThrow(/SHA256/);
    manifest.files[0].name = '../escape.png';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    expect(() =>
      readPrivateUploadManifest(manifestPath, sha256(fs.readFileSync(manifestPath)))
    ).toThrow(/manifest file/);
  });
  it('accepts harmless JSON key ordering while preserving exact inventory validation', async () => {
    const manifest = planPrivateUploads(source);
    manifest.files = manifest.files.map(({ name, sha256, bytes, mimeType }) => ({
      bytes,
      name,
      mimeType,
      sha256,
    }));
    const hash = writePrivateUploadManifest(manifestPath, manifest);
    const loaded = readPrivateUploadManifest(manifestPath, hash);
    await expect(applyPrivateUploads(loaded, { apply: false })).resolves.toMatchObject({
      inventoryVerified: true,
    });
  });
  it.each(['new', 'missing', 'changed'] as const)(
    'refuses %s source inventory before any remote call',
    async (change) => {
      const manifest = planPrivateUploads(source);
      if (change === 'new') fs.writeFileSync(path.join(source, name2), png);
      if (change === 'missing') fs.unlinkSync(path.join(source, name));
      if (change === 'changed') fs.writeFileSync(path.join(source, name), modified);
      const remote = destination();
      await expect(
        applyPrivateUploads(manifest, { apply: true, destination: remote })
      ).rejects.toThrow(/inventory changed/);
      expect(remote.verifyPrivateBucket).not.toHaveBeenCalled();
    }
  );
  it.each(['file', 'directory', 'ancestor'] as const)('rejects %s symlinks', (kind) => {
    if (kind === 'file') {
      const actual = path.join(root, 'actual.png');
      fs.writeFileSync(actual, png);
      fs.unlinkSync(path.join(source, name));
      fs.symlinkSync(actual, path.join(source, name));
      expect(() => planPrivateUploads(source)).toThrow(/Symbolic/);
    } else {
      const alias = path.join(root, 'alias');
      fs.symlinkSync(source, alias);
      if (kind === 'ancestor') fs.mkdirSync(path.join(source, 'nested'));
      expect(() =>
        planPrivateUploads(kind === 'ancestor' ? path.join(alias, 'nested') : alias)
      ).toThrow(/Symbolic/);
    }
  });
  it.each(['oversize', 'bad-magic', 'wrong-extension', 'legacy', 'directory'] as const)(
    'rejects %s sources',
    (kind) => {
      if (kind === 'oversize') fs.truncateSync(path.join(source, name), MAX_IMAGE_BYTES + 1);
      if (kind === 'bad-magic') fs.writeFileSync(path.join(source, name), '<svg/>');
      if (kind === 'wrong-extension')
        fs.renameSync(path.join(source, name), path.join(source, name.replace('.png', '.jpg')));
      if (kind === 'legacy') fs.writeFileSync(path.join(source, 'old.png'), png);
      if (kind === 'directory') {
        fs.unlinkSync(path.join(source, name));
        fs.mkdirSync(path.join(source, name));
      }
      expect(() => planPrivateUploads(source)).toThrow();
    }
  );
  it('requires explicit supabase backend and a verified bucket', async () => {
    const manifest = planPrivateUploads(source);
    const remote = destination();
    process.env.UPLOAD_STORAGE_BACKEND = 'local';
    await expect(
      applyPrivateUploads(manifest, { apply: true, destination: remote })
    ).rejects.toThrow(/BACKEND=supabase/);
    process.env.UPLOAD_STORAGE_BACKEND = 'supabase';
    remote.verifyPrivateBucket.mockRejectedValueOnce(new Error('Public bucket'));
    await expect(
      applyPrivateUploads(manifest, { apply: true, destination: remote })
    ).rejects.toThrow(/Public bucket/);
    expect(remote.writePrivateImage).not.toHaveBeenCalled();
  });
  it('copies unchanged names, verifies downloaded bytes and safely retries without replacing originals', async () => {
    const manifest = planPrivateUploads(source);
    const remote = destination();
    const result = await applyPrivateUploads(manifest, { apply: true, destination: remote });
    expect(result).toMatchObject({ completed: true, files: [{ name, status: 'verified-upload' }] });
    expect(remote.objects.get(name)).toEqual(png);
    const retry = await applyPrivateUploads(manifest, { apply: true, destination: remote });
    expect(retry).toMatchObject({
      completed: true,
      files: [{ name, status: 'verified-existing' }],
    });
    expect(remote.writePrivateImage).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(path.join(source, name))).toEqual(png);
  });
  it('rejects a mismatched destination without overwriting it', async () => {
    const remote = destination();
    remote.objects.set(name, modified);
    const result = await applyPrivateUploads(planPrivateUploads(source), {
      apply: true,
      destination: remote,
    });
    expect(result).toMatchObject({ completed: false, files: [{ status: 'failed' }] });
    expect(remote.writePrivateImage).not.toHaveBeenCalled();
    expect(remote.objects.get(name)).toEqual(modified);
  });
  it('treats a destination outage as a failure rather than a missing file', async () => {
    const remote = destination();
    remote.readPrivateImage.mockRejectedValue(new PublicResourceError('Outage', 503));
    const result = await applyPrivateUploads(planPrivateUploads(source), {
      apply: true,
      destination: remote,
    });
    expect(result.completed).toBe(false);
    expect(remote.writePrivateImage).not.toHaveBeenCalled();
  });
  it('reports failed copies without continuing or claiming final success', async () => {
    fs.writeFileSync(path.join(source, name2), png);
    const remote = destination();
    remote.writePrivateImage.mockRejectedValueOnce(new Error('Write failed'));
    const result = await applyPrivateUploads(planPrivateUploads(source), {
      apply: true,
      destination: remote,
    });
    expect(result).toMatchObject({
      completed: false,
      files: [{ status: 'failed' }, { status: 'pending' }],
    });
    expect(remote.writePrivateImage).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(source)).toHaveLength(2);
  });
  it('recovers an ambiguous upload only when the exact downloaded bytes match', async () => {
    const remote = destination();
    remote.writePrivateImage.mockImplementationOnce(async (filename, bytes) => {
      remote.objects.set(filename, bytes);
      throw new Error('Response lost');
    });
    const result = await applyPrivateUploads(planPrivateUploads(source), {
      apply: true,
      destination: remote,
    });
    expect(result.completed).toBe(true);
  });
  it('detects remote corruption and concurrent local inventory drift', async () => {
    const remote = destination();
    remote.writePrivateImage.mockImplementationOnce(async (filename) => {
      remote.objects.set(filename, modified);
    });
    expect(
      (await applyPrivateUploads(planPrivateUploads(source), { apply: true, destination: remote }))
        .completed
    ).toBe(false);
    remote.objects.clear();
    remote.writePrivateImage.mockImplementationOnce(async (filename, bytes) => {
      remote.objects.set(filename, bytes);
      fs.writeFileSync(path.join(source, name2), png);
    });
    const result = await applyPrivateUploads(planPrivateUploads(source), {
      apply: true,
      destination: remote,
    });
    expect(result).toMatchObject({
      completed: false,
      error: expect.stringContaining('inventory changed'),
    });
  });
  it('CLI requires reviewed SHA and defaults apply to dry run', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await privateUploadsMain(['plan', '--source-dir', source, '--out', manifestPath]);
    const output = JSON.parse(log.mock.calls[0][0]);
    await expect(privateUploadsMain(['apply', '--manifest', manifestPath])).rejects.toThrow(
      /sha256/
    );
    await privateUploadsMain(['apply', '--manifest', manifestPath, '--sha256', output.sha256]);
    expect(JSON.parse(log.mock.calls[1][0])).toMatchObject({
      applied: false,
      inventoryVerified: true,
    });
    await expect(
      privateUploadsMain(['plan', '--source-dir', source, '--out', manifestPath, '--apply'])
    ).rejects.toThrow(/flag/);
  });
});
