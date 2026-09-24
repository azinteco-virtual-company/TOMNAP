export type FinansDurumu = 'ODENDI' | 'KISMI_ODEME' | 'BEKLIYOR';

export type LojistikDurumu =
  | 'KANADA_SATINALIM_BEKLIYOR'
  | 'KANADA_DEPO'
  | 'ULUSLARARASI_KARGO'
  | 'BAKU_DAGITIM_ARKADAS'
  | 'TESLIM_EDILDI';

export type MusteriTipi = 'TANIMADIK' | 'SADIK_MUSTERI' | 'AKRABA_YAKIN' | 'VIP';

export interface Musteri {
  id: string;
  tenant_id?: string; // Multi-Tenant SaaS butik identifikatoru
  ad_soyad: string;
  telefon?: string;
  instagram_kullanici_adi?: string;
  sehir?: string;
  adres?: string;
  musteri_tipi: MusteriTipi;
  toplam_siparis_sayisi: number;
  toplam_harcama: number;
  kalan_toplam_borc: number;
  notlar?: string;
  olusturma_tarihi: string;
  son_siparis_tarihi: string;
  son_urun_aciklamasi?: string;
  son_siparis_tutari?: number;
}

export interface UrunAlani {
  gorsel_indeksi?: number;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export interface SiparisUrunKalemi {
  urun_aciklamasi?: string;
  urun_adi?: string;
  adet: number;
  birim_fiyat?: number;
  tutar?: number;
  beden_veya_olcu?: string;
  renk?: string;
  gorsel_url?: string;
  urun_gorseli?: string; // Kırpılmış net ürün fotoğrafı (örneğin sadece çanta veya ayakkabı)
  orijinal_gorsel_url?: string; // Alındığı ham ekran görüntüsü
  urun_alani?: UrunAlani; // Normalleştirilmiş koordinatlar (0-1000)
  ilgili_telefon?: string; // Ürün görselinin yanında/altında yer alan özel telefon numarası (örn: '+994 51 430 77 78', '055 489 68 96')
  odeme_notu?: string; // Ürünün yanında yazan ödeme durumu (örn: 'ödedi', '108 AZN', 'm10')
  ozel_not?: string; // Bu ürün için özel not
  katalog_gorseli?: string; // Web'den/marka sitesinden bulunan stüdyo/katalog çekimi orijinal ürün görseli
  urun_sayfasi_url?: string; // Resmi marka veya e-ticaret sitesi linki (Farfetch, Nordstrom, Karl.com vb.)
  resmi_urun_adi?: string; // Resmi ürün katalog adı / modeli
}

export interface Siparis {
  id: string;
  olusturma_tarihi: string;
  guncellenme_tarihi?: string;
  ham_mesaj: string;
  musteri_adi: string;
  musteri_id?: string;
  musteri_tipi?: MusteriTipi;
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
  finans_durumu: FinansDurumu;
  lojistik_durumu: LojistikDurumu;
  baku_tahsilat_notu?: string;
  ozel_not?: string;
  kanada_takip_kodu?: string;
  uluslararasi_kargo_kodu?: string;
  eksik_bilgiler: string[];
  ai_guven_skoru?: number;
  siparis_kaynagi: 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'INSTAGRAM_DM' | 'WHATSAPP';
  gorsel_urlleri?: string[];
  urunler?: SiparisUrunKalemi[];
  birden_fazla_urun?: boolean;
  // Bölgesel Kurye & Dağıtım Sorumlusu (Bakü)
  baku_kurye_id?: string;
  kurye_atama_surumu?: number; // Server version for explicit courier assignment.
  baku_kurye_adi?: string; // Örn: 'Elvin M. (Nərimanov/Mərkəz)', 'Rəşad K. (Yasamal/Elmlər)', 'Vüqar T. (Gəncə/Rayonlar)', 'Ofis / Evdən Təhvil'
  baku_kurye_bolgesi?: string; // 'Nərimanov', 'Yasamal', 'Nəsimi', 'Xətai', 'Gəncə / Rayon', 'Ofis'
  teslim_tarihi?: string;
  teslim_eden_kisi?: string;
  // Kanada Satınalma & Belge/Fatura Yönetimi
  kanada_magaza_adi?: string; // Örn: 'Winners Toronto', 'Lululemon Yorkdale', 'Coach Outlet'
  kanada_alis_fiyati_cad?: number; // Kanada alış maliyeti (CAD)
  kanada_alis_fiyati_azn?: number; // Kanada alış maliyeti (AZN karşılığı)
  kargo_agirligi_kg?: number; // Parsel hava kargo ağırlığı (kg)
  kargo_ucreti_azn?: number; // Uluslararası kargo taşıma maliyeti (AZN)
  kanada_fatura_no?: string; // Mağaza fiş/fatura no
  kanada_fatura_gorseli?: string; // Yüklenen fiş/fatura fotoğrafı
  kanada_gumruk_fin_kodu?: string; // Müşteri FIN Kodu (SmartCustoms gümrük beyannamesi için)
  tenant_id?: string; // Firma / Butik İdentifikatoru (Multi-Tenant SaaS)
  is_demo?: boolean; // Demo / Sınaq qeydi olub-olmadığı
  /** Request-only: reason the patron gives when lowering a recorded collection. */
  duzeltme_gerekcesi?: string;
  islem_gecmisi?: {
    tarih: string;
    yapan_rol: string;
    yapan_kisi: string;
    eylem: string;
    aciklama?: string;
  }[];
}

// Roller ve kotalar rol kataloğundan gelir (src/shared/roller.ts).
import type { KullaniciRolu, RolLimitleri } from './shared/roller';
export type { KullaniciRolu, RolLimitleri };

export interface BakuKuryeProfili {
  id: string;
  tenant_id?: string; // Multi-Tenant SaaS butik identifikatoru
  ad_soyad: string;
  telefon: string;
  bolge: string;
  aktif_paket_sayisi?: number;
  toplam_tahsilat_bekleyen?: number;
}

export interface AiAyristirmaSonucu {
  musteri_adi: string;
  musteri_id?: string;
  musteri_durumu?: 'MEVCUT_MUSTERI' | 'YENI_MUSTERI';
  duzeltilen_yazim_hatasi?: string;
  musteri_tipi?: MusteriTipi;
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
  finans_durumu: FinansDurumu;
  lojistik_durumu: LojistikDurumu;
  baku_tahsilat_notu?: string;
  ozel_not?: string;
  eksik_bilgiler: string[];
  ai_guven_skoru: number;
  siparis_kaynagi?: 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'INSTAGRAM_DM' | 'WHATSAPP';
  gorsel_urlleri?: string[];
  urunler?: SiparisUrunKalemi[];
  birden_fazla_urun?: boolean;
}

export interface OnayBekleyenMesaj {
  id: string;
  gelis_tarihi: string;
  kaynak: 'INSTAGRAM_DM' | 'INSTAGRAM_LIVE' | 'INSTAGRAM_REELS' | 'WHATSAPP';
  gonderen_kullanici: string;
  konusma_gecmisi: string;
  tetikleyici_kod?: '#SİPARİŞ' | '#ONAY' | '#KNB' | 'MANUEL';
  oneri_siparis: AiAyristirmaSonucu;
  durum: 'BEKLEMEDE' | 'ONAYLANDI' | 'REDDEDILDI';
}

export interface FirmaTenant {
  id: string; // örn: 'kanada_shopper_baku', 'ayla_boutique', 'luxury_brand_baku', 'demo_sandbox'
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
  aktifKullaniciSayilari?: Partial<RolLimitleri>;
}

export interface DavetLinkiItem {
  token: string;
  tenantId: string;
  tenantAd: string;
  rol: KullaniciRolu;
  olusturanKisi: string;
  olusturmaTarihi: string;
  gecerlilikTarihi: string;
  kullanildiMi: boolean;
  kullananKisi?: string;
}
