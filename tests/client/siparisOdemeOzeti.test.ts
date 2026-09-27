import { describe, expect, it } from 'vitest';
import { odemeOzeti } from '../../src/utils/siparisOdemeOzeti';

// Codex R4 T1: the mobile card took its balance from the Baku collection fields, the table
// from total − received. An order owing 40 of 50 AZN without Baku fields showed
// "Tam Ödənildi" on the card. Both views now read one model.
describe('one payment summary for the order card and the table', () => {
  it('uses total, received and remaining like the table', () => {
    expect(
      odemeOzeti({ toplam_tutar: 50, alinan_tutar: 10, kalan_tutar: 40, para_birimi: 'AZN' })
    ).toEqual({ toplam: 50, odenen: 10, kalan: 40, paraBirimi: 'AZN', tamOdendi: false });
  });

  it('ignores the Baku collection fields for the balance', () => {
    expect(
      odemeOzeti({
        toplam_tutar: 100,
        alinan_tutar: 0,
        kalan_tutar: 100,
        para_birimi: 'AZN',
        baku_tahsilat_azn: 0,
        baku_tahsil_edilen_azn: 0,
        kalan_baku_tahsilat_azn: 0,
      })
    ).toMatchObject({ kalan: 100, tamOdendi: false });
  });

  it('derives the remaining amount when it is missing and never shows less than zero', () => {
    expect(odemeOzeti({ toplam_tutar: 80, alinan_tutar: 30, para_birimi: 'AZN' })).toMatchObject({
      kalan: 50,
      tamOdendi: false,
    });
    expect(odemeOzeti({ toplam_tutar: 80, alinan_tutar: 90, para_birimi: 'AZN' })).toMatchObject({
      kalan: 0,
      tamOdendi: true,
    });
    expect(odemeOzeti({ toplam_tutar: 0, alinan_tutar: 0, para_birimi: 'AZN' }).tamOdendi).toBe(
      false
    );
  });
});
