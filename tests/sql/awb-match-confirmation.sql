-- Canonical schema + migrations, isolated PostgreSQL only; all fixtures roll back.
BEGIN;
DO $$ DECLARE proc text := 'public.tomnap_confirm_awb_matches(text,jsonb)'; actor text; BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = proc::regprocedure)
     OR NOT (SELECT coalesce(proconfig @> ARRAY['search_path=""'], false) FROM pg_proc WHERE oid = proc::regprocedure) THEN
    RAISE EXCEPTION 'Unsafe AWB confirmation function';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(actor, proc, 'EXECUTE') THEN RAISE EXCEPTION 'Browser role % can confirm AWBs', actor; END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', proc, 'EXECUTE') THEN RAISE EXCEPTION 'Missing service role grant'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_confirm_awb_matches('awb-sql-a', '[]'); RAISE EXCEPTION 'Anonymous confirmation ran';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_confirm_awb_matches('awb-sql-a', '[]'); RAISE EXCEPTION 'Browser confirmation ran';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('awb-sql-a', 'AWB test A', 'AKTIF'), ('awb-sql-b', 'AWB test B', 'AKTIF');
INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, lojistik_durumu, uluslararasi_kargo_kodu, ek_veriler) VALUES
 ('50000000-0000-4000-8000-000000000001', 'awb-sql-a', 'm', 'Target', 'Parcel', 'KANADA_DEPO', NULL, '{"kanada_fatura_no":"KEEP"}'),
 ('50000000-0000-4000-8000-000000000002', 'awb-sql-a', 'm', 'Delivered', 'Parcel', 'TESLIM_EDILDI', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000003', 'awb-sql-a', 'm', 'Labelled', 'Parcel', 'ULUSLARARASI_KARGO', 'OLD-AWB-1', '{}'),
 ('50000000-0000-4000-8000-000000000004', 'awb-sql-a', 'm', 'Holder', 'Parcel', 'ULUSLARARASI_KARGO', ' awb-0004', '{}'),
 ('50000000-0000-4000-8000-000000000005', 'awb-sql-a', 'm', 'Free', 'Parcel', 'KANADA_SATINALIM_BEKLIYOR', '', '{}'),
 ('50000000-0000-4000-8000-000000000006', 'awb-sql-b', 'm', 'Foreign', 'Parcel', 'KANADA_DEPO', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000007', 'awb-sql-a', 'm', 'Later', 'Parcel', 'BAKU_DAGITIM_ARKADAS', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000008', 'awb-sql-b', 'm', 'Foreign holder', 'Parcel', 'ULUSLARARASI_KARGO', 'AWB-2008', '{}');
DO $$ DECLARE r jsonb; o public.siparisler; bad jsonb; BEGIN
  -- One valid pair next to blocked pairs: nothing is written, every reason is reported.
  r := public.tomnap_confirm_awb_matches('awb-sql-a', '[
    {"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001","agirlikKg":1.5},
    {"siparisId":"50000000-0000-4000-8000-000000000002","takipNo":"AWB-1002"},
    {"siparisId":"50000000-0000-4000-8000-000000000003","takipNo":"AWB-1003"},
    {"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-0004"},
    {"siparisId":"50000000-0000-4000-8000-000000000006","takipNo":"AWB-1006"},
    {"siparisId":"not-a-uuid","takipNo":"AWB-1009"}]');
  IF r->>'basarili' <> 'false' OR jsonb_array_length(r->'uygulananlar') <> 0 THEN RAISE EXCEPTION 'Rejected batch reported success %', r; END IF;
  IF (SELECT string_agg(e->>'sebep', ',' ORDER BY n) FROM jsonb_array_elements(r->'reddedilenler') WITH ORDINALITY AS t(e, n))
     <> 'TESLIM_EDILDI,MEVCUT_AWB,AWB_BASKA_SIPARISTE,SIPARIS_BULUNAMADI,SIPARIS_BULUNAMADI' THEN
    RAISE EXCEPTION 'Unexpected rejection reasons %', r;
  END IF;
  IF r#>>'{reddedilenler,1,mevcutAwb}' <> 'OLD-AWB-1' THEN RAISE EXCEPTION 'Existing AWB not reported %', r; END IF;
  IF (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000001') IS NOT NULL
     OR (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000003') <> 'OLD-AWB-1'
     OR (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000006') IS NOT NULL
     OR (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000002') IS NOT NULL THEN
    RAISE EXCEPTION 'A rejected batch changed an order';
  END IF;

  -- Confirmed pairs: AWB, weight and pre-flight status; later statuses and extras stay.
  -- AWB-2008 belongs to another tenant and neither blocks nor changes this tenant.
  r := public.tomnap_confirm_awb_matches('awb-sql-a', '[
    {"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001","agirlikKg":1.5},
    {"siparisId":"50000000-0000-4000-8000-000000000007","takipNo":"AWB-2008"}]');
  IF r->>'basarili' <> 'true' OR jsonb_array_length(r->'uygulananlar') <> 2 THEN RAISE EXCEPTION 'Confirmation failed %', r; END IF;
  SELECT * INTO o FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000001';
  IF o.uluslararasi_kargo_kodu <> 'AWB-1001' OR o.lojistik_durumu::text <> 'ULUSLARARASI_KARGO'
     OR o.ek_veriler->>'kargo_agirligi_kg' <> '1.5' OR o.ek_veriler->>'kanada_fatura_no' <> 'KEEP'
     OR NOT (o.ek_veriler ? 'guncellenme_tarihi') THEN
    RAISE EXCEPTION 'Confirmed order not written as expected %', to_jsonb(o);
  END IF;
  IF (SELECT lojistik_durumu::text FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000007') <> 'BAKU_DAGITIM_ARKADAS' THEN
    RAISE EXCEPTION 'Later status was rewritten';
  END IF;
  IF (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000008') <> 'AWB-2008'
     OR (SELECT tenant_id FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000008') <> 'awb-sql-b' THEN
    RAISE EXCEPTION 'Foreign tenant order changed';
  END IF;

  -- A lost-response retry is idempotent; the AWB cannot move to a second order.
  r := public.tomnap_confirm_awb_matches('awb-sql-a', '[{"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001"}]');
  IF r->>'basarili' <> 'true' OR r#>>'{uygulananlar,0,tekrar}' <> 'true' THEN RAISE EXCEPTION 'Retry was not idempotent %', r; END IF;
  r := public.tomnap_confirm_awb_matches('awb-sql-a', '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-1001"}]');
  IF r#>>'{reddedilenler,0,sebep}' <> 'AWB_BASKA_SIPARISTE' THEN RAISE EXCEPTION 'Duplicate AWB accepted %', r; END IF;
  r := public.tomnap_confirm_awb_matches('awb-sql-b', '[{"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-3001"}]');
  IF r#>>'{reddedilenler,0,sebep}' <> 'SIPARIS_BULUNAMADI' THEN RAISE EXCEPTION 'Cross-tenant write accepted %', r; END IF;

  -- Malformed or ambiguous requests are refused before any lock or write.
  FOREACH bad IN ARRAY ARRAY[
    '[]'::jsonb,
    '{}'::jsonb,
    '[1]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005"}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"awb-lower"}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB 5"}]'::jsonb,
    '[{"siparisId":"../x","takipNo":"AWB-5005"}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5005","agirlikKg":-1}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5005","agirlikKg":"2"}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5005"},{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5006"}]'::jsonb,
    '[{"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5005"},{"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-5005"}]'::jsonb,
    (SELECT jsonb_agg(jsonb_build_object('siparisId', 'o' || n, 'takipNo', 'AWB-' || (10000 + n))) FROM generate_series(1, 501) n)
  ] LOOP
    BEGIN
      PERFORM public.tomnap_confirm_awb_matches('awb-sql-a', bad);
      RAISE EXCEPTION 'Malformed confirmation accepted %', left(bad::text, 120);
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  BEGIN PERFORM public.tomnap_confirm_awb_matches('all', '[{"siparisId":"x","takipNo":"AWB-5007"}]'); RAISE EXCEPTION 'Global tenant accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.tomnap_confirm_awb_matches(NULL, '[{"siparisId":"x","takipNo":"AWB-5007"}]'); RAISE EXCEPTION 'Missing tenant accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000005') <> '' THEN
    RAISE EXCEPTION 'A malformed request changed an order';
  END IF;
END $$;
RESET ROLE;

-- The rollback revokes execution from every API role without dropping anything.
\ir ../../supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_confirm_awb_matches(text,jsonb)') IS NULL THEN RAISE EXCEPTION 'Rollback dropped the function'; END IF;
  IF has_function_privilege('service_role', 'public.tomnap_confirm_awb_matches(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rollback left service role access';
  END IF;
END $$;
ROLLBACK;
