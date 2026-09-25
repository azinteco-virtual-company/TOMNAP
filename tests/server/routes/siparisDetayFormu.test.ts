import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../src/server';
import { firmalarVeritabani } from '../../../src/server/services/state';
import {
  detayFormuBaslangici,
  detayFormuDegisiklikleri,
  type DetayFormu,
} from '../../../src/components/siparisDetayFormu';
import type { Siparis } from '../../../src/types';
import { loginFixture } from '../helpers/session';

// Codex R3 F14: the order detail form (SiparisDetayModal) sent the purchase and customs
// fields on every save. None of them was in any role's field list, so even an empty
// value was refused (403), while the form said "saved" without waiting for the answer.
// The body here is the one the form builds (detayFormuDegisiklikleri).
type Agent = Awaited<ReturnType<typeof loginFixture>>['agent'];
const TENANT = 'detay-formu';

describe('order detail form saves through PATCH /api/siparisler/:id (Codex R3 F14)', () => {
  const app = createApp();
  const agents: Record<string, Agent> = {};
  let orderId = '';

  /** The current order, the form over it with the user's edits, and the PATCH body. */
  async function formBody(edits: Partial<DetayFormu>) {
    const list = await agents.PATRON.get('/api/siparisler?limit=100');
    const order = (list.body.siparisler as Siparis[]).find((s) => s.id === orderId)!;
    return detayFormuDegisiklikleri(order, { ...detayFormuBaslangici(order), ...edits });
  }
  async function save(role: string, edits: Partial<DetayFormu>) {
    const built = await formBody(edits);
    if (built.hata !== undefined) throw new Error(built.hata);
    return agents[role].patch(`/api/siparisler/${orderId}`).send(built.degisiklikler);
  }

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
    for (const role of [
      'PATRON',
      'KANADA_SATINALMA',
      'SATIS_SORUMLUSU',
      'BAKU_FINANS',
      'SUPER_ADMIN',
    ] as const)
      agents[role] = (await loginFixture(app, role, TENANT)).agent;
    agents.SUPER_ADMIN.set('x-tenant-id', TENANT);
    const created = await agents.PATRON.post('/api/siparisler').send({
      musteri_adi: 'Aytən',
      urun_aciklamasi: 'Çanta',
      toplam_tutar: 100,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    orderId = created.body.siparis.id;
  });

  it('the patron saves purchase and customs details from the form', async () => {
    const response = await save('PATRON', {
      magazaAdi: 'Winners Toronto',
      alisFiyatiCad: '45,5',
      finKodu: '5abc123',
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.siparis).toMatchObject({
      kanada_magaza_adi: 'Winners Toronto',
      kanada_alis_fiyati_cad: 45.5,
      kanada_gumruk_fin_kodu: '5ABC123',
    });
  });

  it('the Canada buyer saves the same details; finance saves a note alone', async () => {
    const buyer = await save('KANADA_SATINALMA', {
      magazaAdi: 'Coach Outlet',
      pasaportNo: 'C01234567',
    });
    expect(buyer.status, JSON.stringify(buyer.body)).toBe(200);
    expect(buyer.body.siparis).toMatchObject({
      kanada_magaza_adi: 'Coach Outlet',
      kanada_gumruk_pasaport_no: 'C01234567',
      kanada_gumruk_fin_kodu: '5ABC123',
    });
    const finance = await save('BAKU_FINANS', { tahsilatNotu: 'Qapıda nağd' });
    expect(finance.status, JSON.stringify(finance.body)).toBe(200);
    expect(finance.body.siparis.kanada_gumruk_fin_kodu).toBe('5ABC123');
  });

  it('only the patron and the buyers write customs identity (OPEN_QUESTIONS 34)', async () => {
    for (const role of ['SATIS_SORUMLUSU', 'BAKU_FINANS', 'SUPER_ADMIN']) {
      const response = await save(role, { finKodu: '9ZZZ999' });
      expect([role, response.status]).toEqual([role, 403]);
    }
    for (const role of ['SATIS_SORUMLUSU', 'BAKU_FINANS']) {
      const response = await save(role, { alisFiyatiCad: '1' });
      expect([role, response.status]).toEqual([role, 403]);
    }
    // Unchanged customs fields on the same form no longer block a sales edit.
    const sales = await save('SATIS_SORUMLUSU', { ozelNot: 'Zəng edin' });
    expect(sales.status, JSON.stringify(sales.body)).toBe(200);
    expect(sales.body.siparis.kanada_gumruk_fin_kodu).toBe('5ABC123');
  });

  it('sends nothing for an unchanged form and refuses invalid values', async () => {
    expect(await formBody({})).toEqual({ degisiklikler: {} });
    expect((await formBody({ alisFiyatiCad: 'on beş' })).hata).toMatch(/Alış fiyatı/);
    for (const edits of [
      { finKodu: '12' },
      { pasaportNo: 'C-1' },
      { faturaGorseli: 'javascript:1' },
    ]) {
      const response = await save('PATRON', edits);
      expect([edits, response.status]).toEqual([edits, 400]);
    }
    // Clearing a field is an edit.
    const cleared = await save('PATRON', { alisFiyatiCad: '', finKodu: '' });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(cleared.body.siparis.kanada_gumruk_fin_kodu).toBe('');
    expect(cleared.body.siparis.kanada_alis_fiyati_cad ?? null).toBeNull();
  });
});
