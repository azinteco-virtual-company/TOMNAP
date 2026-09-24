import type { KullaniciRolu, RolLimitleri } from '../../shared/roller';

export interface MusteriKaydi {
  id: string;
  ad_soyad: string;
  telefon?: string;
  instagram_kullanici_adi?: string;
  sehir?: string;
  adres?: string;
  musteri_tipi: 'TANIMADIK' | 'SADIK_MUSTERI' | 'AKRABA_YAKIN' | 'VIP';
  toplam_siparis_sayisi: number;
  toplam_harcama: number;
  kalan_toplam_borc: number;
  notlar?: string;
  tenant_id?: string;
  olusturma_tarihi: string;
  son_siparis_tarihi: string;
  son_urun_aciklamasi?: string;
  son_siparis_tutari?: number;
}

export interface SiparisKaydi {
  id: string;
  olusturma_tarihi: string;
  guncellenme_tarihi?: string;
  ham_mesaj: string;
  musteri_adi: string;
  musteri_id?: string;
  musteri_tipi?: 'TANIMADIK' | 'SADIK_MUSTERI' | 'AKRABA_YAKIN' | 'VIP';
  duzeltilen_yazim_hatasi?: string;
  instagram_kullanici_adi?: string;
  telefon_numarasi?: string;
  teslimat_sehri?: string;
  teslimat_adresi?: string;
  urun_aciklamasi: string;
  beden_veya_olcu?: string;
  renk?: string;
  adet: number;
  toplam_tutar: number;
  alinan_tutar: number;
  kalan_tutar: number;
  para_birimi: 'AZN' | 'CAD' | 'USD';
  finans_durumu: 'ODENDI' | 'KISMI_ODEME' | 'BEKLIYOR';
  lojistik_durumu:
    | 'KANADA_SATINALIM_BEKLIYOR'
    | 'KANADA_DEPO'
    | 'ULUSLARARASI_KARGO'
    | 'BAKU_DAGITIM_ARKADAS'
    | 'TESLIM_EDILDI';
  baku_tahsilat_notu?: string;
  ozel_not?: string;
  kanada_takip_kodu?: string;
  uluslararasi_kargo_kodu?: string;
  eksik_bilgiler: string[];
  ai_guven_skoru?: number;
  siparis_kaynagi: 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'INSTAGRAM_DM' | 'WHATSAPP';
  urunler?: any[];
  gorseller?: string[];
  katalog_gorseli?: string;
  urun_gorseli?: string;
  baku_kurye_id?: string | null;
  baku_kurye_adi?: string | null;
  baku_kurye_bolgesi?: string | null;
  tenant_id?: string;
  is_demo?: boolean;
}

export interface FirmaTenantItem {
  id: string;
  ad: string;
  sehir: string;
  varsayilanParaBirimi: 'AZN' | 'CAD' | 'USD';
  varsayilanKomisyonYuzdesi: number;
  aciklama: string;
  isDemo?: boolean;
  onayDurumu?: 'AKTIF' | 'BEKLEMEDE' | 'REDDEDILDI';
  paket?: 'BASLANGIC' | 'PRO' | 'ENTERPRISE';
  sahipAdi?: string;
  sahipEmail?: string;
  sahipTelefon?: string;
  kayitTarihi?: string;
  menseiUlke?: string;
  rolLimitleri?: RolLimitleri;
  aktifKullaniciSayilari?: RolLimitleri;
}

export interface DavetKaydi {
  token: string;
  tenantId: string;
  tenantAd: string;
  rol: string;
  olusturanKisi: string;
  olusturmaTarihi: string;
  gecerlilikTarihi: string;
  kullanildiMi: boolean;
  kullananKisi?: string;
  email?: string;
}

export interface KullaniciKaydi {
  id: string;
  tenant_id: string;
  ad_soyad: string;
  email: string;
  telefon?: string;
  rol: KullaniciRolu;
  sifre_hash?: string;
  durum: 'BEKLEMEDE_SIFRE' | 'AKTIF' | 'PASIF';
  aktivasyon_token?: string | null;
  token_gecerlilik?: string | null;
  olusturma_tarihi: string;
}

export interface OnayBekleyenKaydi {
  id: string;
  gelis_tarihi: string;
  kaynak: 'INSTAGRAM_DM' | 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'WHATSAPP';
  gonderen_kullanici: string;
  konusma_gecmisi: string;
  tetikleyici_kod?: '#SİPARİŞ' | '#ONAY' | '#KNB' | 'MANUEL';
  oneri_siparis: any;
  durum: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDILDI';
  tenant_id?: string;
}
