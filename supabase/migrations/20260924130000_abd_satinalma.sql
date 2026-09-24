-- ABD_SATINALMA rolü (Faz A, A5; K18). Mevcut tablolar ve firmalar.rol_limitleri
-- varsayılanı değişmez; kaydında ABD_SATINALMA anahtarı olmayan firmada kota
-- tomnap_rol_kota_varsayilani(text) ile varsayılana düşer (diğer rollerde eksik
-- anahtar bugünkü gibi 0). src/shared/roller.ts'deki EKIP_ROLLERI,
-- EKSIK_ANAHTAR_KOTASI ve ROL_GRUPLARI.SHIPPING ile aynı; tests/server/rolKatalogu.test.ts
-- karşılaştırır.
-- Geri alma: supabase/rollbacks/20260924130000_abd_satinalma.down.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.tomnap_gecerli_rol(p_rol text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT coalesce(p_rol IN ('PATRON','KANADA_SATINALMA','ABD_SATINALMA','SATIS_SORUMLUSU','BAKU_FINANS','BAKU_KURYE'), false)
$$;

CREATE FUNCTION public.tomnap_rol_kota_varsayilani(p_rol text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path='' AS $$
  SELECT CASE p_rol WHEN 'ABD_SATINALMA' THEN 2 ELSE 0 END
$$;
REVOKE ALL ON FUNCTION public.tomnap_rol_kota_varsayilani(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_rol_kota_varsayilani(text) TO service_role;

-- CREATE OR REPLACE mevcut yetkileri korur (yalnız service_role çalıştırabilir).
CREATE OR REPLACE FUNCTION public.tomnap_create_invite(p_invite jsonb,p_email_job jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE f public.firmalar; d public.davetler; n integer; lim integer; r text := p_invite->>'rol';
BEGIN
  SELECT * INTO f FROM public.firmalar WHERE id=p_invite->>'firma_id' FOR UPDATE;
  IF NOT FOUND OR f.onay_durumu IS DISTINCT FROM 'AKTIF' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Company unavailable'; END IF;
  IF NOT public.tomnap_gecerli_rol(r) OR coalesce((p_invite->>'son_kullanma_tarihi')::timestamptz > now(),false)=false THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  lim := coalesce((f.rol_limitleri->>r)::integer,public.tomnap_rol_kota_varsayilani(r));
  SELECT count(*) INTO n FROM public.kullanicilar WHERE tenant_id=f.id AND rol=r AND durum IS DISTINCT FROM 'PASIF';
  IF n >= lim THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Role quota exceeded'; END IF;
  INSERT INTO public.davetler(id,token,firma_id,rol,olusturan_rol,durum,son_kullanma_tarihi,email,kullanan_adi)
  VALUES(p_invite->>'id',p_invite->>'token',f.id,r,p_invite->>'olusturan_rol','AKTIF',(p_invite->>'son_kullanma_tarihi')::timestamptz,nullif(lower(btrim(p_invite->>'email')),''),p_invite->>'kullanan_adi') RETURNING * INTO d;
  PERFORM public.tomnap_queue_onboarding_email(p_email_job,f.id);
  RETURN jsonb_build_object('invite',to_jsonb(d),'remaining',lim-n);
END $$;

CREATE OR REPLACE FUNCTION public.tomnap_accept_invite(p_token text,p_user jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE tid text; f public.firmalar; d public.davetler; u public.kullanicilar; n integer; lim integer;
BEGIN
  SELECT firma_id INTO tid FROM public.davetler WHERE token=p_token;
  IF tid IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  SELECT * INTO f FROM public.firmalar WHERE id=tid FOR UPDATE;
  IF NOT FOUND OR f.onay_durumu IS DISTINCT FROM 'AKTIF' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Company unavailable'; END IF;
  SELECT * INTO d FROM public.davetler WHERE token=p_token AND firma_id=tid FOR UPDATE;
  IF NOT FOUND OR d.durum IS DISTINCT FROM 'AKTIF' OR d.son_kullanma_tarihi <= now()
    OR NOT public.tomnap_gecerli_rol(d.rol) OR coalesce(p_user->>'sifre_hash','')=''
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  IF nullif(lower(btrim(d.email)),'') IS NOT NULL AND lower(btrim(p_user->>'email')) IS DISTINCT FROM lower(btrim(d.email)) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Invitation contact mismatch'; END IF;
  lim := coalesce((f.rol_limitleri->>d.rol)::integer,public.tomnap_rol_kota_varsayilani(d.rol));
  SELECT count(*) INTO n FROM public.kullanicilar WHERE tenant_id=tid AND rol=d.rol AND durum IS DISTINCT FROM 'PASIF';
  IF n >= lim THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Role quota exceeded'; END IF;
  INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,telefon,rol,sifre_hash,durum)
  VALUES(p_user->>'id',tid,p_user->>'ad_soyad',coalesce(nullif(lower(btrim(d.email)),''),lower(btrim(p_user->>'email'))),p_user->>'telefon',d.rol,p_user->>'sifre_hash','AKTIF') RETURNING * INTO u;
  UPDATE public.davetler SET durum='KULLANILDI',kullanan_adi=u.ad_soyad,kullanan_telefon=u.telefon,kullanildi_tarih=now() WHERE id=d.id;
  UPDATE public.firmalar SET aktif_kullanici_sayilari=jsonb_set(coalesce(aktif_kullanici_sayilari,'{}'::jsonb),ARRAY[d.rol],to_jsonb(n+1),true) WHERE id=tid RETURNING * INTO f;
  RETURN jsonb_build_object('firma',to_jsonb(f),'user',to_jsonb(u));
END $$;

-- AWB yazabilen roller = ROL_GRUPLARI.SHIPPING (API allowlist'iyle aynı).
CREATE OR REPLACE FUNCTION public.tomnap_approve_awb_matches(p_tenant_id text, p_user_id text, p_manifest jsonb, p_matches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  item jsonb;
  holders jsonb;
  current_order public.siparisler;
  next_order public.siparisler;
  current_awb text;
  awb text;
  written integer := 0;
  rejected jsonb := '[]'::jsonb;
  applied jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_user_id IS NULL OR p_user_id !~ '^[A-Za-z0-9_.@-]{1,100}$'
     OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_manifest->'dosyaAdi') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_manifest->'sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid AWB approval' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_manifest->>'dosyaAdi') NOT BETWEEN 1 AND 255 OR p_manifest->>'dosyaAdi' ~ '[[:cntrl:]]'
     OR p_manifest->>'sha256' !~ '^[a-f0-9]{64}$' OR jsonb_array_length(p_matches) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid AWB approval' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'siparisId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'takipNo') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'satirNo') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'eslesmeTuru') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'isimPuani') IS DISTINCT FROM 'number'
       OR coalesce(jsonb_typeof(item->'agirlikKg'), 'null') NOT IN ('null', 'number') THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    -- AWB codes arrive normalized by the application (uppercase, no whitespace).
    IF item->>'siparisId' !~ '^[A-Za-z0-9_-]{1,100}$'
       OR item->>'takipNo' !~ '^[A-Z0-9][A-Z0-9-]{3,39}$'
       OR item->>'satirNo' !~ '^[1-9][0-9]{0,5}$'
       OR item->>'eslesmeTuru' NOT IN ('TELEFON', 'SIPARIS_KODU', 'ISIM') THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    IF (item->>'satirNo')::integer > 100000 OR (item->>'isimPuani')::numeric < 0 OR (item->>'isimPuani')::numeric > 1 THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item->'agirlikKg') = 'number' THEN
      IF (item->>'agirlikKg')::numeric <= 0 OR (item->>'agirlikKg')::numeric > 1000 THEN
        RAISE EXCEPTION 'Invalid cargo weight' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- An ambiguous selection (one order, one AWB or one manifest row twice) is never resolved here.
  IF (SELECT count(*) <> count(DISTINCT lower(value->>'siparisId'))
             OR count(*) <> count(DISTINCT value->>'takipNo')
             OR count(*) <> count(DISTINCT value->>'satirNo')
        FROM jsonb_array_elements(p_matches)) THEN
    RAISE EXCEPTION 'Duplicate order, AWB or manifest row in approval' USING ERRCODE = '22023';
  END IF;
  -- Defense in depth: the approving user must be active in this tenant and allowed to set AWBs.
  IF NOT EXISTS (SELECT 1 FROM public.kullanicilar u
                  WHERE u.id = p_user_id AND u.durum = 'AKTIF'
                    AND u.rol IN ('SUPER_ADMIN', 'PATRON', 'KANADA_SATINALMA', 'ABD_SATINALMA')
                    AND (u.tenant_id = p_tenant_id OR u.rol = 'SUPER_ADMIN')) THEN
    RAISE EXCEPTION 'Approving user is not allowed for this tenant' USING ERRCODE = 'PT403';
  END IF;

  -- One approval per tenant at a time: two concurrent requests cannot put the
  -- same AWB on two orders. Selected rows are locked in a stable order.
  PERFORM pg_advisory_xact_lock(hashtextextended('tomnap-awb-confirm:' || p_tenant_id, 0));
  PERFORM 1 FROM public.siparisler s
    WHERE s.tenant_id = p_tenant_id
      AND s.id::text IN (SELECT lower(value->>'siparisId') FROM jsonb_array_elements(p_matches))
    ORDER BY s.id FOR UPDATE;

  -- Current holders of the requested AWB codes inside this tenant only.
  SELECT coalesce(jsonb_object_agg(h.normalized, h.ids), '{}'::jsonb) INTO holders
    FROM (SELECT upper(regexp_replace(normalize(o.uluslararasi_kargo_kodu, NFKC), '\s', '', 'g')) AS normalized,
                 jsonb_agg(o.id::text) AS ids
            FROM public.siparisler o
           WHERE o.tenant_id = p_tenant_id AND coalesce(o.uluslararasi_kargo_kodu, '') <> ''
           GROUP BY 1) h
   WHERE h.normalized IN (SELECT value->>'takipNo' FROM jsonb_array_elements(p_matches));

  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    awb := item->>'takipNo';
    current_order := NULL;
    SELECT * INTO current_order FROM public.siparisler s
      WHERE s.tenant_id = p_tenant_id AND s.id::text = lower(item->>'siparisId');
    IF current_order.id IS NULL THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'SIPARIS_BULUNAMADI'));
      CONTINUE;
    END IF;
    current_awb := upper(regexp_replace(normalize(coalesce(current_order.uluslararasi_kargo_kodu, ''), NFKC), '\s', '', 'g'));
    IF current_awb = awb THEN
      -- Lost-response retry: already attached, nothing written, no new approval row.
      applied := applied || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'tekrar', true));
    ELSIF current_order.lojistik_durumu::text = 'TESLIM_EDILDI' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'TESLIM_EDILDI'));
    ELSIF current_awb <> '' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'MEVCUT_AWB',
        'mevcutAwb', current_order.uluslararasi_kargo_kodu));
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(holders->awb, '[]'::jsonb)) holder
                   WHERE holder <> current_order.id::text) THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'AWB_BASKA_SIPARISTE'));
    ELSE
      pending := pending || jsonb_build_array(item || jsonb_build_object('orderId', current_order.id::text));
    END IF;
  END LOOP;

  IF jsonb_array_length(rejected) > 0 THEN
    RETURN jsonb_build_object('basarili', false, 'uygulananlar', '[]'::jsonb, 'reddedilenler', rejected, 'kayitSayisi', 0);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(pending) LOOP
    SELECT * INTO current_order FROM public.siparisler s
      WHERE s.tenant_id = p_tenant_id AND s.id::text = item->>'orderId';
    -- Existing status values are kept; only pre-flight orders move to international cargo.
    next_order := jsonb_populate_record(current_order, jsonb_build_object(
      'uluslararasi_kargo_kodu', item->>'takipNo',
      'lojistik_durumu', CASE WHEN current_order.lojistik_durumu::text IN ('KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO')
                              THEN 'ULUSLARARASI_KARGO' ELSE current_order.lojistik_durumu::text END));
    UPDATE public.siparisler SET
      uluslararasi_kargo_kodu = next_order.uluslararasi_kargo_kodu,
      lojistik_durumu = next_order.lojistik_durumu,
      ek_veriler = coalesce(current_order.ek_veriler, '{}'::jsonb)
        || CASE WHEN jsonb_typeof(item->'agirlikKg') = 'number'
                THEN jsonb_build_object('kargo_agirligi_kg', item->'agirlikKg') ELSE '{}'::jsonb END
        || jsonb_build_object('guncellenme_tarihi', now())
    WHERE id = current_order.id AND tenant_id = p_tenant_id;
    INSERT INTO public.awb_match_approvals(tenant_id, siparis_id, awb, manifest_dosya_adi, manifest_sha256,
      manifest_satir_no, eslesme_turu, isim_puani, onaylayan_kullanici_id)
    VALUES (p_tenant_id, current_order.id, item->>'takipNo', p_manifest->>'dosyaAdi', p_manifest->>'sha256',
      (item->>'satirNo')::integer, item->>'eslesmeTuru', round((item->>'isimPuani')::numeric, 3), p_user_id);
    written := written + 1;
    applied := applied || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
      'siparisId', item->>'siparisId', 'takipNo', item->>'takipNo', 'tekrar', false));
  END LOOP;
  RETURN jsonb_build_object('basarili', true, 'uygulananlar', applied, 'reddedilenler', '[]'::jsonb, 'kayitSayisi', written);
END $$;

COMMIT;
