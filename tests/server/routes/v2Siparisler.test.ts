import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../../src/server';
import {
  firmalarVeritabani,
  kullanicilarVeritabani,
  musterilerVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import {
  bellektekiSatirlar,
  v2SiparisGirdisiniDogrula,
  v2SiparisOlustur,
} from '../../../src/server/services/v2/siparisStore';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const satir = (extra: Record<string, unknown> = {}) => ({
  urun_aciklamasi: 'Çanta',
  adet: 2,
  birim_satis_fiyati_azn: 50,
  kaynak_ulke: 'CA',
  ...extra,
});
const siparis = (extra: Record<string, unknown> = {}) => ({
  musteri_adi: 'Aytən Məmmədova',
  telefon_numarasi: '+994501112233',
  satirlar: [
    satir(),
    satir({ urun_aciklamasi: 'Kəmər', adet: 1, birim_satis_fiyati_azn: 30.5, kaynak_ulke: 'US' }),
  ],
  ...extra,
});
function seedUser(
  id: string,
  tenant: string,
  rol: 'PATRON' | 'SATIS_SORUMLUSU' | 'KANADA_SATINALMA',
  durum = 'AKTIF'
) {
  if (kullanicilarVeritabani.some((u) => u.id === id)) return;
  kullanicilarVeritabani.push({
    id,
    tenant_id: tenant,
    ad_soyad: id,
    email: `${id}@example.invalid`,
    rol,
    durum: durum as 'AKTIF',
    olusturma_tarihi: new Date().toISOString(),
  });
}

const ids = { own: '', foreign: '' };
describeTenantIsolation('v2 siparisler (POST/GET /api/v2/siparisler)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    seedUser('v2-seed-a', TENANT_A, 'PATRON');
    seedUser('v2-seed-b', TENANT_B, 'PATRON');
    ids.own = (
      await v2SiparisOlustur(
        TENANT_A,
        'v2-seed-a',
        v2SiparisGirdisiniDogrula(siparis({ musteri_adi: 'v2-A-isaret' }))
      )
    ).id;
    ids.foreign = (
      await v2SiparisOlustur(
        TENANT_B,
        'v2-seed-b',
        v2SiparisGirdisiniDogrula(siparis({ musteri_adi: 'v2-B-isaret' }))
      )
    ).id;
  },
  own: { id: 'own', marker: 'v2-A-isaret' },
  foreign: { id: 'foreign', markers: ['v2-B-isaret'] },
  read: (agent, id) => agent.get(`/api/v2/siparisler/${id === 'own' ? ids.own : ids.foreign}`),
  list: (agent) => agent.get('/api/v2/siparisler'),
  write: (agent, id) =>
    agent.post('/api/v2/siparisler').send(siparis(id === 'foreign' ? { tenant_id: TENANT_B } : {})),
  foreignState: () => [
    bellektekiSatirlar(TENANT_B),
    siparislerVeritabani.filter((row) => row.tenant_id === TENANT_B && row.model_surumu === 2),
  ],
});

describe('v2 orders with lines and an owner (A8)', () => {
  const app = createApp();
  const TENANT = 'v2-siparis-davranis';
  const agents: Record<string, Agent> = {};
  const userIds: Record<string, string> = {};
  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 sipariş',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    musterilerVeritabani.push(
      { id: 'v2-mus-kendi', tenant_id: TENANT, ad_soyad: 'Kendi müşteri' } as never,
      { id: 'v2-mus-yabanci', tenant_id: TENANT_B, ad_soyad: 'Yabancı müşteri' } as never
    );
    for (const role of ['PATRON', 'SATIS_SORUMLUSU', 'KANADA_SATINALMA', 'BAKU_KURYE'] as const) {
      const fixture = await loginFixture(app, role, TENANT);
      agents[role] = fixture.agent;
      userIds[role] = fixture.userId;
    }
    const admin = await loginFixture(app, 'SUPER_ADMIN', 'all');
    agents.SUPER_ADMIN = admin.agent;
    userIds.SUPER_ADMIN = admin.userId;
    seedUser('v2-diger-satis', TENANT, 'SATIS_SORUMLUSU');
    seedUser('v2-pasif-satis', TENANT, 'SATIS_SORUMLUSU', 'PASIF');
  });
  beforeEach(() => vi.stubEnv('FF_V2_FLOW', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  it('writes the header and lines together, derives the old columns, and the creator owns it', async () => {
    const created = await agents.PATRON.post('/api/v2/siparisler').send(
      siparis({ musteri_id: 'v2-mus-kendi' })
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.siparis).toMatchObject({
      tenantId: TENANT,
      sahipKullaniciId: userIds.PATRON,
      musteriId: 'v2-mus-kendi',
      toplamTutar: 130.5,
      alinanTutar: 0,
      kalanTutar: 130.5,
      finansDurumu: 'BEKLIYOR',
      lojistikDurumu: 'KANADA_SATINALIM_BEKLIYOR',
    });
    expect(
      created.body.siparis.satirlar.map(
        (s: { sira: number; urunAciklamasi: string; kaynakUlke: string }) => [
          s.sira,
          s.urunAciklamasi,
          s.kaynakUlke,
        ]
      )
    ).toEqual([
      [1, 'Çanta', 'CA'],
      [2, 'Kəmər', 'US'],
    ]);
    const id = created.body.siparis.id;
    expect((await agents.KANADA_SATINALMA.get(`/api/v2/siparisler/${id}`)).body.siparis.id).toBe(
      id
    );
    // The v1 screens keep reading the header with its derived columns.
    const v1 = (
      await agents.PATRON.get('/api/siparisler').query({ page_size: 500 })
    ).body.siparisler.find((row: { id: string }) => row.id === id);
    expect(v1).toMatchObject({
      model_surumu: 2,
      toplam_tutar: 130.5,
      adet: 3,
      urun_aciklamasi: 'Çanta + Kəmər',
      musteri_id: 'v2-mus-kendi',
    });
  });

  it('lets an owner choose an active sales owner; sales users own only their own orders', async () => {
    const chosen = await agents.PATRON.post('/api/v2/siparisler').send(
      siparis({ sahip_kullanici_id: 'v2-diger-satis' })
    );
    expect(chosen.body.siparis?.sahipKullaniciId).toBe('v2-diger-satis');
    const own = await agents.SATIS_SORUMLUSU.post('/api/v2/siparisler').send(siparis());
    expect(own.body.siparis?.sahipKullaniciId).toBe(userIds.SATIS_SORUMLUSU);
    const before = siparislerVeritabani.length;
    for (const [agent, body, status] of [
      ['SATIS_SORUMLUSU', { sahip_kullanici_id: userIds.PATRON }, 403],
      ['PATRON', { sahip_kullanici_id: 'v2-pasif-satis' }, 409],
      ['PATRON', { sahip_kullanici_id: userIds.KANADA_SATINALMA }, 409],
      ['PATRON', { sahip_kullanici_id: 'kimse' }, 409],
      ['PATRON', { musteri_id: 'v2-mus-yabanci' }, 409],
      ['KANADA_SATINALMA', {}, 403],
      ['BAKU_KURYE', {}, 403],
    ] as const)
      expect([
        agent,
        body,
        (await agents[agent].post('/api/v2/siparisler').send(siparis(body))).status,
      ]).toEqual([agent, body, status]);
    expect(siparislerVeritabani.length).toBe(before);
    expect((await agents.BAKU_KURYE.get('/api/v2/siparisler')).status).toBe(403);
  });

  it.each([
    ['no lines', { satirlar: [] }],
    ['101 lines', { satirlar: Array.from({ length: 101 }, () => satir()) }],
    ['blank customer', { musteri_adi: '   ' }],
    ['zero quantity', { satirlar: [satir({ adet: 0 })] }],
    ['fractional quantity', { satirlar: [satir({ adet: 1.5 })] }],
    ['negative price', { satirlar: [satir({ birim_satis_fiyati_azn: -1 })] }],
    ['three decimals', { satirlar: [satir({ birim_satis_fiyati_azn: 1.005 })] }],
    ['price as text', { satirlar: [satir({ birim_satis_fiyati_azn: '50' })] }],
    ['unknown country', { satirlar: [satir({ kaynak_ulke: 'DE' })] }],
    ['blank product', { satirlar: [satir({ urun_aciklamasi: ' ' })] }],
    ['unknown line field', { satirlar: [satir({ toplam: 1 })] }],
    ['client-chosen total', { toplam_tutar: 1 }],
    ['client-chosen status', { lojistik_durumu: 'TESLIM_EDILDI' }],
    ['too large total', { satirlar: [satir({ adet: 1000, birim_satis_fiyati_azn: 999999.99 })] }],
  ])('rejects %s and writes nothing', async (_name, change) => {
    const [before, lines] = [siparislerVeritabani.length, bellektekiSatirlar(TENANT).length];
    expect((await agents.PATRON.post('/api/v2/siparisler').send(siparis(change))).status).toBe(400);
    expect([siparislerVeritabani.length, bellektekiSatirlar(TENANT).length]).toEqual([
      before,
      lines,
    ]);
  });

  it('keeps the derived old columns of a v2 order away from the generic PATCH (K20)', async () => {
    const id = (await agents.PATRON.post('/api/v2/siparisler').send(siparis())).body.siparis.id;
    for (const body of [
      { toplam_tutar: 1 },
      { alinan_tutar: 10 },
      { lojistik_durumu: 'KANADA_DEPO' },
      { finans_durumu: 'ODENDI' },
      { urun_aciklamasi: 'x' },
      { adet: 9 },
    ])
      expect([
        body,
        (await agents.PATRON.patch(`/api/siparisler/${id}`).send(body)).status,
      ]).toEqual([body, 409]);
    expect(
      (await agents.PATRON.patch(`/api/siparisler/${id}`).send({ ozel_not: 'Qapıda zəng et' }))
        .status
    ).toBe(200);
    expect(siparislerVeritabani.find((row) => row.id === id)).toMatchObject({
      toplam_tutar: 130.5,
      alinan_tutar: 0,
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
    });
    // A v1 order is unchanged by this rule.
    siparislerVeritabani.push({
      id: 'v1-siparis-kontrol',
      tenant_id: TENANT,
      musteri_adi: 'v1',
      urun_aciklamasi: 'v1',
      adet: 1,
      toplam_tutar: 10,
      alinan_tutar: 0,
      eksik_bilgiler: [],
    });
    expect(
      (await agents.PATRON.patch('/api/siparisler/v1-siparis-kontrol').send({ toplam_tutar: 12 }))
        .status
    ).toBe(200);
  });

  it('answers 404 for foreign, v1 and malformed order ids', async () => {
    for (const id of ['v1-siparis-kontrol', 'not-a-uuid', '00000000-0000-4000-8000-000000000000'])
      expect((await agents.PATRON.get(`/api/v2/siparisler/${id}`)).status).toBe(404);
  });

  it('lets the administrator create in a selected boutique; the owner defaults to the creator', async () => {
    const created = await agents.SUPER_ADMIN.post(`/api/v2/siparisler?tenant_id=${TENANT}`).send(
      siparis()
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.siparis).toMatchObject({
      tenantId: TENANT,
      sahipKullaniciId: userIds.SUPER_ADMIN,
    });
    expect((await agents.SUPER_ADMIN.post('/api/v2/siparisler').send(siparis())).status).toBe(403);
  });
});
