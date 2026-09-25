-- v1 sipariş düzenlemesi tek transaction'da (Codex R3 F1/F2/F9). Yalnız yeni bir fonksiyon.
--
-- PATCH /api/siparisler/:id, siparişi okuyup satırın tamamını geri yazıyordu. Arada
-- yazılan bir ödeme (alinan_tutar) ya da AWB onayı (uluslararasi_kargo_kodu) eski
-- değerle eziliyordu. Bu fonksiyon:
--   * yalnız p_degisiklik'teki kolonları yazar (değişmeyen kolona dokunmaz);
--   * p_beklenen'deki her kolonun hâlâ o değerde olduğunu satırı kilitleyerek doğrular
--     (iyimser kilit); biri değiştiyse PT409;
--   * atama, teslim, sahip ve sürüm kolonlarını yazmaz (kendi işlemleri var);
--   * v2 siparişte satırlardan türetilen kolonları yazmaz (K20; para_birimi dahil).
-- model_surumu okuması to_jsonb üzerinden: v2 migration'ları (7–15) uygulanmamış bir
-- şemada da çalışır, bu yüzden Deploy 1 ile uygulanabilir.
-- Rol ve alan yetkisi sunucuda (src/server/routes/siparisler.ts) kalır.
-- Geri alma: supabase/rollbacks/20260925150000_siparis_guncelle.down.sql
BEGIN;

CREATE FUNCTION public.tomnap_siparis_guncelle(p_tenant_id text, p_siparis_id uuid, p_degisiklik jsonb, p_beklenen jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  s public.siparisler;
  eski jsonb;
  anahtar text;
  kolonlar text;
  sonuc jsonb;
  -- Written only by their own transactions (assignment, delivery, v2 RPCs) or never.
  korunan constant text[] := ARRAY['id', 'tenant_id', 'olusturma_tarihi', 'guncellenme_tarihi',
    'kurye_atama_surumu', 'kurye_teslim_kullanici_id', 'kurye_teslim_alan', 'baku_kurye_id',
    'baku_kurye_adi', 'baku_kurye_bolgesi', 'model_surumu', 'sahip_kullanici_id'];
  v2_turetilen constant text[] := ARRAY['toplam_tutar', 'alinan_tutar', 'finans_durumu', 'lojistik_durumu',
    'urun_aciklamasi', 'adet', 'beden_veya_olcu', 'renk', 'para_birimi'];
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' OR p_siparis_id IS NULL
     OR jsonb_typeof(p_degisiklik) IS DISTINCT FROM 'object' OR p_degisiklik = '{}'::jsonb
     OR jsonb_typeof(p_beklenen) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid order update' USING ERRCODE = '22023';
  END IF;
  -- The lock makes a concurrent writer finish first; the checks below then see its values.
  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  eski := to_jsonb(s);
  FOR anahtar IN SELECT jsonb_object_keys(p_beklenen) LOOP
    IF coalesce(eski -> anahtar, 'null'::jsonb) IS DISTINCT FROM coalesce(p_beklenen -> anahtar, 'null'::jsonb) THEN
      RAISE EXCEPTION 'Order changed meanwhile: %', anahtar USING ERRCODE = 'PT409';
    END IF;
  END LOOP;
  FOR anahtar IN SELECT jsonb_object_keys(p_degisiklik) LOOP
    IF anahtar = ANY (korunan) THEN
      RAISE EXCEPTION 'Not editable here: %', anahtar USING ERRCODE = 'PT403';
    END IF;
    IF eski ->> 'model_surumu' = '2' AND anahtar = ANY (v2_turetilen) THEN
      RAISE EXCEPTION 'Derived from the v2 lines: %', anahtar USING ERRCODE = 'PT409';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
                    WHERE a.attrelid = 'public.siparisler'::regclass AND a.attname = anahtar AND a.attnum > 0
                      AND NOT a.attisdropped AND a.attgenerated = '' AND a.attidentity = '') THEN
      RAISE EXCEPTION 'Unknown order column: %', anahtar USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Only real, checked column names are interpolated, quoted with %I.
  SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO kolonlar FROM jsonb_object_keys(p_degisiklik) k;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a
              WHERE a.attrelid = 'public.siparisler'::regclass AND a.attname = 'guncellenme_tarihi'
                AND a.attnum > 0 AND NOT a.attisdropped) THEN
    kolonlar := kolonlar || ', guncellenme_tarihi = now()';
  END IF;
  EXECUTE format('UPDATE public.siparisler t SET %s FROM jsonb_populate_record(NULL::public.siparisler, $1) r
                   WHERE t.id = $2 AND t.tenant_id = $3 RETURNING to_jsonb(t.*)', kolonlar)
    INTO sonuc USING p_degisiklik, p_siparis_id, p_tenant_id;
  RETURN sonuc;
END $$;
REVOKE ALL ON FUNCTION public.tomnap_siparis_guncelle(text, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_siparis_guncelle(text, uuid, jsonb, jsonb) TO service_role;

COMMIT;
