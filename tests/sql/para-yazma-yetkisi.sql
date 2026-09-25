-- Para yazma yetkisi (20260925140000): SUPER_ADMIN records no payment, reversal or cash
-- hand-over (also inside the boutique it administers); PATRON and BAKU_FINANS keep
-- writing. Then down -> down -> up. Run after kacaklar.sql, in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Access and safety settings are unchanged.
DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.tomnap_v2_odeme_kaydet(text,text,jsonb)',
                            'public.tomnap_v2_odeme_ters_kayit(text,text,uuid,text)',
                            'public.tomnap_v2_kasa_teslimi(text,text,text,uuid[],numeric,text)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
    END IF;
    IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe configuration of %', fn;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.pz_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('pz-a', 'Para A', 'AKTIF'), ('pz-b', 'Para B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('pz-patron', 'pz-a', 'Patron', 'patron@para.test', 'PATRON', 'AKTIF'),
    ('pz-finans', 'pz-a', 'Finans', 'finans@para.test', 'BAKU_FINANS', 'AKTIF'),
    ('pz-kurye', 'pz-a', 'Kurye', 'kurye@para.test', 'BAKU_KURYE', 'AKTIF'),
    -- One platform admin registered in this boutique, one elsewhere.
    ('pz-admin-a', 'pz-a', 'Admin A', 'admin-a@para.test', 'SUPER_ADMIN', 'AKTIF'),
    ('pz-admin-b', 'pz-b', 'Admin B', 'admin-b@para.test', 'SUPER_ADMIN', 'AKTIF');
  INSERT INTO public.kuryeler(id, tenant_id, ad_soyad, telefon, bolge, aktif, kullanici_id)
    VALUES ('pz-k', 'pz-a', 'Kurye', '1', 'Baku', true, 'pz-kurye');
  PERFORM public.tomnap_v2_siparis_olustur('pz-a', 'pz-patron', '{"musteri_adi":"Para"}',
    '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]');
  UPDATE public.siparisler SET baku_kurye_id = 'pz-k', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS' WHERE tenant_id = 'pz-a';
END $$;
CREATE FUNCTION pg_temp.pz_order() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE tenant_id = 'pz-a' AND model_surumu = 2 LIMIT 1
$$;
-- 'ok' or the SQLSTATE of one money write.
CREATE FUNCTION pg_temp.pz(p_what text, p_user text, p_ref uuid) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF p_what = 'odeme' THEN
    PERFORM public.tomnap_v2_odeme_kaydet('pz-a', p_user, jsonb_build_object(
      'siparis_id', p_ref, 'tutar_azn', 1, 'yontem', 'NAKIT', 'kaynak', 'BUTIK'));
  ELSIF p_what = 'ters' THEN
    PERFORM public.tomnap_v2_odeme_ters_kayit('pz-a', p_user, p_ref, 'Yanlış');
  ELSE
    PERFORM public.tomnap_v2_kasa_teslimi('pz-a', p_user, 'pz-kurye', ARRAY[p_ref],
      (SELECT tutar_azn FROM public.odemeler WHERE id = p_ref), NULL);
  END IF;
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.pz_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.pz_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid := pg_temp.pz_order(); butik uuid; nakit uuid; admin text;
BEGIN
  PERFORM public.tomnap_v2_kurye_tahsilati('pz-a', 'pz-kurye', s, 20);
  nakit := (SELECT id FROM public.odemeler WHERE siparis_id = s AND kaynak = 'TESLIMAT');
  PERFORM pg_temp.pz_expect(pg_temp.pz('odeme', 'pz-patron', s), 'ok', 'patron records');
  butik := (SELECT id FROM public.odemeler WHERE siparis_id = s AND kaynak = 'BUTIK');
  FOREACH admin IN ARRAY ARRAY['pz-admin-a', 'pz-admin-b'] LOOP
    PERFORM pg_temp.pz_expect(pg_temp.pz('odeme', admin, s), 'PT403', admin || ' records a payment');
    PERFORM pg_temp.pz_expect(pg_temp.pz('ters', admin, butik), 'PT403', admin || ' reverses a payment');
    PERFORM pg_temp.pz_expect(pg_temp.pz('kasa', admin, nakit), 'PT403', admin || ' takes courier cash');
  END LOOP;
  IF (SELECT count(*) FROM public.odemeler WHERE siparis_id = s) <> 2 OR EXISTS (SELECT 1 FROM public.kasa_teslimleri) THEN
    RAISE EXCEPTION 'A refused admin write left rows behind';
  END IF;
  PERFORM pg_temp.pz_expect(pg_temp.pz('odeme', 'pz-finans', s), 'ok', 'finance records');
  PERFORM pg_temp.pz_expect(pg_temp.pz('ters', 'pz-finans', butik), 'ok', 'finance reverses');
  PERFORM pg_temp.pz_expect(pg_temp.pz('kasa', 'pz-patron', nakit), 'ok', 'patron takes courier cash');
END $$;
ROLLBACK;

-- 3. Down (twice) lets the admin write again (the A10/A11 bodies); up refuses again.
BEGIN;
\ir ../../supabase/rollbacks/20260925140000_para_yazma_yetkisi.down.sql
\ir ../../supabase/rollbacks/20260925140000_para_yazma_yetkisi.down.sql
COMMIT;
BEGIN;
SELECT pg_temp.pz_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.pz_expect(pg_temp.pz('odeme', 'pz-admin-b', pg_temp.pz_order()), 'ok', 'admin after rollback');
  IF to_regclass('public.odemeler') IS NULL OR to_regclass('public.kasa_teslimleri') IS NULL THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
END $$;
ROLLBACK;
\ir ../../supabase/migrations/20260925140000_para_yazma_yetkisi.sql
BEGIN;
SELECT pg_temp.pz_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.pz_expect(pg_temp.pz('odeme', 'pz-admin-b', pg_temp.pz_order()), 'PT403', 'admin after re-apply');
END $$;
ROLLBACK;
