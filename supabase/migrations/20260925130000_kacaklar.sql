-- Kaçaklar panosu v0 (Faz A, A12; spec §9): Q4 ve Q5. Yalnız yeni, salt okunur
-- fonksiyonlar (STABLE, SECURITY INVOKER, service_role). Tablo ve veri değişikliği yok.
--
-- Q4 Teslim edildi, ödenmedi: lojistik_durumu TESLIM_EDILDI ve kalan_tutar > 0 olan
--   siparişler, v1 ve v2 (v2'de alinan_tutar defterden türetilir, K20). Faz A'da ürün
--   birimi yok; "bütün birimler teslim edildi" yerine siparişin lojistik durumu kullanılır.
--   Yaş: teslim tarihinden bu yana gün. Eşik varsayılanı 0 gün.
-- Q5 Kuryede bekleyen nakit: bakiyesi (Σ nakit − Σ kasa teslimi) > 0 olan ve en eski açık
--   tahsilatı eşikten (varsayılan 24 saat) eski kuryeler. Kasaya teslim edilen nakit açık
--   sayılmaz; ters kaydı olan tahsilat da.
-- Eşikler: spec tenant_v2_ayarlari'nı gösteriyor; o tabloya dokunmamak için v0'da
--   parametre varsayılanı (OPEN_QUESTIONS 30).
-- Geri alma: supabase/rollbacks/20260925130000_kacaklar.down.sql
BEGIN;

CREATE FUNCTION public.tomnap_v2_kacak_q4(p_tenant_id text, p_min_gun integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE sonuc jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_min_gun IS NULL OR p_min_gun NOT BETWEEN 0 AND 3650 THEN
    RAISE EXCEPTION 'Invalid leak query' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'musteri_adi', s.musteri_adi, 'model_surumu', s.model_surumu,
      'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar, 'kalan_tutar', s.kalan_tutar,
      'finans_durumu', s.finans_durumu, 'teslim_tarihi', s.teslim_tarihi,
      'baku_kurye_adi', s.baku_kurye_adi, 'sahip_kullanici_id', s.sahip_kullanici_id,
      'yas_gun', floor(extract(epoch FROM now() - coalesce(s.teslim_tarihi, s.guncellenme_tarihi, s.olusturma_tarihi)) / 86400)::integer)
      ORDER BY coalesce(s.teslim_tarihi, s.guncellenme_tarihi, s.olusturma_tarihi), s.id), '[]'::jsonb)
    INTO sonuc
    FROM (SELECT * FROM public.siparisler
           WHERE tenant_id = p_tenant_id AND lojistik_durumu = 'TESLIM_EDILDI' AND kalan_tutar > 0
             AND coalesce(teslim_tarihi, guncellenme_tarihi, olusturma_tarihi) <= now() - make_interval(days => p_min_gun)
           ORDER BY coalesce(teslim_tarihi, guncellenme_tarihi, olusturma_tarihi), id
           LIMIT 500) s;
  RETURN sonuc;
END $$;

CREATE FUNCTION public.tomnap_v2_kacak_q5(p_tenant_id text, p_min_saat integer DEFAULT 24)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE sonuc jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_min_saat IS NULL OR p_min_saat NOT BETWEEN 0 AND 87600 THEN
    RAISE EXCEPTION 'Invalid leak query' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'kurye_kullanici_id', b->>'kurye_kullanici_id', 'ad_soyad', b->>'ad_soyad',
      'bakiye', (b->>'tahsilat_toplami')::numeric - (b->>'teslim_toplami')::numeric,
      'acik_tahsilat_sayisi', jsonb_array_length(b->'acik_tahsilatlar'),
      'en_eski_tahsilat', en_eski,
      'bekleme_saat', floor(extract(epoch FROM now() - en_eski) / 3600)::integer)
      ORDER BY en_eski, b->>'kurye_kullanici_id'), '[]'::jsonb)
    INTO sonuc
    FROM (SELECT b, (SELECT min((a->>'alma_zamani')::timestamptz) FROM jsonb_array_elements(b->'acik_tahsilatlar') a) AS en_eski
            FROM jsonb_array_elements(public.tomnap_v2_kurye_bakiyeleri(p_tenant_id)) b) q
   WHERE (b->>'tahsilat_toplami')::numeric - (b->>'teslim_toplami')::numeric > 0
     AND en_eski <= now() - make_interval(hours => p_min_saat);
  RETURN sonuc;
END $$;

REVOKE ALL ON FUNCTION public.tomnap_v2_kacak_q4(text, integer), public.tomnap_v2_kacak_q5(text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_kacak_q4(text, integer), public.tomnap_v2_kacak_q5(text, integer)
  TO service_role;

COMMIT;
