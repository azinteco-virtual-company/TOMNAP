import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import type { KullaniciKaydi } from '../../../src/server/types';
import { loginFixture } from '../helpers/session';
import { TENANT_A, TENANT_B, describeTenantIsolation } from '../helpers/tenantIsolation';

// Deploy 2 finding 1: a v2 order had no way to move its logistics stage (K20 derives it
// from the unit axis, Phase B–C), so courier cash and the cash desk hand-over could not
// run end to end. TEMPORARY bridge (OPEN_QUESTIONS 38): one step forward only, with the
// expected current stage; the v1 SHIPPING roles for the Canada and cargo steps,
// COURIER_ASSIGN for the Baku step; SUPER_ADMIN never.
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const siparis = (musteri: string) => ({
  musteri_adi: musteri,
  satirlar: [{ urun_aciklamasi: 'Çanta', adet: 1, birim_satis_fiyati_azn: 10, kaynak_ulke: 'CA' }],
});
function seedUser(id: string, tenant: string, rol: KullaniciKaydi['rol']) {
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
const header = (id: string) => siparislerVeritabani.find((s) => s.id === id);
const ilerlet = (agent: Agent, id: string, beklenen: unknown) =>
  agent.post(`/api/v2/siparisler/${id}/asama`).send({ beklenen_asama: beklenen });

const orders = { own: '', foreign: '' };
describeTenantIsolation('v2 stage bridge (POST /api/v2/siparisler/:id/asama)', {
  env: { FF_V2_FLOW: 'true' },
  seed: async () => {
    orders.own = await v2Order(TENANT_A, 'asama-seed-a', 'asama-A-musteri');
    orders.foreign = await v2Order(TENANT_B, 'asama-seed-b', 'asama-B-musteri');
  },
  own: { id: 'own', marker: 'unused' },
  // The foreign order id is a marker too: a refusal must not confirm it exists.
  foreign: {
    id: 'foreign',
    get markers() {
      return ['asama-B-musteri', orders.foreign];
    },
  },
  write: (agent, id) =>
    ilerlet(agent, id === 'own' ? orders.own : orders.foreign, 'KANADA_SATINALIM_BEKLIYOR'),
  foreignState: () => structuredClone(header(orders.foreign)),
});

describe('v2 stage bridge behaviour (TEMPORARY, O-38)', () => {
  const app = createApp();
  const TENANT = 'v2-asama-davranis';
  const agents: Record<string, Agent> = {};
  const userIds: Record<string, string> = {};

  beforeAll(async () => {
    vi.stubEnv('FF_V2_FLOW', 'true');
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'v2 aşama',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    for (const rol of [
      'PATRON',
      'KANADA_SATINALMA',
      'ABD_SATINALMA',
      'SATIS_SORUMLUSU',
      'BAKU_FINANS',
      'SUPER_ADMIN',
    ] as const) {
      const login = await loginFixture(app, rol, TENANT);
      agents[rol] = login.agent;
      userIds[rol] = login.userId;
    }
  });
  afterAll(() => vi.unstubAllEnvs());

  it('moves one stage at a time, in order, with the expected stage, and records who did it', async () => {
    const id = await v2Order(TENANT, 'asama-owner', 'Aşama');
    for (const rol of ['SUPER_ADMIN', 'SATIS_SORUMLUSU', 'BAKU_FINANS'])
      expect([rol, (await ilerlet(agents[rol], id, 'KANADA_SATINALIM_BEKLIYOR')).status]).toEqual([
        rol,
        403,
      ]);
    expect((await ilerlet(agents.PATRON, id, 'KANADA_DEPO')).status).toBe(409);
    expect((await ilerlet(agents.PATRON, id, undefined)).status).toBe(400);
    expect(
      (
        await agents.PATRON.post(`/api/v2/siparisler/${id}/asama`).send({
          beklenen_asama: 'KANADA_SATINALIM_BEKLIYOR',
          lojistik_durumu: 'TESLIM_EDILDI',
        })
      ).status
    ).toBe(400);
    expect(header(id)?.lojistik_durumu).toBe('KANADA_SATINALIM_BEKLIYOR');

    const first = await ilerlet(agents.ABD_SATINALMA, id, 'KANADA_SATINALIM_BEKLIYOR');
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.siparis).toEqual({
      id,
      lojistikDurumu: 'KANADA_DEPO',
      oncekiAsama: 'KANADA_SATINALIM_BEKLIYOR',
    });
    expect((await ilerlet(agents.PATRON, id, 'KANADA_SATINALIM_BEKLIYOR')).status).toBe(409);
    expect((await ilerlet(agents.KANADA_SATINALMA, id, 'KANADA_DEPO')).status).toBe(200);
    // The Baku step belongs to COURIER_ASSIGN: PATRON and KANADA_SATINALMA.
    expect((await ilerlet(agents.ABD_SATINALMA, id, 'ULUSLARARASI_KARGO')).status).toBe(403);
    expect((await ilerlet(agents.KANADA_SATINALMA, id, 'ULUSLARARASI_KARGO')).status).toBe(200);
    // Delivery belongs to the courier flow; no step back either.
    expect((await ilerlet(agents.PATRON, id, 'BAKU_DAGITIM_ARKADAS')).status).toBe(409);
    expect((await ilerlet(agents.PATRON, id, 'ULUSLARARASI_KARGO')).status).toBe(409);

    const row = header(id);
    expect(row?.lojistik_durumu).toBe('BAKU_DAGITIM_ARKADAS');
    const gecmis = (row?.ek_veriler as { islem_gecmisi?: Array<Record<string, string>> })
      .islem_gecmisi;
    expect(gecmis?.map((e) => [e.yapan_kisi, e.yapan_rol, e.eylem, e.aciklama])).toEqual([
      [
        userIds.ABD_SATINALMA,
        'ABD_SATINALMA',
        'V2_ASAMA_ILERLETILDI',
        'KANADA_SATINALIM_BEKLIYOR -> KANADA_DEPO',
      ],
      [
        userIds.KANADA_SATINALMA,
        'KANADA_SATINALMA',
        'V2_ASAMA_ILERLETILDI',
        'KANADA_DEPO -> ULUSLARARASI_KARGO',
      ],
      [
        userIds.KANADA_SATINALMA,
        'KANADA_SATINALMA',
        'V2_ASAMA_ILERLETILDI',
        'ULUSLARARASI_KARGO -> BAKU_DAGITIM_ARKADAS',
      ],
    ]);
    expect(gecmis?.every((e) => !Number.isNaN(Date.parse(e.tarih)))).toBe(true);
  });

  it('moves no v1 order and answers 404 for unknown orders', async () => {
    const v1 = randomUUID();
    siparislerVeritabani.push({
      id: v1,
      tenant_id: TENANT,
      model_surumu: 1,
      musteri_adi: 'v1',
      urun_aciklamasi: 'Çanta',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      ek_veriler: {},
    });
    expect((await ilerlet(agents.PATRON, v1, 'KANADA_SATINALIM_BEKLIYOR')).status).toBe(409);
    expect(header(v1)?.lojistik_durumu).toBe('KANADA_SATINALIM_BEKLIYOR');
    expect((await ilerlet(agents.PATRON, randomUUID(), 'KANADA_SATINALIM_BEKLIYOR')).status).toBe(
      404
    );
    expect((await ilerlet(agents.PATRON, 'not-a-uuid', 'KANADA_SATINALIM_BEKLIYOR')).status).toBe(
      404
    );
  });

  it('is closed while the flag is off', async () => {
    const id = await v2Order(TENANT, 'asama-owner', 'Kapalı');
    vi.stubEnv('FF_V2_FLOW', '');
    try {
      expect((await ilerlet(agents.PATRON, id, 'KANADA_SATINALIM_BEKLIYOR')).status).toBe(404);
    } finally {
      vi.stubEnv('FF_V2_FLOW', 'true');
    }
    expect(header(id)?.lojistik_durumu).toBe('KANADA_SATINALIM_BEKLIYOR');
  });
});
