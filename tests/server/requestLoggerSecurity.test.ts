import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requestLogger } from '../../src/server/logger';

afterEach(() => vi.restoreAllMocks());

describe('Request log redaction', () => {
  it.each([
    '/api/auth/token-kontrol/activation-secret?api_key=key-secret',
    '/api/firmalar/davet/invitation-secret?token=token-secret',
  ])('redacts bearer material from %s', async (url) => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const app = express()
      .use(requestLogger)
      .use((_req, res) => res.json({ ok: true }));
    await request(app).get(url);
    const logs = JSON.stringify(spy.mock.calls);
    for (const secret of ['activation-secret', 'invitation-secret', 'key-secret', 'token-secret'])
      expect(logs).not.toContain(secret);
    expect(logs).toContain('[REDACTED]');
  });
});
