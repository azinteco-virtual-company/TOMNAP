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
  bellekteKasayaKapat,
  bellektekiOdemeler,
} from '../../../src/server/services/v2/odemeStore';
import {
  kuryeBakiyeleri,
  kuryeTahsilatGirdisi,
  kuryeTahsilatiKaydet,
} from '../../../src/server/services/v2/kasaStore';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
function seedUser(id: string, tenant: string, rol: 'PATRON' | 'BAKU_KURYE') {
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
async function courierFor(tenant: string, userId: string) {
  const kurye = await createCourier(tenant, { ad_soyad: userId, telefon: '1', bolge: 'Baku' });
  await bindCourier(tenant, kurye.id, userId, null);
  return kurye.id as string;
}
/** A v2 order of 100 AZN, out for delivery with the given courier record. */
async function deliveringOrder(tenant: string, owner: string, courierId: string, musteri: string) {
  seedUser(owner, tenant, 'PATRON');
  const id = (
    await v2SiparisOlustur(
      tenant,
      owner,
      v2SiparisGirdisiniDogrula({
        musteri_adi: musteri,
        satirlar: [
          { urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 100, kaynak_ulke: 'CA' },
        ],
      })
    )
  ).id;
  Object.assign(
    siparislerVeritabani.find((s) => s.id === id)!,
    {
      baku_kurye_id: courierId,
      lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
    }
  );
  return id;
}

const seeded: Record<string, { courier: string; order: string; payment: string }> = {};
async function seedTenant(tenant: string, tag: string) {
  const user = `kasa-kurye-${tag}`;
  seedUser(user, tenant, 'BAKU_KURYE');
  const courier = seeded[tenant]?.courier ?? (await courierFor(tenant, user));
  const order = await deliveringOrder(tenant, `kasa-patron-${tag}`, courier, `kasa-${tag}-isaret`);
  const payment = (
    await kuryeTahsilatiKaydet(
      tenant,
      user,
      kuryeTahsilatGirdisi({ siparis_id: order, tutar_azn: 10 })
    )
  ).odeme!.id;
  seeded[tenant] = { courier, order, payment };
}

describeTenantIsolation('v2 cash desk (GET balances, POST /api/v2/kasa/teslimler)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    await seedTenant(TENANT_A, 'A');
    await seedTenant(TENANT_B, 'B');
  },
  own: { id: 'own', marker: 'kasa-A-isaret' },
  foreign: { id: 'foreign', markers: ['kasa-B-isaret', 'kasa-kurye-B'] },
  list: (agent) => agent.get('/api/v2/kasa/kurye-bakiyeleri'),
  write: (agent, id) => {
    const tenant = id === 'own' ? TENANT_A : TENANT_B;
    return agent.post('/api/v2/kasa/teslimler').send({
      kurye_kullanici_id: `kasa-kurye-${id === 'own' ? 'A' : 'B'}`,
      odeme_idleri: [seeded[tenant].payment],
      tutar_azn: 10,
    });
  },
  foreignState: () => bellektekiOdemeler(TENANT_B),
});

describe('v2 courier cash and the cash desk (A11)', () => {
  const app = createApp();
  const TENANT = 'v2-kasa-davranis';
  const agents: Record<string, Agent> = {};
  const ids: Record<string, string> = {};
  const couriers: Record<string, string> = {};
  let own = '';
  let others = '';

  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 kasa',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    for (const [name, role] of [
      ['PATRON', 'PATRON'],
      ['BAKU_FINANS', 'BAKU_FINANS'],
      ['SATIS_SORUMLUSU', 'SATIS_SORUMLUSU'],
      ['KANADA_SATINALMA', 'KANADA_SATINALMA'],
      ['KURYE1', 'BAKU_KURYE'],
      ['KURYE2', 'BAKU_KURYE'],
    ] as const) {
      const fixture = await loginFixture(app, role, TENANT);
      agents[name] = fixture.agent;
      ids[name] = fixture.userId;
    }
    const admin = await loginFixture(app, 'SUPER_ADMIN', 'all');
    agents.SUPER_ADMIN = admin.agent;
    couriers.KURYE1 = await courierFor(TENANT, ids.KURYE1);
    couriers.KURYE2 = await courierFor(TENANT, ids.KURYE2);
  });
  beforeEach(async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    own = await deliveringOrder(TENANT, ids.PATRON, couriers.KURYE1, 'Kurye 1 müştəri');
    others = await deliveringOrder(TENANT, ids.PATRON, couriers.KURYE2, 'Kurye 2 müştəri');
  });
  afterEach(() => vi.unstubAllEnvs());

  const collect = (who: string, order: string, amount: number) =>
    agents[who].post(`/api/v2/kurye/tahsilat?tenant_id=${TENANT}`).send({
      siparis_id: order,
      tutar_azn: amount,
    });
  const balanceOf = async (courier: string) =>
    (await kuryeBakiyeleri(TENANT)).find((b) => b.kuryeKullaniciId === courier);

  it('lets a courier record cash only for its own order out for delivery, up to the amount due', async () => {
    const first = await collect('KURYE1', own, 40);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.odeme).toMatchObject({
      tutarAzn: 40,
      yontem: 'NAKIT',
      kaynak: 'TESLIMAT',
      alanKullaniciId: ids.KURYE1,
    });
    expect(first.body.ozet).toMatchObject({ odenenTutar: 40, durum: 'KISMI' });

    const v1 = randomUUID();
    siparislerVeritabani.push({
      id: v1,
      tenant_id: TENANT,
      musteri_adi: 'v1',
      urun_aciklamasi: 'v1',
      adet: 1,
      toplam_tutar: 100,
      alinan_tutar: 0,
      baku_kurye_id: couriers.KURYE1,
      lojistik_durumu: 'BAKU_DAGITIM_ARKADAS',
    });
    const inCanada = await deliveringOrder(TENANT, ids.PATRON, couriers.KURYE1, 'Kanada');
    siparislerVeritabani.find((s) => s.id === inCanada)!.lojistik_durumu = 'KANADA_DEPO';
    const before = bellektekiOdemeler(TENANT).length;
    for (const [who, order, amount, status] of [
      ['KURYE1', others, 10, 403],
      ['KURYE2', own, 10, 403],
      ['KURYE1', v1, 10, 409],
      ['KURYE1', inCanada, 10, 409],
      ['KURYE1', own, 60.01, 400],
      ['KURYE1', own, 0, 400],
      ['KURYE1', randomUUID(), 10, 404],
      ['PATRON', own, 10, 403],
      ['BAKU_FINANS', own, 10, 403],
    ] as const)
      expect([who, order === own, (await collect(who, order, amount)).status]).toEqual([
        who,
        order === own,
        status,
      ]);
    expect(bellektekiOdemeler(TENANT)).toHaveLength(before);

    // An order of another boutique, even one pointing at this courier's record id, is not found.
    const foreignOrder = await deliveringOrder(
      TENANT_B,
      'kasa-yabanci-patron',
      couriers.KURYE1,
      'Yabancı'
    );
    const cross = (url: string) =>
      agents.KURYE1.post(url).send({ siparis_id: foreignOrder, tutar_azn: 10 });
    expect((await cross('/api/v2/kurye/tahsilat')).status).toBe(404);
    // Asking for the other boutique is refused before the route (session scope).
    expect([403, 404]).toContain(
      (await cross(`/api/v2/kurye/tahsilat?tenant_id=${TENANT_B}`)).status
    );
    expect(bellektekiOdemeler(TENANT_B).some((o) => o.siparisId === foreignOrder)).toBe(false);

    const view = await agents.KURYE1.get(`/api/v2/kurye/nakit?tenant_id=${TENANT}`);
    expect(view.status).toBe(200);
    expect(view.body.bakiye).toBe((await balanceOf(ids.KURYE1))!.bakiye);
    expect(view.body.siparisler.map((s: { id: string }) => s.id)).toContain(own);
    expect(view.body.siparisler.map((s: { id: string }) => s.id)).not.toContain(others);
    expect((await agents.PATRON.get('/api/v2/kurye/nakit')).status).toBe(403);
  });

  it('hands over the exact selected cash once; the balance is cash minus hand-overs', async () => {
    const a = (await collect('KURYE1', own, 30)).body.odeme.id;
    const b = (await collect('KURYE1', own, 20)).body.odeme.id;
    const start = (await balanceOf(ids.KURYE1))!;
    const handover = (who: string, body: Record<string, unknown>) =>
      agents[who].post(`/api/v2/kasa/teslimler?tenant_id=${TENANT}`).send({
        kurye_kullanici_id: ids.KURYE1,
        ...body,
      });

    for (const [who, body, status] of [
      ['BAKU_FINANS', { odeme_idleri: [a, b], tutar_azn: 50.01 }, 409],
      ['BAKU_FINANS', { odeme_idleri: [a, b], tutar_azn: 49 }, 409],
      ['BAKU_FINANS', { odeme_idleri: [a, a], tutar_azn: 60 }, 400],
      ['BAKU_FINANS', { odeme_idleri: [], tutar_azn: 1 }, 400],
      ['BAKU_FINANS', { odeme_idleri: [a], tutar_azn: 30, kurye_kullanici_id: ids.KURYE2 }, 409],
      ['BAKU_FINANS', { odeme_idleri: [a], tutar_azn: 30, kurye_kullanici_id: ids.PATRON }, 404],
      ['SATIS_SORUMLUSU', { odeme_idleri: [a], tutar_azn: 30 }, 403],
      ['KANADA_SATINALMA', { odeme_idleri: [a], tutar_azn: 30 }, 403],
      ['KURYE1', { odeme_idleri: [a], tutar_azn: 30 }, 403],
    ] as const)
      expect([who, body, (await handover(who, body)).status]).toEqual([who, body, status]);
    expect((await balanceOf(ids.KURYE1))!.bakiye).toBe(start.bakiye);

    const taken = await handover('BAKU_FINANS', {
      odeme_idleri: [a, b],
      tutar_azn: 50,
      aciklama: 'Sayıldı',
    });
    expect(taken.status, JSON.stringify(taken.body)).toBe(201);
    expect(taken.body.teslim).toMatchObject({
      kuryeKullaniciId: ids.KURYE1,
      teslimAlanKullaniciId: ids.BAKU_FINANS,
      tutarAzn: 50,
      odemeSayisi: 2,
    });
    expect((await handover('PATRON', { odeme_idleri: [a, b], tutar_azn: 50 })).status).toBe(409);
    const after = (await balanceOf(ids.KURYE1))!;
    expect(after.bakiye).toBe(start.bakiye - 50);
    expect(after.teslimToplami).toBe(start.teslimToplami + 50);
    // balance = Σ cash − Σ hand-overs = Σ open collections
    const open =
      after.acikTahsilatlar.reduce((sum, o) => sum + Math.round(o.tutarAzn * 100), 0) / 100;
    expect(after.bakiye).toBe(open);
    expect(after.acikTahsilatlar.map((o) => o.id)).not.toContain(a);

    // Handed-over cash cannot be reversed; open cash can, and it leaves the balance.
    const reverse = (id: string) =>
      agents.PATRON.post(`/api/v2/odemeler/${id}/ters-kayit?tenant_id=${TENANT}`).send({
        aciklama: 'Yanlış',
      });
    expect((await reverse(a)).status).toBe(409);
    const c = (await collect('KURYE1', own, 5)).body.odeme.id;
    expect((await reverse(c)).status).toBe(201);
    expect((await balanceOf(ids.KURYE1))!.bakiye).toBe(after.bakiye);
    expect((await handover('BAKU_FINANS', { odeme_idleri: [c], tutar_azn: 5 })).status).toBe(409);
  });

  it("never closes another tenant's cash in the memory ledger (second layer)", async () => {
    await seedTenant(TENANT_B, 'B');
    const foreign = seeded[TENANT_B].payment;
    expect(bellekteKasayaKapat(TENANT, 'kasa-kurye-B', [foreign], 10, randomUUID())).toBe(false);
    expect(bellekteKasayaKapat(TENANT_A, 'kasa-kurye-B', [foreign], 10, randomUUID())).toBe(false);
    expect(bellektekiOdemeler(TENANT_B).find((o) => o.id === foreign)?.kasaTeslimId).toBeNull();
  });

  it('shows balances to the cash desk only, and is closed with the flag off', async () => {
    await collect('KURYE2', others, 15);
    const list = await agents.BAKU_FINANS.get(`/api/v2/kasa/kurye-bakiyeleri?tenant_id=${TENANT}`);
    expect(list.status).toBe(200);
    expect(
      list.body.kuryeler.map((k: { kuryeKullaniciId: string }) => k.kuryeKullaniciId)
    ).toContain(ids.KURYE2);
    for (const who of ['SATIS_SORUMLUSU', 'KANADA_SATINALMA', 'KURYE1'])
      expect([who, (await agents[who].get('/api/v2/kasa/kurye-bakiyeleri')).status]).toEqual([
        who,
        403,
      ]);
    vi.stubEnv('FF_V2_FLOW', '');
    expect((await collect('KURYE1', own, 1)).status).toBe(404);
    expect((await request(app).get('/api/v2/kasa/kurye-bakiyeleri')).status).toBe(404);
  });
});
