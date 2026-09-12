import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { apiKeyAuth } from '../../../src/server/middleware/auth';

describe('Auth Middleware (apiKeyAuth)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('development modunda API_SECRET_KEY yoksa isteği geçirmeli (bypass)', async () => {
    delete process.env.API_SECRET_KEY;
    process.env.NODE_ENV = 'development';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const res = await request(testApp).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('production modunda API_SECRET_KEY yoksa 503 Service Unavailable dönmeli', async () => {
    delete process.env.API_SECRET_KEY;
    process.env.NODE_ENV = 'production';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const res = await request(testApp).get('/api/test');
    expect(res.status).toBe(503);
    expect(res.body.basarili).toBe(false);
  });

  it('API_SECRET_KEY tanımlıyken x-api-key olmadan istek yapılırsa 401 dönmeli', async () => {
    process.env.API_SECRET_KEY = 'super-secret-key-123';
    process.env.NODE_ENV = 'development';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const res = await request(testApp).get('/api/test');
    expect(res.status).toBe(401);
    expect(res.body.basarili).toBe(false);
  });

  it('doğru x-api-key başlığı ile istek başarılı olmalı', async () => {
    process.env.API_SECRET_KEY = 'super-secret-key-123';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const res = await request(testApp)
      .get('/api/test')
      .set('x-api-key', 'super-secret-key-123');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('doğru Authorization Bearer başlığı ile istek başarılı olmalı', async () => {
    process.env.API_SECRET_KEY = 'super-secret-key-123';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/test', (req, res) => res.json({ ok: true }));

    const res = await request(testApp)
      .get('/api/test')
      .set('Authorization', 'Bearer super-secret-key-123');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('public endpoint (/api/sistem-durum) auth anahtarı olmadan da erişilebilir olmalı', async () => {
    process.env.API_SECRET_KEY = 'super-secret-key-123';

    const testApp = express();
    testApp.use(apiKeyAuth());
    testApp.get('/api/sistem-durum', (req, res) => res.json({ ok: true }));

    const res = await request(testApp).get('/api/sistem-durum');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
