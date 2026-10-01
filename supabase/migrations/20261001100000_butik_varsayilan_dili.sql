-- Butiğin varsayılan dili (docs/i18n.md; karar 1 Ekim 2026). Yalnız yeni bir kolon.
--
-- tenant_v2_ayarlari.varsayilan_dil: giriş sonrasında arayüz dili, elle seçim yoksa önce
-- bu dilden gelir (cihaz dilinin önünde); yazdırılan belgeler (manifesto, etiket, tahsilat
-- listesi) her zaman bu dildedir. Satırı olmayan butik ve var olan satırlar: 'az'.
--   * Biçim CHECK'i: iki ya da üç küçük harf. Hangi dillerin desteklendiği uygulamadadır
--     (src/i18n/diller.json); sunucu yazarken o listeye göre doğrular.
--   * Kolonu yalnız service_role okur ve yazar (tablo düzeyindeki yetki); tarayıcı rolleri
--     kolon düzeyinde de dışarıda.
-- Migration 9 (20260924140000) yeniden uygulanırsa bu migration da ardından uygulanır.
-- Geri alma: supabase/rollbacks/20261001100000_butik_varsayilan_dili.down.sql
BEGIN;

ALTER TABLE public.tenant_v2_ayarlari
  ADD COLUMN varsayilan_dil text NOT NULL DEFAULT 'az'
  CONSTRAINT tenant_v2_ayarlari_varsayilan_dil_bicimi CHECK (varsayilan_dil ~ '^[a-z]{2,3}$');
REVOKE ALL PRIVILEGES (varsayilan_dil) ON public.tenant_v2_ayarlari FROM PUBLIC, anon, authenticated;
COMMENT ON COLUMN public.tenant_v2_ayarlari.varsayilan_dil IS
  'Boutique default language (docs/i18n.md): interface after login unless chosen manually; '
  'documents always. Format only here; the supported list lives in the application.';

COMMIT;
