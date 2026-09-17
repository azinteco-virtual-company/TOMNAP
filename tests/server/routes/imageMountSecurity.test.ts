import { loginFixture } from '../helpers/session';
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';

const app = createApp();
let authenticated: any;
beforeAll(async () => {
  authenticated = (await loginFixture(app)).agent;
  authenticated.set('x-tenant-id', 'kanada_shopper_baku');
});
describe('Image route mount boundary', () => {
  it.each(['/Uploads/private.png', '/%75ploads/private.png', '/uploads%2Fprivate.png'])(
    'protects static path variants: %s',
    async (url) => {
      expect((await request(app).get(url)).status).toBe(401);
    }
  );
  it.each([
    '/upload-gorsel',
    '/gorselden-urun-ara',
    '/katalog-gorseli-kaydet',
    '/urun-orijinal-gorsele-don',
  ])('does not expose root mutation %s', async (url) => {
    const response = await request(app).post(url).send({});
    expect(response.status).toBe(404);
  });
  it('keeps the API route mounted and validates its input', async () => {
    const response = await authenticated.post('/api/upload-gorsel').send({});
    expect(response.status).toBe(400);
  });
  it('returns 404 for a missing uploaded file', async () => {
    const response = await authenticated.get('/uploads/missing-file.jpg');
    expect(response.status).toBe(404);
  });
});
