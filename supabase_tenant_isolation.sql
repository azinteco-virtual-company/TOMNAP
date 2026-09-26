-- =========================================================================
-- KANADA - AZERBAYCAN E-TİCARET & LOJİSTİK YÖNETİM PLATFORMU
-- ÇOKLU KİRACI (MULTI-TENANT) VERİ İZOLASYONU, İNDEKS VE DDL GÜNCELLEMESİ
-- Bu scripti Supabase Dashboard -> SQL Editor alanında çalıştırabilirsiniz.
-- =========================================================================

-- 1. FİRMALAR / BUTİKLER (TENANTS TABLOSU)
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

-- Varsayılan Temel Butiklerin Varlığını Garantiye Al
INSERT INTO public.firmalar (id, ad, sehir, varsayilan_para_birimi, varsayilan_komisyon_yuzdesi, aciklama, is_demo)
VALUES 
    ('kanada_shopper_baku', 'Kanada Shopper Bakı', 'Bakı', 'AZN', 15.00, 'Əsas Kanada alış-veriş və çatdırılma butiki', false),
    ('ayla_boutique', 'Ayla Boutique', 'Gəncə', 'AZN', 12.00, 'Gəncə və Qərb bölgəsi moda butiki', false),
    ('demo_sandbox', 'Sınaq / Təlim Butiki', 'Bakı', 'AZN', 10.00, 'Test və təlim məqsədli sınaq hesabı', true)
ON CONFLICT (id) DO NOTHING;

-- 2. SİPARİŞLER TABLOSUNDA TENANT_ID GÜVENCESİ
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'siparisler' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.siparisler ADD COLUMN tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku';
    END IF;
END $$;

-- 3. MÜŞTERİLER TABLOSUNDA TENANT_ID GÜVENCESİ
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'musteriler' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.musteriler ADD COLUMN tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku';
    END IF;
END $$;

-- 4. KURYELER TABLOSUNDA TENANT_ID GÜVENCESİ
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'kuryeler' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.kuryeler ADD COLUMN tenant_id VARCHAR(100) DEFAULT 'kanada_shopper_baku';
    END IF;
END $$;

-- 5. GELEN KUTUSU (INBOX) TABLOSUNDA TENANT_ID GÜVENCESİ
CREATE TABLE IF NOT EXISTS public.inbox_mesajlar (
    id VARCHAR(100) PRIMARY KEY,
    tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku' REFERENCES public.firmalar(id) ON DELETE CASCADE,
    gonderen_kullanici VARCHAR(100) NOT NULL,
    kaynak VARCHAR(50) NOT NULL,
    konusma_gecmisi TEXT NOT NULL,
    durum VARCHAR(30) DEFAULT 'BEKLEMEDE',
    oneri_siparis JSONB NOT NULL DEFAULT '{}'::jsonb,
    olusturma_tarihi TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'inbox_mesajlar' 
          AND column_name = 'tenant_id'
    ) THEN
        ALTER TABLE public.inbox_mesajlar ADD COLUMN tenant_id VARCHAR(100) NOT NULL DEFAULT 'kanada_shopper_baku';
    END IF;
END $$;

-- 6. YÜKSEK PERFORMANS VE İZOLASYON İNDEKSLERİ
-- Tenant filtreli sorgular için indeksler; yetkilendirmenin yerine geçmez.
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_id ON public.siparisler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_lojistik ON public.siparisler(tenant_id, lojistik_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_finans ON public.siparisler(tenant_id, finans_durumu);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_kurye ON public.siparisler(tenant_id, baku_kurye_id);
CREATE INDEX IF NOT EXISTS idx_siparisler_tenant_tarih ON public.siparisler(tenant_id, olusturma_tarihi DESC);

CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_id ON public.musteriler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_telefon ON public.musteriler(tenant_id, telefon);
CREATE INDEX IF NOT EXISTS idx_musteriler_tenant_harcama ON public.musteriler(tenant_id, toplam_harcama DESC);

CREATE INDEX IF NOT EXISTS idx_kuryeler_tenant_id ON public.kuryeler(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inbox_tenant_id ON public.inbox_mesajlar(tenant_id);

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
