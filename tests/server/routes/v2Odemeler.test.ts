import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/server';
import {
  firmalarVeritabani,
  kullanicilarVeritabani,
  siparislerVeritabani,
} from '../../../src/server/services/state';
import {
  v2SiparisGirdisiniDogrula,
  v2SiparisOlustur,
} from '../../../src/server/services/v2/siparisStore';
import {
  bellektekiOdemeler,
  odemeDurumu,
  v2OdemeGirdisiniDogrula,
  v2OdemeKaydet,
} from '../../../src/server/services/v2/odemeStore';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const siparis = (musteri: string, fiyat = 50) => ({
  musteri_adi: musteri,
  satirlar: [
    { urun_aciklamasi: 'Çanta', adet: 2, birim_satis_fiyati_azn: fiyat, kaynak_ulke: 'CA' },
  ],
});
const odeme = (siparisId: string, extra: Record<string, unknown> = {}) => ({
  siparis_id: siparisId,
  tutar_azn: 30,
  yontem: 'NAKIT',
  kaynak: 'BUTIK',
  ...extra,
});
function seedUser(id: string, tenant: string, rol: 'PATRON' | 'SATIS_SORUMLUSU') {
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
async function v2Order(tenant: string, owner: string, musteri: string) {
  seedUser(owner, tenant, 'PATRON');
  return (await v2SiparisOlustur(tenant, owner, v2SiparisGirdisiniDogrula(siparis(musteri)))).id;
}
const ledgerOf = (tenant: string) => bellektekiOdemeler(tenant);
const headerOf = (id: string) => siparislerVeritabani.find((row) => row.id === id);

const orders = { own: '', foreign: '' };
describeTenantIsolation('v2 payment ledger (GET ledger, POST /api/v2/odemeler)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    orders.own = await v2Order(TENANT_A, 'odeme-seed-a', 'odeme-A-musteri');
    orders.foreign = await v2Order(TENANT_B, 'odeme-seed-b', 'odeme-B-musteri');
    await v2OdemeKaydet(
      TENANT_A,
      'odeme-seed-a',
      v2OdemeGirdisiniDogrula(odeme(orders.own, { aciklama: 'odeme-A-isaret' }))
    );
    await v2OdemeKaydet(
      TENANT_B,
      'odeme-seed-b',
      v2OdemeGirdisiniDogrula(odeme(orders.foreign, { aciklama: 'odeme-B-isaret' }))
    );
  },
  own: { id: 'own', marker: 'odeme-A-isaret' },
  // The foreign order id is a marker too: even an empty ledger must not confirm it exists.
  foreign: {
    id: 'foreign',
    get markers() {
      return ['odeme-B-isaret', orders.foreign];
    },
  },
  read: (agent, id) =>
    agent.get(`/api/v2/siparisler/${id === 'own' ? orders.own : orders.foreign}/odemeler`),
  write: (agent, id) =>
    agent
      .post('/api/v2/odemeler')
      .send(odeme(id === 'own' ? orders.own : orders.foreign, { tutar_azn: 1 })),
  foreignState: () => [ledgerOf(TENANT_B), headerOf(orders.foreign)],
});

const payments = { own: '', foreign: '' };
describeTenantIsolation('v2 payment reversal (POST /api/v2/odemeler/:id/ters-kayit)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    const a = await v2Order(TENANT_A, 'ters-seed-a', 'ters-A-musteri');
    const b = await v2Order(TENANT_B, 'ters-seed-b', 'ters-B-musteri');
    payments.own = (
      await v2OdemeKaydet(TENANT_A, 'ters-seed-a', v2OdemeGirdisiniDogrula(odeme(a)))
    ).odeme.id;
    payments.foreign = (
      await v2OdemeKaydet(TENANT_B, 'ters-seed-b', v2OdemeGirdisiniDogrula(odeme(b)))
    ).odeme.id;
  },
  own: { id: 'own', marker: 'unused' },
  foreign: { id: 'foreign', markers: ['ters-B-musteri'] },
  write: (agent, id) =>
    agent
      .post(`/api/v2/odemeler/${id === 'own' ? payments.own : payments.foreign}/ters-kayit`)
      .send({ aciklama: 'Yanlış' }),
  foreignState: () => ledgerOf(TENANT_B),
});

describe('v2 payment ledger behaviour (A10)', () => {
  const app = createApp();
  const TENANT = 'v2-odeme-davranis';
  const agents: Record<string, Agent> = {};
  const userIds: Record<string, string> = {};
  let order = '';
  let v1Order = '';

  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 ödeme',
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
      'ABD_SATINALMA',
      'BAKU_KURYE',
    ] as const) {
      const fixture = await loginFixture(app, role, TENANT);
      agents[role] = fixture.agent;
      userIds[role] = fixture.userId;
    }
    const admin = await loginFixture(app, 'SUPER_ADMIN', 'all');
    agents.SUPER_ADMIN = admin.agent;
    userIds.SUPER_ADMIN = admin.userId;
  });
  beforeEach(async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    order = (
      await v2SiparisOlustur(TENANT, userIds.PATRON, v2SiparisGirdisiniDogrula(siparis('Ödeme')))
    ).id;
    v1Order = randomUUID();
    siparislerVeritabani.push({
      id: v1Order,
      tenant_id: TENANT,
      musteri_adi: 'v1',
      urun_aciklamasi: 'v1',
      adet: 1,
      toplam_tutar: 100,
      alinan_tutar: 0,
      finans_durumu: 'BEKLIYOR',
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  const post = (role: string, body: object) =>
    agents[role].post(`/api/v2/odemeler?tenant_id=${TENANT}`).send(body);

  it('derives the payment status from the ledger total', () => {
    expect([
      odemeDurumu(100, 0),
      odemeDurumu(100, 0.01),
      odemeDurumu(100, 100),
      odemeDurumu(100, 100.01),
    ]).toEqual(['ODENMEDI', 'KISMI', 'TAM', 'FAZLA']);
  });

  it('adds payments up and keeps the old columns in step (K20)', async () => {
    const first = await post('PATRON', odeme(order));
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.ozet).toMatchObject({ odenenTutar: 30, kalanTutar: 70, durum: 'KISMI' });
    expect(headerOf(order)).toMatchObject({
      alinan_tutar: 30,
      kalan_tutar: 70,
      finans_durumu: 'KISMI_ODEME',
    });
    await post('BAKU_FINANS', odeme(order, { tutar_azn: 70, yontem: 'KART', kaynak: 'ONLINE' }));
    const over = await post(
      'SUPER_ADMIN',
      odeme(order, { tutar_azn: 5.5, yontem: 'HAVALE', kaynak: 'ONLINE' })
    );
    expect(over.body.ozet).toMatchObject({ odenenTutar: 105.5, kalanTutar: -5.5, durum: 'FAZLA' });
    expect(headerOf(order)).toMatchObject({ alinan_tutar: 105.5, finans_durumu: 'ODENDI' });

    const ledger = await agents.KANADA_SATINALMA.get(`/api/v2/siparisler/${order}/odemeler`);
    expect(ledger.status).toBe(200);
    expect(ledger.body.odemeler).toHaveLength(3);
    expect(ledger.body.odemeler[0]).toMatchObject({
      tutarAzn: 30,
      alanKullaniciId: userIds.PATRON,
      kaydedenKullaniciId: userIds.PATRON,
      tersKaydiVar: false,
    });
    // The v1 list shows the derived columns too.
    const v1List = await agents.PATRON.get('/api/siparisler');
    expect(v1List.body.siparisler.find((s: { id: string }) => s.id === order)).toMatchObject({
      alinan_tutar: 105.5,
      finans_durumu: 'ODENDI',
    });
  });

  it('follows the role matrix: sales only in the boutique, buyers and couriers never', async () => {
    const before = ledgerOf(TENANT).length;
    for (const [role, body, status] of [
      ['SATIS_SORUMLUSU', odeme(order, { kaynak: 'ONLINE', yontem: 'KART' }), 403],
      ['KANADA_SATINALMA', odeme(order), 403],
      ['ABD_SATINALMA', odeme(order), 403],
      ['BAKU_KURYE', odeme(order), 403],
    ] as const)
      expect([role, (await post(role, body)).status]).toEqual([role, status]);
    expect(ledgerOf(TENANT)).toHaveLength(before);
    expect((await post('SATIS_SORUMLUSU', odeme(order))).status).toBe(201);
    expect((await agents.BAKU_KURYE.get(`/api/v2/siparisler/${order}/odemeler`)).status).toBe(403);
  });

  it('refuses v1 orders, unknown orders and invalid payments without writing', async () => {
    const before = ledgerOf(TENANT).length;
    for (const [body, status] of [
      [odeme(v1Order), 409],
      [odeme(randomUUID()), 404],
      [odeme('not-a-uuid'), 400],
      [odeme(order, { tutar_azn: 0 }), 400],
      [odeme(order, { tutar_azn: -5 }), 400],
      [odeme(order, { tutar_azn: 1.005 }), 400],
      [odeme(order, { tutar_azn: '5' }), 400],
      [odeme(order, { yontem: 'KRIPTO' }), 400],
      [odeme(order, { kaynak: 'TESLIMAT' }), 400],
      [odeme(order, { alma_zamani: '2999-01-01T00:00:00Z' }), 400],
      [odeme(order, { alan_kullanici_id: 'baskasi' }), 400],
    ] as const)
      expect([body, (await post('PATRON', body)).status]).toEqual([body, status]);
    expect(ledgerOf(TENANT)).toHaveLength(before);
    expect(headerOf(v1Order)).toMatchObject({ alinan_tutar: 0, finans_durumu: 'BEKLIYOR' });
    expect((await agents.PATRON.get(`/api/v2/siparisler/${v1Order}/odemeler`)).status).toBe(404);
  });

  it('reverses a payment once, with a reason; sales only their own boutique payments', async () => {
    const patronPays = (await post('PATRON', odeme(order))).body.odeme.id;
    const salesPays = (await post('SATIS_SORUMLUSU', odeme(order, { tutar_azn: 10 }))).body.odeme
      .id;
    const reverse = (role: string, id: string, body: object = { aciklama: 'Yanlış tutar' }) =>
      agents[role].post(`/api/v2/odemeler/${id}/ters-kayit?tenant_id=${TENANT}`).send(body);

    expect((await reverse('PATRON', patronPays, {})).status).toBe(400);
    expect((await reverse('PATRON', patronPays, { aciklama: '  ' })).status).toBe(400);
    expect((await reverse('SATIS_SORUMLUSU', patronPays)).status).toBe(403);
    expect((await reverse('KANADA_SATINALMA', patronPays)).status).toBe(403);
    const reversed = await reverse('BAKU_FINANS', patronPays);
    expect(reversed.status, JSON.stringify(reversed.body)).toBe(201);
    expect(reversed.body.odeme).toMatchObject({
      tutarAzn: -30,
      tersKayitOdemeId: patronPays,
      alanKullaniciId: userIds.PATRON,
      kaydedenKullaniciId: userIds.BAKU_FINANS,
      aciklama: 'Yanlış tutar',
    });
    expect(reversed.body.ozet).toMatchObject({ odenenTutar: 10, durum: 'KISMI' });
    expect((await reverse('PATRON', patronPays)).status).toBe(409);
    expect((await reverse('PATRON', reversed.body.odeme.id)).status).toBe(409);
    expect((await reverse('PATRON', randomUUID())).status).toBe(404);
    expect((await reverse('SATIS_SORUMLUSU', salesPays)).status).toBe(201);
    expect(headerOf(order)).toMatchObject({ alinan_tutar: 0, finans_durumu: 'BEKLIYOR' });

    const ledger = await agents.PATRON.get(`/api/v2/siparisler/${order}/odemeler`);
    expect(
      ledger.body.odemeler.map((o: { tutarAzn: number; tersKaydiVar: boolean }) => [
        o.tutarAzn,
        o.tersKaydiVar,
      ])
    ).toEqual([
      [30, true],
      [10, true],
      [-30, false],
      [-10, false],
    ]);
  });

  it('keeps the money trail: a v2 order with payments is neither deleted nor cleared', async () => {
    await post('PATRON', odeme(order));
    const deleted = await agents.PATRON.delete(`/api/siparisler/${order}?tenant_id=${TENANT}`);
    expect([deleted.status, deleted.body.hata]).toEqual([
      409,
      'Ödemesi olan bir sipariş silinemez.',
    ]);
    const cleared = await agents.SUPER_ADMIN.post(
      `/api/veritabani/temizle?tenant_id=${TENANT}`
    ).send({
      islem_id: randomUUID(),
      onay_kodu: `SIL:${TENANT}`,
    });
    expect(cleared.status).toBe(409);
    expect(headerOf(order)).toBeDefined();
    // The general v1 PATCH cannot rewrite what the ledger derives (A8 guard).
    const patched = await agents.PATRON.patch(`/api/siparisler/${order}?tenant_id=${TENANT}`).send({
      alinan_tutar: 0,
    });
    expect(patched.status).toBe(409);
    // A v2 order without payments is still deletable.
    const unpaid = (
      await v2SiparisOlustur(TENANT, userIds.PATRON, v2SiparisGirdisiniDogrula(siparis('Boş')))
    ).id;
    expect(
      (await agents.PATRON.delete(`/api/siparisler/${unpaid}?tenant_id=${TENANT}`)).status
    ).toBe(200);
  });

  it('is closed with the flag off', async () => {
    vi.stubEnv('FF_V2_FLOW', '');
    expect((await post('PATRON', odeme(order))).status).toBe(404);
    expect((await request(app).get(`/api/v2/siparisler/${order}/odemeler`)).status).toBe(404);
  });
});
