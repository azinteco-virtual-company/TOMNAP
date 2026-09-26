import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';
import {
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import { bindCourier, createCourier } from '../../../src/server/services/couriers';
import {
  v2SiparisGirdisiniDogrula,
  v2SiparisOlustur,
} from '../../../src/server/services/v2/siparisStore';
import {
  kasaTeslimAl,
  kasaTeslimGirdisi,
  kuryeTahsilatGirdisi,
  kuryeTahsilatiKaydet,
} from '../../../src/server/services/v2/kasaStore';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const gunOnce = (gun: number) => new Date(Date.now() - gun * 86_400_000).toISOString();
function seedUser(id: string, tenant: string, rol: 'PATRON' | 'BAKU_KURYE' | 'BAKU_FINANS') {
  if (kullanicilarVeritabani.some((u) => u.id === id)) return;
  kullanicilarVeritabani.push({
    id,
    tenant_id: tenant,
    ad_soyad: id,
    email: `${id}@example.invalid`,
    rol,
    durum: 'AKTIF',
    olusturma_tarihi: new Date().toISOString(),
  });
}
function v1Order(tenant: string, musteri: string, extra: Record<string, unknown> = {}) {
  const id = randomUUID();
  siparislerVeritabani.push({
    id,
    tenant_id: tenant,
    musteri_adi: musteri,
    urun_aciklamasi: 'x',
    adet: 1,
    toplam_tutar: 100,
    alinan_tutar: 0,
    lojistik_durumu: 'TESLIM_EDILDI',
    teslim_tarihi: gunOnce(3),
    ...extra,
  });
  return id;
}
const couriers: Record<string, string> = {};
/** A courier with open cash on a v2 order out for delivery. */
async function courierWithCash(tenant: string, user: string, amount: number) {
  seedUser(user, tenant, 'BAKU_KURYE');
  if (!couriers[user]) {
    const kurye = await createCourier(tenant, { ad_soyad: user, telefon: '1', bolge: 'Baku' });
    await bindCourier(tenant, kurye.id, user, null);
    couriers[user] = kurye.id;
  }
  seedUser(`${user}-patron`, tenant, 'PATRON');
  const order = (
    await v2SiparisOlustur(
      tenant,
      `${user}-patron`,
      v2SiparisGirdisiniDogrula({
        musteri_adi: `${user}-musteri`,
        satirlar: [
          { urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 100, kaynak_ulke: 'CA' },
        ],
      })
    )
  ).id;
  Object.assign(
    siparislerVeritabani.find((s) => s.id === order)!,
    {
      baku_kurye_id: couriers[user],
      lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
    }
  );
  return (
    await kuryeTahsilatiKaydet(
      tenant,
      user,
      kuryeTahsilatGirdisi({ siparis_id: order, tutar_azn: amount })
    )
  ).odeme!.id;
}

describeTenantIsolation('v2 leak board (GET /api/v2/kacaklar)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    v1Order(TENANT_A, 'kacak-A-isaret');
    v1Order(TENANT_B, 'kacak-B-isaret');
    await courierWithCash(TENANT_A, 'kacak-kurye-A', 5);
    await courierWithCash(TENANT_B, 'kacak-kurye-B', 5);
  },
  own: { id: 'own', marker: 'kacak-A-isaret' },
  foreign: { id: 'foreign', markers: ['kacak-B-isaret', 'kacak-kurye-B'] },
  list: (agent) => agent.get('/api/v2/kacaklar?q5_saat=0'),
});

describe('v2 leak board v0: Q4 and Q5 (A12)', () => {
  const app = createApp();
  const TENANT = 'v2-kacak-davranis';
  const agents: Record<string, Agent> = {};
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 kaçak',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    for (const role of [
      'PATRON',
      'BAKU_FINANS',
      'SATIS_SORUMLUSU',
      'KANADA_SATINALMA',
      'BAKU_KURYE',
    ] as const) {
      const fixture = await loginFixture(app, role, TENANT);
      agents[role] = fixture.agent;
      ids[role] = fixture.userId;
    }
    agents.SUPER_ADMIN = (await loginFixture(app, 'SUPER_ADMIN', 'all')).agent;
  });
  beforeEach(() => vi.stubEnv('FF_V2_FLOW', 'true'));
  afterEach(() => vi.unstubAllEnvs());

  const board = (who: string, query = '') =>
    agents[who].get(`/api/v2/kacaklar?tenant_id=${TENANT}${query}`);

  it('Q4 lists delivered, unpaid orders only (v1 and v2), with the age threshold', async () => {
    v1Order(TENANT, 'Q4 borclu');
    v1Order(TENANT, 'Q4 odendi', { alinan_tutar: 100 });
    v1Order(TENANT, 'Q4 yolda', { lojistik_durumu: 'BAKU_DAGITIM_ARKADAS', teslim_tarihi: null });
    v1Order(TENANT, 'Q4 dun', { teslim_tarihi: gunOnce(1), alinan_tutar: 40 });
    const all = await board('PATRON');
    expect(all.status).toBe(200);
    const names = all.body.q4.map((r: { musteriAdi: string }) => r.musteriAdi);
    expect(names).toEqual(expect.arrayContaining(['Q4 borclu', 'Q4 dun']));
    expect(names).not.toContain('Q4 odendi');
    expect(names).not.toContain('Q4 yolda');
    expect(
      all.body.q4.find((r: { musteriAdi: string }) => r.musteriAdi === 'Q4 dun')
    ).toMatchObject({
      kalanTutar: 60,
      yasGun: 1,
    });
    const old = await board('BAKU_FINANS', '&q4_gun=2');
    expect(old.body.q4.map((r: { musteriAdi: string }) => r.musteriAdi)).not.toContain('Q4 dun');
    expect(old.body.esikler).toEqual({ q4Gun: 2, q5Saat: 24 });
  });

  it('Q5 lists couriers holding cash past the threshold, never cash handed over', async () => {
    seedUser('kacak-finans', TENANT, 'BAKU_FINANS');
    await courierWithCash(TENANT, 'kacak-kurye-tutan', 30);
    const handed = await courierWithCash(TENANT, 'kacak-kurye-veren', 20);
    await kasaTeslimAl(
      TENANT,
      'kacak-finans',
      kasaTeslimGirdisi({
        kurye_kullanici_id: 'kacak-kurye-veren',
        odeme_idleri: [handed],
        tutar_azn: 20,
      })
    );
    const fresh = await board('PATRON');
    expect(fresh.body.q5).toEqual([]);
    const now = await board('SUPER_ADMIN', '&q5_saat=0');
    expect(
      now.body.q5.map((r: { kuryeKullaniciId: string; bakiye: number }) => [
        r.kuryeKullaniciId,
        r.bakiye,
      ])
    ).toEqual([['kacak-kurye-tutan', 30]]);
  });

  it('is read by PATRON, SUPER_ADMIN and BAKU_FINANS only; bad thresholds are refused', async () => {
    for (const who of ['SATIS_SORUMLUSU', 'KANADA_SATINALMA', 'BAKU_KURYE'])
      expect([who, (await board(who)).status]).toEqual([who, 403]);
    for (const query of ['&q4_gun=-1', '&q4_gun=x', '&q5_saat=99999999', '&q4_gun=1.5'])
      expect([query, (await board('PATRON', query)).status]).toEqual([query, 400]);
    vi.stubEnv('FF_V2_FLOW', '');
    expect((await board('PATRON')).status).toBe(404);
    expect((await request(app).get('/api/v2/kacaklar')).status).toBe(404);
  });
});
