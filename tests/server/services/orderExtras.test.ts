import { describe, expect, it } from 'vitest';
import {
  SIPARIS_EK_ALANLAR,
  formatlaSiparis,
  hazirlaSupabasePayload,
} from '../../../src/server/services/siparisFormatlama';

const extras = {
  guncellenme_tarihi: '2026-01-01T00:00:00Z',
  musteri_id: 'customer-owned-by-tenant',
  musteri_tipi: 'SADIK_MUSTERI',
  kanada_magaza_adi: 'Synthetic Store',
  kanada_alis_fiyati_cad: 0,
  kanada_alis_fiyati_azn: 22.5,
  kargo_agirligi_kg: 0.8,
  kargo_ucreti_azn: 15,
  kanada_fatura_no: 'FIXTURE-001',
  kanada_fatura_gorseli: null,
  kanada_gumruk_fin_kodu: 'SYNTHETIC',
  kanada_gumruk_pasaport_no: 'SYNTHETIC1',
  islem_gecmisi: [
    { tarih: '2026-01-01', yapan_rol: 'PATRON', yapan_kisi: 'Fixture', eylem: 'Updated' },
  ],
};
const order = () => ({
  id: '00000000-0000-4000-a000-000000000001',
  tenant_id: 'tenant-a',
  is_demo: false,
  musteri_adi: 'Synthetic',
  urun_aciklamasi: 'Bag',
  adet: 1,
  toplam_tutar: 100,
  alinan_tutar: 10,
  ...extras,
});

describe('supported order metadata persistence', () => {
  it('roundtrips every supported field through the actual database payload', () => {
    const original = order();
    const payload = hazirlaSupabasePayload(original);
    expect(Object.keys(extras).sort()).toEqual([...SIPARIS_EK_ALANLAR].sort());
    expect(payload.ek_veriler).toEqual(extras);
    for (const field of SIPARIS_EK_ALANLAR) expect(payload).not.toHaveProperty(field);
    const fetched = formatlaSiparis({ ...payload, id: original.id });
    for (const field of SIPARIS_EK_ALANLAR) expect(fetched[field]).toEqual(original[field]);
  });

  it('keeps unedited extras through ordinary physical-field updates and explicit clears', () => {
    const stored = hazirlaSupabasePayload(order());
    const updated = hazirlaSupabasePayload({ ...stored, alinan_tutar: 90 });
    expect(updated.ek_veriler).toEqual(extras);
    const cleared = hazirlaSupabasePayload({
      ...formatlaSiparis(updated),
      kanada_fatura_no: null,
      kanada_alis_fiyati_cad: 0,
    });
    expect(cleared.ek_veriler).toEqual({ ...extras, kanada_fatura_no: null });
  });

  it('cannot hydrate or persist ownership, identity or access-control fields from extras', () => {
    const hostile = {
      ...hazirlaSupabasePayload(order()),
      id: order().id,
      ek_veriler: {
        ...extras,
        id: 'foreign-id',
        tenant_id: 'tenant-b',
        is_demo: true,
        role: 'SUPER_ADMIN',
        rol: 'SUPER_ADMIN',
        auth: { tenantId: 'tenant-b' },
        unknown_field: 'discard',
      },
    };
    const hydrated = formatlaSiparis(hostile);
    expect(hydrated).toMatchObject({ id: order().id, tenant_id: 'tenant-a', is_demo: false });
    for (const field of ['role', 'rol', 'auth', 'unknown_field'])
      expect(hydrated).not.toHaveProperty(field);
    expect(hydrated.ek_veriler).toEqual(extras);
    expect(hazirlaSupabasePayload(hostile).ek_veriler).toEqual(extras);
  });

  it('gives explicit top-level values precedence over stale stored metadata', () => {
    const hydrated = formatlaSiparis({
      ...hazirlaSupabasePayload(order()),
      musteri_id: null,
      kanada_fatura_no: 'NEW-RECEIPT',
    });
    expect(hydrated.musteri_id).toBeNull();
    expect(hydrated.kanada_fatura_no).toBe('NEW-RECEIPT');
    expect(hazirlaSupabasePayload(hydrated).ek_veriler).toMatchObject({
      musteri_id: null,
      kanada_fatura_no: 'NEW-RECEIPT',
    });
  });

  it.each(['Könül İsaq', 'Konul'])('does not invent unowned upload URLs for %s', (name) => {
    const hydrated = formatlaSiparis({
      ...order(),
      musteri_adi: name,
      urunler: [{ urun_adi: 'Bag', adet: 1 }],
      gorsel_urlleri: [],
    });
    expect(hydrated.gorsel_urlleri).toEqual([]);
    expect(hydrated.urunler[0].urun_gorseli).toBeUndefined();
    expect(JSON.stringify(hydrated)).not.toContain('/uploads/');
  });
});
