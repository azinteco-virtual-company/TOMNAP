import request from 'supertest';
import { describe, expect, it } from 'vitest';
import vercelHandler from '../../src/server/vercel';

// Vercel does not set X-Forwarded-Uri; when present, a client sent it.
describe('Vercel entry routes by req.url only', () => {
  it('ignores a client-supplied X-Forwarded-Uri in both directions', async () => {
    const health = await request(vercelHandler)
      .get('/api/health')
      .set('X-Forwarded-Uri', '/api/sistem-durum');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ basarili: true });

    const upload = await request(vercelHandler)
      .get('/uploads/missing.png')
      .set('X-Forwarded-Uri', '/api/health');
    expect(upload.status).toBe(401);
  });

  it('keeps upload paths, query strings and the /api prefix fallback', async () => {
    expect((await request(vercelHandler).get('/uploads/missing.png')).status).toBe(401);
    expect((await request(vercelHandler).get('/api/health?probe=1')).status).toBe(200);
    // A path without /api (or /uploads) is served under /api, as before.
    expect((await request(vercelHandler).get('/health?probe=1')).status).toBe(200);
  });
});
