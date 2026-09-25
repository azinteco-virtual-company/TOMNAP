import { describe, expect, it } from 'vitest';
import {
  bosForm,
  bosSatir,
  formToplami,
  formdanIstek,
  oneridenForm,
  satirTutari,
  sayiOku,
  type AyristirmaSonucu,
} from '../../src/components/v2/siparisFormu';

const oneri: AyristirmaSonucu = {
  oneri: {
    musteri_adi: 'Aytan',
    telefon_numarasi: '0552843911',
    instagram_kullanici_adi: null,
    teslimat_sehri: 'Gəncə',
    teslimat_adresi: null,
    ozel_not: null,
    satirlar: [
      {
        urun_aciklamasi: 'Çanta',
        beden: 'M',
        renk: null,
        adet: 2,
        birim_satis_fiyati_azn: 45,
        kaynak_ulke: 'CA',
      },
      {
        urun_aciklamasi: 'Kəmər',
        beden: null,
        renk: 'Qara',
        adet: 1,
        birim_satis_fiyati_azn: 0,
        kaynak_ulke: 'CA',
      },
    ],
  },
  eksikBilgiler: ['2. satırın fiyatı yok.'],
  musteriEslesen: { musteri_id: 'm-1', ad_soyad: 'Aytən Məmmədova' },
  musteriAdaylari: [],
};

describe('v2 order form (A9)', () => {
  it('reads decimal commas and computes line and order totals in cents', () => {
    expect([sayiOku('12,5'), sayiOku(' 3 '), sayiOku('1e3'), sayiOku('-1')]).toEqual([
      12.5,
      3,
      Number.NaN,
      Number.NaN,
    ]);
    expect(satirTutari({ ...bosSatir(), adet: '3', fiyat: '0,1' })).toBe(0.3);
    expect(satirTutari({ ...bosSatir(), adet: '1.5', fiyat: '2' })).toBeNull();
    const form = {
      ...bosForm(),
      satirlar: [
        { ...bosSatir(), adet: '2', fiyat: '45' },
        { ...bosSatir(), adet: '1', fiyat: '20,55' },
        bosSatir(),
      ],
    };
    expect(formToplami(form)).toBe(110.55);
  });

  it('fills the form from a suggestion: one row per suggested line, the matched customer linked', () => {
    const form = oneridenForm(oneri, 'mesaj');
    expect(form).toMatchObject({
      hamMesaj: 'mesaj',
      musteriAdi: 'Aytən Məmmədova',
      musteriId: 'm-1',
      sehir: 'Gəncə',
    });
    expect(form.satirlar.map((s) => [s.urunAciklamasi, s.adet, s.fiyat, s.beden, s.renk])).toEqual([
      ['Çanta', '2', '45', 'M', ''],
      ['Kəmər', '1', '', '', 'Qara'],
    ]);
    // A missing price stays empty, so the form cannot be sent until someone enters it.
    expect(formdanIstek(form).hatalar).toEqual([
      '2. sətir: qiymət 0-1.000.000 AZN, ən çox 2 onluq olmalıdır.',
    ]);
  });

  it('builds exactly the body the server accepts', () => {
    const form = oneridenForm(oneri, 'mesaj');
    form.satirlar[1].fiyat = '20,5';
    form.sahipKullaniciId = 'satis-1';
    const { govde, hatalar } = formdanIstek(form);
    expect(hatalar).toEqual([]);
    expect(govde).toEqual({
      musteri_adi: 'Aytən Məmmədova',
      telefon_numarasi: '0552843911',
      teslimat_sehri: 'Gəncə',
      ham_mesaj: 'mesaj',
      musteri_id: 'm-1',
      sahip_kullanici_id: 'satis-1',
      satirlar: [
        {
          urun_aciklamasi: 'Çanta',
          beden: 'M',
          adet: 2,
          birim_satis_fiyati_azn: 45,
          kaynak_ulke: 'CA',
        },
        {
          urun_aciklamasi: 'Kəmər',
          renk: 'Qara',
          adet: 1,
          birim_satis_fiyati_azn: 20.5,
          kaynak_ulke: 'CA',
        },
      ],
    });
  });

  it('makes a platform admin pick the owner (O-24)', () => {
    const form = oneridenForm(oneri, 'mesaj');
    form.satirlar[1].fiyat = '20';
    expect(formdanIstek(form, { sahipZorunlu: true }).hatalar).toEqual([
      'Sifarişin sahibini seçin.',
    ]);
    form.sahipKullaniciId = 'satis-1';
    expect(formdanIstek(form, { sahipZorunlu: true })).toMatchObject({
      hatalar: [],
      govde: { sahip_kullanici_id: 'satis-1' },
    });
    expect(formdanIstek({ ...form, sahipKullaniciId: null }).hatalar).toEqual([]);
  });

  it('lists every problem before anything is sent', () => {
    const form = { ...bosForm(), satirlar: [{ ...bosSatir(), adet: '0', fiyat: '1,005' }] };
    expect(formdanIstek(form).hatalar).toEqual([
      'Müştəri adı lazımdır.',
      '1. sətir: məhsul adı lazımdır.',
      '1. sətir: say 1-1000 arası tam ədəd olmalıdır.',
      '1. sətir: qiymət 0-1.000.000 AZN, ən çox 2 onluq olmalıdır.',
    ]);
  });
});
