-- Para yazma yetkisi (25 Eylül 2026 kararı; OPEN_QUESTIONS 24, 28, 29).
-- Defterde "parayı alan = kaydı yapan". SUPER_ADMIN ekip üyesi değil; kayıt yaparsa
-- butiğin parasını platform yöneticisi almış görünürdü. Bu yüzden SUPER_ADMIN artık
-- ödeme kaydı, ters kayıt ve kasa teslimi YAZAMAZ; defteri, kasayı ve kaçaklar
-- panosunu okumaya devam eder (okuma fonksiyonları ve sunucu okuma rotaları değişmedi).
-- Yazanlar yalnız kendi butiğinin kullanıcıları:
--   ödeme kaydı ve ters kayıt: PATRON, SATIS_SORUMLUSU (yalnız butikte), BAKU_FINANS;
--   kasa teslimi alma: PATRON, BAKU_FINANS.
-- Yalnız üç fonksiyonun yetki satırları değişir (A10 ve A11 gövdeleri); tablo ve veri
-- değişikliği yok.
-- Geri alma: supabase/rollbacks/20260925140000_para_yazma_yetkisi.down.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.tomnap_v2_odeme_kaydet(p_tenant_id text, p_user_id text, p_odeme jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  o public.odemeler;
  v_siparis uuid;
  v_tutar numeric;
  v_kaynak text;
  v_zaman timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_odeme) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_odeme->'tutar_azn') IS DISTINCT FROM 'number'
     OR coalesce(p_odeme->>'siparis_id', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid payment' USING ERRCODE = '22023';
  END IF;
  v_siparis := (p_odeme->>'siparis_id')::uuid;
  v_tutar := (p_odeme->>'tutar_azn')::numeric;
  IF v_tutar <= 0 OR v_tutar >= 1000000 OR v_tutar <> round(v_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;
  v_kaynak := p_odeme->>'kaynak';
  IF v_kaynak IS NULL OR v_kaynak NOT IN ('BUTIK', 'ONLINE') THEN
    RAISE EXCEPTION 'Only boutique and online payments are recorded here' USING ERRCODE = '22023';
  END IF;
  v_zaman := coalesce((p_odeme->>'alma_zamani')::timestamptz, now());
  IF v_zaman > now() + interval '5 minutes' OR v_zaman < now() - interval '366 days' THEN
    RAISE EXCEPTION 'Invalid payment time' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF'
     -- para-yazma-yetkisi (20260925140000): a platform admin writes no money.
     AND rol IN ('PATRON', 'SATIS_SORUMLUSU', 'BAKU_FINANS')
     AND tenant_id = p_tenant_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to record payments for this tenant' USING ERRCODE = 'PT403';
  END IF;
  IF u.rol = 'SATIS_SORUMLUSU' AND v_kaynak <> 'BUTIK' THEN
    RAISE EXCEPTION 'A sales user records boutique payments only' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firmalar f
                  WHERE f.id = p_tenant_id AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')) THEN
    RAISE EXCEPTION 'Company unavailable' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO s FROM public.siparisler WHERE id = v_siparis AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  IF s.model_surumu <> 2 THEN
    RAISE EXCEPTION 'Payments are recorded only for v2 orders' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama)
  VALUES (p_tenant_id, v_siparis, v_tutar, p_odeme->>'yontem', v_kaynak, u.id, v_zaman, u.id,
          nullif(btrim(coalesce(p_odeme->>'aciklama', '')), ''))
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = v_siparis AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.tomnap_v2_odeme_ters_kayit(p_tenant_id text, p_user_id text, p_odeme_id uuid, p_aciklama text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  asil public.odemeler;
  o public.odemeler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' OR p_odeme_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reversal' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_aciklama, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A reversal needs a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF'
     -- para-yazma-yetkisi (20260925140000): a platform admin writes no money.
     AND rol IN ('PATRON', 'SATIS_SORUMLUSU', 'BAKU_FINANS')
     AND tenant_id = p_tenant_id
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to reverse payments for this tenant' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO asil FROM public.odemeler WHERE id = p_odeme_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'PT404'; END IF;
  -- Lock the order first: a concurrent reversal of the same payment waits here and
  -- then finds the first one.
  SELECT * INTO s FROM public.siparisler WHERE id = asil.siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF u.rol = 'SATIS_SORUMLUSU' AND (asil.kaynak <> 'BUTIK' OR asil.kaydeden_kullanici_id <> u.id) THEN
    RAISE EXCEPTION 'A sales user reverses only its own boutique payments' USING ERRCODE = 'PT403';
  END IF;
  IF asil.ters_kayit_odeme_id IS NOT NULL
     OR asil.kasa_teslim_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.odemeler r WHERE r.ters_kayit_odeme_id = asil.id) THEN
    RAISE EXCEPTION 'Payment is a reversal, handed over or already reversed' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id)
  VALUES (p_tenant_id, asil.siparis_id, -asil.tutar_azn, asil.yontem, asil.kaynak, asil.alan_kullanici_id,
          now(), u.id, btrim(p_aciklama), asil.id)
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = asil.siparis_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_odeme_ters_kayit(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_odeme_ters_kayit(text, text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.tomnap_v2_kasa_teslimi(p_tenant_id text, p_user_id text, p_kurye_kullanici_id text,
                                              p_odeme_idleri uuid[], p_tutar numeric, p_aciklama text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  k public.kasa_teslimleri;
  v_sayi integer;
  v_toplam numeric(12, 2);
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_odeme_idleri IS NULL OR cardinality(p_odeme_idleri) NOT BETWEEN 1 AND 5000
     OR array_position(p_odeme_idleri, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(p_odeme_idleri) x) <> cardinality(p_odeme_idleri)
     OR p_tutar IS NULL OR p_tutar <= 0 OR p_tutar <> round(p_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid hand-over' USING ERRCODE = '22023';
  END IF;
  IF p_aciklama IS NOT NULL AND char_length(btrim(p_aciklama)) > 500 THEN
    RAISE EXCEPTION 'Note too long' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF' AND rol IN ('PATRON', 'BAKU_FINANS')
     -- para-yazma-yetkisi (20260925140000): a platform admin takes no cash.
     AND tenant_id = p_tenant_id
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed to take cash for this tenant' USING ERRCODE = 'PT403'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanicilar c
                  WHERE c.id = p_kurye_kullanici_id AND c.tenant_id = p_tenant_id AND c.rol = 'BAKU_KURYE') THEN
    RAISE EXCEPTION 'Courier not found' USING ERRCODE = 'PT404';
  END IF;

  -- Lock the selected rows; a concurrent hand-over of any of them waits and then
  -- finds it closed. A second statement re-checks with a fresh snapshot, so a
  -- reversal committed meanwhile is seen.
  PERFORM 1 FROM public.odemeler o WHERE o.id = ANY (p_odeme_idleri) AND o.tenant_id = p_tenant_id FOR UPDATE;
  SELECT count(*), sum(o.tutar_azn) INTO v_sayi, v_toplam FROM public.odemeler o
   WHERE o.id = ANY (p_odeme_idleri) AND o.tenant_id = p_tenant_id
     AND o.alan_kullanici_id = p_kurye_kullanici_id AND o.kaynak = 'TESLIMAT' AND o.yontem = 'NAKIT'
     AND o.tutar_azn > 0 AND o.ters_kayit_odeme_id IS NULL AND o.kasa_teslim_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.odemeler r WHERE r.ters_kayit_odeme_id = o.id);
  IF v_sayi <> cardinality(p_odeme_idleri) THEN
    RAISE EXCEPTION 'A selected collection is not open cash of this courier' USING ERRCODE = 'PT409';
  END IF;
  IF v_toplam <> p_tutar THEN
    RAISE EXCEPTION 'The amount differs from the selected collections' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.kasa_teslimleri(tenant_id, kurye_kullanici_id, teslim_alan_kullanici_id, tutar_azn, odeme_sayisi, aciklama)
  VALUES (p_tenant_id, p_kurye_kullanici_id, u.id, v_toplam, v_sayi, nullif(btrim(coalesce(p_aciklama, '')), ''))
  RETURNING * INTO k;
  UPDATE public.odemeler SET kasa_teslim_id = k.id
   WHERE id = ANY (p_odeme_idleri) AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('teslim', to_jsonb(k),
    'bakiye', public.tomnap_v2_kurye_bakiyeleri(p_tenant_id, p_kurye_kullanici_id)->0);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_kasa_teslimi(text, text, text, uuid[], numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_kasa_teslimi(text, text, text, uuid[], numeric, text) TO service_role;

COMMIT;
