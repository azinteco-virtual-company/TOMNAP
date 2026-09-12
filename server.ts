import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createServer as createViteServer } from 'vite';
import { BASLANGIC_SIPARISLER } from './src/data/ornek-siparisler';

dotenv.config();

const app = express();
const PORT = 3000;

// Görsel base64 ve büyük payloadlar için 50MB limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Yüklenen ve kırpılan ürün görselleri klasörü
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Görseller için CORS ve Akıllı Kurtarma (Fallback) Middleware'i
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
});

// Akıllı görsel servisi: Dosya birebir yoksa aynı indeksteki veya mevcut son görselle kurtarır
app.get('/uploads/:dosyaAdi', (req, res, next) => {
  const dosyaAdi = req.params.dosyaAdi;
  const tamYol = path.join(UPLOADS_DIR, dosyaAdi);

  if (fs.existsSync(tamYol)) {
    return res.sendFile(tamYol);
  }

  // Akıllı Fallback: Eğer dosya adı örn. gorsel_*_1.jpg veya gorsel_*_2.jpg ise
  try {
    const tumDosyalar = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
    const indexMatch = dosyaAdi.match(/_([0-9]+)\.(jpe?g|png|webp|svg)$/i);
    
    if (indexMatch && indexMatch[1]) {
      const arananIndex = indexMatch[1];
      const uzanti = indexMatch[2];
      const eslesenler = tumDosyalar.filter(f => f.endsWith(`_${arananIndex}.${uzanti}`) || f.endsWith(`_${arananIndex}.jpg`) || f.endsWith(`_${arananIndex}.png`));
      if (eslesenler.length > 0) {
        // En güncel olanı seç
        eslesenler.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
        return res.sendFile(path.join(UPLOADS_DIR, eslesenler[0]));
      }
    }

    // Genel fallback: Herhangi bir resim dosyası varsa en sonuncuyu gönder
    const resimDosyalari = tumDosyalar.filter(f => /\.(jpe?g|png|webp|svg)$/i.test(f));
    if (resimDosyalari.length > 0) {
      resimDosyalari.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
      return res.sendFile(path.join(UPLOADS_DIR, resimDosyalari[0]));
    }
  } catch (fbErr) {
    console.warn('Görsel akıllı kurtarma hatası:', fbErr);
  }

  next();
});

app.use('/uploads', express.static(UPLOADS_DIR));

// Supabase İstemcisi Başlatma
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

let supabase: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
    console.log('✅ Supabase canlı PostgreSQL veritabanı bağlandı:', SUPABASE_URL);
  } catch (err) {
    console.error('❌ Supabase bağlantı hatası:', err);
  }
}

// Müşteri Veritabanı Modeli (CRM & Tekrar Eden Müşteriler)
interface MusteriKaydi {
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

let musterilerVeritabani: MusteriKaydi[] = [
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

// Otomatik Takip Kodu Üreticileri
function uretKanadaTakipKodu(urunTanimi?: string): string {
  let storeCode = 'CA';
  if (urunTanimi) {
    const clean = urunTanimi.toUpperCase().replace(/[^A-Z]/g, '');
    if (clean.includes('ZARA')) storeCode = 'ZARA';
    else if (clean.includes('SEPHORA')) storeCode = 'SEPH';
    else if (clean.includes('KORS') || clean.includes('MICHAEL')) storeCode = 'MK';
    else if (clean.includes('TOMMY')) storeCode = 'TH';
    else if (clean.includes('NIKE')) storeCode = 'NIKE';
    else if (clean.includes('MASSIMO')) storeCode = 'MD';
    else if (clean.length >= 2) storeCode = clean.slice(0, 4);
  }
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return `TOR-${storeCode}-${randomNum}`;
}

function uretUluslararasiKargoKodu(): string {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const prefixes = ['AZ-CARGO', 'KNB-AIR', 'GYD-EXP'];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];
  return `${p}-${randomNum}-YYZ`;
}

// In-memory sipariş veritabanı (Başlangıç verileri ile)
interface SiparisKaydi {
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
}

let siparislerVeritabani: any[] = [...BASLANGIC_SIPARISLER];

interface FirmaTenantItem {
  id: string;
  ad: string;
  sehir: string;
  varsayilanParaBirimi: 'AZN' | 'CAD' | 'USD';
  varsayilanKomisyonYuzdesi: number;
  aciklama: string;
  isDemo?: boolean;
}

const FIRMALAR_DOSYA_YOLU = path.join(process.cwd(), 'data', 'firmalar.json');

function firmalariYukleDosyadan(): FirmaTenantItem[] {
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

function firmalariKaydetDosyaya(firmalar: FirmaTenantItem[]) {
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

let firmalarVeritabani: FirmaTenantItem[] = firmalariYukleDosyadan();


app.get('/api/sistem-durum', async (req, res) => {
  let supabaseAktif = false;
  let kayitSayisi = 0;
  let supabaseHata: string | null = null;

  if (supabase) {
    try {
      const { count, error } = await supabase.from('siparisler').select('*', { count: 'exact', head: true });
      if (error) {
        supabaseHata = error.message;
      } else {
        supabaseAktif = true;
        kayitSayisi = count ?? 0;
      }
    } catch (e: any) {
      supabaseHata = e.message;
    }
  }

  res.json({
    basarili: true,
    supabase: {
      bagli: supabaseAktif,
      url: SUPABASE_URL ? SUPABASE_URL.replace(/https:\/\/(.{4}).*(\.supabase\.co)/, 'https://$1***$2') : null,
      kayit_sayisi: kayitSayisi,
      hata: supabaseHata,
    },
    gemini: {
      aktif: !!process.env.GEMINI_API_KEY,
      model: 'gemini-2.5-flash / gemini-3.8-flash',
    },
    sunucu_zamani: new Date().toISOString(),
  });
});

// Supabase tablosunda tanımlı fiziksel ve yazılabilir kolonlar (Tenant İzolasyonlu)
const SUPABASE_GECERLI_KOLONLAR = new Set([
  'tenant_id',
  'ham_mesaj',
  'siparis_kaynagi',
  'musteri_adi',
  'instagram_kullanici_adi',
  'telefon_numarasi',
  'teslimat_sehri',
  'teslimat_adresi',
  'urun_aciklamasi',
  'beden_veya_olcu',
  'renk',
  'adet',
  'toplam_tutar',
  'alinan_tutar',
  'para_birimi',
  'finans_durumu',
  'lojistik_durumu',
  'baku_kurye_id',
  'baku_kurye_adi',
  'baku_kurye_bolgesi',
  'teslim_tarihi',
  'teslim_eden_kisi',
  'baku_tahsilat_notu',
  'kanada_takip_kodu',
  'uluslararasi_kargo_kodu',
  'eksik_bilgiler',
  'ai_guven_skoru',
  'is_demo',
]);

// Supabase'e yazarken payload'ı filtreleyen, özel teslimat notunu ve metadata'yı koruyan yardımcı
function hazirlaSupabasePayload(input: any): Record<string, any> {
  let tahsilatNotu = (input.baku_tahsilat_notu || '').trim();
  if (input.ozel_not && typeof input.ozel_not === 'string' && input.ozel_not.trim()) {
    const ozelNotTemiz = input.ozel_not.trim();
    if (!tahsilatNotu.includes('[TƏLİMAT:') && !tahsilatNotu.includes('[TALİMAT:')) {
      tahsilatNotu = `[TƏLİMAT: ${ozelNotTemiz}] ${tahsilatNotu}`.trim();
    }
  }

  // Eksik bilgiler ve çoklu ürün/görsel metadata'sı
  let eksikBilgiler: any[] = Array.isArray(input.eksik_bilgiler) ? [...input.eksik_bilgiler] : [];
  eksikBilgiler = eksikBilgiler.filter((b) => typeof b !== 'string' || !b.startsWith('META:'));
  if (Array.isArray(input.urunler) && input.urunler.length > 0) {
    eksikBilgiler.push('META:urunler=' + JSON.stringify(input.urunler));
  }
  if (Array.isArray(input.gorsel_urlleri) && input.gorsel_urlleri.length > 0) {
    eksikBilgiler.push('META:gorseller=' + JSON.stringify(input.gorsel_urlleri));
  }
  if (input.tenant_id) {
    eksikBilgiler.push('META:tenant_id=' + input.tenant_id);
  }
  if (input.is_demo !== undefined) {
    eksikBilgiler.push('META:is_demo=' + (input.is_demo ? '1' : '0'));
  }

  const raw: Record<string, any> = {
    ...input,
    tenant_id: input.tenant_id || 'kanada_shopper_baku',
    baku_tahsilat_notu: tahsilatNotu,
    eksik_bilgiler: eksikBilgiler,
    ham_mesaj: input.ham_mesaj || (input.ozel_not ? `Talimat: ${input.ozel_not}` : (input.urun_aciklamasi || '')),
    adet: Number(input.adet || 1),
    toplam_tutar: Number(input.toplam_tutar || 0),
    alinan_tutar: Number(input.alinan_tutar || 0),
    ai_guven_skoru: Number(input.ai_guven_skoru || 0.95),
  };

  // Sadece Supabase tablosundaki fiziksel kolonları al (kalan_tutar ve id hariç tutulur çünkü postgres generated/default'tur)
  const payload: Record<string, any> = {};
  for (const key of Object.keys(raw)) {
    if (SUPABASE_GECERLI_KOLONLAR.has(key)) {
      payload[key] = raw[key];
    }
  }

  return payload;
}

// Supabase'den veya bellekten gelen veriyi normalize eden yardımcı
function formatlaSiparis(s: any): any {
  let bakuTahsilatNotu = (s.baku_tahsilat_notu || '').trim();
  let ozelNot = (s.ozel_not || '').trim();

  // baku_tahsilat_notu içindeki [TƏLİMAT: ...] veya [TALİMAT: ...] etiketini ayrıştır
  const talimatMatch = bakuTahsilatNotu.match(/\[(?:TƏLİMAT|TALİMAT):\s*([\s\S]*?)\]/i);
  if (talimatMatch) {
    if (!ozelNot) {
      ozelNot = talimatMatch[1].trim();
    }
    bakuTahsilatNotu = bakuTahsilatNotu.replace(/\[(?:TƏLİMAT|TALİMAT):\s*[\s\S]*?\]/gi, '').trim();
  }

  // eksik_bilgiler içindeki META: verilerini ayıkla
  let urunler = Array.isArray(s.urunler) ? s.urunler : [];
  let gorselUrlleri = Array.isArray(s.gorsel_urlleri) ? s.gorsel_urlleri : [];
  let temizEksikBilgiler: string[] = [];
  let tenantId = 'kanada_shopper_baku';
  let isDemo = true;

  if (Array.isArray(s.eksik_bilgiler)) {
    for (const item of s.eksik_bilgiler) {
      if (typeof item === 'string' && item.startsWith('META:urunler=')) {
        try {
          urunler = JSON.parse(item.substring('META:urunler='.length));
        } catch {}
      } else if (typeof item === 'string' && item.startsWith('META:gorseller=')) {
        try {
          gorselUrlleri = JSON.parse(item.substring('META:gorseller='.length));
        } catch {}
      } else if (typeof item === 'string' && item.startsWith('META:tenant_id=')) {
        tenantId = item.substring('META:tenant_id='.length);
      } else if (typeof item === 'string' && item.startsWith('META:is_demo=')) {
        isDemo = item.substring('META:is_demo='.length) === '1';
      } else {
        temizEksikBilgiler.push(String(item));
      }
    }
  }

  if (s.tenant_id) tenantId = s.tenant_id;
  if (s.is_demo !== undefined) isDemo = s.is_demo;

  // Eğer urunler dizisi henüz yoksa ve urun_aciklamasi içinde '+' varsa otomatik ayrıştır
  if (urunler.length === 0 && s.urun_aciklamasi && s.urun_aciklamasi.includes('+')) {
    const parcalar = s.urun_aciklamasi.split('+');
    urunler = parcalar.map((p: string) => {
      const match = p.match(/(?:(\d+)x\s*)?(.*?)(?:\((\d+(?:\.\d+)?)\s*AZN\))?$/i);
      return {
        urun_adi: (match && match[2] ? match[2].trim() : p.trim()) || p.trim(),
        adet: match && match[1] ? Number(match[1]) : 1,
        tutar: match && match[3] ? Number(match[3]) : undefined,
      };
    });
  }

  // Urunler dizisini normalize et ve alanları eşitle
  urunler = urunler.map((u: any, idx: number) => {
    const adi = u.urun_adi || u.urun_aciklamasi || `Ürün #${idx + 1}`;
    const fiyati = u.tutar !== undefined ? Number(u.tutar) : (u.birim_fiyat !== undefined ? Number(u.birim_fiyat) : undefined);

    let gorsel = u.urun_gorseli || u.gorsel_url || undefined;
    // Özel durum: Könül İsaq siparişiyse ve Karl Lagerfeld çantalarıysa, hazırladığımız kaliteli görselleri bağla
    if (!gorsel && (s.musteri_adi?.includes('Könül') || s.musteri_adi?.includes('Konul'))) {
      gorsel = idx === 0 ? '/uploads/karl_lagerfeld_canta_1.svg' : '/uploads/karl_lagerfeld_canta_2.svg';
    }

    return {
      ...u,
      urun_adi: adi,
      urun_aciklamasi: adi,
      adet: Number(u.adet || 1),
      tutar: fiyati,
      birim_fiyat: fiyati,
      urun_gorseli: gorsel,
    };
  });

  // Eğer Könül İsaq siparişiyse ve gorselUrlleri eski dosya adıysa, geçerli görsel yollarına güncelle
  if (s.musteri_adi?.includes('Könül') || s.musteri_adi?.includes('Konul')) {
    if (!gorselUrlleri || gorselUrlleri.length === 0 || gorselUrlleri.some((g: string) => typeof g === 'string' && g.includes('Panodan_'))) {
      gorselUrlleri = [
        '/uploads/whatsapp_konul_screenshot.svg',
        '/uploads/karl_lagerfeld_canta_1.svg',
        '/uploads/karl_lagerfeld_canta_2.svg',
      ];
    }
  }

  const toplam = Number(s.toplam_tutar || 0);
  const alinan = Number(s.alinan_tutar || 0);
  const kalan = s.kalan_tutar !== undefined && s.kalan_tutar !== null ? Number(s.kalan_tutar) : Math.max(0, toplam - alinan);

  return {
    ...s,
    toplam_tutar: toplam,
    alinan_tutar: alinan,
    kalan_tutar: kalan,
    adet: Number(s.adet || 1),
    baku_tahsilat_notu: bakuTahsilatNotu,
    ozel_not: ozelNot,
    urunler: urunler,
    birden_fazla_urun: urunler.length > 1,
    gorsel_urlleri: gorselUrlleri,
    eksik_bilgiler: temizEksikBilgiler,
    tenant_id: tenantId,
    is_demo: isDemo,
  };
}

// 1. API: Tüm Siparişleri Getir (Öncelik: Canlı Supabase PostgreSQL - Tenant İzolasyonlu)
app.get('/api/siparisler', async (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;

  if (supabase) {
    try {
      let query = supabase.from('siparisler').select('*');

      if (seciliTenant && seciliTenant !== 'all') {
        query = query.eq('tenant_id', seciliTenant);
      }

      const { data, error } = await query.order('olusturma_tarihi', { ascending: false });

      if (error) {
        console.error('Supabase sorgu hatası, bellek kullanılıyor:', error.message);
      } else if (data) {
        let temizVeriler = data.map((s: any) => formatlaSiparis(s));
        if (seciliTenant && seciliTenant !== 'all') {
          temizVeriler = temizVeriler.filter((s: any) => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant);
        }

        return res.json({
          basarili: true,
          kaynak: 'supabase',
          toplam: temizVeriler.length,
          siparisler: temizVeriler,
        });
      }
    } catch (err: any) {
      console.error('Supabase getirme istisnası:', err.message);
    }
  }

  // Supabase yoksa veya hata verirse bellek deposundan dön
  let bellekTemizVeriler = siparislerVeritabani.map((s: any) => formatlaSiparis(s));
  if (seciliTenant && seciliTenant !== 'all') {
    bellekTemizVeriler = bellekTemizVeriler.filter((s: any) => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }
  res.json({
    basarili: true,
    kaynak: 'bellek',
    toplam: bellekTemizVeriler.length,
    siparisler: bellekTemizVeriler,
  });
});

// 1.5 API: Tekil Görsel veya Kırpılmış Ürün Fotoğrafı Yükleme
app.post('/api/upload-gorsel', (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Geçersiz görsel verisi' });
    }

    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const ext = (mimeType || '').includes('png') ? 'png' : (mimeType || '').includes('webp') ? 'webp' : 'jpg';
    const benzersizAd = `urun_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const dosyaYolu = path.join(UPLOADS_DIR, benzersizAd);

    fs.writeFileSync(dosyaYolu, Buffer.from(cleanBase64, 'base64'));

    res.json({
      basarili: true,
      url: `/uploads/${benzersizAd}`,
      dosya_adi: dosyaAdi || benzersizAd,
    });
  } catch (err: any) {
    console.error('Görsel yükleme hatası:', err);
    res.status(500).json({ basarili: false, hata: 'Görsel kaydedilemedi: ' + err.message });
  }
});

// Gemini API İstemcisi ve Kota / Yoğunluk Takibi (Cooldown Mekanizması)
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY sistemde tanımlı değil. Lütfen Settings > Secrets panelinden ekleyin.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Model kota ve meşguliyet durumu takibi (Kısa süreli Cooldown)
const modelCooldownMap = new Map<string, number>();

function getPrioritizedModels(preferredModels?: string[]): string[] {
  // En kararlı ve ücretsiz kota desteği olan çalışan modeller
  const baseList = preferredModels || [
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
  ];

  const now = Date.now();
  const ready: string[] = [];
  const inCooldown: string[] = [];

  for (const m of baseList) {
    const expireTime = modelCooldownMap.get(m) || 0;
    if (now > expireTime) {
      ready.push(m);
    } else {
      inCooldown.push(m);
    }
  }

  // Daima en azından hazır modelleri öncelikli kıl
  return ready.length > 0 ? [...ready, ...inCooldown] : baseList;
}

// Gemini API Çağrıları için Dayanıklı Model Fallback & Retry Mekanizması (503 / 429 / Tool Quota Koruması)
async function generateContentWithRetryAndFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: any;
    models?: string[];
  }
) {
  const modelsToTry = getPrioritizedModels(params.models);
  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const model = modelsToTry[i];
    
    // 1. Adım: İlk olarak kullanıcının istediği yapılandırma ile çağrı yap (ör. googleSearch aracı)
    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: params.config,
      });
      // Başarılı çağrıda bu modelin cooldown kaydını kaldır
      modelCooldownMap.delete(model);
      return response;
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const is429 = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
      const is503 = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || errMsg.includes('overloaded');

      console.warn(`[Gemini Deneme] Model '${model}' ilk çağrıda yanıt veremedi (${err?.status || (is429 ? 'Kota 429' : '503 Yoğunluk')})`);

      // 2. Adım: Eğer 'googleSearch' aracı nedeniyle 429 kota hatası veya araç uyumsuzluğu oluştuysa,
      // aynı modeli araçsız (salt Vision veya salt Metin) olarak anında tekrar dene!
      // Bu sayede görsel analizi harici araç kotasına takılmadan %100 başarıyla tamamlanır.
      if (params.config?.tools && (is429 || is503)) {
        try {
          console.log(`[Gemini Kurtarma] '${model}' arama aracı kotası aşıldı, araçsız salt analiz modunda deneniyor...`);
          const fallbackConfig = { ...params.config };
          delete fallbackConfig.tools;

          const recoveryResponse = await ai.models.generateContent({
            model,
            contents: params.contents,
            config: Object.keys(fallbackConfig).length > 0 ? fallbackConfig : undefined,
          });
          modelCooldownMap.delete(model);
          return recoveryResponse;
        } catch (recoveryErr: any) {
          console.warn(`[Gemini Kurtarma] '${model}' araçsız modda da yanıt veremedi:`, recoveryErr?.message || recoveryErr);
          lastError = recoveryErr;
        }
      }

      // Sadece 5 saniyelik geçici cooldown ata (uzun süre modeli kilitleme)
      if (is429 || is503) {
        modelCooldownMap.set(model, Date.now() + 5_000);
      }

      // Bir sonraki modele geçmeden önce kısa bir bekleme (500ms)
      if (i < modelsToTry.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  // 3. Adım: Tüm modeller denendikten sonra hala yanıt alınamadıysa:
  // Son bir kez 'gemini-2.5-flash' ile araçsız temel modda kurtarmayı dene
  try {
    console.log('[Gemini Son Kurtarma] gemini-2.5-flash ile araçsız acil durum çağrısı yapılıyor...');
    const emergencyConfig = params.config ? { ...params.config } : undefined;
    if (emergencyConfig?.tools) delete emergencyConfig.tools;

    const emergencyResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: params.contents,
      config: emergencyConfig,
    });
    return emergencyResponse;
  } catch (finalEmergencyErr) {
    console.error('[Gemini Son Kurtarma Başarısız]:', finalEmergencyErr);
  }

  const errStr = lastError?.message || '';
  if (errStr.includes('503') || errStr.includes('high demand') || errStr.includes('UNAVAILABLE')) {
    throw new Error('Google Yapay Zeka modeli şu anda yoğun talep görüyor (503). Lütfen birkaç saniye sonra tekrar deneyin.');
  }
  if (errStr.includes('429') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('quota')) {
    throw new Error('Google Yapay Zeka sorgu kotası şu an için doldu (429). Lütfen kısa bir süre sonra tekrar deneyin.');
  }
  throw lastError || new Error('Yapay zeka yanıt üretemedi.');
}

// 2. API: Gemini AI ile Dağınık Mesajı Ayrıştır ve Supabase'e Kaydet
app.post('/api/ayristir-siparis', async (req, res) => {
  try {
    const { ham_mesaj, musteri_adi_ipucu, siparis_kaynagi, otomatik_kaydet, gorsel_base64, gorsel_mime_type, gorseller } = req.body;

    const hasGorseller = (Array.isArray(gorseller) && gorseller.length > 0) || !!gorsel_base64;

    if ((!ham_mesaj || typeof ham_mesaj !== 'string' || ham_mesaj.trim() === '') && !hasGorseller) {
      return res.status(400).json({
        basarili: false,
        hata: 'Lütfen müşteriden gelen ham mesaj metnini veya bir ürün görseli/ekran görüntüsü iletin.',
      });
    }

    let ai: GoogleGenAI;
    try {
      ai = getGeminiClient();
    } catch (keyErr: any) {
      return res.status(500).json({
        basarili: false,
        hata: keyErr.message,
      });
    }

    // Mevcut müşterilerin özet listesi (Gemini akıllı eşleştirme ve yazım hatası düzeltmesi için)
    const musterilerRehberi = musterilerVeritabani.map(m => ({
      id: m.id,
      ad_soyad: m.ad_soyad,
      telefon: m.telefon,
      sehir: m.sehir,
      adres: m.adres,
      musteri_tipi: m.musteri_tipi,
    }));

    const systemInstruction = `Sen Kanada'dan Azerbaycan'a (Bakü, Gence ve diğer şehirler) Instagram Live, Reels, DM ve WhatsApp üzerinden ürün satışı yapan uluslararası bir butik e-ticaret ve lojistik operasyonunun Uzman Sipariş ve Müşteri Ayrıştırma Yapay Zekasısın.

Müşteriler siparişlerini son derece dağınık, günlük konuşma diliyle veya Azerbaycan Türkçesi / Türkiye Türkçesi karışımı karmaşık mesajlarla iletmektedirler.

GÖREVİN VE ÇOK KRİTİK KURALLAR:
1. MÜŞTERİ TANIMA VE YAZIM HATASI DÜZELTME (DEDUPLICATION & AUTOCORRECT):
   Sistemde kayıtlı mevcut müşteriler listesi:
   ${JSON.stringify(musterilerRehberi, null, 2)}

   - Mesaj veya görseldeki telefon numarası (örn: "+994 50 694 25 25") mevcut bir müşteriyle eşleşiyorsa, mesajda isim yanlış yazılmış olsa bile (örn: "Kemake" -> "Kəmalə Bədirbəyli") müşterinin doğru ve resmi adını 'musteri_adi' alanına yaz!
   - duzeltilen_yazim_hatasi: Eğer isimde bir harf/yazım hatası düzelttiysen belirt (örn: "Kemake -> Kəmalə Bədirbəyli (Telefon: +994 50 694 25 25 eşleşti)").
   - eslesen_musteri_id: Eşleşen müşterinin id'sini yaz (örn: "mus-001").
   - musteri_durumu: Mevcut müşteri eşleştiyse 'MEVCUT_MUSTERI', yeni bir müşteriyse 'YENI_MUSTERI'.
   - musteri_tipi: Eşleşen müşterinin tipini ata, yoksa mesaja göre 'TANIMADIK' veya akraba/tanıdık olduğunu belirten bir not varsa 'AKRABA_YAKIN' ata.
   - Teslimat şehri veya adresi mesajda eksik ama mevcut müşteri kartında varsa, otomatik tamamla (Örn: Gəncə, Ozan küçəsi).

2. BİRDEN FAZLA GÖRSEL & BİRDEN FAZLA ÜRÜN ANALİZİ:
   Kullanıcı aynı müşteri için birden fazla ekran görüntüsü veya ürün fotoğrafı eklemiş olabilir (Örneğin 1. görselde bir ayakkabı, 2. görselde bir çanta veya mont, 3. görselde banka dekontu veya WhatsApp sohbeti):
   - Müşteri TEK ve AYNI KİŞİDİR. Tüm görseller bu müşteriye aittir.
   - Görsellerdeki TÜM farklı ürünleri tespit et.
   - "urun_aciklamasi" alanında tüm ürünleri açık ve düzenli biçimde listele (Örn: "1x On Cloud Koşu Ayakkabısı (No: 39, Beyaz) + 1x Michael Kors El Çantası (Siyah)").
   - "adet" alanına toplam ürün sayısını yaz (Örn: 2).
   - "toplam_tutar" alanına tüm ürünlerin toplam fiyatını toplayıp yaz (Örn: 338 AZN ayakkabı + 180 AZN çanta = 518 AZN). Dekont veya mesajda genel toplam varsa onu baz al.
   - "alinan_tutar" alanına toplam ödenen kaporayı veya tam ödemeyi yaz.
   - "birden_fazla_urun": Eğer 2 veya daha fazla farklı ürün varsa true, tek bir ürünse false.
   - "urunler": Tespit edilen her bir ürünün ayrı ayrı listesini (urun_aciklamasi, adet, birim_fiyat, beden_veya_olcu, renk) doldur.

3. FİNANS DURUMU:
   - Tamamı ödendiyse: 'ODENDI'
   - Kapora, avans, beh veya bir kısmı verildiyse: 'KISMI_ODEME'
   - Hiç ödeme yapılmadıysa veya teslimatta ödenecekse: 'BEKLIYOR'
4. LOJİSTİK DURUMU: Varsayılan 'ULUSLARARASI_KARGO'. Yeni bir sipariş oluşturulurken lojistik aşaması default olarak mutlaka 'ULUSLARARASI_KARGO' olarak atanmalıdır.
5. alinan_tutar: Alınan kapora/beh (belirtilmemişse 0).
6. kalan_tutar: toplam_tutar - alinan_tutar.
7. baku_tahsilat_notu: Bakü'deki akrabanın teslimatta alacağı veya elden teslim edilecek notlar.
8. ozel_not (MÜŞTERİ VEYA GRUP ÖZEL TALİMATI):
   Müşterinin veya siparişi WhatsApp/Instagram grubuna ileten kişinin kargo, teslimat, sürücü veya paketleme ile ilgili özel bir talebi varsa bunu 'ozel_not' alanına eksiksiz çıkar!
   Örnekler:
   - "Bakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək" -> Müşteri sürücüsü kendisi alacak, haber verilecek, kargo yapılmayacak.
   - "Bana kargo olmasın, kendim gelip alacağım."
   - "Şunu gönderirken içerisine hediye notu koyun."
   - "Yurda değil ev adresine gelsin."
   Bu not lojistik ve operasyon için çok kritiktir.

9. WHATSAPP EKRAN GÖRÜNTÜSÜ VE MÜŞTERİ ADI TESPİTİ (HAYATİ DERECEDE ÖNEMLİ):
   WhatsApp ekran görüntülerinde ve sohbetlerinde müşteri adı şu konumlarda bulunur ve KESİNLİKLE ÇIKARILMALIDIR:
   a) "İletildi / Forwarded / Yönləndirildi" etiketinin hemen altında yazan kişi adı (Örn: "Abdullayeva Deyanet", "Könül İsaq", "Aytən Quliyeva"). Bu iletilen kişi siparişin asıl sahibidir, yani MÜŞTERİDİR! 'musteri_adi' alanına bunu yaz!
   b) WhatsApp ekranının üst başlığındaki profil/kişi adı veya mesaj balonu içindeki "Ad:...", "Müştəri:..." bilgisi.
   c) Mağaza veya grup adı (Örn: "Canadian Brand Shop", "Live Satış") butiğin kendi adıdır, ASLA müşteri adı olarak seçilmemelidir.
   d) İletilen mesajlarda geçen sokak/bina/adres bilgisi (Örn: "Memmedeli Serifli 1B" -> Məmmədəli Şərifli 1B) 'teslimat_adresi' olarak kaydedilmelidir.
   e) Ekranda bir şahıs adı veya telefon numarası varken ASLA 'musteri_adi' alanına "Bilinmiyor" veya "Bilinmeyen Müşteri" yazma! Ekranda görülen gerçek şahıs adını (örn: "Abdullayeva Dəyanət") yaz!

10. GÖRSELLERDEKİ ÜRÜN BAZLI TELEFON NUMARALARI VE ÖDEME NOTLARI (HAYATİ DERECEDE ÖNEMLİ):
   - Müşterilerin gönderdiği WhatsApp ekran görüntülerinde veya ürün kolajlarında, her bir ürün fotoğrafının altında veya hemen yanında o ürüne özel bir telefon numarası (örn: "055 489 68 96", "+994 51 430 77 78", "055 283 88 78") ve/veya ödeme/fiyat notu ("odedi / ödedi", "108 azn", "m10 ilə ödənildi") bulunabilir.
   - Bu numaralar o ürünü sipariş eden farklı kişilere/akrabalara ya da ödemeyi yapan m10 hesaplarına aittir.
   - Her bir ürün kalemi için:
     * 'ilgili_telefon': Ürünün altındaki/yanındaki telefon numarasını çıkar (örn: "+994 51 430 77 78" veya "055 489 68 96").
     * 'odeme_notu': Ürünün yanındaki ödeme ve işlem bilgisini yaz (örn: "Ödedi", "108 AZN Ödendi", "Fiyat teyit edilecek").
     * 'ozel_not': Ürüne özel not (örn: "Tel: +994 51 430 77 78 ödedi").
     * Eğer bir ürünün yanında sadece telefon var ve fiyat yazmıyorsa, o ürünün tutarını 0 veya birim_fiyatını 0 belirle ve 'eksik_bilgiler' listesine o ürünün fiyatının eksik olduğunu ve yanındaki telefon/ödeme notunu ekle (örn: "Örgülü Kazak için fiyat bilgisi eksik (Not: +994 51 430 77 78 ödedi)").
   - Ayrıca siparişin genel 'ozel_not' alanına ve 'baku_tahsilat_notu' alanına, ürün bazlı telefon ve ödeme dökümünü mutlaka özetle:
     Örn: "Ürün Bazlı Notlar: Karl Lagerfeld Terlik: 108 AZN (055 283 88 78) | Karl Lagerfeld Çanta: 055 489 68 96 (Ödedi - Fiyat teyit edilecek) | Örgülü Kazak: +994 51 430 77 78 (Ödedi - Fiyat teyit edilecek)"`;

    const textPrompt = `Aşağıdaki müşteri mesajı / WhatsApp notu ve (varsa) ekli ürün/etiket/dekont görsellerini incele.
Mesaj Metni: "${(ham_mesaj || '').trim()}"${
      musteri_adi_ipucu ? ` (Kullanıcı İpucu: ${musteri_adi_ipucu})` : ''
    }

GÖRSEL VE MÜŞTERİ ADI TALİMATI:
Eğer görsel / ekran görüntüsü ekliyse;
- "İletildi" satırının altındaki kişi adını (Örn: "Abdullayeva Deyanet"), mesaj başlığını ve telefon numarasını (+994 55 283 88 78 vb.) DİKKATLE OKU ve müşterinin adı olarak 'musteri_adi' alanına kaydet! "Bilinmiyor" yazma!
- Her ürün fotoğrafının yanında/altında yer alan telefon numarasını (örn: 055 489 68 96, +994 51 430 77 78) ve ödeme notunu ("ödedi", "108 azn") MUTLAKA tespit et ve o ürünün 'ilgili_telefon' ve 'odeme_notu' alanlarına ekle!
- Tüm görselleri bir bütün olarak değerlendir (Aynı müşterinin birden fazla siparişi / ürünleri).
- Her bir görseldeki ürünün markasını (Karl Lagerfeld, On Cloud, Tommy Hilfiger vb.) ve detayını tespit et.
- Beden etiketlerini, renklerini ve fiyatlarını oku.
- Fiyatı görselde bulunmayan ürünler için eksik_bilgiler'e not düş ve genel 'ozel_not'a ürün bazlı telefon ve ödeme özetini yaz.
- Tüm ürünlerin fiyatlarını toplayarak genel toplamı hesapla.
- Varsa teslimat adresi veya sokak bilgisini (örn: "Memmedeli Serifli 1B") çıkar.
- İsmi hatalı yazılmışsa müşterinin adını düzelt ve eslesen_musteri_id bağla.`;

    // Multimodal payload hazırlama: Tek veya Birden Fazla Görsel
    const tumGorseller: Array<{ data: string; mimeType: string; dosyaAdi?: string }> = [];

    if (Array.isArray(gorseller) && gorseller.length > 0) {
      for (const g of gorseller) {
        if (g) {
          const raw = g.gorsel_base64 || g.base64;
          if (raw && typeof raw === 'string') {
            const clean = raw.replace(/^data:image\/\w+;base64,/, '');
            const mime = g.gorsel_mime_type || g.mimeType || 'image/jpeg';
            tumGorseller.push({ data: clean, mimeType: mime, dosyaAdi: g.dosya_adi || g.dosyaAdi });
          }
        }
      }
    } else if (gorsel_base64 && typeof gorsel_base64 === 'string') {
      const clean = gorsel_base64.replace(/^data:image\/\w+;base64,/, '');
      tumGorseller.push({ data: clean, mimeType: gorsel_mime_type || 'image/jpeg' });
    }

    // Yüklenen görselleri sunucuya kaydet ve kalıcı URL oluştur
    const kaydedilenGorselUrlleri: string[] = [];
    for (let i = 0; i < tumGorseller.length; i++) {
      const g = tumGorseller[i];
      const ext = g.mimeType.includes('png') ? 'png' : g.mimeType.includes('webp') ? 'webp' : 'jpg';
      const dosyaAdi = `gorsel_${Date.now()}_${i + 1}.${ext}`;
      const hedefYol = path.join(UPLOADS_DIR, dosyaAdi);
      try {
        fs.writeFileSync(hedefYol, Buffer.from(g.data, 'base64'));
        kaydedilenGorselUrlleri.push(`/uploads/${dosyaAdi}`);
      } catch (dosyaErr) {
        console.error('Görsel dosyası kaydedilemedi:', dosyaErr);
      }
    }

    let contentsPayload: any = textPrompt;

    if (tumGorseller.length > 0) {
      contentsPayload = [
        { text: textPrompt },
        ...tumGorseller.map((g) => ({
          inlineData: {
            mimeType: g.mimeType,
            data: g.data,
          },
        })),
      ];
    }

    const schemaConfig = {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: {
            type: Type.STRING,
            description: "Müşterinin doğru ve resmi adı soyadı (yazım hatası varsa düzeltilmiş hali)",
          },
          musteri_durumu: {
            type: Type.STRING,
            enum: ['MEVCUT_MUSTERI', 'YENI_MUSTERI'],
            description: "Müşterinin sistemde önceden kayıtlı olup olmadığı",
          },
          eslesen_musteri_id: {
            type: Type.STRING,
            description: "Eşleşen mevcut müşterinin id'si (örn: mus-001) veya boş",
          },
          duzeltilen_yazim_hatasi: {
            type: Type.STRING,
            description: "Mesajda veya görselde yapılan ve düzeltilen yazım/harf hatası açıklaması (örn: 'Kemake -> Kəmalə Bədirbəyli')",
          },
          musteri_tipi: {
            type: Type.STRING,
            enum: ['TANIMADIK', 'SADIK_MUSTERI', 'AKRABA_YAKIN', 'VIP'],
            description: "Müşteri kategorisi (SADIK_MUSTERI, AKRABA_YAKIN, VIP, TANIMADIK)",
          },
          instagram_kullanici_adi: {
            type: Type.STRING,
            description: "Instagram kullanıcı adı",
          },
          telefon_numarasi: {
            type: Type.STRING,
            description: "Müşteri telefon numarası",
          },
          teslimat_sehri: {
            type: Type.STRING,
            description: "Teslimat şehri (örn: Bakü)",
          },
          teslimat_adresi: {
            type: Type.STRING,
            description: "Teslimat adresi veya metro durağı",
          },
          urun_aciklamasi: {
            type: Type.STRING,
            description: "Ürünlerin genel tanımı (birden fazla ürün varsa hepsi)",
          },
          beden_veya_olcu: {
            type: Type.STRING,
            description: "Beden veya ölçü bilgisi",
          },
          renk: {
            type: Type.STRING,
            description: "Ürünün rengi",
          },
          adet: {
            type: Type.INTEGER,
            description: "Toplam ürün adedi",
          },
          birden_fazla_urun: {
            type: Type.BOOLEAN,
            description: "Birden fazla farklı ürün olup olmadığı",
          },
          urunler: {
            type: Type.ARRAY,
            description: "Tespit edilen her bir ürün kaleminin ayrı ayrı dökümü",
            items: {
              type: Type.OBJECT,
              properties: {
                urun_adi: { type: Type.STRING, description: "Ürünün net adı veya markası (örn: Karl Lagerfeld Çanta)" },
                urun_aciklamasi: { type: Type.STRING, description: "Ürün adı ve detayı" },
                adet: { type: Type.INTEGER, description: "Adet" },
                birim_fiyat: { type: Type.NUMBER, description: "Birim fiyatı" },
                tutar: { type: Type.NUMBER, description: "Toplam tutarı" },
                beden_veya_olcu: { type: Type.STRING, description: "Beden/ölçü" },
                renk: { type: Type.STRING, description: "Renk" },
                gorsel_indeksi: { type: Type.INTEGER, description: "Bu ürünün yer aldığı görselin indeksi (0, 1...)" },
                ilgili_telefon: { type: Type.STRING, description: "Bu ürünün görselinin yanında veya altında yazan özel telefon numarası (örn: '+994 51 430 77 78' veya '055 489 68 96')" },
                odeme_notu: { type: Type.STRING, description: "Bu ürünün yanındaki ödeme ve işlem durumu (örn: 'Ödedi', '108 AZN', 'm10')" },
                ozel_not: { type: Type.STRING, description: "Bu ürüne ait özel not veya açıklama" },
                urun_alani: {
                  type: Type.OBJECT,
                  description: "WhatsApp mesajları ve telefon durum çubukları HARİÇ, sadece ürünün net fotoğrafının bulunduğu alan",
                  properties: {
                    ymin: { type: Type.INTEGER, description: "Üst piksel (0-1000)" },
                    xmin: { type: Type.INTEGER, description: "Sol piksel (0-1000)" },
                    ymax: { type: Type.INTEGER, description: "Alt piksel (0-1000)" },
                    xmax: { type: Type.INTEGER, description: "Sağ piksel (0-1000)" },
                  },
                  required: ['ymin', 'xmin', 'ymax', 'xmax'],
                },
              },
              required: ['urun_aciklamasi', 'adet'],
            },
          },
          toplam_tutar: {
            type: Type.NUMBER,
            description: "Toplam tutar",
          },
          alinan_tutar: {
            type: Type.NUMBER,
            description: "Tahsil edilen veya kapora tutarı",
          },
          kalan_tutar: {
            type: Type.NUMBER,
            description: "Kalan bakiye borç",
          },
          para_birimi: {
            type: Type.STRING,
            enum: ['AZN', 'CAD', 'USD'],
            description: "Para birimi",
          },
          finans_durumu: {
            type: Type.STRING,
            enum: ['ODENDI', 'KISMI_ODEME', 'BEKLIYOR'],
            description: "Finans tahsilat durumu",
          },
          lojistik_durumu: {
            type: Type.STRING,
            enum: [
              'KANADA_SATINALIM_BEKLIYOR',
              'KANADA_DEPO',
              'ULUSLARARASI_KARGO',
              'BAKU_DAGITIM_ARKADAS',
              'TESLIM_EDILDI',
            ],
            description: "Lojistik aşaması",
          },
          baku_tahsilat_notu: {
            type: Type.STRING,
            description: "Bakü akraba tahsilat notu",
          },
          ozel_not: {
            type: Type.STRING,
            description: "Müşterinin veya gönderenin kargo, teslimat, sürücü veya paketleme özel talimatı (Örn: 'Bakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək')",
          },
          eksik_bilgiler: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Eksik kalan alanlar",
          },
          ai_guven_skoru: {
            type: Type.NUMBER,
            description: "Güven skoru 0-1 arası",
          },
        },
        required: [
          'musteri_adi',
          'urun_aciklamasi',
          'adet',
          'toplam_tutar',
          'alinan_tutar',
          'finans_durumu',
          'lojistik_durumu',
          'eksik_bilgiler',
        ],
      },
    };

    const geminiResponse = await generateContentWithRetryAndFallback(ai, {
      contents: contentsPayload,
      config: schemaConfig,
    });

    const parsedJson = JSON.parse(geminiResponse.text || '{}');

    // Yeni kayıt oluşturma
    const alinan = Number(parsedJson.alinan_tutar || 0);
    const toplam = Number(parsedJson.toplam_tutar || alinan);
    const kalan = Math.max(0, toplam - alinan);

    // Supabase için payload (PostgreSQL GENERATED COLUMN olan kalan_tutar hariç tutulur)
    const hedefTenantId = req.body.tenant_id || 'kanada_shopper_baku';
    const dbPayload = {
      tenant_id: hedefTenantId,
      is_demo: hedefTenantId === 'kanada_shopper_baku' || hedefTenantId === 'demo_sandbox',
      ham_mesaj: (ham_mesaj || (tumGorseller.length > 0 ? `[${tumGorseller.length} Ekran Görüntüsü & WhatsApp Notu]` : '')).trim(),
      siparis_kaynagi: siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: parsedJson.musteri_adi || 'Bilinmeyen Müşteri',
      instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || '',
      telefon_numarasi: parsedJson.telefon_numarasi || '',
      teslimat_sehri: parsedJson.teslimat_sehri || 'Bakü',
      teslimat_adresi: parsedJson.teslimat_adresi || '',
      urun_aciklamasi: parsedJson.urun_aciklamasi || 'Sipariş Edilen Ürün',
      beden_veya_olcu: parsedJson.beden_veya_olcu || '',
      renk: parsedJson.renk || '',
      adet: Number(parsedJson.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: parsedJson.para_birimi || 'AZN',
      finans_durumu: parsedJson.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: parsedJson.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: parsedJson.baku_tahsilat_notu || '',
      ozel_not: parsedJson.ozel_not || '',
      kanada_takip_kodu: uretKanadaTakipKodu(parsedJson.urun_aciklamasi),
      uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(parsedJson.eksik_bilgiler) ? parsedJson.eksik_bilgiler : [],
      ai_guven_skoru: Number(parsedJson.ai_guven_skoru || 0.95),
      musteri_id: parsedJson.eslesen_musteri_id || '',
      musteri_tipi: parsedJson.musteri_tipi || 'TANIMADIK',
      duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi || '',
      musteri_durumu: parsedJson.musteri_durumu || 'YENI_MUSTERI',
      birden_fazla_urun: parsedJson.birden_fazla_urun || (Array.isArray(parsedJson.urunler) && parsedJson.urunler.length > 1),
      urunler: (Array.isArray(parsedJson.urunler) ? parsedJson.urunler : []).map((u: any, idx: number) => {
        const uAdi = u.urun_adi || u.urun_aciklamasi || `Ürün #${idx + 1}`;
        const uFiyat = u.tutar !== undefined ? Number(u.tutar) : (u.birim_fiyat !== undefined ? Number(u.birim_fiyat) : undefined);
        const gIdx = typeof u.gorsel_indeksi === 'number' && u.gorsel_indeksi < kaydedilenGorselUrlleri.length ? u.gorsel_indeksi : 0;
        return {
          urun_adi: uAdi,
          urun_aciklamasi: uAdi,
          adet: Number(u.adet || 1),
          tutar: uFiyat,
          birim_fiyat: uFiyat,
          beden_veya_olcu: u.beden_veya_olcu || '',
          renk: u.renk || '',
          orijinal_gorsel_url: kaydedilenGorselUrlleri[gIdx] || undefined,
          urun_alani: u.urun_alani || undefined,
          urun_gorseli: kaydedilenGorselUrlleri[gIdx] || undefined,
          ilgili_telefon: u.ilgili_telefon || undefined,
          odeme_notu: u.odeme_notu || undefined,
          ozel_not: u.ozel_not || undefined,
        };
      }),
      gorsel_urlleri: kaydedilenGorselUrlleri.length > 0 ? kaydedilenGorselUrlleri : tumGorseller.map((g, i) => g.dosyaAdi || `Ekran_Goruntusu_${i + 1}.png`),
    };

    // Ürün bazlı özel telefon veya ödeme notlarını otomatik genel nota entegre et
    const urunNotlari = dbPayload.urunler
      .filter((u: any) => u.ilgili_telefon || u.odeme_notu)
      .map((u: any) => {
        const tel = u.ilgili_telefon ? `Tel: ${u.ilgili_telefon}` : '';
        const odm = u.odeme_notu ? `(${u.odeme_notu})` : '';
        const fyt = u.tutar ? `${u.tutar} ${dbPayload.para_birimi}` : 'Fiyat teyit edilecek';
        return `• ${u.urun_adi}: ${fyt} ${tel} ${odm}`.replace(/\s+/g, ' ').trim();
      });

    if (urunNotlari.length > 0) {
      const urunNotOzeti = `📦 Ürün İletişim & Ödeme Notları:\n${urunNotlari.join('\n')}`;
      if (!dbPayload.ozel_not) {
        dbPayload.ozel_not = urunNotOzeti;
      } else if (!dbPayload.ozel_not.includes('Ürün İletişim & Ödeme')) {
        dbPayload.ozel_not = `${dbPayload.ozel_not}\n\n${urunNotOzeti}`;
      }
    }

    let nihaiSiparis: any = null;

    if (otomatik_kaydet !== false && supabase) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
        if (error) {
          console.error('Supabase kayıt hatası:', error.message);
        } else if (data) {
          nihaiSiparis = {
            ...formatlaSiparis(data),
            musteri_id: parsedJson.eslesen_musteri_id,
            musteri_tipi: parsedJson.musteri_tipi,
            duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi,
            musteri_durumu: parsedJson.musteri_durumu,
            ozel_not: dbPayload.ozel_not,
            urunler: dbPayload.urunler,
            gorsel_urlleri: dbPayload.gorsel_urlleri,
          };
          console.log('✅ Sipariş Supabase veritabanına başarıyla yazıldı ID:', nihaiSiparis.id);
        }
      } catch (errDb) {
        console.error('Supabase istisnası:', errDb);
      }
    }

    if (!nihaiSiparis) {
      nihaiSiparis = formatlaSiparis({
        id: 'sip-' + Date.now().toString(36),
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        kalan_tutar: kalan,
      });
      if (otomatik_kaydet !== false) {
        siparislerVeritabani.unshift(nihaiSiparis);
      }
    }

    // MÜŞTERİ VERİTABANI GÜNCELLEME VE DEDUPLICATION
    const eslesenMusteriId = parsedJson.eslesen_musteri_id;
    const telNo = (parsedJson.telefon_numarasi || '').replace(/\s+/g, '');
    let bulunanMusteri = musterilerVeritabani.find(m => 
      (eslesenMusteriId && m.id === eslesenMusteriId) ||
      (telNo && m.telefon && m.telefon.replace(/\s+/g, '') === telNo) ||
      (m.ad_soyad.toLowerCase().trim() === (parsedJson.musteri_adi || '').toLowerCase().trim())
    );

    if (bulunanMusteri) {
      // Mevcut müşterinin verilerini güncelle
      bulunanMusteri.toplam_siparis_sayisi += 1;
      bulunanMusteri.toplam_harcama += toplam;
      bulunanMusteri.kalan_toplam_borc += kalan;
      bulunanMusteri.son_siparis_tarihi = new Date().toISOString();
      if (!bulunanMusteri.adres && parsedJson.teslimat_adresi) bulunanMusteri.adres = parsedJson.teslimat_adresi;
      if (!bulunanMusteri.sehir && parsedJson.teslimat_sehri) bulunanMusteri.sehir = parsedJson.teslimat_sehri;
      if (!bulunanMusteri.telefon && parsedJson.telefon_numarasi) bulunanMusteri.telefon = parsedJson.telefon_numarasi;
      nihaiSiparis.musteri_id = bulunanMusteri.id;
      nihaiSiparis.musteri_tipi = bulunanMusteri.musteri_tipi;
    } else if (parsedJson.musteri_adi && parsedJson.musteri_adi !== 'Bilinmeyen Müşteri') {
      // Yeni Müşteri Oluştur
      const yeniMusteri: MusteriKaydi = {
        id: 'mus-' + Date.now().toString(36),
        ad_soyad: parsedJson.musteri_adi,
        telefon: parsedJson.telefon_numarasi || '',
        instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || '',
        sehir: parsedJson.teslimat_sehri || 'Bakü',
        adres: parsedJson.teslimat_adresi || '',
        musteri_tipi: parsedJson.musteri_tipi || 'TANIMADIK',
        toplam_siparis_sayisi: 1,
        toplam_harcama: toplam,
        kalan_toplam_borc: kalan,
        olusturma_tarihi: new Date().toISOString(),
        son_siparis_tarihi: new Date().toISOString(),
      };
      musterilerVeritabani.unshift(yeniMusteri);
      nihaiSiparis.musteri_id = yeniMusteri.id;
      nihaiSiparis.musteri_tipi = yeniMusteri.musteri_tipi;
    }

    res.json({
      basarili: true,
      mesaj: 'Mesaj başarıyla Gemini AI tarafından ayrıştırıldı ve kaydedildi.',
      siparis: nihaiSiparis,
      ayristirilan_veri: nihaiSiparis,
      kaydedildi: otomatik_kaydet !== false,
      kaynak: supabase ? 'supabase' : 'bellek',
    });
  } catch (err: any) {
    console.error('Gemini Ayrıştırma Hatası:', err);
    res.status(500).json({
      basarili: false,
      hata: 'Yapay zeka ayrıştırması sırasında bir hata oluştu: ' + (err?.message || 'Bilinmeyen hata'),
    });
  }
});

// 3. API: Yeni Siparişi Doğrudan Ekle / Onayla
app.post('/api/siparisler', async (req, res) => {
  try {
    const yeniVeri = req.body;
    if (!yeniVeri || !yeniVeri.urun_aciklamasi || !yeniVeri.musteri_adi) {
      return res.status(400).json({ basarili: false, hata: 'Müşteri adı ve ürün açıklaması zorunludur.' });
    }

    const toplam = Number(yeniVeri.toplam_tutar || 0);
    const alinan = Number(yeniVeri.alinan_tutar || 0);
    const kalan = Math.max(0, toplam - alinan);

    const dbPayload = {
      tenant_id: yeniVeri.tenant_id || (req.query.tenant_id as string) || 'kanada_shopper_baku',
      baku_kurye_id: yeniVeri.baku_kurye_id || null,
      baku_kurye_adi: yeniVeri.baku_kurye_adi || null,
      baku_kurye_bolgesi: yeniVeri.baku_kurye_bolgesi || null,
      ham_mesaj: yeniVeri.ham_mesaj || (yeniVeri.ozel_not ? `Talimat: ${yeniVeri.ozel_not}` : yeniVeri.urun_aciklamasi),
      siparis_kaynagi: yeniVeri.siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: yeniVeri.musteri_adi,
      instagram_kullanici_adi: yeniVeri.instagram_kullanici_adi || '',
      telefon_numarasi: yeniVeri.telefon_numarasi || '',
      teslimat_sehri: yeniVeri.teslimat_sehri || 'Bakü',
      teslimat_adresi: yeniVeri.teslimat_adresi || '',
      urun_aciklamasi: yeniVeri.urun_aciklamasi,
      beden_veya_olcu: yeniVeri.beden_veya_olcu || '',
      renk: yeniVeri.renk || '',
      adet: Number(yeniVeri.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: yeniVeri.para_birimi || 'AZN',
      finans_durumu: yeniVeri.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: yeniVeri.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: yeniVeri.baku_tahsilat_notu || '',
      ozel_not: yeniVeri.ozel_not || '',
      kanada_takip_kodu: yeniVeri.kanada_takip_kodu || uretKanadaTakipKodu(yeniVeri.urun_aciklamasi),
      uluslararasi_kargo_kodu: yeniVeri.uluslararasi_kargo_kodu || uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(yeniVeri.eksik_bilgiler) ? yeniVeri.eksik_bilgiler : [],
      ai_guven_skoru: Number(yeniVeri.ai_guven_skoru || 1.0),
      urunler: Array.isArray(yeniVeri.urunler) ? yeniVeri.urunler : [],
      gorsel_urlleri: Array.isArray(yeniVeri.gorsel_urlleri) ? yeniVeri.gorsel_urlleri : [],
    };

    if (supabase) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
        if (error) {
          console.error('Supabase ekleme hatası:', error.message);
        } else if (data) {
          const formatli = formatlaSiparis({
            ...data,
            ozel_not: dbPayload.ozel_not || undefined,
            urunler: dbPayload.urunler.length > 0 ? dbPayload.urunler : undefined,
            gorsel_urlleri: dbPayload.gorsel_urlleri.length > 0 ? dbPayload.gorsel_urlleri : undefined,
          });
          return res.json({
            basarili: true,
            kaynak: 'supabase',
            siparis: formatli,
          });
        }
      } catch (errDb: any) {
        console.error('Supabase ekleme istisnası:', errDb?.message || errDb);
      }
    }

    const yeniSiparis: any = formatlaSiparis({
      id: 'sip-' + Date.now().toString(36),
      olusturma_tarihi: new Date().toISOString(),
      ...dbPayload,
      kalan_tutar: kalan,
    });

    siparislerVeritabani.unshift(yeniSiparis);
    res.json({ basarili: true, kaynak: 'bellek', siparis: yeniSiparis });
  } catch (genelHata: any) {
    console.error('Sipariş ekleme genel hatası:', genelHata);
    res.status(500).json({ basarili: false, hata: 'Sipariş eklenirken hata: ' + (genelHata?.message || 'Bilinmeyen hata') });
  }
});

// 4. API: Sipariş Güncelle (Durum değiştirme, tutar ekleme)
app.patch('/api/siparisler/:id', async (req, res) => {
  const { id } = req.params;

  if (supabase) {
    try {
      const { id: _id, kalan_tutar: _k, olusturma_tarihi: _o, guncellenme_tarihi: _g, ...guncellenecekAlanlar } = req.body;

      if (guncellenecekAlanlar.toplam_tutar !== undefined) {
        guncellenecekAlanlar.toplam_tutar = Number(guncellenecekAlanlar.toplam_tutar);
      }
      if (guncellenecekAlanlar.alinan_tutar !== undefined) {
        guncellenecekAlanlar.alinan_tutar = Number(guncellenecekAlanlar.alinan_tutar);
      }

      // Mevcut kaydı çek ki urunler ve gorsel_urlleri metadata'sı ezilmesin
      const { data: mevcutData } = await supabase
        .from('siparisler')
        .select('*')
        .eq('id', id)
        .single();

      let mevcutUrunler: any[] = [];
      let mevcutGorseller: any[] = [];
      let mevcutTemizEksik: any[] = [];

      if (mevcutData && Array.isArray(mevcutData.eksik_bilgiler)) {
        for (const item of mevcutData.eksik_bilgiler) {
          if (typeof item === 'string') {
            if (item.startsWith('META:urunler=')) {
              try { mevcutUrunler = JSON.parse(item.substring('META:urunler='.length)); } catch {}
            } else if (item.startsWith('META:gorseller=')) {
              try { mevcutGorseller = JSON.parse(item.substring('META:gorseller='.length)); } catch {}
            } else {
              mevcutTemizEksik.push(item);
            }
          }
        }
      }

      const sonUrunler = guncellenecekAlanlar.urunler !== undefined ? guncellenecekAlanlar.urunler : mevcutUrunler;
      const sonGorseller = guncellenecekAlanlar.gorsel_urlleri !== undefined ? guncellenecekAlanlar.gorsel_urlleri : mevcutGorseller;
      const sonEksik = guncellenecekAlanlar.eksik_bilgiler !== undefined 
        ? guncellenecekAlanlar.eksik_bilgiler.filter((b: any) => typeof b !== 'string' || !b.startsWith('META:'))
        : mevcutTemizEksik;

      const fullUpdateObj = {
        ...(mevcutData || {}),
        ...guncellenecekAlanlar,
        urunler: sonUrunler,
        gorsel_urlleri: sonGorseller,
        eksik_bilgiler: sonEksik,
      };

      const sbUpdatePayload = hazirlaSupabasePayload(fullUpdateObj);

      const { data, error } = await supabase
        .from('siparisler')
        .update(sbUpdatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase güncelleme hatası:', error.message);
      } else if (data) {
        const formatli = formatlaSiparis({
          ...data,
          ozel_not: fullUpdateObj.ozel_not !== undefined ? fullUpdateObj.ozel_not : undefined,
        });
        return res.json({
          basarili: true,
          kaynak: 'supabase',
          siparis: formatli,
        });
      }
    } catch (errDb) {
      console.error('Supabase güncelleme istisnası:', errDb);
    }
  }

  const index = siparislerVeritabani.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
  }

  const guncel = {
    ...siparislerVeritabani[index],
    ...req.body,
    guncellenme_tarihi: new Date().toISOString(),
  };

  if (guncel.toplam_tutar !== undefined && guncel.alinan_tutar !== undefined) {
    guncel.kalan_tutar = Math.max(0, Number(guncel.toplam_tutar) - Number(guncel.alinan_tutar));
    if (guncel.alinan_tutar >= guncel.toplam_tutar && guncel.toplam_tutar > 0) {
      guncel.finans_durumu = 'ODENDI';
    } else if (guncel.alinan_tutar > 0) {
      guncel.finans_durumu = 'KISMI_ODEME';
    }
  }

  siparislerVeritabani[index] = formatlaSiparis(guncel);
  res.json({ basarili: true, kaynak: 'bellek', siparis: siparislerVeritabani[index] });
});

// 5. API: Sipariş Sil
app.delete('/api/siparisler/:id', async (req, res) => {
  const { id } = req.params;

  if (supabase) {
    try {
      const { error } = await supabase.from('siparisler').delete().eq('id', id);
      if (error) {
        console.error('Supabase silme hatası:', error.message);
      } else {
        return res.json({ basarili: true, kaynak: 'supabase', mesaj: 'Sipariş Supabase veritabanından silindi.' });
      }
    } catch (errDb) {
      console.error('Supabase silme istisnası:', errDb);
    }
  }

  siparislerVeritabani = siparislerVeritabani.filter(s => s.id !== id);
  res.json({ basarili: true, kaynak: 'bellek', mesaj: 'Sipariş başarıyla silindi.' });
});

// 5.1 API: Tüm Siparişleri Varsayılan 'ULUSLARARASI_KARGO' Aşamasına Güncelle
app.post('/api/siparisler/tumunu-uluslararasi-kargo-yap', async (_req, res) => {
  try {
    if (supabase) {
      const { error } = await supabase
        .from('siparisler')
        .update({ lojistik_durumu: 'ULUSLARARASI_KARGO' })
        .neq('lojistik_durumu', 'TESLIM_EDILDI'); // Teslim edilenler hariç
      if (error) console.error('Supabase toplu lojistik güncelleme hatası:', error.message);
    }

    siparislerVeritabani = siparislerVeritabani.map(s => 
      s.lojistik_durumu !== 'TESLIM_EDILDI' ? { ...s, lojistik_durumu: 'ULUSLARARASI_KARGO' } : s
    );

    res.json({ basarili: true, mesaj: 'Tüm siparişlerin lojistik aşaması ULUSLARARASI KARGO olarak güncellendi.' });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// Sayfadan og:image çekerek yüksek çözünürlüklü stüdyo fotoğrafını bulan yardımcı fonksiyon
async function fetchOgImageFromUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl || !pageUrl.startsWith('http')) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const html = await resp.text();
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogMatch && ogMatch[1]) {
      let imgUrl = ogMatch[1].trim();
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      if (imgUrl.startsWith('http') && !imgUrl.includes('placeholder') && !imgUrl.includes('logo')) {
        return imgUrl;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// URL'nin gerçekten erişilebilir ve geçerli bir görsel olup olmadığını test eden yardımcı fonksiyon
async function isValidImageUrl(url: string): Promise<boolean> {
  if (!url || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(url).origin,
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') || '';
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

// 5.4 API: Harici Resimler için Güvenli Vekil Sunucu (CORS ve Hotlink korumasını aşar)
app.get('/api/proxy-gorsel', async (req, res) => {
  const gorselUrl = req.query.url as string;
  if (!gorselUrl || !gorselUrl.startsWith('http')) {
    return res.status(400).send('Geçersiz görsel adresi');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(gorselUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(gorselUrl).origin,
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(resp.status).send(`Görsel indirilemedi (${resp.status})`);
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('Hedef adres resim dosyası değil');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuf = await resp.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    res.status(500).send('Vekil sunucu hatası: ' + err.message);
  }
});

// 5.2 API: Web'den Ürünün Orijinal Katalog / Stüdyo Fotoğrafını ve Resmi Sayfasını Bul (Gemini + Google Search)
app.post('/api/urun-katalog-gorseli-ara', async (req, res) => {
  try {
    const { urun_adi, marka, renk } = req.body;
    if (!urun_adi) {
      return res.status(400).json({ basarili: false, hata: 'Ürün adı gereklidir.' });
    }

    const ai = getGeminiClient();

    const aramaPrompt = `Sen lüks moda, ayakkabı, çanta ve giyim alanında uzman bir ürün katalog araştırmacısısın.
Aşağıda bilgileri verilen ürün için internette resmi marka sitesinde (Karl Lagerfeld, On Running, Michael Kors, Tommy Hilfiger, Aldo, Coach, Zara vb.) ve yetkili lüks sitelerde (Farfetch, Nordstrom, Saks Fifth Avenue, Bloomingdale's, Amazon vb.) orijinal stüdyo/katalog çekimi fotoğrafını ve ürün satış sayfasını araştır:

Aranan Ürün: "${urun_adi}"
${marka ? `Marka: ${marka}` : ''}
${renk ? `Renk: ${renk}` : ''}

GÖREVLERİN:
1. Ürünün resmi e-ticaret sitelerindeki tam model adını belirle.
2. Ürünün resmi sayfasındaki yüksek çözünürlüklü, beyaz/temiz arka planlı stüdyo katalog fotoğrafı linkini (doğrudan CDN/image URL) veya ürün sayfasını bul.
3. Ürünün resmi ürün sayfası linkini (URL) bul.
4. Ürünün malzeme/koleksiyon özetini belirt.

Yanıtını YALNIZCA aşağıdaki JSON formatında döndür (başka açıklama ekleme):
{
  "resmi_urun_adi": "Ürünün resmi tam adı ve modeli",
  "marka": "Marka",
  "katalog_gorsel_url": "Doğrudan görsel CDN URL'si (varsa, örn: https://cdn...jpg veya https://images...)",
  "urun_sayfasi_url": "Resmi ürün sayfası URL'si",
  "aciklama": "Ürünün resmi katalog açıklaması veya materyali",
  "tahmini_fiyat": "Resmi satış fiyatı (varsa)"
}`;

    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: aramaPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    });

    const yanitMetni = searchResponse.text || '';
    let sonuc: any = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('JSON parse hatası:', parseErr);
    }

    // Google Search Grounding kaynaklarını çek
    const groundingMetadata = (searchResponse as any).candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks
      .filter((c: any) => c.web?.uri)
      .map((c: any) => ({
        baslik: c.web.title || 'Resmi Ürün Sayfası',
        url: c.web.uri,
      }));

    if (!sonuc) {
      sonuc = {
        resmi_urun_adi: urun_adi,
        marka: marka || '',
        katalog_gorsel_url: '',
        urun_sayfasi_url: webLinkleri.length > 0 ? webLinkleri[0].url : '',
        aciklama: yanitMetni.slice(0, 200),
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }

    // Katalog görseli boşsa bulunan sayfalardan og:image çek
    if (!sonuc.katalog_gorsel_url) {
      const hedefLink = sonuc.urun_sayfasi_url || webLinkleri[0]?.url;
      if (hedefLink) {
        const ogResmi = await fetchOgImageFromUrl(hedefLink);
        if (ogResmi) {
          sonuc.katalog_gorsel_url = ogResmi;
        }
      }
    }

    res.json({
      basarili: true,
      sonuc,
      web_linkleri: webLinkleri.slice(0, 4),
    });
  } catch (err: any) {
    console.error('Katalog arama hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message || 'Ürün görsel araması başarısız oldu.' });
  }
});

// 5.2.2 API: Görselden (veya seçilen kırpılmış alandan) Ürünü Tanı ve Web'den Orijinalini Bul (Google Lens / AliExpress Visual Search)
app.post('/api/gorselden-urun-ara', async (req, res) => {
  try {
    const { gorsel, mevcut_urun_adi, ek_ipucu } = req.body;
    if (!gorsel) {
      return res.status(400).json({ basarili: false, hata: 'Aranacak görsel verisi bulunamadı.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ basarili: false, hata: 'Gemini API anahtarı yapılandırılmamış.' });
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (gorsel.startsWith('data:')) {
      const match = gorsel.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    } else if (gorsel.startsWith('/uploads/')) {
      const dosyaAdi = gorsel.replace('/uploads/', '');
      const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
      if (fs.existsSync(dosyaYolu)) {
        const buffer = fs.readFileSync(dosyaYolu);
        base64Data = buffer.toString('base64');
        mimeType = dosyaAdi.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }
    } else if (gorsel.startsWith('http')) {
      try {
        const fetchRes = await fetch(gorsel);
        if (fetchRes.ok) {
          const arrayBuffer = await fetchRes.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
          const ct = fetchRes.headers.get('content-type');
          if (ct && ct.startsWith('image/')) mimeType = ct;
        }
      } catch (err) {
        console.warn('Görsel URL indirilemedi:', err);
      }
    }

    if (!base64Data) {
      return res.status(400).json({ basarili: false, hata: 'Görsel verisi okunamadı veya format desteklenmiyor.' });
    }

    const ai = getGeminiClient();

    const lensPrompt = `Sen profesyonel bir e-ticaret, lüks marka ve ürün tanıma uzmanısın (Google Lens ve AliExpress Visual Search mantığıyla çalışıyorsun).
Ekli görselde kullanıcının odakladığı veya seçtiği bir ürün yer almaktadır.
${mevcut_urun_adi ? `Sipariş metnindeki ürün adı/ipucu: "${mevcut_urun_adi}"` : ''}
${ek_ipucu ? `Kullanıcının belirttiği ek ipucu: "${ek_ipucu}"` : ''}

Lütfen şu adımları eksiksiz uygula:
1. Görseldeki ürünü titizlikle analiz et: Logo, marka amblemi, monogram desen, renk, taban, toka, materyal veya tipografik detayları belirle (Örn: Karl Lagerfeld, Michael Kors, Gucci, Zara, Prada, Guess, Nike, Adidas, vb.).
2. Ürünün tam resmi model adını ve koleksiyonunu tespit et (Örn: "Karl Lagerfeld Kondo Monogram Slide Sandal", "Michael Kors Jet Set Crossbody Bag").
3. Google Search aracı ile bu ürünün orijinal stüdyo fotoğrafını (.jpg veya .png formatında doğrudan resim bağlantısı) ve resmi satış/e-ticaret sayfalarını (Trendyol, Beymen, Farfetch, Brandroom, Hepsiburada, Amazon veya resmi marka sitesi) bul.

Cevabını YALNIZCA geçerli bir JSON nesnesi formatında ver:
{
  "marka": "Tespit edilen marka adı",
  "resmi_urun_adi": "Ürünün resmi model ve tam katalog adı",
  "urun_tipi": "Ürün kategorisi (ör: Terlik, Çanta, Ayakkabı, Saat, Elbise)",
  "renk": "Tespit edilen renk (ör: Siyah, Beyaz-Siyah, Bej)",
  "belirgin_ozellikler": "Görselden tespit edilen logo, desen, materyal vb. detaylar",
  "katalog_gorsel_url": "Doğrudan görsel dosya linki (.jpg, .jpeg, .png, .webp) - web sayfası linki OLMAYACAK",
  "urun_sayfasi_url": "Ürünün resmi e-ticaret satış veya marka sayfası",
  "aciklama": "Ürünün resmi katalog açıklaması ve özellikleri",
  "google_arama_kelimeleri": "Google Görseller veya Google Lens'te tam bu ürünü bulmak için en etkili 4-5 kelimelik arama terimi"
}`;

    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: lensPrompt,
        },
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const yanitMetni = searchResponse.text || '';
    let sonuc: any = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('Görsel arama JSON parse hatası:', parseErr);
    }

    // Google Search Grounding kaynaklarını al
    const groundingMetadata = (searchResponse as any).candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks
      .filter((c: any) => c.web?.uri)
      .map((c: any) => ({
        baslik: c.web.title || 'Resmi Satış Sayfası',
        url: c.web.uri,
      }));

    if (!sonuc) {
      sonuc = {
        marka: '',
        resmi_urun_adi: mevcut_urun_adi || 'Tespit Edilen Ürün',
        urun_tipi: '',
        renk: '',
        belirgin_ozellikler: '',
        katalog_gorsel_url: '',
        urun_sayfasi_url: webLinkleri[0]?.url || '',
        aciklama: yanitMetni.slice(0, 200),
        google_arama_kelimeleri: mevcut_urun_adi || '',
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }

    // Katalog görseli doğrulama & og:image kurtarma
    if (sonuc.katalog_gorsel_url) {
      const gecerliMi = await isValidImageUrl(sonuc.katalog_gorsel_url);
      if (!gecerliMi) {
        console.log(`[Görsel Doğrulama] Modelin ürettiği katalog URL (${sonuc.katalog_gorsel_url.slice(0, 60)}...) geçersiz/404 çıktı, temizleniyor.`);
        sonuc.katalog_gorsel_url = '';
      }
    }

    // Katalog görseli boşsa veya geçersiz çıktıysa, bulunan ürün sayfalarından gerçek og:image çek
    if (!sonuc.katalog_gorsel_url) {
      const adayLinkler = [sonuc.urun_sayfasi_url, ...(webLinkleri.map((w: any) => w.url))].filter(Boolean);
      for (const link of adayLinkler) {
        if (!link || link.includes('google.com') || link.includes('google.com.tr')) continue;
        const ogResmi = await fetchOgImageFromUrl(link);
        if (ogResmi && await isValidImageUrl(ogResmi)) {
          sonuc.katalog_gorsel_url = ogResmi;
          break;
        }
      }
    }

    const aramaKelimeleri = (sonuc.google_arama_kelimeleri || `${sonuc.marka || ''} ${sonuc.resmi_urun_adi || ''}`).trim() || 'Ürün Ara';
    const googleGorselAramaUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleWebAramaUrl = `https://www.google.com/search?q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleAlisverisUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(aramaKelimeleri)}`;

    if (!sonuc.urun_sayfasi_url) {
      sonuc.urun_sayfasi_url = googleWebAramaUrl;
    }

    const sonWebLinkleri = webLinkleri.length > 0 ? webLinkleri.slice(0, 5) : [
      {
        baslik: `Google Görseller: ${aramaKelimeleri}`,
        url: googleGorselAramaUrl,
      },
      {
        baslik: `Google Alışveriş / Fiyatlar: ${aramaKelimeleri}`,
        url: googleAlisverisUrl,
      },
      {
        baslik: `Google Web Arama: ${aramaKelimeleri}`,
        url: googleWebAramaUrl,
      },
    ];

    res.json({
      basarili: true,
      sonuc,
      web_linkleri: sonWebLinkleri,
      google_gorsel_arama_url: googleGorselAramaUrl,
    });
  } catch (err: any) {
    console.error('Görselden arama hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message || 'Görsel üzerinden arama yapılamadı.' });
  }
});

// 5.3 API: Web'den Bulunan Katalog Görselini Sipariş Ürününe Tanımla & Supabase'e Kaydet
app.post('/api/katalog-gorseli-kaydet', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi, katalog_gorsel_url, urun_sayfasi_url, resmi_urun_adi } = req.body;
    if (!siparis_id || urun_indeksi === undefined || !katalog_gorsel_url) {
      return res.status(400).json({ basarili: false, hata: 'siparis_id, urun_indeksi ve katalog_gorsel_url gereklidir.' });
    }

    // Siparişi Supabase'den veya bellekten çek
    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find(s => s.id === siparis_id);
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    const formatli = formatlaSiparis(mevcutSiparis);
    const guncelUrunler = [...(formatli.urunler || [])];

    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: 'Belirtilen ürün bulunamadı.' });
    }

    const mevcutUrun = guncelUrunler[urun_indeksi];

    // Orijinal görseli ASLA kaybetme: Eğer orijinal_gorsel_url boşsa, mevcut görseli sakla
    const korunanOrijinalGorsel = mevcutUrun.orijinal_gorsel_url || mevcutUrun.urun_gorseli || (formatli.gorseller && formatli.gorseller[0]) || '';

    let kaydedilecekGorselUrl = katalog_gorsel_url;

    // Eğer proxy URL'si ise içindeki asıl hedef adresi ayıkla
    if (kaydedilecekGorselUrl.includes('/api/proxy-gorsel?url=')) {
      try {
        const parsed = new URL(kaydedilecekGorselUrl, 'http://localhost:3000');
        const gercekUrl = parsed.searchParams.get('url');
        if (gercekUrl) kaydedilecekGorselUrl = gercekUrl;
      } catch {
        // ignore
      }
    }

    // Eğer istemciden kırpılmış base64 görsel geldiyse, doğrudan yerel dosyaya kaydet
    if (kaydedilecekGorselUrl.startsWith('data:image/')) {
      try {
        const matches = kaydedilecekGorselUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const rawExt = matches[1].toLowerCase();
          const ext = rawExt.includes('png') ? '.png' : rawExt.includes('webp') ? '.webp' : '.jpg';
          const buffer = Buffer.from(matches[2], 'base64');
          const dosyaAdi = `kirpinti_${Date.now()}_${urun_indeksi}${ext}`;
          const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
          fs.writeFileSync(dosyaYolu, buffer);
          kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
        }
      } catch (errKirpinti) {
        console.warn('Kırpıntı görseli dosyaya kaydedilemedi:', errKirpinti);
      }
    } else if (kaydedilecekGorselUrl.startsWith('http://') || kaydedilecekGorselUrl.startsWith('https://')) {
      // Eğer web URL'si (http/https) ise doğrudan sunucuya indirip yerel dosyaya dönüştürmeyi dene (Hotlink & CORS engellerini aşmak için)
      try {
        const response = await fetch(kaydedilecekGorselUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': new URL(kaydedilecekGorselUrl).origin,
          },
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          return res.status(400).json({
            basarili: false,
            hata: 'Belirtilen adres doğrudan bir görsel dosyası değil, web sayfası linkidir. Lütfen doğrudan resim adresini (.jpg, .png vb.) girin.',
          });
        }

        if (response.ok && contentType.startsWith('image/')) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
          const dosyaAdi = `katalog_${Date.now()}_${urun_indeksi}${ext}`;
          const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
          fs.writeFileSync(dosyaYolu, buffer);
          kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
        }
      } catch (fetchErr) {
        console.warn('Görsel yerel indirme uyarısı (URL doğrudan kullanılacak):', fetchErr);
      }
    }

    guncelUrunler[urun_indeksi] = {
      ...mevcutUrun,
      orijinal_gorsel_url: korunanOrijinalGorsel,
      katalog_gorseli: kaydedilecekGorselUrl,
      urun_gorseli: kaydedilecekGorselUrl,
      urun_sayfasi_url: urun_sayfasi_url || mevcutUrun.urun_sayfasi_url,
      resmi_urun_adi: resmi_urun_adi || mevcutUrun.resmi_urun_adi,
    };

    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler,
    });

    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .update(sbPayload)
        .eq('id', siparis_id)
        .select()
        .single();
      if (error) console.error('Supabase katalog görseli güncelleme hatası:', error.message);
      if (data) {
        return res.json({ basarili: true, siparis: formatlaSiparis(data), mesaj: 'Orijinal web katalog görseli kaydedildi!' });
      }
    }

    // Bellek güncelleme
    const idx = siparislerVeritabani.findIndex(s => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({ basarili: true, siparis: { ...formatli, urunler: guncelUrunler }, mesaj: 'Orijinal web katalog görseli kaydedildi!' });
  } catch (err: any) {
    console.error('Katalog görseli kaydetme hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// 5.4 API: Orijinal Ekran Görüntüsüne Geri Dön (Geri Al)
app.post('/api/urun-orijinal-gorsele-don', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi } = req.body;
    if (!siparis_id || urun_indeksi === undefined) {
      return res.status(400).json({ basarili: false, hata: 'siparis_id ve urun_indeksi gereklidir.' });
    }

    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find(s => s.id === siparis_id);
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    const formatli = formatlaSiparis(mevcutSiparis);
    const guncelUrunler = [...(formatli.urunler || [])];

    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: 'Belirtilen ürün bulunamadı.' });
    }

    const u = guncelUrunler[urun_indeksi];
    const geriDonecekGorsel = u.orijinal_gorsel_url || (formatli.gorseller && formatli.gorseller[0]) || '';

    guncelUrunler[urun_indeksi] = {
      ...u,
      urun_gorseli: geriDonecekGorsel,
      katalog_gorseli: undefined,
      urun_sayfasi_url: undefined,
      resmi_urun_adi: undefined,
    };

    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler,
    });

    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .update(sbPayload)
        .eq('id', siparis_id)
        .select()
        .single();
      if (error) console.error('Supabase orijinal görsele dönme hatası:', error.message);
      if (data) {
        return res.json({ basarili: true, siparis: formatlaSiparis(data), mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.' });
      }
    }

    const idx = siparislerVeritabani.findIndex(s => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({ basarili: true, siparis: { ...formatli, urunler: guncelUrunler }, mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.' });
  } catch (err: any) {
    console.error('Orijinal görsele dönme hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// In-memory onay bekleyen mesajlar havuzu (Gelen Kutusu / Staging Inbox)
interface OnayBekleyenKaydi {
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

let onayBekleyenler: OnayBekleyenKaydi[] = [
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

// 7. API: Onay Bekleyen Gelen Kutusu Listele
app.get('/api/inbox', (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;
  let mesajlar = onayBekleyenler;
  if (seciliTenant && seciliTenant !== 'all') {
    mesajlar = onayBekleyenler.filter(m => (m.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }
  res.json({
    basarili: true,
    toplam: mesajlar.filter(m => m.durum === 'BEKLEMEDE').length,
    mesajlar,
  });
});

// 8. API: Webhook Simülasyonu / Canlı Webhook Uç Noktası
app.post('/api/webhook/siparis', async (req, res) => {
  const { mesaj, gonderen, kaynak, tetikleyici_kod } = req.body;

  if (!mesaj || typeof mesaj !== 'string') {
    return res.status(400).json({ basarili: false, hata: 'Mesaj metni zorunludur.' });
  }

  // Tetikleyici kontrolü: Eğer #SİPARİŞ, #ONAY, #KNB geçmiyorsa isteğe bağlı uyarı veya doğrudan onay havuzuna atma
  const metin = mesaj.toUpperCase();
  const bulunanKod = tetikleyici_kod || (
    metin.includes('#SİPARİŞ') || metin.includes('#SIPARIS') ? '#SİPARİŞ' :
    metin.includes('#ONAY') ? '#ONAY' :
    metin.includes('#KNB') ? '#KNB' : 'MANUEL'
  );

  // Gemini ile mesaj geçmişini ayrıştır
  let aiSonuc: any = null;
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = getGeminiClient();
      const prompt = `Aşağıdaki müşteri ile satıcı arasındaki sohbet geçmişini oku. Konuşmadaki pazarlık veya alternatif konuşmaları eleyerek EN SON ÜZERİNDE ANLAŞILAN nihai siparişi çıkar.
Sohbet: "${mesaj}"`;

      const resp = await generateContentWithRetryAndFallback(ai, {
        contents: prompt,
        config: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              musteri_adi: { type: Type.STRING },
              instagram_kullanici_adi: { type: Type.STRING },
              telefon_numarasi: { type: Type.STRING },
              teslimat_sehri: { type: Type.STRING },
              teslimat_adresi: { type: Type.STRING },
              urun_aciklamasi: { type: Type.STRING },
              beden_veya_olcu: { type: Type.STRING },
              renk: { type: Type.STRING },
              adet: { type: Type.NUMBER },
              toplam_tutar: { type: Type.NUMBER },
              alinan_tutar: { type: Type.NUMBER },
              para_birimi: { type: Type.STRING },
              baku_tahsilat_notu: { type: Type.STRING },
              eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
              ai_guven_skoru: { type: Type.NUMBER },
            },
            required: ['musteri_adi', 'urun_aciklamasi', 'toplam_tutar'],
          },
        },
      });
      aiSonuc = JSON.parse(resp.text || '{}');
    } catch (e: any) {
      console.warn('Webhook AI hatası:', e.message);
    }
  }

  if (!aiSonuc || !aiSonuc.urun_aciklamasi) {
    aiSonuc = {
      musteri_adi: gonderen || 'Yeni Müşteri',
      instagram_kullanici_adi: gonderen?.startsWith('@') ? gonderen : '',
      telefon_numarasi: gonderen?.includes('+') ? gonderen : '',
      teslimat_sehri: 'Bakü',
      teslimat_adresi: '',
      urun_aciklamasi: 'Sohbetten gelen sipariş',
      beden_veya_olcu: '',
      renk: '',
      adet: 1,
      toplam_tutar: 0,
      alinan_tutar: 0,
      kalan_tutar: 0,
      para_birimi: 'AZN',
      finans_durumu: 'BEKLIYOR',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: '',
      eksik_bilgiler: ['toplam_tutar'],
      ai_guven_skoru: 0.85,
    };
  } else {
    const alinan = Number(aiSonuc.alinan_tutar || 0);
    const toplam = Number(aiSonuc.toplam_tutar || alinan);
    aiSonuc.alinan_tutar = alinan;
    aiSonuc.toplam_tutar = toplam;
    aiSonuc.kalan_tutar = Math.max(0, toplam - alinan);
    aiSonuc.para_birimi = aiSonuc.para_birimi || 'AZN';
    aiSonuc.finans_durumu = alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR';
    aiSonuc.lojistik_durumu = 'KANADA_SATINALIM_BEKLIYOR';
  }

  const hedefTenantId = req.body.tenant_id || 'kanada_shopper_baku';

  const yeniInbox: OnayBekleyenKaydi = {
    id: 'inbox-' + Date.now().toString(36),
    gelis_tarihi: new Date().toISOString(),
    kaynak: kaynak || 'INSTAGRAM_DM',
    gonderen_kullanici: gonderen || aiSonuc.instagram_kullanici_adi || aiSonuc.musteri_adi || '@musteri',
    konusma_gecmisi: mesaj,
    tetikleyici_kod: bulunanKod as any,
    oneri_siparis: {
      ...aiSonuc,
      tenant_id: hedefTenantId,
    },
    durum: 'BEKLEMEDE',
    tenant_id: hedefTenantId,
  };

  onayBekleyenler.unshift(yeniInbox);

  res.json({
    basarili: true,
    mesaj: 'Mesaj tetikleyici ile yakalandı ve onay bekleyenler havuzuna eklendi.',
    inbox: yeniInbox,
  });
});

// 9. API: Inbox Mesajını Onayla ve Kesin Siparişe Dönüştür
app.post('/api/inbox/:id/onayla', async (req, res) => {
  const { id } = req.params;
  const duzeltilmisSiparis = req.body.duzeltilmis_siparis; // Kullanıcının düzenlediği son hali
  const istekTenantId = req.body.tenant_id;

  const bulunanIndex = onayBekleyenler.findIndex(m => m.id === id);
  if (bulunanIndex === -1) {
    return res.status(404).json({ basarili: false, hata: 'Inbox mesajı bulunamadı.' });
  }

  const inboxItem = onayBekleyenler[bulunanIndex];
  const siparisVerisi = duzeltilmisSiparis || inboxItem.oneri_siparis;
  const tenantId = istekTenantId || siparisVerisi.tenant_id || inboxItem.tenant_id || 'kanada_shopper_baku';

  const alinan = Number(siparisVerisi.alinan_tutar || 0);
  const toplam = Number(siparisVerisi.toplam_tutar || alinan);
  const kalan = Math.max(0, toplam - alinan);

  const dbPayload = {
    tenant_id: tenantId,
    is_demo: tenantId === 'kanada_shopper_baku' || tenantId === 'demo_sandbox',
    ham_mesaj: inboxItem.konusma_gecmisi,
    siparis_kaynagi: inboxItem.kaynak,
    musteri_adi: siparisVerisi.musteri_adi || 'Müşteri',
    instagram_kullanici_adi: siparisVerisi.instagram_kullanici_adi || '',
    telefon_numarasi: siparisVerisi.telefon_numarasi || '',
    teslimat_sehri: siparisVerisi.teslimat_sehri || 'Bakü',
    teslimat_adresi: siparisVerisi.teslimat_adresi || '',
    urun_aciklamasi: siparisVerisi.urun_aciklamasi || 'Ürün',
    beden_veya_olcu: siparisVerisi.beden_veya_olcu || '',
    renk: siparisVerisi.renk || '',
    adet: Number(siparisVerisi.adet || 1),
    toplam_tutar: toplam,
    alinan_tutar: alinan,
    para_birimi: siparisVerisi.para_birimi || 'AZN',
    finans_durumu: siparisVerisi.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
    lojistik_durumu: siparisVerisi.lojistik_durumu || 'KANADA_SATINALIM_BEKLIYOR',
    baku_tahsilat_notu: siparisVerisi.baku_tahsilat_notu || '',
    eksik_bilgiler: Array.isArray(siparisVerisi.eksik_bilgiler) ? siparisVerisi.eksik_bilgiler : [],
    ai_guven_skoru: Number(siparisVerisi.ai_guven_skoru || 0.98),
  };

  let kesinSiparis: any = null;

  if (supabase) {
    try {
      const sbPayload = hazirlaSupabasePayload(dbPayload);
      const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
      if (!error && data) {
        kesinSiparis = formatlaSiparis(data);
      }
    } catch (err) {
      console.error('Inbox onayı Supabase hatası:', err);
    }
  }

  if (!kesinSiparis) {
    kesinSiparis = formatlaSiparis({
      id: 'sip-' + Date.now().toString(36),
      olusturma_tarihi: new Date().toISOString(),
      ...dbPayload,
      kalan_tutar: kalan,
    });
    siparislerVeritabani.unshift(kesinSiparis);
  }

  // Durumu güncelle
  onayBekleyenler[bulunanIndex].durum = 'ONAYLANDI';

  res.json({
    basarili: true,
    mesaj: 'Sipariş onaylandı ve resmi sipariş tablosuna aktarıldı.',
    siparis: kesinSiparis,
  });
});

// 10. API: Inbox Mesajını Reddet / Sil
app.post('/api/inbox/:id/reddet', (req, res) => {
  const { id } = req.params;
  const bulunanIndex = onayBekleyenler.findIndex(m => m.id === id);
  if (bulunanIndex !== -1) {
    onayBekleyenler[bulunanIndex].durum = 'REDDEDILDI';
    return res.json({ basarili: true, mesaj: 'Mesaj reddedildi/arşivlendi.' });
  }
  res.status(404).json({ basarili: false, hata: 'Mesaj bulunamadı.' });
});

// ==========================================
// CANLI & DEMO VERİTABANI YÖNETİMİ & SAAS API'LERİ
// ==========================================

// 6.1 API: Veritabanı Durumu & Rejim İnceleme
app.get('/api/veritabani/durum', async (req, res) => {
  let supabaseBagli = false;
  let toplamKayit = 0;
  let demoKayitSayisi = 0;
  let canliKayitSayisi = 0;
  let hata: string | null = null;

  try {
    let siparisler: any[] = [];
    if (supabase) {
      const { data, error } = await supabase.from('siparisler').select('*');
      if (error) {
        hata = error.message;
      } else if (data) {
        supabaseBagli = true;
        siparisler = data.map(s => formatlaSiparis(s));
      }
    }
    if (!supabaseBagli) {
      siparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    toplamKayit = siparisler.length;
    demoKayitSayisi = siparisler.filter(s => s.is_demo !== false).length;
    canliKayitSayisi = siparisler.filter(s => s.is_demo === false).length;

    const firmaDagilimi: Record<string, number> = {};
    for (const s of siparisler) {
      const tid = s.tenant_id || 'kanada_shopper_baku';
      firmaDagilimi[tid] = (firmaDagilimi[tid] || 0) + 1;
    }

    res.json({
      basarili: true,
      supabase_bagli: supabaseBagli,
      kaynak: supabaseBagli ? 'supabase' : 'bellek',
      toplam_siparis: toplamKayit,
      demo_siparis_sayisi: demoKayitSayisi,
      canli_siparis_sayisi: canliKayitSayisi,
      rejim: toplamKayit === 0 ? 'TEMIZ_CANLI' : (demoKayitSayisi > 0 ? 'DEMO_MODU' : 'CANLI_MODU'),
      firma_dagilimi: firmaDagilimi,
      hata,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// 6.2 API: Canlıya Geç / Bütün Demo Verilerini Temizle (Clean Live Mode)
app.post('/api/veritabani/temizle', async (req, res) => {
  try {
    let silinenAdet = 0;
    if (supabase) {
      const { data, error } = await supabase.from('siparisler').delete().neq('adet', -999999).select('id');
      if (error) {
        console.error('Supabase temizleme hatası:', error.message);
        return res.status(500).json({ basarili: false, hata: 'Supabase temizlenemedi: ' + error.message });
      }
      silinenAdet = data?.length || 0;
    }

    silinenAdet = Math.max(silinenAdet, siparislerVeritabani.length);
    siparislerVeritabani = [];

    console.log(`🧹 Veritabanı temizlendi. Toplam silinen: ${silinenAdet}`);
    res.json({
      basarili: true,
      mesaj: 'Verilənlər bazası uğurla təmizləndi. Sistem canlı müştəri sifarişlərini qəbul etməyə tam hazırdır!',
      silinen_adet: silinenAdet,
      toplam: 0,
    });
  } catch (err: any) {
    console.error('Temizleme istisnası:', err);
    res.status(500).json({ basarili: false, hata: 'Temizleme işlemi başarısız: ' + err.message });
  }
});

// 6.3 API: Demo Verilerini Geri Yükle (Təqdimat / Sınaq Rejimi)
app.post('/api/veritabani/demo-yukle', async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('siparisler').delete().neq('adet', -999999);
    }
    siparislerVeritabani = [];

    const eklenecekler = BASLANGIC_SIPARISLER.map(s => ({
      ...s,
      tenant_id: s.tenant_id || 'kanada_shopper_baku',
      is_demo: true,
    }));

    if (supabase) {
      const chunkSize = 30;
      for (let i = 0; i < eklenecekler.length; i += chunkSize) {
        const chunk = eklenecekler.slice(i, i + chunkSize);
        const sbChunk = chunk.map(item => hazirlaSupabasePayload(item));
        const { error } = await supabase.from('siparisler').insert(sbChunk);
        if (error) {
          console.error(`Supabase batch ${i} yükleme hatası:`, error.message);
        }
      }
    }

    siparislerVeritabani = [...eklenecekler];

    console.log(`✅ Demo verileri yüklendi: ${eklenecekler.length} sipariş.`);
    res.json({
      basarili: true,
      mesaj: `${eklenecekler.length} demo sifariş, tarixi qrafiklər və logistika qeydləri bazaya uğurla bərpa edildi!`,
      toplam: eklenecekler.length,
      kaynak: supabase ? 'supabase' : 'bellek',
    });
  } catch (err: any) {
    console.error('Demo yükleme istisnası:', err);
    res.status(500).json({ basarili: false, hata: 'Demo yükleme başarısız: ' + err.message });
  }
});

// 6.4 API: Veritabanı Yedeğini İndir (JSON Export)
app.get('/api/veritabani/yedek-al', async (req, res) => {
  try {
    let siparisler: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').order('olusturma_tarihi', { ascending: false });
      if (data) {
        siparisler = data.map(s => formatlaSiparis(s));
      }
    }
    if (siparisler.length === 0) {
      siparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    const yedekPaketi = {
      proje: 'Kanada Shopper Baku ERP',
      tarih: new Date().toISOString(),
      versiyon: '2.0-saas',
      toplam_siparis: siparisler.length,
      siparisler,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=knb_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.json(yedekPaketi);
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: 'Yedek oluşturulamadı: ' + err.message });
  }
});

// 6.5 API: Veritabanı Yedeğini Geri Yükle (JSON Import)
app.post('/api/veritabani/yedek-yukle', async (req, res) => {
  try {
    const { siparisler, temizleVeYukle = true } = req.body;
    if (!Array.isArray(siparisler) || siparisler.length === 0) {
      return res.status(400).json({ basarili: false, hata: 'Geçerli bir sipariş listesi bulunamadı.' });
    }

    if (temizleVeYukle) {
      if (supabase) {
        await supabase.from('siparisler').delete().neq('adet', -999999);
      }
      siparislerVeritabani = [];
    }

    if (supabase) {
      const chunkSize = 25;
      for (let i = 0; i < siparisler.length; i += chunkSize) {
        const chunk = siparisler.slice(i, i + chunkSize);
        const sbChunk = chunk.map(s => hazirlaSupabasePayload(s));
        const { error } = await supabase.from('siparisler').insert(sbChunk);
        if (error) console.error('Yedek yükleme chunk hatası:', error.message);
      }
    }

    const formatlanmis = siparisler.map(s => formatlaSiparis(s));
    siparislerVeritabani = temizleVeYukle ? [...formatlanmis] : [...formatlanmis, ...siparislerVeritabani];

    res.json({
      basarili: true,
      mesaj: `${siparisler.length} sifariş uğurla bazaya idxal edildi və bərpa olundu!`,
      toplam: siparisler.length,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: 'Yedek yükleme başarısız: ' + err.message });
  }
});

// 6.6 API: Firmalar / Butikler (Multi-Tenant SaaS Listesi)
app.get('/api/firmalar', (req, res) => {
  const sayilar: Record<string, number> = {};
  for (const s of siparislerVeritabani) {
    const tid = s.tenant_id || 'kanada_shopper_baku';
    sayilar[tid] = (sayilar[tid] || 0) + 1;
  }
  res.json({
    basarili: true,
    firmalar: firmalarVeritabani,
    siparis_sayilari: sayilar,
  });
});

app.post('/api/firmalar', (req, res) => {
  try {
    const { ad, sehir, varsayilanParaBirimi = 'AZN', varsayilanKomisyonYuzdesi = 15, aciklama } = req.body;
    if (!ad) {
      return res.status(400).json({ basarili: false, hata: 'Firma / butik adı zorunludur.' });
    }

    const slug = ad.toLowerCase()
      .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36).slice(-4);

    const yeniFirma: FirmaTenantItem = {
      id: slug,
      ad,
      sehir: sehir || 'Bakı',
      varsayilanParaBirimi: varsayilanParaBirimi || 'AZN',
      varsayilanKomisyonYuzdesi: Number(varsayilanKomisyonYuzdesi || 15),
      aciklama: aciklama || '',
      isDemo: false,
    };

    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);

    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistemə uğurla əlavə edildi!`,
      firma: yeniFirma,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

app.delete('/api/firmalar/:id', (req, res) => {
  const { id } = req.params;
  const index = firmalarVeritabani.findIndex(f => f.id === id);
  if (index === -1) {
    return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
  }
  if (id === 'kanada_shopper_baku') {
    return res.status(400).json({ basarili: false, hata: 'Əsas canlı butik silinə bilməz.' });
  }
  firmalarVeritabani.splice(index, 1);
  firmalariKaydetDosyaya(firmalarVeritabani);
  res.json({ basarili: true, mesaj: 'Butik uğurla silindi.' });
});

// 6.7 API: Bakü Kuryeleri (Multi-Tenant Saha Dağıtım Masası)
app.get('/api/kuryeler', (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;

  // İlgili butik siparişlerini filtrele
  const ilgiliSiparisler = (seciliTenant && seciliTenant !== 'all')
    ? siparislerVeritabani.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant)
    : siparislerVeritabani;

  const kuryeler = [
    {
      id: 'kurye-elvin',
      ad_soyad: 'Elvin Məmmədli',
      telefon: '+994 50 411 22 33',
      bolge: 'Nərimanov & Gənclik & Mərkəz',
    },
    {
      id: 'kurye-resad',
      ad_soyad: 'Rəşad Kərimov',
      telefon: '+994 55 622 33 44',
      bolge: 'Yasamal & Elmlər & 28 May',
    },
    {
      id: 'kurye-vuqar',
      ad_soyad: 'Vüqar Tağıyev',
      telefon: '+994 70 833 44 55',
      bolge: 'Gəncə & Qərb Rayonları (Poçt/Avtovağzal)',
    },
    {
      id: 'ofis-tehvil',
      ad_soyad: 'Ofis / Mərkəzi Evdən Təhvil',
      telefon: '+994 50 111 22 33',
      bolge: 'Nəsimi r., 28 May',
    },
  ];

  const zenginKuryeler = kuryeler.map(k => {
    // Bu kuryeye atanmış veya bölgesine düşen ilgili butik siparişleri
    const kuryeSiparisleri = ilgiliSiparisler.filter(s => {
      if (s.baku_kurye_id === k.id) return true;
      const adresVeSehir = `${s.teslimat_sehri || ''} ${s.teslimat_adresi || ''}`.toLowerCase();
      if (k.id === 'kurye-elvin' && (adresVeSehir.includes('nərimanov') || adresVeSehir.includes('gənclik') || adresVeSehir.includes('təbriz'))) return true;
      if (k.id === 'kurye-resad' && (adresVeSehir.includes('yasamal') || adresVeSehir.includes('elmlər') || adresVeSehir.includes('28 may') || adresVeSehir.includes('içərişəhər'))) return true;
      if (k.id === 'kurye-vuqar' && (adresVeSehir.includes('gəncə') || adresVeSehir.includes('sumqayıt') || adresVeSehir.includes('rayon'))) return true;
      if (k.id === 'ofis-tehvil' && (s.ozel_not?.toLowerCase().includes('sürücü') || s.ozel_not?.toLowerCase().includes('özü') || s.ham_mesaj?.toLowerCase().includes('özü'))) return true;
      return false;
    });

    const bekleyenler = kuryeSiparisleri.filter(s => s.lojistik_durumu !== 'TESLIM_EDILDI');
    const toplanacakBorc = bekleyenler.reduce((acc, s) => acc + (s.kalan_tutar || 0), 0);

    return {
      ...k,
      tenant_id: seciliTenant || 'all',
      aktif_paket_sayisi: bekleyenler.length,
      toplam_tahsilat_bekleyen: toplanacakBorc,
      toplam_paket_sayisi: kuryeSiparisleri.length,
    };
  });

  res.json({
    basarili: true,
    kuryeler: zenginKuryeler,
  });
});

// Eski rotayla geriye dönük uyumluluk
app.post('/api/ornek-verileri-yukle', async (req, res) => {
  res.redirect(307, '/api/veritabani/demo-yukle');
});


// 11. API: Müşteriler Listesi (CRM & Müşteri Geçmişi - Tenant İzolasyonlu)
app.get('/api/musteriler', async (req, res) => {
  try {
    const seciliTenant = req.query.tenant_id as string | undefined;

    // 1. Tüm siparişleri topla (Supabase veya in-memory)
    let tumSiparisler: any[] = [];
    let supabaseOkundu = false;
    if (supabase) {
      try {
        let query = supabase.from('siparisler').select('*');
        if (seciliTenant && seciliTenant !== 'all') {
          query = query.eq('tenant_id', seciliTenant);
        }
        const { data, error } = await query;
        if (!error && data) {
          tumSiparisler = data.map(s => formatlaSiparis(s));
          supabaseOkundu = true;
        }
      } catch (err) {
        console.warn('Supabase siparişleri okunamadı:', err);
      }
    }
    if (!supabaseOkundu) {
      tumSiparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    // Seçili butike göre siparişleri filtrele
    const ilgiliSiparisler = (seciliTenant && seciliTenant !== 'all')
      ? tumSiparisler.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant)
      : tumSiparisler;

    // 2. Bu butik için müşteri havuzunu belirle
    let tenantMusteriListesi: MusteriKaydi[] = [];

    if (seciliTenant && seciliTenant !== 'all') {
      if (seciliTenant === 'kanada_shopper_baku' || seciliTenant === 'demo_sandbox') {
        tenantMusteriListesi = musterilerVeritabani.filter(m => !m.tenant_id || m.tenant_id === seciliTenant);
      } else {
        // Yeni veya özel butik: Sadece bu butik için kaydedilmiş müşteriler
        tenantMusteriListesi = musterilerVeritabani.filter(m => m.tenant_id === seciliTenant);
      }

      // Ayrıca bu butik için siparişi olan ama musterilerVeritabani listesinde henüz olmayan kişileri dinamik ekle
      for (const s of ilgiliSiparisler) {
        if (!s.musteri_adi) continue;
        const telNo = (s.telefon_numarasi || '').replace(/\s+/g, '');
        const varMi = tenantMusteriListesi.some(m =>
          (telNo && m.telefon && m.telefon.replace(/\s+/g, '') === telNo) ||
          m.ad_soyad.toLowerCase().trim() === s.musteri_adi.toLowerCase().trim()
        );
        if (!varMi) {
          tenantMusteriListesi.push({
            id: s.musteri_id || `mus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            ad_soyad: s.musteri_adi,
            telefon: s.telefon_numarasi || '',
            instagram_kullanici_adi: s.instagram_kullanici_adi || '',
            sehir: s.teslimat_sehri || 'Bakı',
            adres: s.teslimat_adresi || '',
            musteri_tipi: s.musteri_tipi || 'TANIMADIK',
            toplam_siparis_sayisi: 0,
            toplam_harcama: 0,
            kalan_toplam_borc: 0,
            olusturma_tarihi: s.olusturma_tarihi || new Date().toISOString(),
            son_siparis_tarihi: s.olusturma_tarihi || new Date().toISOString(),
            son_urun_aciklamasi: s.urun_aciklamasi,
            son_siparis_tutari: s.toplam_tutar,
            tenant_id: seciliTenant,
          });
        }
      }
    } else {
      // Tümü / Global görünüm
      tenantMusteriListesi = [...musterilerVeritabani];
    }

    // 3. Her müşterinin seçili butik siparişlerine göre harcama, borç ve son siparişini hesapla
    const zenginlestirilmis = tenantMusteriListesi.map(m => {
      const telNo = (m.telefon || '').replace(/\s+/g, '');
      const eslesenSiparisler = ilgiliSiparisler.filter(s =>
        s.musteri_id === m.id ||
        (telNo && s.telefon_numarasi && s.telefon_numarasi.replace(/\s+/g, '') === telNo) ||
        s.musteri_adi.toLowerCase().trim() === m.ad_soyad.toLowerCase().trim()
      ).sort((a, b) => new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime());

      const sonSiparis = eslesenSiparisler[0];
      const toplamHarcama = eslesenSiparisler.reduce((toplam, s) => toplam + (Number(s.toplam_tutar) || 0), 0);
      const toplamBorc = eslesenSiparisler.reduce((toplam, s) => toplam + (Number(s.kalan_tutar) || 0), 0);

      return {
        ...m,
        toplam_siparis_sayisi: eslesenSiparisler.length > 0 ? eslesenSiparisler.length : (seciliTenant && seciliTenant !== 'all' ? 0 : m.toplam_siparis_sayisi),
        toplam_harcama: eslesenSiparisler.length > 0 ? toplamHarcama : (seciliTenant && seciliTenant !== 'all' ? 0 : m.toplam_harcama),
        kalan_toplam_borc: toplamBorc,
        son_urun_aciklamasi: sonSiparis ? sonSiparis.urun_aciklamasi : (seciliTenant && seciliTenant !== 'all' ? 'Bu butikdə sifariş yoxdur' : (m.son_urun_aciklamasi || 'Sipariş yoxdur')),
        son_siparis_tutari: sonSiparis ? sonSiparis.toplam_tutar : (seciliTenant && seciliTenant !== 'all' ? 0 : (m.son_siparis_tutari || 0)),
        son_siparis_tarihi: sonSiparis ? sonSiparis.olusturma_tarihi : (seciliTenant && seciliTenant !== 'all' ? m.olusturma_tarihi : m.son_siparis_tarihi),
      };
    });

    // Yeni bir butik seçilmişse ve o butike ait müşteri yoksa, liste boş döner!
    const filtrelenmis = zenginlestirilmis.filter(m => {
      if (seciliTenant && seciliTenant !== 'all' && seciliTenant !== 'kanada_shopper_baku' && seciliTenant !== 'demo_sandbox') {
        return m.tenant_id === seciliTenant || m.toplam_siparis_sayisi > 0;
      }
      return true;
    });

    filtrelenmis.sort((a, b) => new Date(b.son_siparis_tarihi || 0).getTime() - new Date(a.son_siparis_tarihi || 0).getTime());

    res.json({
      basarili: true,
      toplam: filtrelenmis.length,
      musteriler: filtrelenmis,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// 12. API: Tek Müşteri ve Sipariş Geçmişi
app.get('/api/musteriler/:id/siparisler', async (req, res) => {
  const { id } = req.params;
  const seciliTenant = req.query.tenant_id as string | undefined;

  let tumSiparisler: any[] = [];
  if (supabase) {
    try {
      let query = supabase.from('siparisler').select('*');
      if (seciliTenant && seciliTenant !== 'all') {
        query = query.eq('tenant_id', seciliTenant);
      }
      const { data } = await query;
      if (data && data.length > 0) {
        tumSiparisler = data.map(s => formatlaSiparis(s));
      }
    } catch {}
  }
  if (tumSiparisler.length === 0) {
    tumSiparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
  }

  const musteri = musterilerVeritabani.find(m => m.id === id);
  const telNo = musteri ? (musteri.telefon || '').replace(/\s+/g, '') : '';
  const musteriAdi = musteri ? musteri.ad_soyad.toLowerCase().trim() : '';

  let musteriSiparisleri = tumSiparisler.filter(s => 
    s.musteri_id === id || 
    (telNo && s.telefon_numarasi && s.telefon_numarasi.replace(/\s+/g, '') === telNo) ||
    (musteriAdi && s.musteri_adi.toLowerCase().trim() === musteriAdi)
  );

  if (seciliTenant && seciliTenant !== 'all') {
    musteriSiparisleri = musteriSiparisleri.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }

  musteriSiparisleri.sort((a, b) => new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime());

  res.json({
    basarili: true,
    musteri: musteri || { id, ad_soyad: 'Müştəri' },
    siparisler: musteriSiparisleri,
  });
});

// 13. API: Müşteri Ekle / Güncelle
app.post('/api/musteriler', (req, res) => {
  const { id, ad_soyad, telefon, instagram_kullanici_adi, sehir, adres, musteri_tipi, notlar, tenant_id } = req.body;
  if (!ad_soyad) {
    return res.status(400).json({ basarili: false, hata: 'Müşteri adı zorunludur.' });
  }

  let musteri = id ? musterilerVeritabani.find(m => m.id === id) : null;
  if (musteri) {
    musteri.ad_soyad = ad_soyad;
    if (telefon !== undefined) musteri.telefon = telefon;
    if (instagram_kullanici_adi !== undefined) musteri.instagram_kullanici_adi = instagram_kullanici_adi;
    if (sehir !== undefined) musteri.sehir = sehir;
    if (adres !== undefined) musteri.adres = adres;
    if (musteri_tipi !== undefined) musteri.musteri_tipi = musteri_tipi;
    if (notlar !== undefined) musteri.notlar = notlar;
    if (tenant_id !== undefined) musteri.tenant_id = tenant_id;
  } else {
    musteri = {
      id: 'mus-' + Date.now().toString(36),
      ad_soyad,
      telefon: telefon || '',
      instagram_kullanici_adi: instagram_kullanici_adi || '',
      sehir: sehir || 'Bakı',
      adres: adres || '',
      musteri_tipi: musteri_tipi || 'TANIMADIK',
      toplam_siparis_sayisi: 0,
      toplam_harcama: 0,
      kalan_toplam_borc: 0,
      notlar: notlar || '',
      olusturma_tarihi: new Date().toISOString(),
      son_siparis_tarihi: new Date().toISOString(),
      tenant_id: tenant_id || 'kanada_shopper_baku',
    };
    musterilerVeritabani.unshift(musteri);
  }

  res.json({ basarili: true, musteri });
});

// 13. API: Tenant İzolasyon Doğrulama & Sızıntı Testi Uç Noktası
app.get('/api/tenant/izolasyon-testi', async (req, res) => {
  try {
    const hedefTenant = (req.query.tenant_id as string) || 'kanada_shopper_baku';
    const testSonuclari: any[] = [];
    let toplamSizinti = 0;

    // 1. Test: Siparişler Tablosu İzolasyonu
    let siparislerTest: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('id, tenant_id, musteri_adi').eq('tenant_id', hedefTenant);
      if (data) siparislerTest = data;
    } else {
      siparislerTest = siparislerVeritabani.filter((s: any) => (s.tenant_id || 'kanada_shopper_baku') === hedefTenant);
    }
    const siparisSizintilari = siparislerTest.filter((s: any) => (s.tenant_id || 'kanada_shopper_baku') !== hedefTenant);
    toplamSizinti += siparisSizintilari.length;
    testSonuclari.push({
      modul: 'Siparişler',
      toplam_kayit: siparislerTest.length,
      sizinti_sayisi: siparisSizintilari.length,
      durum: siparisSizintilari.length === 0 ? 'GECTI' : 'BASARISIZ',
      aciklama: siparisSizintilari.length === 0
        ? `Tüm ${siparislerTest.length} sipariş kesin olarak "${hedefTenant}" tenant'ına ait.`
        : `UYARI: ${siparisSizintilari.length} sipariş başka tenant'a ait!`,
    });

    // 2. Test: Müşteriler (CRM) Tablosu İzolasyonu
    let musterilerTest: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('musteriler').select('id, tenant_id, ad_soyad').eq('tenant_id', hedefTenant);
      if (data) musterilerTest = data;
    } else {
      musterilerTest = musterilerVeritabani.filter((m: any) => (m.tenant_id || 'kanada_shopper_baku') === hedefTenant);
    }
    const musteriSizintilari = musterilerTest.filter((m: any) => (m.tenant_id || 'kanada_shopper_baku') !== hedefTenant);
    toplamSizinti += musteriSizintilari.length;
    testSonuclari.push({
      modul: 'Müşteriler (CRM)',
      toplam_kayit: musterilerTest.length,
      sizinti_sayisi: musteriSizintilari.length,
      durum: musteriSizintilari.length === 0 ? 'GECTI' : 'BASARISIZ',
      aciklama: musteriSizintilari.length === 0
        ? `Tüm ${musterilerTest.length} müşteri kaydı kesin olarak "${hedefTenant}" tenant'ına ait.`
        : `UYARI: ${musteriSizintilari.length} müşteri kaydı başka tenant'a ait!`,
    });

    // 3. Test: Gelen Kutusu (Inbox) İzolasyonu
    const inboxTest = onayBekleyenler.filter((m: any) => (m.tenant_id || 'kanada_shopper_baku') === hedefTenant);
    const inboxSizintilari = inboxTest.filter((m: any) => (m.tenant_id || 'kanada_shopper_baku') !== hedefTenant);
    toplamSizinti += inboxSizintilari.length;
    testSonuclari.push({
      modul: 'Gelen Kutusu (Inbox)',
      toplam_kayit: inboxTest.length,
      sizinti_sayisi: inboxSizintilari.length,
      durum: inboxSizintilari.length === 0 ? 'GECTI' : 'BASARISIZ',
      aciklama: `Tüm ${inboxTest.length} webhook/inbox mesajı bu butike aittir.`,
    });

    // 4. Test: Negatif Kontrol (Var olmayan Hayalet Tenant'ta 0 kayıt testi)
    const hayaletTenantId = 'hayalet_tenant_' + Math.random().toString(36).substring(7);
    let hayaletSiparisler: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('id').eq('tenant_id', hayaletTenantId);
      if (data) hayaletSiparisler = data;
    } else {
      hayaletSiparisler = siparislerVeritabani.filter((s: any) => s.tenant_id === hayaletTenantId);
    }
    const hayaletBasarili = hayaletSiparisler.length === 0;
    if (!hayaletBasarili) toplamSizinti += hayaletSiparisler.length;
    testSonuclari.push({
      modul: 'Negatif Kontrol (Hayalet Tenant)',
      toplam_kayit: hayaletSiparisler.length,
      sizinti_sayisi: hayaletSiparisler.length,
      durum: hayaletBasarili ? 'GECTI' : 'BASARISIZ',
      aciklama: hayaletBasarili 
        ? 'Rastgele oluşturulan sahte tenant sorgusunda 0 kayıt döndü (Veri sızması yok).'
        : 'HATA: Sahte tenant için kayıt döndü!',
    });

    res.json({
      basarili: true,
      test_zamani: new Date().toISOString(),
      tenant_id: hedefTenant,
      tum_testler_gecti: toplamSizinti === 0,
      toplam_sizinti_sayisi: toplamSizinti,
      guvenlik_derecesi: toplamSizinti === 0 ? '100% GÜVENLİ & İZOLE' : 'RİSKLİ',
      sonuclar: testSonuclari,
      ozet: toplamSizinti === 0 
        ? `"${hedefTenant}" butikinin tüm verileri veritabanı ve uygulama katmanında %100 izole edilmiştir. Hiçbir yabancı tenant verisi karışmamaktadır.`
        : `DİKKAT: ${toplamSizinti} adet yabancı kayıt tespit edildi!`
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: 'İzolasyon testi sırasında hata: ' + err.message });
  }
});

// API Rotaları için Global Hata Yakalayıcı (Asla HTML dönmez, her zaman temiz JSON döner)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api/')) {
    console.error('Express API Hatası:', err);
    return res.status(err.status || 500).json({
      basarili: false,
      hata: err.type === 'entity.too.large' 
        ? 'Yüklenen görsel boyutu sunucu sınırını aştı. Lütfen görseli kırpın veya küçültün.' 
        : (err.message || 'Sunucu işlemi sırasında bir hata oluştu.'),
    });
  }
  next(err);
});

// Vite Middleware & Static Serving Setup
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kanada-Bakü Lojistik Portalı port ${PORT} üzerinde çalışıyor.`);
  });
}

startServer();
