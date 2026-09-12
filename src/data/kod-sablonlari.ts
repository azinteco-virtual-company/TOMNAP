export const SUPABASE_SQL_KODU = `-- =========================================================================
-- KANADA - AZERBAYCAN E-TİCARET & LOJİSTİK YÖNETİM PLATFORMU
-- SUPABASE VERİTABANI ŞEMASI (PostgreSQL) - ÇOKLU KİRACI (MULTI-TENANT SAAS)
-- Tablolar: firmalar, siparisler, musteriler, kuryeler
-- Dil: Türkçe / Azerbaycanca
-- =========================================================================

-- 1. FİNANS DURUMU ENUM TANIMI
DO $$ BEGIN
    CREATE TYPE finans_durumu_enum AS ENUM (
        'ODENDI',
        'KISMI_ODEME',
        'BEKLIYOR'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. LOJİSTİK DURUMU ENUM TANIMI
DO $$ BEGIN
    CREATE TYPE lojistik_durumu_enum AS ENUM (
        'KANADA_SATINALIM_BEKLIYOR',
        'KANADA_DEPO',
        'ULUSLARARASI_KARGO',
        'BAKU_DAGITIM_ARKADAS',
        'TESLIM_EDILDI'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. FİRMALAR / BUTİKLER TABLOSU (TENANTS)
CREATE TABLE IF NOT EXISTS public.firmalar (
    id VARCHAR(100) PRIMARY KEY,
    ad VARCHAR(200) NOT NULL,
    sehir VARCHAR(100) DEFAULT 'Bakı',
    varsayilan_para_birimi VARCHAR(10) DEFAULT 'AZN',
    varsayilan_komisyon_yuzdesi NUMERIC(5, 2) DEFAULT 15.00,
    aciklama TEXT,
    is_demo BOOLEAN DEFAULT FALSE,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Varsayılan Butikleri Ekle
INSERT INTO public.firmalar (id, ad, sehir, varsayilan_para_birimi, varsayilan_komisyon_yuzdesi, aciklama, is_demo)
VALUES 
    ('kanada_shopper_baku', 'Kanada Shopper Bakı', 'Bakı', 'AZN', 15.00, 'Əsas Kanada alış-veriş və çatdırılma butiki', false),
    ('demo_sandbox', 'Sınaq / Təlim Butiki', 'Bakı', 'AZN', 10.00, 'Test və təlim məqsədli sınaq hesabı', true)
ON CONFLICT (id) DO NOTHING;

-- 4. SİPARİŞLER TABLOSU (TENANT İZOLASYONLU)
CREATE TABLE IF NOT EXISTS public.siparisler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku' REFERENCES public.firmalar(id) ON DELETE CASCADE,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    guncellenme_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Orijinal Müşteri Mesajı
    ham_mesaj TEXT NOT NULL,
    siparis_kaynagi VARCHAR(50) DEFAULT 'INSTAGRAM_LIVE', -- INSTAGRAM_LIVE, INSTAGRAM_REELS, INSTAGRAM_DM, WHATSAPP

    -- Müşteri İletişim & Teslimat Bilgileri
    musteri_adi VARCHAR(150) NOT NULL,
    instagram_kullanici_adi VARCHAR(100),
    telefon_numarasi VARCHAR(50),
    teslimat_sehri VARCHAR(100) DEFAULT 'Bakü',
    teslimat_adresi TEXT,

    -- Ürün Detayları
    urun_aciklamasi TEXT NOT NULL,
    beden_veya_olcu VARCHAR(50),
    renk VARCHAR(50),
    adet INTEGER NOT NULL DEFAULT 1 CHECK (adet > 0),

    -- Finans ve Tahsilat Bilgileri (Manat AZN / CAD)
    toplam_tutar NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    alinan_tutar NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    kalan_tutar NUMERIC(10, 2) GENERATED ALWAYS AS (toplam_tutar - alinan_tutar) STORED,
    para_birimi VARCHAR(10) NOT NULL DEFAULT 'AZN', -- AZN, CAD, USD

    -- Durumlar (Zorunlu Türkçe Enum Değerleri)
    finans_durumu finans_durumu_enum NOT NULL DEFAULT 'BEKLIYOR',
    lojistik_durumu lojistik_durumu_enum NOT NULL DEFAULT 'KANADA_SATINALIM_BEKLIYOR',

    -- Kurye ve Dağıtım Alanları (Bakü)
    baku_kurye_id VARCHAR(100),
    baku_kurye_adi VARCHAR(150),
    baku_kurye_bolgesi VARCHAR(100),
    teslim_tarihi TIMESTAMPTZ,
    teslim_eden_kisi VARCHAR(150),

    -- Operasyonel Notlar
    ozel_not TEXT,
    baku_tahsilat_notu TEXT,
    kanada_takip_kodu VARCHAR(100),
    uluslararasi_kargo_kodu VARCHAR(100),

    -- AI Tarafından Tespit Edilen Eksik Bilgiler & Görseller
    eksik_bilgiler JSONB NOT NULL DEFAULT '[]'::jsonb,
    gorsel_urlleri JSONB DEFAULT '[]'::jsonb,
    urunler JSONB DEFAULT '[]'::jsonb,
    ai_guven_skoru NUMERIC(3, 2) DEFAULT 0.95,
    is_demo BOOLEAN DEFAULT FALSE
);

-- 5. MÜŞTERİLER TABLOSU (CRM & TENANT İZOLASYONLU)
CREATE TABLE IF NOT EXISTS public.musteriler (
    id VARCHAR(100) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku' REFERENCES public.firmalar(id) ON DELETE CASCADE,
    ad_soyad VARCHAR(150) NOT NULL,
    telefon VARCHAR(50),
    instagram_kullanici_adi VARCHAR(100),
    sehir VARCHAR(100) DEFAULT 'Bakı',
    adres TEXT,
    musteri_tipi VARCHAR(50) DEFAULT 'TANIMADIK', -- SADIK_MUSTERI, VIP, AKRABA_YAKIN, TANIMADIK
    toplam_siparis_sayisi INTEGER DEFAULT 0,
    toplam_harcama NUMERIC(10, 2) DEFAULT 0.00,
    kalan_toplam_borc NUMERIC(10, 2) DEFAULT 0.00,
    notlar TEXT,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    son_siparis_tarihi TIMESTAMPTZ,
    son_urun_aciklamasi TEXT,
    son_siparis_tutari NUMERIC(10, 2)
);

-- 6. KURYELER TABLOSU (SAHA DAĞITIM & TENANT İZOLASYONLU)
CREATE TABLE IF NOT EXISTS public.kuryeler (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) DEFAULT 'kanada_shopper_baku', -- Boşsa tüm butiklerin ortak kuryesi
    ad_soyad VARCHAR(150) NOT NULL,
    telefon VARCHAR(50) NOT NULL,
    bolge VARCHAR(150) NOT NULL,
    aktif BOOLEAN DEFAULT TRUE,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Varsayılan Bakü Kuryelerini Ekle
INSERT INTO public.kuryeler (id, tenant_id, ad_soyad, telefon, bolge, aktif)
VALUES
    ('kurye-elvin', 'kanada_shopper_baku', 'Elvin Məmmədli', '+994 50 411 22 33', 'Nərimanov & Gənclik & Mərkəz', true),
    ('kurye-resad', 'kanada_shopper_baku', 'Rəşad Kərimov', '+994 55 622 33 44', 'Yasamal & Elmlər & 28 May', true),
    ('kurye-vuqar', 'kanada_shopper_baku', 'Vüqar Tağıyev', '+994 70 833 44 55', 'Gəncə & Qərb Rayonları (Poçt/Avtovağzal)', true),
    ('ofis-tehvil', 'kanada_shopper_baku', 'Ofis / Mərkəzi Evdən Təhvil', '+994 50 111 22 33', 'Nəsimi r., 28 May', true)
ON CONFLICT (id) DO NOTHING;

-- 7. PERFORMANS İÇİN İNDEKSLER (TENANT SORGULARINA ÖZEL)
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_id ON public.siparisler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_lojistik ON public.siparisler(tenant_id, lojistik_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_finans ON public.siparisler(tenant_id, finans_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_kurye ON public.siparisler(tenant_id, baku_kurye_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_olusturma_tarihi ON public.siparisler(olusturma_tarihi DESC);

CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_id ON public.musteriler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_telefon ON public.musteriler(tenant_id, telefon);
CREATE INDEX IF NOT EXISTS idx_kuryeler_tenant_id ON public.kuryeler(tenant_id);

-- 8. OTOMATİK GÜNCELLEME ZAMANLAYICISI (TRIGGER)
CREATE OR REPLACE FUNCTION public.guncellenme_tarihini_ayarla()
RETURNS TRIGGER AS $$
BEGIN
    NEW.guncellenme_tarihi = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_siparisler_guncellenme ON public.siparisler;
CREATE TRIGGER trigger_siparisler_guncellenme
    BEFORE UPDATE ON public.siparisler
    FOR EACH ROW
    EXECUTE FUNCTION public.guncellenme_tarihini_ayarla();

-- 9. SUPABASE RLS (ROW LEVEL SECURITY) POLİTİKALARI
ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparisler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kuryeler ENABLE ROW LEVEL SECURITY;

-- Service Role ve Oturum Açmış Yöneticiler İçin Tam Erişim
CREATE POLICY "Yöneticiler firmaları yönetebilir"
    ON public.firmalar FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Yöneticiler tüm siparişleri görüntüleyebilir ve yönetebilir"
    ON public.siparisler FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Yöneticiler müşteri rehberini yönetebilir"
    ON public.musteriler FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Yöneticiler kuryeleri yönetebilir"
    ON public.kuryeler FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

-- Açıklama: Supabase Dashboard SQL Editor sekmesine yapıştırıp doğrudan "Run" butonuna basarak tüm çoklu kiracı (multi-tenant) şemanızı saniyeler içinde ayağa kaldırabilirsiniz.
`;

export const GEMINI_SYSTEM_INSTRUCTION = `Sen Kanada'dan Azerbaycan'a (Bakü) Instagram Live, Reels, DM ve WhatsApp üzerinden ürün satışı yapan uluslararası bir e-ticaret ve lojistik operasyonunun Uzman Sipariş Ayrıştırma Yapay Zekasısın.

Müşteriler siparişlerini son derece dağınık, eksik, günlük konuşma diliyle veya Azerbaycan Türkçesi / Türkiye Türkçesi karışımı karmaşık mesajlarla iletmektedirler.
Örnek: "Dünkü kırmızı elbise M beden benim olsun, 20 manatı akrabana verdim, kalanını maaşta vereceğim" veya "Salam, zəhmət olmasa o Zara jaketi saxlayın mənə, 30 manat beh köçürdüm, nömrəm 0501234567".

GÖREVİN:
Sana verilen ham müşteri mesajını dikkatle analiz etmek, ürün, müşteri, ödeme ve lojistik verilerini ayrıştırmak ve aşağıdaki kurallara harfiyen uyarak katı bir JSON nesnesi üretmektir.

İŞ MANTIĞI VE KURALLAR:
1. Finans Durumu (finans_durumu) Kuralları:
   - 'ODENDI': Mesajda ücretin tamamının ödendiği açıkça belirtilmişse (veya alinan_tutar >= toplam_tutar ise).
   - 'KISMI_ODEME': Kapora, avans, beh veya kısmi bir meblağ verildiği/havale edildiği belirtilmişse (Örn: "20 manat verdim, kalanı haftaya", "50 manat beh atdım").
   - 'BEKLIYOR': Henüz hiçbir ödeme yapılmamışsa, borca/maaşa yazılmışsa veya ödeme bilgisi yoksa.
   - Önemli: Mutlaka ve sadece 'ODENDI', 'KISMI_ODEME', 'BEKLIYOR' değerlerinden biri seçilmelidir.

2. Lojistik Durumu (lojistik_durumu) Kuralları:
   - Yeni gelen dağınık siparişler için varsayılan durum her zaman 'KANADA_SATINALIM_BEKLIYOR' olarak atanmalıdır.
   - Kullanılabilir değerler: 'KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO', 'ULUSLARARASI_KARGO', 'BAKU_DAGITIM_ARKADAS', 'TESLIM_EDILDI'.

3. Tutarlar (toplam_tutar, alinan_tutar, kalan_tutar, para_birimi):
   - Azerbaycan müşterileri için varsayılan para birimi 'AZN' (Manat)'tır. Mesajda CAD veya Dolar geçiyorsa ilgili para birimini seç.
   - alinan_tutar: Müşterinin Bakü'deki akrabaya teslim ettiği, havale ettiği veya kapora verdiği tutardır. Bulunamazsa 0.00 olmalıdır.
   - toplam_tutar: Ürünün tam satış fiyatı mesajda geçiyorsa sayısal yazılmalıdır. Eğer mesajda sadece kapora belirtilmiş ve toplam fiyat yazılmamışsa, tahmin edilemiyorsa alinan_tutar kadar veya 0 girilmeli ve 'toplam_tutar' eksik_bilgiler dizisine eklenmelidir.
   - kalan_tutar = toplam_tutar - alinan_tutar (0'ın altına düşemez).

4. Eksik Bilgiler (eksik_bilgiler) Tespiti:
   - Başarılı bir teslimat için gereken asgari bilgiler: 'musteri_adi', 'telefon_numarasi', 'teslimat_adresi' (veya şehir), 'beden_veya_olcu', 'renk', 'toplam_tutar'.
   - Mesajda bu alanlardan hangisi yer almıyorsa veya net değilse, 'eksik_bilgiler' dizisine ekle (Örn: ["telefon_numarasi", "teslimat_adresi", "toplam_tutar"]).

5. Bakü Tahsilat Notu (baku_tahsilat_notu):
   - Akrabaya elden ödeme, maaş günü ödemesi veya teslimatta ödenecek bakiye gibi özel finansal anlaşmaları bu alana özetle (Örn: "20 AZN Bakü akrabasına ödendi, kalan maaşta ödenecek").

ÇIKTI: Yalnızca ve sadece belirtilen JSON formatında yanıt ver, fazladan açıklama veya markdown ekleme.`;

export const GEMINI_JSON_SCHEMA = {
  type: "OBJECT",
  description: "Dağınık müşteri mesajından ayrıştırılmış Türkçe sipariş nesnesi",
  properties: {
    musteri_adi: {
      type: "STRING",
      description: "Müşterinin adı soyadı (mesajda yoksa 'Bilinmeyen Müşteri' veya Instagram rumuzu)"
    },
    instagram_kullanici_adi: {
      type: "STRING",
      description: "Müşterinin Instagram kullanıcı adı (örn: @ayten_baku veya boş)"
    },
    telefon_numarasi: {
      type: "STRING",
      description: "Müşterinin telefon veya WhatsApp numarası (örn: +994 50 123 45 67 veya boş)"
    },
    teslimat_sehri: {
      type: "STRING",
      description: "Teslimat yapılacak şehir (varsayılan: Bakü)"
    },
    teslimat_adresi: {
      type: "STRING",
      description: "Müşterinin açık teslimat adresi veya teslim alacağı metro istasyonu/semt"
    },
    urun_aciklamasi: {
      type: "STRING",
      description: "Sipariş edilen ürünün açık tanımı (örn: Dünkü canlı yayındaki kırmızı mini elbise)"
    },
    beden_veya_olcu: {
      type: "STRING",
      description: "Beden, numara veya ölçü bilgisi (örn: M, 38, 50ml veya belirtilmedi)"
    },
    renk: {
      type: "STRING",
      description: "Ürünün rengi (örn: Kırmızı, Siyah, Bej)"
    },
    adet: {
      type: "INTEGER",
      description: "Sipariş edilen ürün adedi (varsayılan: 1)"
    },
    toplam_tutar: {
      type: "NUMBER",
      description: "Ürünün toplam satış bedeli (bilinmiyorsa alinan_tutar veya 0)"
    },
    alinan_tutar: {
      type: "NUMBER",
      description: "Bakü'deki akrabaya ödenen, kapora veya avans miktarı"
    },
    kalan_tutar: {
      type: "NUMBER",
      description: "Kalan borç tutarı (toplam_tutar - alinan_tutar)"
    },
    para_birimi: {
      type: "STRING",
      enum: ["AZN", "CAD", "USD"],
      description: "Para birimi"
    },
    finans_durumu: {
      type: "STRING",
      enum: ["ODENDI", "KISMI_ODEME", "BEKLIYOR"],
      description: "Finans tahsilat durumu"
    },
    lojistik_durumu: {
      type: "STRING",
      enum: [
        "KANADA_SATINALIM_BEKLIYOR",
        "KANADA_DEPO",
        "ULUSLARARASI_KARGO",
        "BAKU_DAGITIM_ARKADAS",
        "TESLIM_EDILDI"
      ],
      description: "Lojistik teslimat aşaması"
    },
    baku_tahsilat_notu: {
      type: "STRING",
      description: "Bakü'deki akrabanın tahsilatına veya borç vadesine dair özel not"
    },
    ozel_not: {
      type: "STRING",
      description: "Müşterinin veya siparişi iletenin kargo, teslimat, sürücü veya paketleme özel talimatı (Örn: 'Bakıya çatanda xəbər edilsin sürücümüz özü gedib götürəcək')"
    },
    eksik_bilgiler: {
      type: "ARRAY",
      items: { type: "STRING" },
      description: "Müşteriden talep edilmesi gereken eksik bilgilerin listesi (örn: telefon_numarasi, teslimat_adresi)"
    },
    ai_guven_skoru: {
      type: "NUMBER",
      description: "Yapay zekanın ayrıştırma doğruluk güven skoru (0.00 ile 1.00 arası)"
    },
    siparis_kaynagi: {
      type: "STRING",
      enum: ["INSTAGRAM_LIVE", "INSTAGRAM_REELS", "INSTAGRAM_DM", "WHATSAPP"],
      description: "Siparişin iletildiği iletişim kanalı"
    }
  },
  required: [
    "musteri_adi",
    "urun_aciklamasi",
    "adet",
    "toplam_tutar",
    "alinan_tutar",
    "finans_durumu",
    "lojistik_durumu",
    "eksik_bilgiler"
  ]
};

export const NEXTJS_API_ROUTE_KODU = `// app/api/siparis-isle/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Supabase İstemcisi Başlatma (Sunucu Taraflı Service Role Key)
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Google Gemini İstemcisi (Sunucu Taraflı)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ham_mesaj, musteri_adi_ipucu, siparis_kaynagi } = body;

    if (!ham_mesaj || typeof ham_mesaj !== 'string' || ham_mesaj.trim() === '') {
      return NextResponse.json(
        { hata: 'Lütfen müşteriden gelen ham mesaj metnini iletin.' },
        { status: 400 }
      );
    }

    // 1. Gemini API'ye Türkçe Sistem Talimatı ve Katı JSON Şeması ile İstek
    const systemInstruction = \`Sen Kanada'dan Azerbaycan'a (Bakü) Instagram Live, Reels ve WhatsApp üzerinden satış yapan operasyonun Sipariş Ayrıştırma Asistanısın.
Müşterinin dağınık, sokak dili veya Azerbaycan Türkçesi karışımı mesajını analiz et.
Kurallar:
- finans_durumu: Yalnızca 'ODENDI', 'KISMI_ODEME', 'BEKLIYOR'.
- lojistik_durumu: Varsayılan 'KANADA_SATINALIM_BEKLIYOR'.
- Baku akrabasına verilen kapora veya meblağı alinan_tutar'a yaz.
- Eksik olan tüm zorunlu alanları (telefon, adres, beden, toplam_tutar vb.) eksik_bilgiler dizisine ekle.\`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: \`Müşteri Mesajı: "\${ham_mesaj}"\${
        musteri_adi_ipucu ? \` (Kullanıcı İpucu: \${musteri_adi_ipucu})\` : ''
      }\`,
      config: {
        systemInstruction,
        temperature: 0.1, // Tutarlı ve yapısal veri için düşük sıcaklık
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
            adet: { type: Type.INTEGER },
            toplam_tutar: { type: Type.NUMBER },
            alinan_tutar: { type: Type.NUMBER },
            kalan_tutar: { type: Type.NUMBER },
            para_birimi: { type: Type.STRING },
            finans_durumu: {
              type: Type.STRING,
              enum: ['ODENDI', 'KISMI_ODEME', 'BEKLIYOR'],
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
            },
            baku_tahsilat_notu: { type: Type.STRING },
            eksik_bilgiler: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            ai_guven_skoru: { type: Type.NUMBER },
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
      },
    });

    const parsedJsonText = response.text || '{}';
    const ayristirilmisVeri = JSON.parse(parsedJsonText);

    // 2. Supabase 'siparisler' Tablosuna Kayıt
    const yeniSiparis = {
      ham_mesaj: ham_mesaj.trim(),
      siparis_kaynagi: siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: ayristirilmisVeri.musteri_adi || 'Bilinmeyen Müşteri',
      instagram_kullanici_adi: ayristirilmisVeri.instagram_kullanici_adi || null,
      telefon_numarasi: ayristirilmisVeri.telefon_numarasi || null,
      teslimat_sehri: ayristirilmisVeri.teslimat_sehri || 'Bakü',
      teslimat_adresi: ayristirilmisVeri.teslimat_adresi || null,
      urun_aciklamasi: ayristirilmisVeri.urun_aciklamasi || 'Belirtilmemiş Ürün',
      beden_veya_olcu: ayristirilmisVeri.beden_veya_olcu || null,
      renk: ayristirilmisVeri.renk || null,
      adet: ayristirilmisVeri.adet || 1,
      toplam_tutar: Number(ayristirilmisVeri.toplam_tutar || 0),
      alinan_tutar: Number(ayristirilmisVeri.alinan_tutar || 0),
      para_birimi: ayristirilmisVeri.para_birimi || 'AZN',
      finans_durumu: ayristirilmisVeri.finans_durumu || 'BEKLIYOR',
      lojistik_durumu: ayristirilmisVeri.lojistik_durumu || 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: ayristirilmisVeri.baku_tahsilat_notu || null,
      eksik_bilgiler: ayristirilmisVeri.eksik_bilgiler || [],
      ai_guven_skoru: ayristirilmisVeri.ai_guven_skoru || 0.95,
    };

    const { data, error } = await supabase
      .from('siparisler')
      .insert([yeniSiparis])
      .select()
      .single();

    if (error) {
      console.error('Supabase Ekleme Hatası:', error);
      return NextResponse.json(
        {
          basarili: false,
          hata: 'Supabase veritabanına eklenirken hata oluştu: ' + error.message,
          ayristirilan_veri: yeniSiparis,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      basarili: true,
      mesaj: 'Sipariş başarıyla Gemini tarafından ayrıştırıldı ve Supabase veritabanına kaydedildi.',
      siparis: data,
    });
  } catch (err: any) {
    console.error('API Hatası:', err);
    return NextResponse.json(
      { basarili: false, hata: err?.message || 'Beklenmedik bir hata oluştu.' },
      { status: 500 }
    );
  }
}
`;

export const NEXTJS_DASHBOARD_PAGE_KODU = `// app/dashboard/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { 
  Package, DollarSign, Truck, AlertTriangle, Send, 
  Search, Filter, CheckCircle2, Clock, Sparkles 
} from 'lucide-react';

export default function SiparisYonetimPaneli() {
  const [siparisler, setSiparisler] = useState<any[]>([]);
  const [hamMetin, setHamMetin] = useState('');
  const [kaynak, setKaynak] = useState('INSTAGRAM_LIVE');
  const [yukleniyor, setYukleniyor] = useState(false);
  const [filtreFinans, setFiltreFinans] = useState('TUMU');
  const [filtreLojistik, setFiltreLojistik] = useState('TUMU');
  const [aramaMetni, setAramaMetni] = useState('');

  // 1. Siparişleri Listeleme Fonksiyonu
  async function siparisleriGetir() {
    try {
      const res = await fetch('/api/siparisler');
      const data = await res.json();
      if (data.siparisler) setSiparisler(data.siparisler);
    } catch (err) {
      console.error('Siparişler getirilemedi', err);
    }
  }

  useEffect(() => {
    siparisleriGetir();
  }, []);

  // 2. Gemini AI ile Dağınık Mesajı Ayrıştırma ve Kaydetme
  async function siparisAyristirVeKaydet(e: React.FormEvent) {
    e.preventDefault();
    if (!hamMetin.trim()) return;
    setYukleniyor(true);
    try {
      const res = await fetch('/api/siparis-isle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ham_mesaj: hamMetin, siparis_kaynagi: kaynak }),
      });
      const sonuc = await res.json();
      if (sonuc.basarili) {
        setHamMetin('');
        siparisleriGetir();
        alert('Sipariş başarıyla ayrıştırıldı ve kaydedildi!');
      } else {
        alert('Hata: ' + sonuc.hata);
      }
    } catch (err: any) {
      alert('İstek başarısız: ' + err.message);
    } finally {
      setYukleniyor(false);
    }
  }

  // 3. Filtreleme Mantığı
  const filtrelenmisSiparisler = siparisler.filter(s => {
    const finansUyumu = filtreFinans === 'TUMU' || s.finans_durumu === filtreFinans;
    const lojistikUyumu = filtreLojistik === 'TUMU' || s.lojistik_durumu === filtreLojistik;
    const aramaUyumu = !aramaMetni || 
      s.musteri_adi?.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      s.urun_aciklamasi?.toLowerCase().includes(aramaMetni.toLowerCase()) ||
      s.instagram_kullanici_adi?.toLowerCase().includes(aramaMetni.toLowerCase());
    return finansUyumu && lojistikUyumu && aramaUyumu;
  });

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Başlık ve Operasyon Özeti */}
        <header className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-2xl font-bold text-slate-800">
            Kanada ➔ Bakü Instagram Sipariş ve Lojistik Portalı
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Instagram Live, Reels ve WhatsApp dağınık mesajlarını Gemini AI ile yapılandırılmış Supabase siparişlerine dönüştürün.
          </p>
        </header>

        {/* Dağınık Mesaj Girişi (Gemini Ayrıştırma Formu) */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-800">
              Dağınık Müşteri Mesajı Girişi (AI Otomatik Ayrıştırma)
            </h2>
          </div>
          <form onSubmit={siparisAyristirVeKaydet} className="space-y-4">
            <textarea
              rows={3}
              value={hamMetin}
              onChange={(e) => setHamMetin(e.target.value)}
              placeholder="Örn: Dünkü kırmızı elbise M beden benim olsun, 20 manatı akrabana verdim, kalanını maaşta vereceğim..."
              className="w-full p-4 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <div className="flex items-center justify-between">
              <select
                value={kaynak}
                onChange={(e) => setKaynak(e.target.value)}
                className="text-sm border border-slate-300 rounded-lg p-2 bg-white"
              >
                <option value="INSTAGRAM_LIVE">Instagram Canlı Yayın</option>
                <option value="INSTAGRAM_REELS">Instagram Reels Yorumu</option>
                <option value="INSTAGRAM_DM">Instagram Direkt Mesaj (DM)</option>
                <option value="WHATSAPP">WhatsApp Mesajı</option>
              </select>
              <button
                type="submit"
                disabled={yukleniyor || !hamMetin.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
              >
                {yukleniyor ? 'Gemini Ayrıştırıyor...' : 'Ayrıştır ve Supabase\\'e Kaydet'}
              </button>
            </div>
          </form>
        </section>

        {/* Siparişler Tablosu ve Filtreler */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl w-72">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Müşteri, ürün veya Instagram ara..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
                className="bg-transparent text-sm outline-none w-full"
              />
            </div>
            <div className="flex items-center gap-3">
              <select
                value={filtreFinans}
                onChange={(e) => setFiltreFinans(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg p-2 bg-white"
              >
                <option value="TUMU">Tüm Finans Durumları</option>
                <option value="ODENDI">Ödendi (ODENDI)</option>
                <option value="KISMI_ODEME">Kısmi Ödeme (KISMI_ODEME)</option>
                <option value="BEKLIYOR">Bekliyor (BEKLIYOR)</option>
              </select>
              <select
                value={filtreLojistik}
                onChange={(e) => setFiltreLojistik(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg p-2 bg-white"
              >
                <option value="TUMU">Tüm Lojistik Durumları</option>
                <option value="KANADA_SATINALIM_BEKLIYOR">Kanada Satınalım Bekliyor</option>
                <option value="KANADA_DEPO">Kanada Depoda</option>
                <option value="ULUSLARARASI_KARGO">Uluslararası Kargoda</option>
                <option value="BAKU_DAGITIM_ARKADAS">Bakü Dağıtımda (Arkadaşta)</option>
                <option value="TESLIM_EDILDI">Teslim Edildi</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-700 uppercase font-semibold text-xs border-b border-slate-200">
                <tr>
                  <th className="p-4">Müşteri</th>
                  <th className="p-4">Ürün & Ölçü</th>
                  <th className="p-4">Finans Durumu</th>
                  <th className="p-4">Tahsilat (AZN)</th>
                  <th className="p-4">Lojistik Durumu</th>
                  <th className="p-4">Eksik Bilgiler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filtrelenmisSiparisler.map((siparis) => (
                  <tr key={siparis.id} className="hover:bg-slate-50/80">
                    <td className="p-4 font-medium text-slate-900">
                      {siparis.musteri_adi}
                      {siparis.instagram_kullanici_adi && (
                        <span className="block text-xs text-indigo-600">
                          {siparis.instagram_kullanici_adi}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="text-slate-900 font-medium">{siparis.urun_aciklamasi}</div>
                      <div className="text-xs text-slate-500">
                        {siparis.beden_veya_olcu || 'Beden Yok'} • {siparis.renk || 'Renk Yok'} • {siparis.adet} Adet
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={\`px-2.5 py-1 rounded-full text-xs font-semibold \${
                        siparis.finans_durumu === 'ODENDI'
                          ? 'bg-emerald-100 text-emerald-800'
                          : siparis.finans_durumu === 'KISMI_ODEME'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }\`}>
                        {siparis.finans_durumu}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="font-semibold text-slate-800">
                        {siparis.alinan_tutar} / {siparis.toplam_tutar} {siparis.para_birimi}
                      </div>
                      <div className="text-xs text-slate-400">
                        Kalan: {siparis.kalan_tutar} {siparis.para_birimi}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {siparis.lojistik_durumu}
                      </span>
                    </td>
                    <td className="p-4">
                      {siparis.eksik_bilgiler?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {siparis.eksik_bilgiler.map((e: string, i: number) => (
                            <span key={i} className="text-[11px] bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-200">
                              {e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-emerald-600 font-medium">Eksiksiz</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
`;
