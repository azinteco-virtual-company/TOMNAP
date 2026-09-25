-- Kaçaklar panosu v0 (A12): Q4 and Q5 are tenant-filtered and read-only; Q4 never shows
-- an undelivered or paid order, Q5 never shows cash handed over to the cash desk.
-- Then down -> down -> up. Run after kasa-teslimleri.sql, in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Access and read-only.
DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.tomnap_v2_kacak_q4(text,integer)', 'public.tomnap_v2_kacak_q5(text,integer)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
    END IF;
    IF (SELECT prosecdef OR provolatile <> 's' OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION '% must be STABLE, SECURITY INVOKER with an empty search_path', fn;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.kc_fixture() RETURNS void LANGUAGE plpgsql AS $$
DECLARE line text := '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]';
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('kc-a', 'Kaçak A', 'AKTIF'), ('kc-b', 'Kaçak B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('kc-patron-a', 'kc-a', 'Patron A', 'patron-a@kacak.test', 'PATRON', 'AKTIF'),
    ('kc-finans-a', 'kc-a', 'Finans A', 'finans-a@kacak.test', 'BAKU_FINANS', 'AKTIF'),
    ('kc-kurye1', 'kc-a', 'Kurye 1', 'kurye1@kacak.test', 'BAKU_KURYE', 'AKTIF'),
    ('kc-kurye2', 'kc-a', 'Kurye 2', 'kurye2@kacak.test', 'BAKU_KURYE', 'AKTIF'),
    ('kc-kurye3', 'kc-a', 'Kurye 3', 'kurye3@kacak.test', 'BAKU_KURYE', 'AKTIF'),
    ('kc-patron-b', 'kc-b', 'Patron B', 'patron-b@kacak.test', 'PATRON', 'AKTIF'),
    ('kc-kurye-b', 'kc-b', 'Kurye B', 'kurye-b@kacak.test', 'BAKU_KURYE', 'AKTIF');
  -- v1 orders of A: delivered unpaid (3 days), delivered paid, unpaid but still on the way.
  INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, toplam_tutar, alinan_tutar, lojistik_durumu, teslim_tarihi) VALUES
    ('73000000-0000-4000-8000-000000000001', 'kc-a', 'v1', 'Q4 v1 borclu', 'x', 100, 0, 'TESLIM_EDILDI', now() - interval '3 days'),
    ('73000000-0000-4000-8000-000000000002', 'kc-a', 'v1', 'Q4 v1 odendi', 'x', 100, 100, 'TESLIM_EDILDI', now() - interval '3 days'),
    ('73000000-0000-4000-8000-000000000003', 'kc-a', 'v1', 'Q4 v1 yolda', 'x', 100, 0, 'BAKU_DAGITIM_ARKADAS', NULL),
    ('73000000-0000-4000-8000-000000000004', 'kc-b', 'v1', 'Q4 B borclu', 'x', 100, 0, 'TESLIM_EDILDI', now() - interval '3 days');
  -- v2 orders of A: one partly paid through the ledger, one fully paid; both delivered yesterday.
  PERFORM public.tomnap_v2_siparis_olustur('kc-a', 'kc-patron-a', '{"musteri_adi":"Q4 v2 kismi"}', line::jsonb);
  PERFORM public.tomnap_v2_siparis_olustur('kc-a', 'kc-patron-a', '{"musteri_adi":"Q4 v2 tam"}', line::jsonb);
  PERFORM public.tomnap_v2_siparis_olustur('kc-a', 'kc-patron-a', '{"musteri_adi":"Q5 nakit"}', line::jsonb);
  PERFORM public.tomnap_v2_siparis_olustur('kc-b', 'kc-patron-b', '{"musteri_adi":"Q5 B nakit"}', line::jsonb);
  UPDATE public.siparisler SET lojistik_durumu = 'TESLIM_EDILDI', teslim_tarihi = now() - interval '1 day'
   WHERE tenant_id = 'kc-a' AND musteri_adi IN ('Q4 v2 kismi', 'Q4 v2 tam');
END $$;
CREATE FUNCTION pg_temp.kc_order(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE musteri_adi = p_name LIMIT 1
$$;
-- A courier cash collection taken p_hours ago (direct insert, as the ledger allows).
CREATE FUNCTION pg_temp.kc_cash(p_tenant text, p_courier text, p_order uuid, p_amount numeric, p_hours integer) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id, alma_zamani, kaydeden_kullanici_id)
  VALUES (p_tenant, p_order, p_amount, 'NAKIT', 'TESLIMAT', p_courier, now() - make_interval(hours => p_hours), p_courier)
  RETURNING id
$$;
CREATE FUNCTION pg_temp.kc_q4(p_days integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(x->>'musteri_adi' || '=' || (x->>'kalan_tutar'), ',' ORDER BY x->>'musteri_adi'), '')
    FROM jsonb_array_elements(public.tomnap_v2_kacak_q4('kc-a', p_days)) x
$$;
CREATE FUNCTION pg_temp.kc_q5(p_hours integer) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(x->>'kurye_kullanici_id' || '=' || (x->>'bakiye'), ',' ORDER BY x->>'kurye_kullanici_id'), '')
    FROM jsonb_array_elements(public.tomnap_v2_kacak_q5('kc-a', p_hours)) x
$$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.kc_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE q5 uuid := pg_temp.kc_order('Q5 nakit'); reversed uuid; handed uuid; code text; before text;
BEGIN
  PERFORM public.tomnap_v2_odeme_kaydet('kc-a', 'kc-finans-a', jsonb_build_object('siparis_id', pg_temp.kc_order('Q4 v2 kismi'), 'tutar_azn', 40, 'yontem', 'NAKIT', 'kaynak', 'BUTIK'));
  PERFORM public.tomnap_v2_odeme_kaydet('kc-a', 'kc-finans-a', jsonb_build_object('siparis_id', pg_temp.kc_order('Q4 v2 tam'), 'tutar_azn', 100, 'yontem', 'KART', 'kaynak', 'ONLINE'));

  -- Q4: delivered and unpaid only, v1 and v2, this tenant only; the threshold filters by age.
  IF pg_temp.kc_q4(0) IS DISTINCT FROM 'Q4 v1 borclu=100.00,Q4 v2 kismi=60.00' THEN
    RAISE EXCEPTION 'Q4 (0 days) returned: %', pg_temp.kc_q4(0);
  END IF;
  IF pg_temp.kc_q4(2) IS DISTINCT FROM 'Q4 v1 borclu=100.00' THEN RAISE EXCEPTION 'Q4 (2 days) returned: %', pg_temp.kc_q4(2); END IF;
  IF (SELECT (x->>'yas_gun')::integer FROM jsonb_array_elements(public.tomnap_v2_kacak_q4('kc-a')) x WHERE x->>'musteri_adi' = 'Q4 v1 borclu') <> 3 THEN
    RAISE EXCEPTION 'Q4 age is wrong';
  END IF;

  -- Q5: courier 1 holds old cash; courier 2 handed its cash over; courier 3's cash is fresh.
  PERFORM pg_temp.kc_cash('kc-a', 'kc-kurye1', q5, 30, 48);
  reversed := pg_temp.kc_cash('kc-a', 'kc-kurye1', q5, 15, 72);
  PERFORM public.tomnap_v2_odeme_ters_kayit('kc-a', 'kc-patron-a', reversed, 'Yanlış');
  handed := pg_temp.kc_cash('kc-a', 'kc-kurye2', q5, 20, 48);
  PERFORM pg_temp.kc_cash('kc-a', 'kc-kurye3', q5, 10, 0);
  PERFORM pg_temp.kc_cash('kc-b', 'kc-kurye-b', pg_temp.kc_order('Q5 B nakit'), 50, 48);
  PERFORM public.tomnap_v2_kasa_teslimi('kc-a', 'kc-finans-a', 'kc-kurye2', ARRAY[handed], 20, NULL);
  IF pg_temp.kc_q5(24) IS DISTINCT FROM 'kc-kurye1=30.00' THEN RAISE EXCEPTION 'Q5 (24 h) returned: %', pg_temp.kc_q5(24); END IF;
  IF pg_temp.kc_q5(0) IS DISTINCT FROM 'kc-kurye1=30.00,kc-kurye3=10.00' THEN RAISE EXCEPTION 'Q5 (0 h) returned: %', pg_temp.kc_q5(0); END IF;
  IF (SELECT (x->>'bekleme_saat')::integer FROM jsonb_array_elements(public.tomnap_v2_kacak_q5('kc-a')) x) < 48 THEN
    RAISE EXCEPTION 'Q5 waiting time counts from the oldest open collection';
  END IF;

  -- Read-only: the queries change nothing; bad input is refused.
  before := (SELECT md5(string_agg(to_jsonb(s)::text, '' ORDER BY s.id)) FROM public.siparisler s WHERE s.tenant_id = 'kc-a');
  PERFORM public.tomnap_v2_kacak_q4('kc-a'), public.tomnap_v2_kacak_q5('kc-a');
  IF before IS DISTINCT FROM (SELECT md5(string_agg(to_jsonb(s)::text, '' ORDER BY s.id)) FROM public.siparisler s WHERE s.tenant_id = 'kc-a') THEN
    RAISE EXCEPTION 'A leak query changed data';
  END IF;
  FOREACH code IN ARRAY ARRAY['SELECT public.tomnap_v2_kacak_q4(''all'')', 'SELECT public.tomnap_v2_kacak_q4(''kc-a'', -1)',
                              'SELECT public.tomnap_v2_kacak_q5(NULL)', 'SELECT public.tomnap_v2_kacak_q5(''kc-a'', NULL)'] LOOP
    BEGIN EXECUTE code; RAISE EXCEPTION 'Accepted: %', code;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
END $$;
ROLLBACK;

-- 3. Down -> down -> up.
BEGIN;
\ir ../../supabase/rollbacks/20260925130000_kacaklar.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260925130000_kacaklar.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_v2_kacak_q4(text,integer)') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_kacak_q5(text,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback left leak functions behind';
  END IF;
  IF to_regprocedure('public.tomnap_v2_kurye_bakiyeleri(text,text)') IS NULL OR to_regclass('public.odemeler') IS NULL THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
END $$;
\ir ../../supabase/migrations/20260925130000_kacaklar.sql
DO $$ BEGIN
  IF NOT has_function_privilege('service_role', 'public.tomnap_v2_kacak_q4(text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_kacak_q5(text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Re-applied leak migration is incomplete';
  END IF;
END $$;
