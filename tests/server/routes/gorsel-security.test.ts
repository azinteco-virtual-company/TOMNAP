import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({ download: vi.fn(), generate: vi.fn() }));
vi.mock('../../../src/server/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/server/config')>()),
  GEMINI_API_KEY: 'test-only-no-external-request',
}));
vi.mock('../../../src/server/services/publicFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/server/services/publicFetch')>()),
  fetchPublicResource: mocks.download,
}));
vi.mock('../../../src/server/services/gemini', () => ({
  getGeminiClient: () => ({}),
  generateContentWithRetryAndFallback: mocks.generate,
}));

import gorselRouter, { serveUploadedImage } from '../../../src/server/routes/gorsel';
import { UPLOADS_DIR } from '../../../src/server/config';
import { MAX_IMAGE_BYTES, PublicResourceError } from '../../../src/server/services/publicFetch';
import { setSiparislerVeritabani } from '../../../src/server/services/state';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64'
);
const app = express();
app.use(express.json({ limit: '25mb' }));
app.get('/uploads/:dosyaAdi', serveUploadedImage);
app.use('/api', gorselRouter);

beforeEach(() => {
  mocks.download.mockReset();
  mocks.generate.mockReset().mockResolvedValue({ text: '{}' });
  for (const file of fs.readdirSync(UPLOADS_DIR))
    fs.rmSync(path.join(UPLOADS_DIR, file), { recursive: true, force: true });
  setSiparislerVeritabani([
    {
      id: 'security-order',
      tenant_id: 'demo_sandbox',
      musteri_adi: 'Synthetic Test',
      urunler: [{ urun_adi: 'Test', urun_gorseli: '/uploads/original.png' }],
    },
  ]);
});

describe('image route file boundaries', () => {
  it.each(['/uploads/../secret.png', '/uploads/../../secret.png', '/uploads/..\\secret.png'])(
    'rejects local traversal before reading or invoking AI: %s',
    async (gorsel) => {
      const res = await request(app).post('/api/gorselden-urun-ara').send({ gorsel });
      expect(res.status).toBe(403);
      expect(mocks.generate).not.toHaveBeenCalled();
      expect(mocks.download).not.toHaveBeenCalled();
    }
  );

  it('rejects symlinks outside the upload directory for serving and AI reading', async () => {
    const outside = path.join(process.env.DATA_DIR!, 'outside.png');
    fs.writeFileSync(outside, png);
    fs.symlinkSync(outside, path.join(UPLOADS_DIR, 'linked.png'));
    expect((await request(app).get('/uploads/linked.png')).status).toBe(403);
    expect(
      (await request(app).post('/api/gorselden-urun-ara').send({ gorsel: '/uploads/linked.png' }))
        .status
    ).toBe(403);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing file instead of a different uploaded image', async () => {
    fs.writeFileSync(path.join(UPLOADS_DIR, 'other_1.png'), png);
    expect((await request(app).get('/uploads/missing_1.png')).status).toBe(404);
    const exact = await request(app).get('/uploads/other_1.png');
    expect(exact.status).toBe(200);
    expect(exact.body).toEqual(png);
  });

  it('passes an exact local upload to AI without remote fetch', async () => {
    fs.writeFileSync(path.join(UPLOADS_DIR, 'allowed.png'), png);
    const res = await request(app)
      .post('/api/gorselden-urun-ara')
      .send({ gorsel: '/uploads/allowed.png' });
    expect(res.status).toBe(200);
    expect(mocks.generate.mock.calls[0][1].contents[0].inlineData.data).toBe(
      png.toString('base64')
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('preserves the detected WebP MIME when sending a local upload to AI', async () => {
    const webp = Buffer.from('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA', 'base64');
    fs.writeFileSync(path.join(UPLOADS_DIR, 'allowed.webp'), webp);
    const res = await request(app)
      .post('/api/gorselden-urun-ara')
      .send({ gorsel: '/uploads/allowed.webp' });
    expect(res.status).toBe(200);
    expect(mocks.generate.mock.calls[0][1].contents[0].inlineData.mimeType).toBe('image/webp');
  });

  it('accepts a PNG upload and derives its extension from the bytes', async () => {
    const res = await request(app)
      .post('/api/upload-gorsel')
      .send({ base64: png.toString('base64'), mimeType: 'image/png', dosyaAdi: '../../evil.svg' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/uploads\/urun_.*\.png$/);
    expect(fs.readFileSync(path.join(UPLOADS_DIR, path.basename(res.body.url)))).toEqual(png);
  });

  it.each([
    {
      base64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
      mimeType: 'image/png',
    },
    { base64: png.toString('base64'), mimeType: 'image/webp' },
    { base64: `data:image/jpeg;base64,${png.toString('base64')}` },
  ])('rejects unsupported bytes or a false MIME claim', async (body) => {
    const res = await request(app).post('/api/upload-gorsel').send(body);
    expect(res.status).toBe(415);
    expect(fs.readdirSync(UPLOADS_DIR)).toEqual([]);
  });

  it('rejects invalid base64 and files over the decoded limit', async () => {
    expect((await request(app).post('/api/upload-gorsel').send({ base64: '%%%%' })).status).toBe(
      400
    );
    const oversized = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64');
    expect(
      (
        await request(app)
          .post('/api/upload-gorsel')
          .send({ base64: oversized, mimeType: 'image/png' })
      ).status
    ).toBe(413);
    expect(fs.readdirSync(UPLOADS_DIR)).toEqual([]);
  });
});

describe('all remote image paths use the validated downloader', () => {
  it.each(['url[]=https://cdn.example/a', 'url[x]=https://cdn.example/a'])(
    'rejects non-string proxy queries: %s',
    async (query) => {
      const res = await request(app).get(`/api/proxy-gorsel?${query}`);
      expect(res.status).toBe(400);
      expect(mocks.download).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'],
    ['image/png', '<html><script>alert(1)</script></html>'],
  ])('rejects active or falsely labelled remote content: %s', async (mimeType, body) => {
    mocks.download.mockResolvedValue(new Response(body, { headers: { 'content-type': mimeType } }));
    const res = await request(app).get('/api/proxy-gorsel').query({ url: 'https://cdn.example/a' });
    expect(res.status).toBe(415);
    expect(res.text).not.toContain(body);
  });

  it('serves a valid remote PNG with its detected MIME type', async () => {
    mocks.download.mockResolvedValue(
      new Response(png, { headers: { 'content-type': 'image/png' } })
    );
    const res = await request(app).get('/api/proxy-gorsel').query({ url: 'https://cdn.example/a' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.body).toEqual(png);
  });

  it('returns proxy SSRF errors without copying the remote body', async () => {
    mocks.download.mockRejectedValue(new PublicResourceError('Private DNS address'));
    const res = await request(app)
      .get('/api/proxy-gorsel')
      .query({ url: 'https://cdn.example/a.png' });
    expect(res.status).toBe(403);
    expect(mocks.download).toHaveBeenCalledWith('https://cdn.example/a.png');
  });

  it('blocks the formerly unchecked visual-search download before AI', async () => {
    mocks.download.mockRejectedValue(new PublicResourceError('Private DNS address'));
    const res = await request(app)
      .post('/api/gorselden-urun-ara')
      .send({ gorsel: 'http://internal.example/a.png' });
    expect(res.status).toBe(403);
    expect(mocks.download).toHaveBeenCalledWith('http://internal.example/a.png');
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  it('does not silently save the original URL after a blocked redirect in catalog download', async () => {
    mocks.download.mockRejectedValue(new PublicResourceError('Private redirect'));
    const res = await request(app)
      .post('/api/katalog-gorseli-kaydet')
      .send({
        siparis_id: 'security-order',
        urun_indeksi: 0,
        katalog_gorsel_url: 'https://cdn.example/a.png',
      });
    expect(res.status).toBe(403);
    expect(mocks.download).toHaveBeenCalledWith('https://cdn.example/a.png');
    expect(fs.readdirSync(UPLOADS_DIR)).toEqual([]);
  });
});
