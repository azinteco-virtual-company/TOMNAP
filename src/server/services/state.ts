import fs from 'fs';
import path from 'path';
import { FIRMALAR_DOSYA_YOLU } from '../config';
import { BASLANGIC_SIPARISLER } from '../../data/ornek-siparisler';
import { MusteriKaydi, FirmaTenantItem, OnayBekleyenKaydi } from '../types';

// In-memory sipariş veritabanı
export let siparislerVeritabani: any[] = [...BASLANGIC_SIPARISLER];

export function setSiparislerVeritabani(yeniListe: any[]) {
  siparislerVeritabani = yeniListe;
}

// In-memory müşteri veritabanı (CRM)
export let musterilerVeritabani: MusteriKaydi[] = [
  {
    id: 'mus-001',
    ad_soyad: 'Kəmalə Bədirbəyli',
    telefon: '+994 50 694 25 25',
    instagram_kullanici_adi: '@kemale_bedirbeyli',
    sehir: 'Gəncə',
    adres: 'Gəncə şəhəri, Ozan küçəsi döngə 4',
    musteri_tipi: 'SADIK_MUSTERI',
    toplam_siparis_sayisi: 3,
    toplam_harcama: 580.0,
    kalan_toplam_borc: 80.0,
    notlar: 'Gəncə daimi müştərisi, Ozan küçəsində yaşayır. 3 fərqli uğurlu sifarişi var.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    son_urun_aciklamasi: 'Michael Kors Greenwich Dəri Çanta (180 AZN)',
    son_siparis_tutari: 180.0,
  },
  {
    id: 'mus-002',
    ad_soyad: 'Aytən Məmmədova',
    telefon: '+994 50 214 55 88',
    instagram_kullanici_adi: '@ayten_fashion_baku',
    sehir: 'Bakı',
    adres: 'Nərimanov m/s yaxınlığı, Təbriz küçəsi',
    musteri_tipi: 'SADIK_MUSTERI',
    toplam_siparis_sayisi: 2,
    toplam_harcama: 265.0,
    kalan_toplam_borc: 65.0,
    notlar: 'Bəzən beh atıb maaş günündə qalanını bağlayır.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    son_urun_aciklamasi: 'Canlı yayındaki kırmızı midi elbise (85 AZN)',
    son_siparis_tutari: 85.0,
  },
  {
    id: 'mus-003',
    ad_soyad: 'Nigar Əliyeva',
    telefon: '+994 55 987 11 22',
    instagram_kullanici_adi: '@nigar.aliyeva',
    sehir: 'Bakı',
    adres: '28 May m/s çıxışı, Səməd Vurğun bağının yanı',
    musteri_tipi: 'VIP',
    toplam_siparis_sayisi: 5,
    toplam_harcama: 1240.0,
    kalan_toplam_borc: 0.0,
    notlar: 'Çanta və ayaqqabı daimi alıcısı. Tam ödəniş edir.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 42).toISOString(),
    son_urun_aciklamasi: 'Michael Kors deri omuz çantası (190 AZN)',
    son_siparis_tutari: 190.0,
  },
  {
    id: 'mus-004',
    ad_soyad: 'Leyla Qasımova',
    telefon: '+994 70 333 44 11',
    instagram_kullanici_adi: '@leylaq_89',
    sehir: 'Bakı',
    adres: '',
    musteri_tipi: 'AKRABA_YAKIN',
    toplam_siparis_sayisi: 1,
    toplam_harcama: 240.0,
    kalan_toplam_borc: 240.0,
    notlar: 'Xalanın rəfiqəsi. Bakıda qohuma nağd ödəyir.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
    son_urun_aciklamasi: 'Canada Goose çocuk kışlık mont (240 AZN)',
    son_siparis_tutari: 240.0,
  }
];

export function setMusterilerVeritabani(yeniListe: MusteriKaydi[]) {
  musterilerVeritabani = yeniListe;
}

// Firmalar dosyadan yükleme / kaydetme
export function firmalariYukleDosyadan(): FirmaTenantItem[] {
  try {
    if (fs.existsSync(FIRMALAR_DOSYA_YOLU)) {
      const icerik = fs.readFileSync(FIRMALAR_DOSYA_YOLU, 'utf-8');
      const parsed = JSON.parse(icerik);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Firmalar dosyadan okunamadı:', e);
  }
  return [
    {
      id: 'kanada_shopper_baku',
      ad: 'Kanada Shopper Bakı',
      sehir: 'Bakı',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      aciklama: 'Əsas canlı butik və beynəlxalq logistika iş sahəsi',
    },
    {
      id: 'ayla_boutique',
      ad: 'Ayla Boutique',
      sehir: 'Gəncə',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 18,
      aciklama: 'Gəncə və qərb rayonları üzrə tərəfdaş butik',
    },
    {
      id: 'luxury_brand_baku',
      ad: 'Luxury Brands VIP',
      sehir: 'Bakı',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 20,
      aciklama: 'Lüks çanta və geyim sifarişləri (VIP müştərilər)',
    },
    {
      id: 'demo_sandbox',
      ad: 'Demo & Təlim İş Sahəsi',
      sehir: 'Bakı / Toronto',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      aciklama: 'Yeni müştərilərə və işçilərə təqdimat mühiti',
      isDemo: true,
    },
  ];
}

export function firmalariKaydetDosyaya(firmalar: FirmaTenantItem[]) {
  try {
    const dir = path.dirname(FIRMALAR_DOSYA_YOLU);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, JSON.stringify(firmalar, null, 2), 'utf-8');
  } catch (e) {
    console.error('Firmalar dosyaya yazılamadı:', e);
  }
}

export let firmalarVeritabani: FirmaTenantItem[] = firmalariYukleDosyadan();

export function setFirmalarVeritabani(yeniListe: FirmaTenantItem[]) {
  firmalarVeritabani = yeniListe;
}

// In-memory onay bekleyen mesajlar havuzu (Gelen Kutusu / Staging Inbox)
export let onayBekleyenler: OnayBekleyenKaydi[] = [
  {
    id: 'inbox-001',
    gelis_tarihi: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    kaynak: 'INSTAGRAM_DM',
    gonderen_kullanici: '@sevda_aliyeva',
    konusma_gecmisi: `Müşteri: Salam canım, bu Aldo çanta hələ qalıb?
Satıcı: Bəli Sevda xanım, son 2 ədəd qalıb qara və bej rəngi.
Müşteri: Bej rəngini istəyirəm, 60 manat bibinizə beh atdım, qalanını Bakıda çatdıranda verəcəm.
Satıcı: Əla, qeydə aldım #SİPARİŞ`,
    tetikleyici_kod: '#SİPARİŞ',
    durum: 'BEKLEMEDE',
    tenant_id: 'kanada_shopper_baku',
    oneri_siparis: {
      tenant_id: 'kanada_shopper_baku',
      musteri_adi: 'Sevda Əliyeva',
      instagram_kullanici_adi: '@sevda_aliyeva',
      telefon_numarasi: '',
      teslimat_sehri: 'Bakü',
      teslimat_adresi: '',
      urun_aciklamasi: 'Aldo Bej Çanta',
      beden_veya_olcu: 'Standart',
      renk: 'Bej',
      adet: 1,
      toplam_tutar: 110,
      alinan_tutar: 60,
      kalan_tutar: 50,
      para_birimi: 'AZN',
      finans_durumu: 'KISMI_ODEME',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: '60 AZN bibiye ödendi, 50 AZN Baküde teslimatta',
      eksik_bilgiler: ['telefon_numarasi', 'teslimat_adresi'],
      ai_guven_skoru: 0.94,
    },
  },
  {
    id: 'inbox-002',
    gelis_tarihi: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    kaynak: 'WHATSAPP',
    gonderen_kullanici: '+994 50 333 44 55 (Leyla Q.)',
    konusma_gecmisi: `Leyla: Salam, Sephora-dakı Rare Beauty ənlik var idi ya, Hope rəngi?
Satıcı: Bəli var, qiyməti 75 manatdır.
Leyla: Zəhmət olmasa 1 ədəd mənə ayırın, kartınıza tam 75 manat atdım indicə. Ünvan: Elmlər m/s yaxınlığı.
Satıcı: Çox sağ olun Leyla xanım, sifarişiniz qəbul edildi #ONAY`,
    tetikleyici_kod: '#ONAY',
    durum: 'BEKLEMEDE',
    tenant_id: 'kanada_shopper_baku',
    oneri_siparis: {
      tenant_id: 'kanada_shopper_baku',
      musteri_adi: 'Leyla Q.',
      instagram_kullanici_adi: '',
      telefon_numarasi: '+994 50 333 44 55',
      teslimat_sehri: 'Bakü',
      teslimat_adresi: 'Elmlər m/s yaxınlığı',
      urun_aciklamasi: 'Rare Beauty Allık (Hope)',
      beden_veya_olcu: 'Standart',
      renk: 'Hope',
      adet: 1,
      toplam_tutar: 75,
      alinan_tutar: 75,
      kalan_tutar: 0,
      para_birimi: 'AZN',
      finans_durumu: 'ODENDI',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: 'Tam tutar peşin karta ödendi',
      eksik_bilgiler: [],
      ai_guven_skoru: 0.98,
    },
  },
];

export function setOnayBekleyenler(yeniListe: OnayBekleyenKaydi[]) {
  onayBekleyenler = yeniListe;
}
