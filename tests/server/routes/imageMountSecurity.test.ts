import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';

const app = createApp();
describe('Image route mount boundary', () => {
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
    const response = await request(app).post('/api/upload-gorsel').send({});
    expect(response.status).toBe(400);
  });
  it('returns 404 for a missing uploaded file', async () => {
    const response = await request(app).get('/uploads/missing-file.jpg');
    expect(response.status).toBe(404);
  });
});
