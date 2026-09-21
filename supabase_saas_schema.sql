-- =========================================================================
-- TOMNAP GLOBAL B2B SAAS PLATFORMASI — SUPABASE VERİLƏNLƏR BAZASI ŞEMASI
-- Bu skripti Supabase Dashboard -> SQL Editor bölməsində icra edə bilərsiniz.
-- =========================================================================

-- 1. FİRMALAR / BUTİKLER (TENANTS) CƏDVƏLİ
CREATE TABLE IF NOT EXISTS public.firmalar (
    id VARCHAR(100) PRIMARY KEY,
    ad VARCHAR(200) NOT NULL,
    sehir VARCHAR(100) DEFAULT 'Bakı',
    varsayilan_para_birimi VARCHAR(10) DEFAULT 'AZN',
    varsayilan_komisyon_yuzdesi NUMERIC(5, 2) DEFAULT 15.00,
    aciklama TEXT,
    is_demo BOOLEAN DEFAULT FALSE,
    onay_durumu VARCHAR(30) DEFAULT 'AKTIF', -- 'AKTIF', 'BEKLEMEDE', 'REDDEDILDI', 'DONDURULMUS'
    paket VARCHAR(50) DEFAULT 'PRO',         -- 'BASLANGIC', 'PRO', 'ENTERPRISE'
    sahip_adi VARCHAR(150),
    sahip_email VARCHAR(150),
    sahip_telefon VARCHAR(50),
    mensei_ulke VARCHAR(10) DEFAULT 'CA',    -- 'CA', 'US', 'TR', 'JP', 'GB'
    rol_limitleri JSONB DEFAULT '{"PATRON":1,"KANADA_SATINALMA":2,"SATIS_SORUMLUSU":2,"BAKU_FINANS":2,"BAKU_KURYE":5}'::jsonb,
    aktif_kullanici_sayilari JSONB DEFAULT '{"PATRON":1,"KANADA_SATINALMA":0,"SATIS_SORUMLUSU":0,"BAKU_FINANS":0,"BAKU_KURYE":0}'::jsonb,
    kayit_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    guncellenme_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Əsas ilkin butikləri təmin et
INSERT INTO public.firmalar (id, ad, sehir, varsayilan_para_birimi, varsayilan_komisyon_yuzdesi, aciklama, is_demo, onay_durumu, paket, sahip_adi, sahip_telefon, mensei_ulke)
VALUES 
    ('kanada_shopper_baku', 'Kanada Shopper Bakı', 'Bakı', 'AZN', 15.00, 'Əsas Kanada alış-veriş və çatdırılma butiki', false, 'AKTIF', 'PRO', 'Tural', '+994 50 123 45 67', 'CA'),
    ('ayla_boutique', 'Ayla Boutique', 'Gəncə', 'AZN', 12.00, 'Gəncə və Qərb bölgəsi moda butiki', false, 'AKTIF', 'BASLANGIC', 'Ayla X.', '+994 50 765 43 21', 'TR'),
    ('demo_sandbox', 'Sınaq / Demo Sandbox Butiki', 'Bakı', 'AZN', 10.00, 'İctimai sınaq və təlim hesabı (izolyasiyalı)', true, 'AKTIF', 'PRO', 'Demo İstifadəçi', '+994 50 000 00 00', 'CA')
ON CONFLICT (id) DO NOTHING;

-- 2. DƏVƏT LİNKLƏRİ (TEAM INVITATIONS) CƏDVƏLİ
CREATE TABLE IF NOT EXISTS public.davetler (
    id VARCHAR(100) PRIMARY KEY,
    token VARCHAR(100) UNIQUE NOT NULL,
    firma_id VARCHAR(100) NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
    rol VARCHAR(50) NOT NULL, -- 'PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS', 'BAKU_KURYE'
    olusturan_rol VARCHAR(50) DEFAULT 'PATRON',
    durum VARCHAR(30) DEFAULT 'AKTIF', -- 'AKTIF', 'KULLANILDI', 'IPTAL'
    son_kullanma_tarihi TIMESTAMPTZ NOT NULL,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    kullanildi_tarih TIMESTAMPTZ,
    kullanan_adi VARCHAR(150),
    kullanan_telefon VARCHAR(50)
);

-- 3. İSTİFADƏÇİLƏR VƏ HESAB TƏHLÜKƏSİZLİYİ (USERS & AUTH) CƏDVƏLİ
CREATE TABLE IF NOT EXISTS public.kullanicilar (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
    ad_soyad VARCHAR(150) NOT NULL,
    email VARCHAR(150) NOT NULL,
    telefon VARCHAR(50),
    rol VARCHAR(50) NOT NULL, -- 'SUPER_ADMIN', 'PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS', 'BAKU_KURYE'
    sifre_hash VARCHAR(255),
    durum VARCHAR(30) DEFAULT 'BEKLEMEDE_SIFRE', -- 'BEKLEMEDE_SIFRE', 'AKTIF', 'PASIF'
    aktivasyon_token VARCHAR(100),
    token_gecerlilik TIMESTAMPTZ,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. SİPARİŞLƏR CƏDVƏLİNDƏ TENANT_ID VƏ YENİ KOLONLARIN TƏMİNATI
DO $$ 
BEGIN
    -- tenant_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'tenant_id') THEN
        ALTER TABLE public.siparisler ADD COLUMN tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku';
    END IF;

    -- is_demo
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'is_demo') THEN
        ALTER TABLE public.siparisler ADD COLUMN is_demo BOOLEAN DEFAULT FALSE;
    END IF;

    -- baku_kurye_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'baku_kurye_id') THEN
        ALTER TABLE public.siparisler ADD COLUMN baku_kurye_id VARCHAR(100);
    END IF;

    -- baku_kurye_adi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'baku_kurye_adi') THEN
        ALTER TABLE public.siparisler ADD COLUMN baku_kurye_adi VARCHAR(150);
    END IF;

    -- baku_kurye_bolgesi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'baku_kurye_bolgesi') THEN
        ALTER TABLE public.siparisler ADD COLUMN baku_kurye_bolgesi VARCHAR(100);
    END IF;

    -- teslim_tarihi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'teslim_tarihi') THEN
        ALTER TABLE public.siparisler ADD COLUMN teslim_tarihi TIMESTAMPTZ;
    END IF;

    -- teslim_eden_kisi
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'teslim_eden_kisi') THEN
        ALTER TABLE public.siparisler ADD COLUMN teslim_eden_kisi VARCHAR(150);
    END IF;
END $$;

-- Mövcud sifarişlərin tenant_id sahəsini doldur
UPDATE public.siparisler 
SET tenant_id = 'kanada_shopper_baku' 
WHERE tenant_id IS NULL OR tenant_id = '';

-- 5. MÜŞTƏRİLƏR (CRM) CƏDVƏLİ
CREATE TABLE IF NOT EXISTS public.musteriler (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku' REFERENCES public.firmalar(id) ON DELETE CASCADE,
    ad_soyad VARCHAR(150) NOT NULL,
    telefon VARCHAR(50),
    instagram_kullanici_adi VARCHAR(100),
    sehir VARCHAR(100),
    adres TEXT,
    musteri_tipi VARCHAR(50) DEFAULT 'TANIMADIK', -- 'TANIMADIK', 'SADIK_MUSTERI', 'AKRABA_YAKIN', 'VIP'
    toplam_siparis_sayisi INTEGER DEFAULT 0,
    toplam_harcama NUMERIC(12, 2) DEFAULT 0.00,
    kalan_toplam_borc NUMERIC(12, 2) DEFAULT 0.00,
    notlar TEXT,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    son_siparis_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. GƏLƏN MESAJLAR VƏ SİFARİŞ QƏBULU (INBOX) CƏDVƏLİ
CREATE TABLE IF NOT EXISTS public.inbox_mesajlar (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku' REFERENCES public.firmalar(id) ON DELETE CASCADE,
    gonderen_kullanici VARCHAR(100) NOT NULL,
    kaynak VARCHAR(50) NOT NULL, -- 'INSTAGRAM_DM', 'INSTAGRAM_LIVE', 'INSTAGRAM_REELS', 'WHATSAPP'
    konusma_gecmisi TEXT NOT NULL,
    durum VARCHAR(30) DEFAULT 'BEKLEMEDE', -- 'BEKLEMEDE', 'ONAYLANDI', 'REDDEDILDI'
    oneri_siparis JSONB NOT NULL DEFAULT '{}'::jsonb,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. İNDEKS VƏ PERFORMANS OPTİMİZASİYASI
CREATE INDEX IF NOT EXISTS idx_firmalar_onay ON public.firmalar(onay_durumu);
CREATE INDEX IF NOT EXISTS idx_davetler_token ON public.davetler(token);
CREATE INDEX IF NOT EXISTS idx_davetler_firma ON public.davetler(firma_id);
CREATE INDEX IF NOT EXISTS idx_kullanicilar_tenant ON public.kullanicilar(tenant_id);
CREATE INDEX IF NOT EXISTS idx_kullanicilar_email ON public.kullanicilar(email);
CREATE INDEX IF NOT EXISTS idx_kullanicilar_token ON public.kullanicilar(aktivasyon_token);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_id ON public.siparisler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_lojistik ON public.siparisler(tenant_id, lojistik_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_finans ON public.siparisler(tenant_id, finans_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_kurye ON public.siparisler(tenant_id, baku_kurye_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_is_demo ON public.siparisler(is_demo);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_id ON public.musteriler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_telefon ON public.musteriler(tenant_id, telefon);
CREATE INDEX IF NOT EXISTS idx_inbox_tenant_id ON public.inbox_mesajlar(tenant_id);

-- Server-only data access. Browser requests must pass the TOMNAP session API.
-- service_role bypasses RLS; tenant authorization is enforced by that API.
CREATE TABLE IF NOT EXISTS public.oturumlar (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES public.kullanicilar(id) ON DELETE CASCADE,
  csrf_token text NOT NULL CHECK (csrf_token ~ '^[a-f0-9]{64}$'),
  credential_fingerprint text NOT NULL CHECK (credential_fingerprint ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oturumlar_expires_at_idx ON public.oturumlar (expires_at);
CREATE INDEX IF NOT EXISTS oturumlar_user_id_idx ON public.oturumlar (user_id);

DO $$
DECLARE
  target text;
  old_policy record;
  column_list text;
BEGIN
  FOREACH target IN ARRAY ARRAY['firmalar', 'davetler', 'kullanicilar', 'siparisler', 'musteriler', 'inbox_mesajlar', 'kuryeler', 'oturumlar'] LOOP
    IF to_regclass(format('public.%I', target)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
    -- Permissive policies combine with OR: remove previous allow-all policies.
    FOR old_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, target);
    END LOOP;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
    SELECT string_agg(quote_ident(attname), ', ') INTO column_list FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', target)) AND attnum > 0 AND NOT attisdropped;
    -- Table-level REVOKE does not remove previously granted column privileges.
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC, anon, authenticated', column_list, target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', target);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
