import { describe, expect, it } from 'vitest';
import {
  kuryeTahsilatIstegi,
  seciliToplam,
  teslimIstegi,
  type KuryeBakiyesi,
} from '../../src/components/v2/kasaFormu';

const kurye: KuryeBakiyesi = {
  kuryeKullaniciId: 'k-1',
  adSoyad: 'Kurye',
  tahsilatToplami: 60.3,
  teslimToplami: 0,
  bakiye: 60.3,
  acikTahsilatlar: [
    { id: 'a', siparisId: 's-1', tutarAzn: 10.1, almaZamani: 'z', musteriAdi: 'A' },
    { id: 'b', siparisId: 's-2', tutarAzn: 20.1, almaZamani: 'z', musteriAdi: 'B' },
    { id: 'c', siparisId: 's-3', tutarAzn: 30.1, almaZamani: 'z', musteriAdi: 'C' },
  ],
};

describe('v2 cash desk forms (A11)', () => {
  it('hands over exactly the selected collections, summed in cents', () => {
    expect(seciliToplam(kurye.acikTahsilatlar, new Set(['a', 'b', 'c']))).toBe(60.3);
    expect(teslimIstegi(kurye, new Set(['a', 'c', 'unknown']))).toEqual({
      kurye_kullanici_id: 'k-1',
      odeme_idleri: ['a', 'c'],
      tutar_azn: 40.2,
    });
    expect(teslimIstegi(kurye, new Set())).toBeNull();
  });

  it('lets a courier record at most the amount due', () => {
    const siparis = {
      id: 's-1',
      musteriAdi: 'A',
      lojistikDurumu: 'BAKU_DAGITIM_ARKADAS',
      toplamTutar: 100,
      kalanTutar: 40.5,
    };
    expect(kuryeTahsilatIstegi(siparis, '40,5')).toEqual({
      govde: { siparis_id: 's-1', tutar_azn: 40.5 },
      hata: null,
    });
    expect(kuryeTahsilatIstegi(siparis, '40.51').hata).toBe('Ən çox 40.50 AZN yazıla bilər.');
    for (const tutar of ['', '0', '-1', '1,005', 'x'])
      expect(kuryeTahsilatIstegi(siparis, tutar).hata).toBe(
        'Məbləğ 0-dan böyük, ən çox 2 onluq olmalıdır.'
      );
  });
});
