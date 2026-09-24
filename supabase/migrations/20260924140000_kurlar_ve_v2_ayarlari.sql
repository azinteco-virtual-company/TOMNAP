-- Kur tablosu ve v2 tenant ayarları (Faz A, A7; K4, K8). Yalnız yeni tablolar.
--
-- kurlar: tenant'ın elle girdiği kurlar (1 birim para_birimi = azn_karsiligi AZN).
--   Faturalara öneri kaynağıdır; fatura kendi kurunu ayrıca sabitler (K4).
--   Append-only, iki katmanda (awb_match_approvals deseni):
--     * yetkiler: UPDATE, DELETE ve TRUNCATE service_role dahil her API
--       rolünden alınır; yalnız SELECT ve INSERT verilir;
--     * tetikleyiciler: BEFORE UPDATE/DELETE (satır) ve BEFORE TRUNCATE hata
--       verir; tablo sahibini ve sonradan yanlışlıkla verilecek bir GRANT'ı da durdurur.
--   Düzeltme yeni bir satırdır; güncel kur en son girilen satırdır.
-- tenant_v2_ayarlari: tenant başına bir satır. Satır yoksa uygulama varsayılanları
--   kullanır (aylık beyan sınırı 300 USD, prim oranı %5, kg fiyatı tanımsız).
--
-- İki tabloda da yabancı anahtar yok: firmalar tablosuna dokunulmaz ve firma
-- silme davranışı değişmez. Tenant izolasyonu uygulama katmanındadır (service_role).
-- Geri alma: supabase/rollbacks/20260924140000_kurlar_ve_v2_ayarlari.down.sql
BEGIN;

CREATE TABLE public.kurlar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  para_birimi text NOT NULL CHECK (para_birimi IN ('CAD', 'USD')),
  tarih date NOT NULL CHECK (tarih >= DATE '2000-01-01'),
  azn_karsiligi numeric(12, 6) NOT NULL CHECK (azn_karsiligi > 0 AND azn_karsiligi < 100),
  kaynak text CHECK (kaynak IS NULL OR char_length(kaynak) BETWEEN 1 AND 100),
  giren_kullanici_id text NOT NULL CHECK (char_length(giren_kullanici_id) BETWEEN 1 AND 100),
  olusturma_zamani timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kurlar_tenant_para_idx ON public.kurlar (tenant_id, para_birimi, olusturma_zamani DESC);

ALTER TABLE public.kurlar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kurlar FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.kurlar FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.kurlar'::regclass AND attnum > 0 AND NOT attisdropped;
  -- Table-level REVOKE does not remove column privileges; revoke both.
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.kurlar FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
GRANT SELECT, INSERT ON public.kurlar TO service_role;

CREATE FUNCTION public.tomnap_kurlar_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'kurlar is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.tomnap_kurlar_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kurlar_append_only_rows
  BEFORE UPDATE OR DELETE ON public.kurlar
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_kurlar_append_only();
CREATE TRIGGER kurlar_append_only_truncate
  BEFORE TRUNCATE ON public.kurlar
  FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_kurlar_append_only();

CREATE TABLE public.tenant_v2_ayarlari (
  tenant_id text PRIMARY KEY CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  -- K8: alıcı başına aylık toplam beyan sınırı (USD); kesin kural ilk gerçek butikten önce doğrulanacak.
  aylik_beyan_sinir_usd numeric(10, 2) NOT NULL DEFAULT 300 CHECK (aylik_beyan_sinir_usd > 0 AND aylik_beyan_sinir_usd <= 100000),
  varsayilan_kg_fiyati_azn numeric(10, 2) CHECK (varsayilan_kg_fiyati_azn IS NULL OR varsayilan_kg_fiyati_azn BETWEEN 0 AND 10000),
  -- K11: prim = oran × max(0, prim öncesi kâr); varsayılan oran %5.
  prim_orani_varsayilan numeric(5, 4) NOT NULL DEFAULT 0.05 CHECK (prim_orani_varsayilan BETWEEN 0 AND 1),
  guncelleyen_kullanici_id text NOT NULL CHECK (char_length(guncelleyen_kullanici_id) BETWEEN 1 AND 100),
  guncellenme_zamani timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_v2_ayarlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_v2_ayarlari FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_v2_ayarlari FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.tenant_v2_ayarlari'::regclass AND attnum > 0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.tenant_v2_ayarlari FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
-- Settings are only read and upserted; a row is never deleted through the API.
GRANT SELECT, INSERT, UPDATE ON public.tenant_v2_ayarlari TO service_role;

COMMIT;
