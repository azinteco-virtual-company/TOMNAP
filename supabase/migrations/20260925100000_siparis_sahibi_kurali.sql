-- v2 order owner rule (O-24, decided 2026-09-25).
-- A platform admin (SUPER_ADMIN) is not a team member and cannot earn the prim, so it
-- never owns an order: when it creates a v2 order it must name the owner, and the owner
-- is always an active PATRON or SATIS_SORUMLUSU of the tenant (also when it defaults to
-- the creator). Replaces only tomnap_v2_siparis_olustur from 20260924150000; no table,
-- column or data changes.
-- Rollback: supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql

BEGIN;

CREATE OR REPLACE FUNCTION public.tomnap_v2_siparis_olustur(p_tenant_id text, p_user_id text, p_siparis jsonb, p_satirlar jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  v_sahip text;
  v_musteri text;
  v_toplam numeric(12, 2);
  v_adet integer;
  v_aciklama text;
  v_hatali integer;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_siparis) IS DISTINCT FROM 'object' OR jsonb_typeof(p_satirlar) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_satirlar) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'An order needs 1-100 lines' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_siparis->>'musteri_adi', ''))) NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION 'Invalid customer name' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_hatali FROM jsonb_array_elements(p_satirlar) AS l(x)
   WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
      OR jsonb_typeof(x->'adet') IS DISTINCT FROM 'number'
      OR jsonb_typeof(x->'birim_satis_fiyati_azn') IS DISTINCT FROM 'number';
  IF v_hatali > 0 THEN RAISE EXCEPTION 'Invalid order line' USING ERRCODE = '22023'; END IF;

  -- The creator: active in this tenant (or a platform admin) and allowed to create orders.
  -- FOR SHARE: a concurrent deactivation waits for this order, or wins and stops it.
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF' AND rol IN ('SUPER_ADMIN', 'PATRON', 'SATIS_SORUMLUSU')
     AND (tenant_id = p_tenant_id OR rol = 'SUPER_ADMIN')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator is not allowed for this tenant' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firmalar f
                  WHERE f.id = p_tenant_id AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')) THEN
    RAISE EXCEPTION 'Company unavailable' USING ERRCODE = 'PT403';
  END IF;

  -- The owner earns the prim (K15), so it is always an active PATRON or SATIS_SORUMLUSU
  -- of this tenant. It defaults to the creator; a platform admin is not a team member,
  -- never owns an order and must name the owner (O-24). A sales user owns only their own.
  v_sahip := nullif(btrim(coalesce(p_siparis->>'sahip_kullanici_id', '')), '');
  IF v_sahip IS NULL AND u.rol = 'SUPER_ADMIN' THEN
    RAISE EXCEPTION 'A platform admin must name the order owner' USING ERRCODE = '22023';
  END IF;
  v_sahip := coalesce(v_sahip, u.id);
  IF u.rol = 'SATIS_SORUMLUSU' AND v_sahip <> u.id THEN
    RAISE EXCEPTION 'A sales user may only own their own orders' USING ERRCODE = 'PT403';
  END IF;
  PERFORM 1 FROM public.kullanicilar
   WHERE id = v_sahip AND tenant_id = p_tenant_id AND durum = 'AKTIF' AND rol IN ('PATRON', 'SATIS_SORUMLUSU')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owner is not an active sales user of this tenant' USING ERRCODE = 'PT409';
  END IF;

  v_musteri := nullif(btrim(coalesce(p_siparis->>'musteri_id', '')), '');
  IF v_musteri IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.musteriler m WHERE m.id = v_musteri AND m.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown customer' USING ERRCODE = 'PT409';
  END IF;

  SELECT sum(round((x->>'adet')::integer * (x->>'birim_satis_fiyati_azn')::numeric, 2)),
         sum((x->>'adet')::integer),
         string_agg(btrim(x->>'urun_aciklamasi'), ' + ' ORDER BY n)
    INTO v_toplam, v_adet, v_aciklama
    FROM jsonb_array_elements(p_satirlar) WITH ORDINALITY AS l(x, n);

  INSERT INTO public.siparisler(
    tenant_id, model_surumu, sahip_kullanici_id, ham_mesaj, siparis_kaynagi, musteri_adi,
    instagram_kullanici_adi, telefon_numarasi, teslimat_sehri, teslimat_adresi, urun_aciklamasi,
    adet, toplam_tutar, alinan_tutar, para_birimi, finans_durumu, lojistik_durumu, ozel_not,
    eksik_bilgiler, is_demo, ek_veriler)
  VALUES (
    p_tenant_id, 2, v_sahip, coalesce(p_siparis->>'ham_mesaj', ''),
    coalesce(nullif(p_siparis->>'siparis_kaynagi', ''), 'INSTAGRAM_DM'), btrim(p_siparis->>'musteri_adi'),
    nullif(p_siparis->>'instagram_kullanici_adi', ''), nullif(p_siparis->>'telefon_numarasi', ''),
    coalesce(nullif(p_siparis->>'teslimat_sehri', ''), 'Bakü'), nullif(p_siparis->>'teslimat_adresi', ''),
    v_aciklama, v_adet, v_toplam, 0, 'AZN', 'BEKLIYOR', 'KANADA_SATINALIM_BEKLIYOR',
    nullif(p_siparis->>'ozel_not', ''), '[]'::jsonb, false,
    jsonb_strip_nulls(jsonb_build_object('musteri_id', v_musteri)))
  RETURNING * INTO s;

  -- Column checks reject an invalid line; the whole order is then rolled back.
  INSERT INTO public.siparis_satirlari(
    tenant_id, siparis_id, sira, urun_aciklamasi, beden, renk, adet, birim_satis_fiyati_azn, kaynak_ulke)
  SELECT p_tenant_id, s.id, n, btrim(x->>'urun_aciklamasi'), nullif(btrim(coalesce(x->>'beden', '')), ''),
         nullif(btrim(coalesce(x->>'renk', '')), ''), (x->>'adet')::integer,
         (x->>'birim_satis_fiyati_azn')::numeric, x->>'kaynak_ulke'
    FROM jsonb_array_elements(p_satirlar) WITH ORDINALITY AS l(x, n);

  RETURN jsonb_build_object(
    'siparis', to_jsonb(s),
    'satirlar', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sira) FROM public.siparis_satirlari l
                  WHERE l.siparis_id = s.id AND l.tenant_id = p_tenant_id));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_siparis_olustur(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_siparis_olustur(text, text, jsonb, jsonb) TO service_role;

COMMIT;
