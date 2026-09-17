CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
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

CREATE TABLE IF NOT EXISTS public.siparisler (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku',
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

CREATE TABLE public.kuryeler(
  id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) DEFAULT 'kanada_shopper_baku',
  ad_soyad varchar(150) NOT NULL,
  telefon varchar(50) NOT NULL,
  bolge varchar(150) NOT NULL,
  aktif boolean DEFAULT true,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
