import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { sessionAuth, apiKeyAuth } from '../../../src/server/middleware/auth';
import authRouter from '../../../src/server/routes/auth';
import { DATA_DIR } from '../../../src/server/config';
import {
  setKullanicilarVeritabani,
  setFirmalarVeritabani,
} from '../../../src/server/services/state';
import { sifreHashle } from '../../../src/server/services/crypto';
import type { KullaniciKaydi } from '../../../src/server/types';

const password = 'Real session password!';
const hash = sifreHashle(password);
const roles: KullaniciKaydi['rol'][] = [
  'SUPER_ADMIN',
  'PATRON',
  'SATIS_SORUMLUSU',
  'KANADA_SATINALMA',
  'BAKU_FINANS',
  'BAKU_KURYE',
];
const app = express();
app.use(express.json());
app.use(sessionAuth());
app.use('/api', authRouter);
for (const route of [
  '/api/health',
  '/health',
  '/api/siparisler',
  '/api/siparisler/order',
  '/api/firmalar',
  '/api/firmalar/davet-olustur',
  '/api/sistem-durum',
  '/api/kargo/ayarlar',
  '/api/test',
  '/api/auth/giris/extra',
  '/uploads/file.png',
]) {
  app.all(route, (req, res) =>
    res.json({
      ok: true,
      tenant: req.tenantId,
      role: req.auth?.role,
      body: req.body,
      query: req.query,
    })
  );
}
async function signIn(role: KullaniciKaydi['rol'] = 'PATRON') {
  const response = await request(app)
    .post('/api/auth/giris')
    .send({ email: `${role.toLowerCase()}@example.test`, sifre: password });
  expect(response.status).toBe(200);
  return { cookie: response.headers['set-cookie'][0].split(';')[0], csrf: response.body.csrfToken };
}

beforeEach(() => {
  fs.rmSync(path.join(DATA_DIR, 'oturumlar.json'), { force: true });
  setFirmalarVeritabani(
    ['company-a', 'company-b'].map((id) => ({
      id,
      ad: id,
      sehir: 'Baku',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 10,
      aciklama: '',
      onayDurumu: 'AKTIF',
    }))
  );
  setKullanicilarVeritabani(
    roles.map((rol) => ({
      id: rol,
      tenant_id: 'company-a',
      ad_soyad: rol,
      email: `${rol.toLowerCase()}@example.test`,
      rol,
      durum: 'AKTIF',
      sifre_hash: hash,
      olusturma_tarihi: new Date().toISOString(),
    }))
  );
});
afterEach(() => vi.unstubAllEnvs());

describe('Session middleware replaces the API key and browser header bypasses', () => {
  it('keeps the old export as a compatibility alias for the secure middleware', () => {
    expect(apiKeyAuth).toBe(sessionAuth);
  });

  it.each(['development', 'production'])(
    'requires a session in %s even when API_SECRET_KEY is absent',
    async (environment) => {
      vi.stubEnv('NODE_ENV', environment);
      vi.stubEnv('API_SECRET_KEY', '');
      expect((await request(app).get('/api/siparisler')).status).toBe(401);
    }
  );

  it.each([
    ['x-api-key', 'shared-api-secret'],
    ['Authorization', 'Bearer shared-api-secret'],
    ['sec-fetch-site', 'same-origin'],
    ['sec-fetch-site', 'same-site'],
    ['origin', 'http://localhost'],
    ['referer', 'https://tomnap.com/'],
    ['origin', 'https://tomnap.com.attacker.test'],
    ['referer', 'https://vercel.app.attacker.test'],
  ])('never authenticates a forged %s header', async (header, value) => {
    vi.stubEnv('API_SECRET_KEY', 'shared-api-secret');
    const response = await request(app).get('/api/siparisler').set(header, value);
    expect(response.status).toBe(401);
    expect(response.body.ok).toBeUndefined();
  });

  it('rejects credentials and roles provided through query parameters', async () => {
    vi.stubEnv('API_SECRET_KEY', 'shared-api-secret');
    const response = await request(app).get(
      '/api/siparisler?api_key=shared-api-secret&rol=SUPER_ADMIN&tenantId=all'
    );
    expect(response.status).toBe(401);
  });

  it.each(['/API/siparisler', '/Api/firmalar', '/Uploads/file.png'])(
    'protects case-insensitive Express route aliases: %s',
    async (route) => {
      const response = await request(app).get(route);
      expect(response.status).toBe(401);
      expect(response.body.ok).toBeUndefined();
    }
  );

  it('resolves a real session to server-owned role and tenant scope', async () => {
    const auth = await signIn();
    const response = await request(app)
      .get('/api/siparisler?rol=SUPER_ADMIN')
      .set('Cookie', auth.cookie)
      .set('x-role', 'SUPER_ADMIN');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      role: 'PATRON',
      tenant: 'company-a',
      query: { tenant_id: 'company-a', tenantId: 'company-a' },
    });
    expect(response.headers['cache-control']).toContain('no-store');
  });
});

describe('CSRF protection, exact public paths, and role authorization', () => {
  it('permits only the minimal health route publicly', async () => {
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/health')).status).toBe(200);
    for (const route of [
      '/api/sistem-durum',
      '/api/firmalar',
      '/api/auth/oturum',
      '/api/auth/giris',
      '/api/auth/giris/extra',
    ]) {
      expect((await request(app).get(route)).status).toBe(401);
    }
    expect((await request(app).post('/api/health')).status).toBe(401);
    expect((await request(app).post('/api/auth/giris/extra')).status).toBe(401);
  });

  it('answers HEAD like GET on the public read routes, and on no other route', async () => {
    for (const route of ['/api/health', '/health'])
      expect((await request(app).head(route)).status).toBe(200);
    // Public token checks reach their handler instead of stopping at 401.
    for (const route of [
      '/api/auth/token-kontrol/unknown-token',
      '/api/firmalar/davet/unknown-token',
    ]) {
      const head = await request(app).head(route);
      expect(head.status).not.toBe(401);
      expect(head.status).toBe((await request(app).get(route)).status);
    }
    for (const route of [
      '/api/siparisler',
      '/api/sistem-durum',
      '/api/auth/giris',
      '/uploads/file.png',
    ])
      expect((await request(app).head(route)).status).toBe(401);
  });

  it('allows password login publicly but rejects a cross-origin login request', async () => {
    const login = { email: 'patron@example.test', sifre: password };
    for (const origin of ['https://attacker.test', 'http://localhost.attacker.test', 'null']) {
      const response = await request(app).post('/api/auth/giris').set('Origin', origin).send(login);
      expect(response.status).toBe(403);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
    expect(
      (await request(app).post('/api/auth/giris').set('Origin', 'http://localhost').send(login))
        .status
    ).toBe(200);
  });

  it('rejects missing, wrong, and another session’s CSRF token', async () => {
    const auth = await signIn();
    const other = await signIn('SATIS_SORUMLUSU');
    expect(
      (await request(app).post('/api/siparisler').set('Cookie', auth.cookie).send({})).status
    ).toBe(403);
    for (const token of ['wrong', 'a'.repeat(64), other.csrf]) {
      expect(
        (
          await request(app)
            .post('/api/siparisler')
            .set('Cookie', auth.cookie)
            .set('x-csrf-token', token)
            .send({})
        ).status
      ).toBe(403);
    }
    const response = await request(app)
      .post('/api/siparisler')
      .set('Cookie', auth.cookie)
      .set('x-csrf-token', auth.csrf)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.body).toMatchObject({ tenantId: 'company-a', tenant_id: 'company-a' });
  });

  it('rejects a cross-origin write even with a valid cookie and CSRF token', async () => {
    const auth = await signIn();
    expect(
      (
        await request(app)
          .post('/api/siparisler')
          .set('Cookie', auth.cookie)
          .set('x-csrf-token', auth.csrf)
          .set('Origin', 'https://attacker.test')
          .send({})
      ).status
    ).toBe(403);
  });

  it('rejects insufficient roles for sensitive reads and writes', async () => {
    const courier = await signIn('BAKU_KURYE');
    expect((await request(app).get('/api/siparisler').set('Cookie', courier.cookie)).status).toBe(
      403
    );
    const sales = await signIn('SATIS_SORUMLUSU');
    expect((await request(app).get('/api/sistem-durum').set('Cookie', sales.cookie)).status).toBe(
      403
    );
    expect(
      (
        await request(app)
          .post('/api/kargo/ayarlar')
          .set('Cookie', sales.cookie)
          .set('x-csrf-token', sales.csrf)
          .send({})
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/firmalar/davet-olustur')
          .set('Cookie', sales.cookie)
          .set('x-csrf-token', sales.csrf)
          .send({})
      ).status
    ).toBe(403);
  });

  it('denies new/unreviewed routes and methods even for an authenticated administrator', async () => {
    const admin = await signIn('SUPER_ADMIN');
    expect((await request(app).get('/api/test').set('Cookie', admin.cookie)).status).toBe(403);
    expect(
      (
        await request(app)
          .put('/api/siparisler')
          .set('Cookie', admin.cookie)
          .set('x-csrf-token', admin.csrf)
          .send({ tenantId: 'company-a' })
      ).status
    ).toBe(403);
  });

  it('requires CSRF for logout, revokes the session, and rejects a reused old cookie', async () => {
    const auth = await signIn();
    expect((await request(app).post('/api/auth/cikis').set('Cookie', auth.cookie)).status).toBe(
      403
    );
    expect((await request(app).get('/api/auth/oturum').set('Cookie', auth.cookie)).status).toBe(
      200
    );
    const logout = await request(app)
      .post('/api/auth/cikis')
      .set('Cookie', auth.cookie)
      .set('x-csrf-token', auth.csrf)
      .send({});
    expect(logout.status).toBe(200);
    expect(logout.headers['set-cookie'][0]).toMatch(/^tomnap_session=;/);
    expect((await request(app).get('/api/siparisler').set('Cookie', auth.cookie)).status).toBe(401);
  });
});

describe('Tenant aliases never override the session of an ordinary user', () => {
  it.each(['tenant_id', 'tenantId'])(
    'rejects %s query overrides, all scope, and duplicate query parameters',
    async (alias) => {
      const auth = await signIn();
      for (const value of ['company-b', 'all']) {
        expect(
          (await request(app).get(`/api/siparisler?${alias}=${value}`).set('Cookie', auth.cookie))
            .status
        ).toBe(403);
      }
      expect(
        (
          await request(app)
            .get(`/api/siparisler?${alias}=company-a&${alias}=company-b`)
            .set('Cookie', auth.cookie)
        ).status
      ).toBe(403);
    }
  );

  it.each([
    { tenant_id: 'company-b' },
    { tenantId: 'company-b' },
    { tenantId: 'all' },
    { tenantId: ['company-a'] },
    { tenantId: { id: 'company-a' } },
    { duzeltilmis_siparis: { tenant_id: 'company-b' } },
    { duzeltilmis_siparis: { tenantId: 'company-b' } },
    { ayarlar: { tenantId: 'company-b' } },
  ])('rejects body scope overrides %j', async (body) => {
    const auth = await signIn();
    expect(
      (
        await request(app)
          .post('/api/siparisler')
          .set('Cookie', auth.cookie)
          .set('x-csrf-token', auth.csrf)
          .send(body)
      ).status
    ).toBe(403);
  });

  it('rejects a tenant header override and conflicting aliases', async () => {
    const auth = await signIn();
    expect(
      (
        await request(app)
          .get('/api/siparisler')
          .set('Cookie', auth.cookie)
          .set('x-tenant-id', 'company-b')
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .get('/api/siparisler?tenantId=company-a&tenant_id=company-b')
          .set('Cookie', auth.cookie)
      ).status
    ).toBe(403);
  });

  it('allows administrator scope selection but requires a concrete tenant for operational writes', async () => {
    const admin = await signIn('SUPER_ADMIN');
    const all = await request(app).get('/api/siparisler').set('Cookie', admin.cookie);
    expect(all.status).toBe(200);
    expect(all.body.tenant).toBe('all');
    const selected = await request(app)
      .get('/api/siparisler')
      .set('Cookie', admin.cookie)
      .set('x-tenant-id', 'company-b');
    expect(selected.status).toBe(200);
    expect(selected.body.tenant).toBe('company-b');
    expect(
      (
        await request(app)
          .post('/api/siparisler')
          .set('Cookie', admin.cookie)
          .set('x-csrf-token', admin.csrf)
          .send({})
      ).status
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/siparisler')
          .set('Cookie', admin.cookie)
          .set('x-csrf-token', admin.csrf)
          .send({ tenantId: 'company-b' })
      ).status
    ).toBe(200);
  });
});
