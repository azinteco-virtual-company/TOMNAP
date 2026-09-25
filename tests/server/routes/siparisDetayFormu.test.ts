import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/server';
import { firmalarVeritabani } from '../../../src/server/services/state';
import { loginFixture } from '../helpers/session';

// Codex R3 F14: the order detail form (SiparisDetayModal) sends the purchase and customs
// fields on every save. None of them was in any role's field list, so even an empty
// value was refused (403), while the form said "saved" without waiting for the answer.
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const TENANT = 'detay-formu';

/** The body SiparisDetayModal sends today (kaydetDetaylar), from its form state. */
function formBody(form: Record<string, string>) {
  return {
    kanada_takip_kodu: form.kanadaTakip ?? '',
    uluslararasi_kargo_kodu: form.kargoKodu ?? '',
    baku_tahsilat_notu: form.tahsilatNotu ?? '',
    ozel_not: form.ozelNot ?? '',
    kanada_magaza_adi: form.magazaAdi ?? '',
    kanada_alis_fiyati_cad: form.alisFiyatiCad ? parseFloat(form.alisFiyatiCad) : undefined,
    kanada_fatura_gorseli: form.faturaGorseli ?? '',
    gumruk_fin_kodu: form.finKodu ?? '',
    gumruk_pasaport_no: form.pasaportNo ?? '',
  };
}

describe('order detail form saves through PATCH /api/siparisler/:id (Codex R3 F14)', () => {
  const app = createApp();
  const agents: Record<string, Agent> = {};
  let orderId = '';

  beforeAll(async () => {
    firmalarVeritabani.push({
      id: TENANT,
      ad: 'Detay formu',
      sehir: 'Baku',
      aciklama: '',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      onayDurumu: 'AKTIF',
    });
    for (const role of ['PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS'] as const)
      agents[role] = (await loginFixture(app, role, TENANT)).agent;
    const created = await agents.PATRON.post('/api/siparisler').send({
      musteri_adi: 'Aytən',
      urun_aciklamasi: 'Çanta',
      toplam_tutar: 100,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    orderId = created.body.siparis.id;
  });

  it('the patron saves purchase and customs details from the form', async () => {
    const response = await agents.PATRON.patch(`/api/siparisler/${orderId}`).send(
      formBody({ magazaAdi: 'Winners Toronto', alisFiyatiCad: '45.5', finKodu: '5ABC123' })
    );
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.siparis).toMatchObject({
      kanada_magaza_adi: 'Winners Toronto',
      kanada_alis_fiyati_cad: 45.5,
      kanada_gumruk_fin_kodu: '5ABC123',
    });
  });

  it('the Canada buyer saves the same details; a note-only save works for finance', async () => {
    const buyer = await agents.KANADA_SATINALMA.patch(`/api/siparisler/${orderId}`).send(
      formBody({ magazaAdi: 'Coach Outlet', pasaportNo: 'C01234567' })
    );
    expect(buyer.status, JSON.stringify(buyer.body)).toBe(200);
    const finance = await agents.BAKU_FINANS.patch(`/api/siparisler/${orderId}`).send(
      formBody({ tahsilatNotu: 'Qapıda nağd' })
    );
    expect(finance.status, JSON.stringify(finance.body)).toBe(200);
  });
});
