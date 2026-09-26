-- Ödeme işlem anahtarı (Codex R3 F15). Yeni kolon, yeni indeks ve yeni fonksiyon;
-- mevcut tablo ve veri değişmez (var olan ödemelerin anahtarı NULL kalır).
-- Sunucu ödeme RPC'sinden sonra defteri yeniden okuyordu; o okuma başarısız olunca kişi
-- kaydedilmiş bir ödeme için hata görüyor, yeniden deniyor ve ödeme iki kez yazılıyordu.
-- Sunucu artık RPC'nin döndürdüğü toplamları kullanır. Bu migration her ödeme niyetine
-- veritabanında benzersiz bir işlem anahtarı verir: aynı anahtarla gelen tekrar yeni kayıt
-- yazmaz, ilk ödemeyi döndürür ('tekrar': true); aynı anahtar başka bir ödeme için
-- kullanılırsa PT412. Kapsam: butik/online ödeme (tomnap_v2_odeme_kaydet) ve kurye
-- tahsilatı (beş argümanlı yeni tomnap_v2_kurye_tahsilati; dört argümanlı olan anahtarsız
-- çağrıyı ona devreder). Ters kayıt zaten ödeme başına bir kez yazılır (tek ters kayıt).
-- Geri alma: supabase/rollbacks/20260926100000_odeme_islem_anahtari.down.sql

BEGIN;

ALTER TABLE public.odemeler ADD COLUMN islem_anahtari uuid;
-- Table-level grants of 20260925110000 already give service_role SELECT and INSERT only;
-- nobody else gets the new column.
REVOKE ALL PRIVILEGES (islem_anahtari) ON public.odemeler FROM PUBLIC, anon, authenticated;
CREATE UNIQUE INDEX odemeler_islem_anahtari ON public.odemeler (tenant_id, islem_anahtari)
  WHERE islem_anahtari IS NOT NULL;

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
  v_anahtar uuid;
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
  -- Operation key of this payment intent (Codex R3 F15): optional UUID.
  IF jsonb_typeof(p_odeme->'islem_anahtari') IS NOT NULL AND jsonb_typeof(p_odeme->'islem_anahtari') <> 'null' THEN
    IF coalesce(p_odeme->>'islem_anahtari', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Invalid operation key' USING ERRCODE = '22023';
    END IF;
    v_anahtar := (p_odeme->>'islem_anahtari')::uuid;
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
  -- A retry of a recorded intent returns that payment and records nothing (Codex R3 F15).
  -- The order lock above makes a concurrent retry wait and then find the first one.
  IF v_anahtar IS NOT NULL THEN
    SELECT * INTO o FROM public.odemeler WHERE tenant_id = p_tenant_id AND islem_anahtari = v_anahtar;
    IF FOUND THEN
      IF o.siparis_id <> v_siparis OR o.tutar_azn <> v_tutar OR o.kaynak <> v_kaynak
         OR o.yontem IS DISTINCT FROM p_odeme->>'yontem' OR o.kaydeden_kullanici_id <> u.id THEN
        RAISE EXCEPTION 'Operation key already used for another payment' USING ERRCODE = 'PT412';
      END IF;
      RETURN jsonb_build_object('odeme', to_jsonb(o), 'tekrar', true, 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
    END IF;
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama, islem_anahtari)
  VALUES (p_tenant_id, v_siparis, v_tutar, p_odeme->>'yontem', v_kaynak, u.id, v_zaman, u.id,
          nullif(btrim(coalesce(p_odeme->>'aciklama', '')), ''), v_anahtar)
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = v_siparis AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'tekrar', false, 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) TO service_role;

CREATE FUNCTION public.tomnap_v2_kurye_tahsilati(p_tenant_id text, p_user_id text, p_siparis_id uuid, p_tutar numeric,
                                                 p_islem_anahtari uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  c public.kuryeler;
  s public.siparisler;
  o public.odemeler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' OR p_siparis_id IS NULL THEN
    RAISE EXCEPTION 'Invalid collection' USING ERRCODE = '22023';
  END IF;
  IF p_tutar IS NULL OR p_tutar <= 0 OR p_tutar >= 1000000 OR p_tutar <> round(p_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.kullanicilar u JOIN public.firmalar f ON f.id = u.tenant_id
   WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id AND u.rol = 'BAKU_KURYE' AND u.durum = 'AKTIF'
     AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')
   FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active courier user not found' USING ERRCODE = 'PT403'; END IF;
  SELECT * INTO c FROM public.kuryeler WHERE tenant_id = p_tenant_id AND kullanici_id = p_user_id AND aktif IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active courier record for this user' USING ERRCODE = 'PT403'; END IF;

  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  IF s.baku_kurye_id IS DISTINCT FROM c.id THEN
    RAISE EXCEPTION 'The order is assigned to another courier' USING ERRCODE = 'PT403';
  END IF;
  IF s.model_surumu <> 2 THEN RAISE EXCEPTION 'Only v2 orders have a ledger' USING ERRCODE = 'PT409'; END IF;
  IF NOT (s.lojistik_durumu = 'BAKU_DAGITIM_ARKADAS'
          OR (s.lojistik_durumu = 'TESLIM_EDILDI' AND s.kurye_teslim_kullanici_id = p_user_id)) THEN
    RAISE EXCEPTION 'The order is not out for delivery with this courier' USING ERRCODE = 'PT409';
  END IF;
  -- A retry of a recorded intent returns that collection (Codex R3 F15). It comes before
  -- the amount check: the first collection already lowered what is due.
  IF p_islem_anahtari IS NOT NULL THEN
    SELECT * INTO o FROM public.odemeler WHERE tenant_id = p_tenant_id AND islem_anahtari = p_islem_anahtari;
    IF FOUND THEN
      IF o.siparis_id <> s.id OR o.tutar_azn <> p_tutar OR o.kaynak <> 'TESLIMAT' OR o.alan_kullanici_id <> p_user_id THEN
        RAISE EXCEPTION 'Operation key already used for another payment' USING ERRCODE = 'PT412';
      END IF;
      RETURN jsonb_build_object('odeme', to_jsonb(o), 'tekrar', true, 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
    END IF;
  END IF;
  IF p_tutar > s.kalan_tutar THEN
    RAISE EXCEPTION 'More than the amount due' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, islem_anahtari)
  VALUES (p_tenant_id, s.id, p_tutar, 'NAKIT', 'TESLIMAT', p_user_id, now(), p_user_id, p_islem_anahtari)
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'tekrar', false, 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric, uuid) TO service_role;

-- The four-argument call (no key) goes through the same body.
CREATE OR REPLACE FUNCTION public.tomnap_v2_kurye_tahsilati(p_tenant_id text, p_user_id text, p_siparis_id uuid, p_tutar numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
BEGIN
  RETURN public.tomnap_v2_kurye_tahsilati(p_tenant_id, p_user_id, p_siparis_id, p_tutar, NULL::uuid);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric) TO service_role;

COMMIT;
