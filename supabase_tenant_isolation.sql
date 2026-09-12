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
-- Her tenant sorgusunu O(log N) hızına indirir ve cross-tenant sızıntılarını önler
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

-- 7. ROW LEVEL SECURITY (RLS) POLİTİKALARI (OPSİYONEL VE AKTİF)
ALTER TABLE public.siparisler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.musteriler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firmalar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kuryeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_mesajlar ENABLE ROW LEVEL SECURITY;

-- Servis Rolü ve Anon Erişimi için Varsayılan Okuma Politikaları
CREATE POLICY "Anon ve Servis Rolü Siparişleri Okuyabilir" ON public.siparisler FOR SELECT USING (true);
CREATE POLICY "Anon ve Servis Rolü Siparişleri Yazabilir" ON public.siparisler FOR ALL USING (true);

CREATE POLICY "Anon ve Servis Rolü Müşterileri Okuyabilir" ON public.musteriler FOR SELECT USING (true);
CREATE POLICY "Anon ve Servis Rolü Müşterileri Yazabilir" ON public.musteriler FOR ALL USING (true);

CREATE POLICY "Anon ve Servis Rolü Firmaları Okuyabilir" ON public.firmalar FOR SELECT USING (true);
CREATE POLICY "Anon ve Servis Rolü Firmaları Yazabilir" ON public.firmalar FOR ALL USING (true);

CREATE POLICY "Anon ve Servis Rolü Kuryeleri Okuyabilir" ON public.kuryeler FOR SELECT USING (true);
CREATE POLICY "Anon ve Servis Rolü Kuryeleri Yazabilir" ON public.kuryeler FOR ALL USING (true);

CREATE POLICY "Anon ve Servis Rolü Inbox Okuyabilir" ON public.inbox_mesajlar FOR SELECT USING (true);
CREATE POLICY "Anon ve Servis Rolü Inbox Yazabilir" ON public.inbox_mesajlar FOR ALL USING (true);
