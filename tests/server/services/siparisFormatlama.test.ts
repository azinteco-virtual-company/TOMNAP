import { describe, it, expect } from 'vitest';
import {
  uretKanadaTakipKodu,
  uretUluslararasiKargoKodu,
  hazirlaSupabasePayload,
  formatlaSiparis,
  SUPABASE_GECERLI_KOLONLAR,
} from '../../../src/server/services/siparisFormatlama';

describe('Sipariş Formatlama Servisi', () => {
  describe('uretKanadaTakipKodu', () => {
    it('Zara ürünleri için ZARA kodu üretmeli', () => {
      const kod = uretKanadaTakipKodu('Zara Keten Gömlek');
      expect(kod).toMatch(/^TOR-ZARA-\d{4}$/);
    });

    it('Sephora ürünleri için SEPH kodu üretmeli', () => {
      const kod = uretKanadaTakipKodu('Sephora Dudak Yağı');
      expect(kod).toMatch(/^TOR-SEPH-\d{4}$/);
    });

    it('Michael Kors ürünleri için MK kodu üretmeli', () => {
      const kod = uretKanadaTakipKodu('Michael Kors Omuz Çantası');
      expect(kod).toMatch(/^TOR-MK-\d{4}$/);
    });

    it('Genel ürün için en az 2 harfli mağaza ön eki üretmeli', () => {
      const kod = uretKanadaTakipKodu('Tommy Hilfiger Mont');
      expect(kod).toMatch(/^TOR-TH-\d{4}$/);
    });
  });

  describe('uretUluslararasiKargoKodu', () => {
    it('geçerli kargo ön eki ve YYZ son eki ile formatlı kod üretmeli', () => {
      const kod = uretUluslararasiKargoKodu();
      expect(kod).toMatch(/^(AZ-CARGO|KNB-AIR|GYD-EXP)-\d{4}-YYZ$/);
    });
  });

  describe('hazirlaSupabasePayload', () => {
    it('yalnızca Supabase fiziksel kolonlarını içermeli', () => {
      const input = {
        musteri_adi: 'Aytən Məmmədova',
        toplam_tutar: '150',
        alinan_tutar: '50',
        kalan_tutar: 100, // Generated column olmalı, payload'dan elenmeli
        gecersiz_kolon: 'bu_silinmeli',
        baku_tahsilat_notu: 'Kartla ödendi',
        ozel_not: 'Kurye öncesi aransın',
      };

      const payload = hazirlaSupabasePayload(input);

      expect(payload).toHaveProperty('musteri_adi', 'Aytən Məmmədova');
      expect(payload).toHaveProperty('toplam_tutar', 150);
      expect(payload).toHaveProperty('alinan_tutar', 50);
      expect(payload).not.toHaveProperty('kalan_tutar');
      expect(payload).not.toHaveProperty('gecersiz_kolon');
      expect(payload.baku_tahsilat_notu).toContain('[TƏLİMAT: Kurye öncesi aransın]');

      // Tüm anahtarların geçerli kolonlar kümesinde olduğunu doğrula
      for (const key of Object.keys(payload)) {
        expect(SUPABASE_GECERLI_KOLONLAR.has(key)).toBe(true);
      }
    });

    it('urunler ve gorseller metadata olarak eksik_bilgiler içine paketlenmeli', () => {
      const input = {
        musteri_adi: 'Nigar Əliyeva',
        urunler: [{ urun_adi: 'Çanta', adet: 1, tutar: 190 }],
        gorsel_urlleri: ['/uploads/canta.jpg'],
        tenant_id: 'ayla_boutique',
      };

      const payload = hazirlaSupabasePayload(input);
      expect(Array.isArray(payload.eksik_bilgiler)).toBe(true);
      const metaUrun = payload.eksik_bilgiler.find((item: string) => item.startsWith('META:urunler='));
      expect(metaUrun).toBeDefined();
      expect(metaUrun).toContain('Çanta');
    });
  });

  describe('formatlaSiparis', () => {
    it('baku_tahsilat_notu içindeki talimatı ozel_not olarak ayıklamalı', () => {
      const ham = {
        id: 'sip-001',
        musteri_adi: 'Könül İsaq',
        toplam_tutar: 200,
        alinan_tutar: 100,
        baku_tahsilat_notu: '[TƏLİMAT: Sürücü özü gəlib götürəcək] Bakıda nağd',
      };

      const formatli = formatlaSiparis(ham);
      expect(formatli.ozel_not).toBe('Sürücü özü gəlib götürəcək');
      expect(formatli.baku_tahsilat_notu).toBe('Bakıda nağd');
      expect(formatli.kalan_tutar).toBe(100);
    });

    it('META: verilerini eksik_bilgiler dizisinden urunler dizisine dönüştürmeli', () => {
      const ham = {
        id: 'sip-002',
        musteri_adi: 'Test Müşteri',
        toplam_tutar: 100,
        alinan_tutar: 0,
        eksik_bilgiler: [
          'META:urunler=[{"urun_adi":"Ayakkabı","adet":1,"birim_fiyat":100}]',
          'telefon_numarasi',
        ],
      };

      const formatli = formatlaSiparis(ham);
      expect(formatli.urunler).toHaveLength(1);
      expect(formatli.urunler[0].urun_adi).toBe('Ayakkabı');
      expect(formatli.eksik_bilgiler).toEqual(['telefon_numarasi']);
    });
  });
});
