import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../../src/server/index';
import vercelHandler from '../../../src/server/vercel';

// girisLimiter allows 20 attempts per 15 minutes per client IP (req.ip).
// An empty login body is rejected with 400 after the limiter counted it.
const LIMIT = 20;

describe('Login rate limit cannot be bypassed with a forged X-Forwarded-For', () => {
  it('ignores X-Forwarded-For when no proxy is trusted (local and Docker)', async () => {
    const app = createApp();
    expect(app.get('trust proxy')).toBe(false);
    const attempt = (forwardedFor: string) =>
      request(app).post('/api/auth/giris').set('X-Forwarded-For', forwardedFor).send({});
    for (let index = 0; index < LIMIT; index++)
      expect((await attempt(`198.51.100.${index}`)).status).toBe(400);
    expect((await attempt('198.51.100.250')).status).toBe(429);
  });

  it('on Vercel trusts only the address Vercel supplies, not entries a client adds', async () => {
    // Vercel overwrites X-Forwarded-For with the client IP. Even if a forged
    // entry stood in front of it, only the last entry (Vercel's) counts.
    const attempt = (forwardedFor: string) =>
      request(vercelHandler).post('/api/auth/giris').set('X-Forwarded-For', forwardedFor).send({});
    for (let index = 0; index < LIMIT; index++)
      expect((await attempt(`198.51.100.${index}, 203.0.113.7`)).status).toBe(400);
    expect((await attempt('198.51.100.250, 203.0.113.7')).status).toBe(429);
    // Another real client keeps its own budget.
    expect((await attempt('203.0.113.8')).status).toBe(400);
  });
});
