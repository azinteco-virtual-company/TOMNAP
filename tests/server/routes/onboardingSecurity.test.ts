import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const db = vi.hoisted(() => ({ client: null as any }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return db.client;
  },
}));
import router, { davetlerVeritabani } from '../../../src/server/routes/firmalar';
import { kullanicilarVeritabani, firmalarVeritabani } from '../../../src/server/services/state';

const app = express().use(express.json()).use('/api', router);
const signup = {
  ad: 'Security Fixture',
  sahipAdi: 'Test Owner',
  sahipEmail: 'owner@example.invalid',
  sahipTelefon: '+994000000002',
};

beforeEach(() => {
  db.client = null;
});

describe('Onboarding trust boundaries', () => {
  it('does not disclose an activation token to the registration caller', async () => {
    const response = await request(app).post('/api/firmalar/kayit').send(signup);
    expect(response.status).toBe(200);
    const user = kullanicilarVeritabani.find((u) => u.tenant_id === response.body.firma.id)!;
    expect(user.aktivasyon_token).toBeTruthy();
    expect(JSON.stringify(response.body)).not.toContain(user.aktivasyon_token);
    expect(response.body.aktivasyonLinki).toBeUndefined();
  });

  it.each(['firmalar', 'kullanicilar'])(
    'does not report signup success after %s persistence fails',
    async (failingTable) => {
      const count = kullanicilarVeritabani.length;
      db.client = {
        from: (table: string) => ({
          insert: async () => ({
            error: table === failingTable ? { message: 'write failed' } : null,
          }),
        }),
      };
      const response = await request(app).post('/api/firmalar/kayit').send(signup);
      expect(response.status).toBe(503);
      expect(response.body.basarili).toBe(false);
      expect(kullanicilarVeritabani).toHaveLength(count);
    }
  );

  it('rejects SUPER_ADMIN and unknown invitation roles', async () => {
    for (const rol of ['SUPER_ADMIN', 'unknown']) {
      const response = await request(app)
        .post('/api/firmalar/davet-olustur')
        .send({ tenantId: firmalarVeritabani[0].id, rol });
      expect(response.status).toBe(400);
    }
  });

  it('uses an unpredictable invitation token and does not trust the Host header', async () => {
    const response = await request(app)
      .post('/api/firmalar/davet-olustur')
      .set('Host', 'attacker.invalid')
      .set('X-Forwarded-Proto', 'https')
      .send({
        tenantId: firmalarVeritabani[0].id,
        rol: 'BAKU_KURYE',
        email: 'courier@example.invalid',
      });
    expect(response.status).toBe(200);
    expect(response.body.davet.token).toMatch(/^inv_[a-f0-9]{64}$/);
    expect(new URL(response.body.davetUrlTam).origin).toBe('http://localhost');
  });

  it('does not publish an invite when its database insert fails', async () => {
    const count = davetlerVeritabani.length;
    db.client = {
      from: () => ({
        insert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { message: 'unavailable' } }),
          }),
        }),
      }),
    };
    const response = await request(app)
      .post('/api/firmalar/davet-olustur')
      .send({ tenantId: firmalarVeritabani[0].id, rol: 'BAKU_KURYE' });
    expect(response.status).toBe(503);
    expect(davetlerVeritabani).toHaveLength(count);
    expect(response.body.davet).toBeUndefined();
  });
});
