import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_DIR } from '../../../src/server/config';
import authRouter from '../../../src/server/routes/auth';
import {
  createSession,
  readSession,
  revokeSession,
  SESSION_DURATION_MS,
} from '../../../src/server/services/sessions';
import {
  setKullanicilarVeritabani,
  kullanicilarVeritabani,
} from '../../../src/server/services/state';
import { sifreHashle } from '../../../src/server/services/crypto';
import type { KullaniciKaydi } from '../../../src/server/types';

const password = 'Session test password!';
const hash = sifreHashle(password);
const file = path.join(DATA_DIR, 'oturumlar.json');
const user = (extra: Partial<KullaniciKaydi> = {}): KullaniciKaydi => ({
  id: 'session-user',
  tenant_id: 'kanada_shopper_baku',
  ad_soyad: 'Session User',
  email: 'session@example.test',
  telefon: '+994 50 123 45 67',
  rol: 'PATRON',
  durum: 'AKTIF',
  sifre_hash: hash,
  olusturma_tarihi: new Date().toISOString(),
  ...extra,
});
const app = express();
app.use(express.json());
app.use('/api', authRouter);
app.get('/probe', async (req, res) => {
  try {
    res.json(await readSession(req));
  } catch {
    res.status(503).json({ failed: true });
  }
});
app.post('/revoke', async (req, res) => {
  try {
    await revokeSession(req, res);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ failed: true });
  }
});
const login = (identifier = 'session@example.test', sifre = password) =>
  request(app).post('/api/auth/giris').send({ identifikator: identifier, sifre });
const cookie = (response: request.Response): string =>
  response.headers['set-cookie'][0].split(';')[0];

beforeEach(() => {
  vi.useRealTimers();
  fs.rmSync(file, { force: true, recursive: true });
  setKullanicilarVeritabani([user()]);
});

describe('Server session lifecycle with real local storage', () => {
  it('issues an opaque host-only HttpOnly cookie and stores only its SHA256 hash', async () => {
    const before = Date.now();
    const response = await login();
    expect(response.status).toBe(200);
    const setCookie = response.headers['set-cookie'][0];
    expect(setCookie).toMatch(/^tomnap_session=[a-f0-9]{64};/);
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=28800');
    expect(setCookie).not.toContain('Domain=');
    expect(response.headers['cache-control']).toBe('no-store');
    const rawToken = cookie(response).split('=')[1];
    const persisted = fs.readFileSync(file, 'utf8');
    const [record] = JSON.parse(persisted);
    expect(record.token_hash).toBe(createHash('sha256').update(rawToken).digest('hex'));
    expect(record.csrf_token).toMatch(/^[a-f0-9]{64}$/);
    expect(record.csrf_token).toBe(response.body.csrfToken);
    expect(persisted).not.toContain(rawToken);
    expect(persisted).not.toContain(hash);
    expect(persisted).not.toContain(password);
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(Date.parse(response.body.expiresAt)).toBeGreaterThanOrEqual(
      before + SESSION_DURATION_MS
    );
  });

  it('restores the current user from the cookie without disclosing secret account fields', async () => {
    const response = await login();
    const restored = await request(app).get('/api/auth/oturum').set('Cookie', cookie(response));
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({
      basarili: true,
      csrfToken: response.body.csrfToken,
      expiresAt: response.body.expiresAt,
      kullanici: { id: 'session-user', tenantId: 'kanada_shopper_baku', rol: 'PATRON' },
    });
    expect(JSON.stringify(restored.body)).not.toContain('sifre_hash');
    expect(JSON.stringify(restored.body)).not.toContain('credential_fingerprint');
    expect(JSON.stringify(restored.body)).not.toContain('sessionHash');
    expect(restored.headers['cache-control']).toBe('no-store');
  });

  it('creates unrelated session and CSRF tokens for separate successful logins', async () => {
    const first = await login();
    const second = await login();
    expect(cookie(second)).not.toBe(cookie(first));
    expect(second.body.csrfToken).not.toBe(first.body.csrfToken);
  });

  it.each([
    ['disabled', { durum: 'PASIF' }],
    ['password changed', { sifre_hash: sifreHashle('New password value!') }],
    ['role changed', { rol: 'BAKU_KURYE' }],
    ['tenant changed', { tenant_id: 'ayla_boutique' }],
    ['unknown role', { rol: 'INVENTED_ROLE' }],
    ['missing tenant', { tenant_id: '' }],
  ])('invalidates sessions after the account is %s', async (_name, changes) => {
    const response = await login();
    Object.assign(kullanicilarVeritabani[0], changes);
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(401);
  });

  it('invalidates a session when the user is deleted', async () => {
    const response = await login();
    setKullanicilarVeritabani([]);
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(401);
  });

  it('returns fresh profile data for an unchanged active credential', async () => {
    const response = await login();
    kullanicilarVeritabani[0].ad_soyad = 'Updated Name';
    const restored = await request(app).get('/api/auth/oturum').set('Cookie', cookie(response));
    expect(restored.status).toBe(200);
    expect(restored.body.kullanici.adSoyad).toBe('Updated Name');
  });

  it('expires at exactly eight hours without sliding refresh', async () => {
    const response = await login();
    const expires = Date.parse(response.body.expiresAt);
    vi.spyOn(Date, 'now').mockReturnValue(expires - 1);
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(200);
    vi.spyOn(Date, 'now').mockReturnValue(expires);
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(401);
    vi.restoreAllMocks();
  });

  it('revokes the persisted token and clears the cookie', async () => {
    const response = await login();
    const logout = await request(app).post('/revoke').set('Cookie', cookie(response));
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/^tomnap_session=;/);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual([]);
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(401);
  });

  it('does not accept header/query credentials, malformed or duplicate cookies', async () => {
    const response = await login();
    for (const header of [
      'tomnap_session=bad',
      `tomnap_session=${'a'.repeat(64)}`,
      `${cookie(response)}; ${cookie(response)}`,
    ]) {
      expect((await request(app).get('/api/auth/oturum').set('Cookie', header)).status).toBe(401);
    }
    expect(
      (
        await request(app)
          .get('/api/auth/oturum')
          .set('Authorization', `Bearer ${cookie(response).split('=')[1]}`)
      ).status
    ).toBe(401);
    expect(
      (await request(app).get(`/api/auth/oturum?tomnap_session=${cookie(response).split('=')[1]}`))
        .status
    ).toBe(401);
  });

  it('fails closed when local session storage is malformed and issues no login cookie', async () => {
    const response = await login();
    fs.writeFileSync(file, '{broken');
    expect(
      (await request(app).get('/api/auth/oturum').set('Cookie', cookie(response))).status
    ).toBe(503);
    const failedLogin = await login();
    expect(failedLogin.status).toBe(503);
    expect(failedLogin.headers['set-cookie']).toBeUndefined();
  });

  it('rejects a stale account passed to createSession after a password change', async () => {
    const stale = { ...kullanicilarVeritabani[0] };
    kullanicilarVeritabani[0].sifre_hash = sifreHashle('Replacement password!');
    const response = { cookie: vi.fn() } as any;
    await expect(createSession(stale, response)).rejects.toThrow('Account changed');
    expect(response.cookie).not.toHaveBeenCalled();
  });
});

describe('Login has no shared or magic credentials', () => {
  it.each(['admin2026', 'admin', 'tomnap2026', 'tomnap', 'demo'])(
    'denies the former bypass %s',
    async (identifier) => {
      const response = await login(identifier, 'admin2026');
      expect(response.status).toBe(404);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  );

  it('permits a real password-bearing SUPER_ADMIN account', async () => {
    setKullanicilarVeritabani([user({ rol: 'SUPER_ADMIN' })]);
    const response = await login();
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      tip: 'super_admin',
      tenantId: 'all',
      rol: 'SUPER_ADMIN',
    });
    const restored = await request(app).get('/api/auth/oturum').set('Cookie', cookie(response));
    expect(restored.body.kullanici).toMatchObject({ rol: 'SUPER_ADMIN', tenantId: 'all' });
  });

  it('requires exact normalized phones and rejects the former seven-digit suffix match', async () => {
    expect((await login('+994501234567')).status).toBe(200);
    expect((await login('1234567')).status).toBe(404);
  });

  it('rejects ambiguous email and phone identifiers instead of choosing the first account', async () => {
    setKullanicilarVeritabani([user(), user({ id: 'duplicate' })]);
    expect((await login()).status).toBe(404);
    expect((await login('+994501234567')).status).toBe(404);
  });

  it('does not establish a session when an activation token is consumed', async () => {
    setKullanicilarVeritabani([
      user({
        durum: 'BEKLEMEDE_SIFRE',
        sifre_hash: undefined,
        aktivasyon_token: 'activation-token',
        token_gecerlilik: new Date(Date.now() + 3600000).toISOString(),
      }),
    ]);
    const activation = await request(app)
      .post('/api/auth/sifre-belirle')
      .send({ token: 'activation-token', sifre: password });
    expect(activation.status).toBe(200);
    expect(activation.headers['set-cookie']).toBeUndefined();
    expect(activation.body.csrfToken).toBeUndefined();
    expect((await request(app).get('/api/auth/oturum')).status).toBe(401);
    expect((await login()).status).toBe(200);
  });
});
