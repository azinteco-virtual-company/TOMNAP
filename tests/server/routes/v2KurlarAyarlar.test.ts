import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server';
import { bellektekiKurlar, kurEkle } from '../../../src/server/services/v2/kurlar';
import { ayarlariGuncelle, bellektekiAyarlar } from '../../../src/server/services/v2/ayarlar';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

const V2 = { FF_V2_FLOW: 'true' };
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const kur = (extra: Record<string, unknown> = {}) => ({
  para_birimi: 'CAD',
  tarih: '2026-09-21',
  azn_karsiligi: 1.25,
  ...extra,
});

describeTenantIsolation('v2 kurlar (GET/POST /api/v2/kurlar)', {
  env: V2,
  seed: async () => {
    await kurEkle(TENANT_A, 'seed-a', {
      paraBirimi: 'CAD',
      tarih: '2026-09-20',
      aznKarsiligi: 1.2345,
      kaynak: 'kaynak-A-isaret',
    });
    await kurEkle(TENANT_B, 'seed-b', {
      paraBirimi: 'USD',
      tarih: '2026-09-20',
      aznKarsiligi: 1.7777,
      kaynak: 'kaynak-B-isaret',
    });
  },
  own: { id: 'own', marker: 'kaynak-A-isaret' },
  foreign: { id: 'foreign', markers: ['kaynak-B-isaret', '1.7777'] },
  list: (agent) => agent.get('/api/v2/kurlar'),
  // Writing into tenant B means naming it in the body; the session decides.
  write: (agent, id) =>
    agent.post('/api/v2/kurlar').send(kur(id === 'foreign' ? { tenant_id: TENANT_B } : {})),
  foreignState: () => bellektekiKurlar(TENANT_B),
});

describeTenantIsolation('v2 ayarlar (GET/PATCH /api/v2/ayarlar)', {
  env: V2,
  seed: async () => {
    await ayarlariGuncelle(TENANT_A, 'seed-a', {
      aylikBeyanSinirUsd: 321.5,
      varsayilanKgFiyatiAzn: 11.11,
      primOraniVarsayilan: 0.0321,
    });
    await ayarlariGuncelle(TENANT_B, 'seed-b', {
      aylikBeyanSinirUsd: 987.65,
      varsayilanKgFiyatiAzn: 99.99,
      primOraniVarsayilan: 0.0987,
    });
  },
  own: { id: 'own', marker: '321.5' },
  foreign: { id: 'foreign', markers: ['987.65', '99.99', '0.0987'] },
  read: (agent, id) =>
    agent.get(id === 'foreign' ? `/api/v2/ayarlar?tenant_id=${TENANT_B}` : '/api/v2/ayarlar'),
  write: (agent, id) =>
    agent
      .patch('/api/v2/ayarlar')
      .send({ aylik_beyan_sinir_usd: 400, ...(id === 'foreign' ? { tenant_id: TENANT_B } : {}) }),
  foreignState: () => bellektekiAyarlar(TENANT_B),
});

describe('v2 kurlar and ayarlar behaviour (A7)', () => {
  const app = createApp();
  const TENANT = 'v2-davranis';
  const agents: Record<string, Agent> = {};
  let ownerId = '';
  beforeAll(async () => {
    const { firmalarVeritabani } = await import('../../../src/server/services/state');
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 test',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    for (const role of [
      'PATRON',
      'KANADA_SATINALMA',
      'ABD_SATINALMA',
      'BAKU_FINANS',
      'SATIS_SORUMLUSU',
      'BAKU_KURYE',
    ] as const) {
      const fixture = await loginFixture(app, role, TENANT);
      agents[role] = fixture.agent;
      if (role === 'PATRON') ownerId = fixture.userId;
    }
    agents.SUPER_ADMIN = (await loginFixture(app, 'SUPER_ADMIN', 'all')).agent;
  });
  beforeEach(() => vi.stubEnv('FF_V2_FLOW', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('lets the owner, both buyers and Baku finance enter rates, nobody else', async () => {
    for (const role of ['PATRON', 'KANADA_SATINALMA', 'ABD_SATINALMA', 'BAKU_FINANS'])
      expect([role, (await agents[role].post('/api/v2/kurlar').send(kur())).status]).toEqual([
        role,
        201,
      ]);
    for (const role of ['SATIS_SORUMLUSU', 'BAKU_KURYE']) {
      expect([role, (await agents[role].post('/api/v2/kurlar').send(kur())).status]).toEqual([
        role,
        403,
      ]);
      expect([role, (await agents[role].get('/api/v2/kurlar')).status]).toEqual([role, 403]);
    }
  });

  it('never changes a rate: a correction is a new entry and becomes current', async () => {
    const first = await agents.PATRON.post('/api/v2/kurlar').send(
      kur({ para_birimi: 'USD', azn_karsiligi: 1.7 })
    );
    const second = await agents.KANADA_SATINALMA.post('/api/v2/kurlar').send(
      kur({ para_birimi: 'USD', azn_karsiligi: 1.705, kaynak: '  CBAR\u0000 ' })
    );
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.kur).toMatchObject({
      tenantId: TENANT,
      girenKullaniciId: ownerId,
      aznKarsiligi: 1.7,
    });
    expect(second.body.kur.kaynak).toBe('CBAR');
    const list = await agents.BAKU_FINANS.get('/api/v2/kurlar');
    expect(list.body.guncel.USD).toMatchObject({ id: second.body.kur.id, aznKarsiligi: 1.705 });
    expect(list.body.kurlar.map((row: { id: string }) => row.id)).toEqual(
      expect.arrayContaining([first.body.kur.id, second.body.kur.id])
    );
    // No route edits or deletes a rate.
    for (const method of ['patch', 'put', 'delete'] as const)
      expect((await agents.PATRON[method]('/api/v2/kurlar').send({})).status).toBe(403);
    expect(bellektekiKurlar(TENANT).find((row) => row.id === first.body.kur.id)?.aznKarsiligi).toBe(
      1.7
    );
  });

  it.each([
    ['unknown currency', { para_birimi: 'EUR' }],
    ['zero rate', { azn_karsiligi: 0 }],
    ['negative rate', { azn_karsiligi: -1.2 }],
    ['rate of 100', { azn_karsiligi: 100 }],
    ['seven decimals', { azn_karsiligi: 1.2345678 }],
    ['rate as text', { azn_karsiligi: '1.2' }],
    ['date format', { tarih: '21.09.2026' }],
    ['impossible date', { tarih: '2026-02-30' }],
    ['future date', { tarih: '2099-01-01' }],
    ['too old date', { tarih: '1999-12-31' }],
    ['long source', { kaynak: 'x'.repeat(101) }],
    ['client-chosen author', { giren_kullanici_id: 'someone-else' }],
  ])('rejects a rate with %s and writes nothing', async (_name, change) => {
    const before = bellektekiKurlar(TENANT).length;
    const response = await agents.PATRON.post('/api/v2/kurlar').send(kur(change));
    expect(response.status).toBe(400);
    expect(bellektekiKurlar(TENANT)).toHaveLength(before);
  });

  it('serves defaults until the owner saves settings, and updates only the sent fields', async () => {
    const fresh = await agents.PATRON.get('/api/v2/ayarlar');
    expect(fresh.body.ayarlar).toMatchObject({
      kayitli: false,
      aylikBeyanSinirUsd: 300,
      varsayilanKgFiyatiAzn: null,
      primOraniVarsayilan: 0.05,
    });
    const saved = await agents.PATRON.patch('/api/v2/ayarlar').send({
      varsayilan_kg_fiyati_azn: 14.5,
    });
    expect(saved.body.ayarlar).toMatchObject({
      kayitli: true,
      aylikBeyanSinirUsd: 300,
      varsayilanKgFiyatiAzn: 14.5,
      primOraniVarsayilan: 0.05,
      guncelleyenKullaniciId: ownerId,
    });
    const again = await agents.PATRON.patch('/api/v2/ayarlar').send({
      prim_orani_varsayilan: 0.06,
    });
    expect(again.body.ayarlar).toMatchObject({
      varsayilanKgFiyatiAzn: 14.5,
      primOraniVarsayilan: 0.06,
    });
    for (const bad of [
      {},
      { aylik_beyan_sinir_usd: 0 },
      { aylik_beyan_sinir_usd: 100000.01 },
      { prim_orani_varsayilan: 1.5 },
      { prim_orani_varsayilan: 0.12345 },
      { varsayilan_kg_fiyati_azn: -1 },
      { bilinmeyen: 1 },
    ])
      expect([bad, (await agents.PATRON.patch('/api/v2/ayarlar').send(bad)).status]).toEqual([
        bad,
        400,
      ]);
    expect(bellektekiAyarlar(TENANT)).toMatchObject({ primOraniVarsayilan: 0.06 });
  });

  it('keeps settings to the owners', async () => {
    for (const role of [
      'KANADA_SATINALMA',
      'ABD_SATINALMA',
      'BAKU_FINANS',
      'SATIS_SORUMLUSU',
      'BAKU_KURYE',
    ]) {
      expect([role, (await agents[role].get('/api/v2/ayarlar')).status]).toEqual([role, 403]);
      expect([
        role,
        (await agents[role].patch('/api/v2/ayarlar').send({ prim_orani_varsayilan: 0.5 })).status,
      ]).toEqual([role, 403]);
    }
  });

  it('shows the administrator the settings without the prim rate, which only the owner sets (K15)', async () => {
    expect(
      (await agents.PATRON.patch('/api/v2/ayarlar').send({ prim_orani_varsayilan: 0.07 })).status
    ).toBe(200);
    const scoped = `/api/v2/ayarlar?tenant_id=${TENANT}`;
    const seen = await agents.SUPER_ADMIN.get(scoped);
    expect(seen.status).toBe(200);
    expect(seen.body.ayarlar).toHaveProperty('aylikBeyanSinirUsd');
    expect(seen.body.ayarlar).not.toHaveProperty('primOraniVarsayilan');
    expect(JSON.stringify(seen.body)).not.toContain('0.07');
    for (const body of [
      { prim_orani_varsayilan: 0.09 },
      { prim_orani_varsayilan: 'x' },
      { aylik_beyan_sinir_usd: 500, prim_orani_varsayilan: 0.09 },
    ])
      expect([body, (await agents.SUPER_ADMIN.patch(scoped).send(body)).status]).toEqual([
        body,
        403,
      ]);
    const other = await agents.SUPER_ADMIN.patch(scoped).send({ aylik_beyan_sinir_usd: 450 });
    expect(other.status).toBe(200);
    expect(other.body.ayarlar).not.toHaveProperty('primOraniVarsayilan');
    expect(bellektekiAyarlar(TENANT)).toMatchObject({
      aylikBeyanSinirUsd: 450,
      primOraniVarsayilan: 0.07,
    });
    expect((await agents.PATRON.get('/api/v2/ayarlar')).body.ayarlar.primOraniVarsayilan).toBe(
      0.07
    );
  });

  it('requires an administrator to select a concrete boutique', async () => {
    expect((await agents.SUPER_ADMIN.get('/api/v2/kurlar')).status).toBe(400);
    expect((await agents.SUPER_ADMIN.get('/api/v2/ayarlar')).status).toBe(400);
    expect((await agents.SUPER_ADMIN.post('/api/v2/kurlar').send(kur())).status).toBe(403);
    const scoped = await agents.SUPER_ADMIN.get(`/api/v2/kurlar?tenant_id=${TENANT}`);
    expect(scoped.status).toBe(200);
    expect(scoped.body.kurlar.every((row: { tenantId: string }) => row.tenantId === TENANT)).toBe(
      true
    );
  });
});
