import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/server/config', async (original) => ({
  ...(await original<typeof import('../../../src/server/config')>()),
  SUPABASE_URL: 'http://127.0.0.1:54329',
  SUPABASE_KEY: 'synthetic-server-key',
}));
import { UPLOADS_DIR } from '../../../src/server/config';
import { MAX_IMAGE_BYTES } from '../../../src/server/services/publicFetch';
import {
  PRIVATE_IMAGE_BUCKET as bucket,
  assertPrivateImageExists,
  readPrivateImage,
  preparePrivateBucket,
  storageBackend,
  verifyPrivateBucket,
  writePrivateImage,
} from '../../../src/server/services/privateImageStorage';
const name = `t_${'a'.repeat(24)}_${'b'.repeat(32)}.png`;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
let config: any;
let objects: Map<string, Buffer>;
let objectFailure: number;
const calls: { url: string; init: RequestInit }[] = [];
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
beforeEach(() => {
  vi.stubEnv('UPLOAD_STORAGE_BACKEND', 'supabase');
  config = {
    id: bucket,
    name: bucket,
    public: false,
    file_size_limit: MAX_IMAGE_BYTES,
    allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
  };
  objects = new Map();
  objectFailure = 0;
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      calls.push({ url: url.pathname, init });
      expect(url.origin).toBe('http://127.0.0.1:54329');
      expect(init.redirect).toBe('error');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      const headers = new Headers(init.headers);
      expect(headers.get('authorization')).toBe('Bearer synthetic-server-key');
      if (url.pathname === `/storage/v1/bucket/${bucket}`)
        return config ? json(config) : json({ statusCode: '404', message: 'missing' }, 404);
      if (url.pathname === '/storage/v1/bucket' && init.method === 'POST') {
        const body = JSON.parse(init.body as string);
        expect(body).toMatchObject({
          id: bucket,
          name: bucket,
          public: false,
          file_size_limit: MAX_IMAGE_BYTES,
          allowed_mime_types: ['image/png', 'image/jpeg', 'image/webp'],
        });
        config = body;
        return json({ name: bucket });
      }
      if (objectFailure)
        return json(
          {
            statusCode: String(objectFailure),
            error: 'Synthetic outage',
            message: 'private details must not escape',
          },
          objectFailure
        );
      const key = url.pathname.split('/').at(-1)!;
      if (url.pathname.startsWith('/storage/v1/object/info/')) {
        if (!objects.has(key)) return json({ statusCode: '404', message: 'not found' }, 404);
        return json({
          id: 'object-id',
          name: key,
          bucket_id: bucket,
          size: objects.get(key)!.length,
          content_type: 'image/png',
        });
      }
      if (init.method === 'POST') {
        expect(headers.get('x-upsert')).toBe('false');
        expect(headers.get('content-type')).toBe('image/png');
        expect(headers.get('cache-control')).toBe('max-age=0');
        if (objects.has(key)) return json({ statusCode: '409', message: 'exists' }, 409);
        objects.set(key, Buffer.from(init.body as Uint8Array));
        return json({ Id: 'object-id', Key: `${bucket}/${key}` });
      }
      if (!objects.has(key)) return json({ statusCode: '404', message: 'not found' }, 404);
      return new Response(objects.get(key), { headers: { 'content-type': 'image/png' } });
    })
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('private persistent image storage through the real SDK', () => {
  it('uploads exact bytes without overwriting and reads through a private server request', async () => {
    await writePrivateImage(name, png);
    expect(fs.existsSync(path.join(UPLOADS_DIR, name))).toBe(false);
    await assertPrivateImageExists(name);
    expect((await readPrivateImage(name)).buffer).toEqual(png);
    expect(calls.filter((c) => c.url.startsWith('/storage/v1/bucket/'))).toHaveLength(3);
    await expect(writePrivateImage(name, png)).rejects.toMatchObject({ status: 503 });
    expect(objects.get(name)).toEqual(png);
  });
  it.each([
    { public: true },
    { file_size_limit: null },
    { file_size_limit: MAX_IMAGE_BYTES + 1 },
    { allowed_mime_types: ['image/*'] },
    { allowed_mime_types: [] },
    { id: 'other-bucket' },
  ])('rejects unsafe bucket configuration before object access: %j', async (change) => {
    Object.assign(config, change);
    await expect(writePrivateImage(name, png)).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
    expect(objects.size).toBe(0);
  });
  it('rechecks privacy after the bucket changes instead of trusting cached metadata', async () => {
    await writePrivateImage(name, png);
    config.public = true;
    await expect(readPrivateImage(name)).rejects.toMatchObject({ status: 503 });
    expect(calls.at(-1)?.url).toBe(`/storage/v1/bucket/${bucket}`);
  });
  it('distinguishes missing objects from outages and does not fall back to local copies', async () => {
    fs.writeFileSync(path.join(UPLOADS_DIR, name), png);
    try {
      await expect(readPrivateImage(name)).rejects.toMatchObject({ status: 404 });
      await expect(assertPrivateImageExists(name)).rejects.toMatchObject({ status: 404 });
      objectFailure = 503;
      await expect(readPrivateImage(name)).rejects.toMatchObject({ status: 503 });
      await expect(assertPrivateImageExists(name)).rejects.toMatchObject({ status: 503 });
      await expect(writePrivateImage(name, png)).rejects.not.toThrow('private details');
      expect(fs.readFileSync(path.join(UPLOADS_DIR, name))).toEqual(png);
    } finally {
      fs.unlinkSync(path.join(UPLOADS_DIR, name));
    }
  });
  it('rejects traversal, arbitrary content and extension mismatch before any network operation', async () => {
    await expect(readPrivateImage('../secret.png')).rejects.toMatchObject({ status: 404 });
    await expect(writePrivateImage(name, Buffer.from('<svg/>'))).rejects.toMatchObject({
      status: 415,
    });
    await expect(writePrivateImage(name.replace('.png', '.jpg'), png)).rejects.toMatchObject({
      status: 415,
    });
    expect(calls).toHaveLength(0);
  });
  it('validates downloaded content and enforces a hard transport byte ceiling', async () => {
    objects.set(name, Buffer.from('<html>bad upstream</html>'));
    await expect(readPrivateImage(name)).rejects.toMatchObject({ status: 415 });
    objects.set(name, Buffer.alloc(MAX_IMAGE_BYTES + 1));
    await expect(readPrivateImage(name)).rejects.toMatchObject({ status: 503 });
  });
  it('sanitizes network errors including server key details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic-server-key')));
    await expect(verifyPrivateBucket()).rejects.not.toThrow('synthetic-server-key');
  });
  it('provisions only a missing bucket through the API with private constraints', async () => {
    config = null;
    await expect(preparePrivateBucket()).resolves.toBe('created');
    expect(calls.filter((c) => c.init.method === 'POST')).toHaveLength(1);
  });
  it('validates an existing bucket without changing it', async () => {
    await expect(preparePrivateBucket()).resolves.toBe('existing');
    expect(calls.every((c) => !c.init.method || c.init.method === 'GET')).toBe(true);
    config.public = true;
    await expect(preparePrivateBucket()).rejects.toMatchObject({ status: 503 });
  });
  it('refuses local ephemeral Vercel storage and unrecognized backends', () => {
    vi.stubEnv('UPLOAD_STORAGE_BACKEND', 'local');
    vi.stubEnv('VERCEL', '1');
    expect(storageBackend).toThrow();
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('UPLOAD_STORAGE_BACKEND', 'auto');
    expect(storageBackend).toThrow();
  });
});
