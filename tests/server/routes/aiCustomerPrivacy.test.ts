import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const environment = vi.hoisted(() => ({ ai: vi.fn() }));
vi.mock('../../../src/server/services/supabase', () => ({ supabase: null }));
vi.mock('../../../src/server/services/gemini', () => ({
  getGeminiClient: () => ({}),
  generateContentWithRetryAndFallback: environment.ai,
}));

import ordersRouter from '../../../src/server/routes/siparisler';
import * as state from '../../../src/server/services/state';
import type { MusteriKaydi } from '../../../src/server/types';

// CLAUDE.md: never send a customer directory to Gemini. Customer matching runs on
// the server after parsing; only a unique exact phone match links a customer.
function app(tenant = 'tenant-a') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).tenantId = tenant;
    (req as any).auth = { userId: 'user-a', role: 'PATRON', tenantId: tenant };
    next();
  });
  server.use('/api', ordersRouter);
  return server;
}

function customer(
  id: string,
  tenant: string,
  ad_soyad: string,
  telefon: string,
  adres = ''
): MusteriKaydi {
  return {
    id,
    tenant_id: tenant,
    ad_soyad,
    telefon,
    instagram_kullanici_adi: '',
    sehir: 'Gəncə',
    adres,
    musteri_tipi: 'SADIK_MUSTERI',
    toplam_siparis_sayisi: 0,
    toplam_harcama: 0,
    kalan_toplam_borc: 0,
    notlar: '',
    olusturma_tarihi: '2026-01-01T00:00:00Z',
    son_siparis_tarihi: '2026-01-01T00:00:00Z',
  } as MusteriKaydi;
}
function aiReturns(fields: Record<string, unknown>) {
  environment.ai.mockResolvedValue({
    text: JSON.stringify({
      urun_aciklamasi: 'Bag',
      adet: 1,
      toplam_tutar: 100,
      alinan_tutar: 0,
      ...fields,
    }),
  });
}
const parse = (tenant: string, body: Record<string, unknown> = {}) =>
  request(app(tenant))
    .post('/api/ayristir-siparis')
    .send({ ham_mesaj: 'Kemale, 050 694 25 25, bir çanta', otomatik_kaydet: false, ...body });
const byId = (id: string) => state.musterilerVeritabani.find((row) => row.id === id);

beforeEach(() => {
  environment.ai.mockReset();
  state.setSiparislerVeritabani([]);
  state.setMusterilerVeritabani([
    customer(
      'mus-kemale',
      'tenant-a',
      'Kəmalə Bədirbəyli',
      '+994 50 694 25 25',
      'SECRET-ADDR-KEMALE'
    ),
    customer('mus-nigar', 'tenant-a', 'Nigar Əliyeva', '+994 55 111 22 33', 'SECRET-ADDR-NIGAR'),
    customer('mus-other', 'tenant-b', 'Aytən Məmmədova', '+994 55 111 22 33', 'SECRET-ADDR-OTHER'),
  ]);
});

describe('AI order parsing keeps customer data on the server', () => {
  it('sends no customer directory to Gemini', async () => {
    aiReturns({ musteri_adi: 'Kemale' });
    // The message itself carries none of the directory values below.
    expect((await parse('tenant-a', { ham_mesaj: 'Bir çanta istiyorum' })).status).toBe(200);
    const sent = JSON.stringify(environment.ai.mock.calls);
    for (const secret of [
      'Kəmalə Bədirbəyli',
      'Nigar',
      'Aytən',
      '694 25 25',
      '111 22 33',
      'SECRET-ADDR',
      'mus-kemale',
      'mus-nigar',
    ])
      expect(sent).not.toContain(secret);
  });

  it('links a customer only on a unique exact phone match and fills from the card', async () => {
    aiReturns({ musteri_adi: 'Kemale', telefon_numarasi: '050 694 25 25', teslimat_adresi: '' });
    const { body } = await parse('tenant-a');
    expect(body.siparis).toMatchObject({
      musteri_id: 'mus-kemale',
      musteri_adi: 'Kəmalə Bədirbəyli',
      teslimat_adresi: 'SECRET-ADDR-KEMALE',
      musteri_durumu: 'MEVCUT_MUSTERI',
    });
    expect(body.siparis.duzeltilen_yazim_hatasi).toContain('Kemale');
  });

  it('never links by name or by the AI-supplied id; similar names are suggestions', async () => {
    aiReturns({ musteri_adi: 'Nigar Aliyeva', eslesen_musteri_id: 'mus-nigar' });
    const { body } = await parse('tenant-a', { otomatik_kaydet: true });
    expect(body.siparis.musteri_id).toBe('');
    expect(body.siparis.musteri_durumu).toBe('YENI_MUSTERI');
    expect(body.musteri_adaylari).toEqual([expect.objectContaining({ musteri_id: 'mus-nigar' })]);
    // A candidate exists, so no card is updated and no duplicate card is created.
    expect(byId('mus-nigar')?.toplam_siparis_sayisi).toBe(0);
    expect(state.musterilerVeritabani).toHaveLength(3);
  });

  it('never matches or reveals another tenant customer with the same phone', async () => {
    aiReturns({ musteri_adi: 'Someone', telefon_numarasi: '055 111 22 33' });
    const { body } = await parse('tenant-b');
    expect(body.siparis.musteri_id).toBe('mus-other');
    expect(JSON.stringify(body)).not.toContain('Nigar');
    expect(JSON.stringify(body)).not.toContain('mus-nigar');
  });

  it('creates a new customer card only when nothing matches', async () => {
    aiReturns({ musteri_adi: 'Leyla Həsənova', telefon_numarasi: '070 999 88 77' });
    const { body } = await parse('tenant-a', { otomatik_kaydet: true });
    const created = state.musterilerVeritabani.find((row) => row.ad_soyad === 'Leyla Həsənova');
    expect(created?.tenant_id).toBe('tenant-a');
    expect(body.siparis.musteri_id).toBe(created?.id);
  });
});
