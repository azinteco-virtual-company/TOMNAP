-- ABD_SATINALMA (A5): catalog, invite + acceptance, quota fallback for firms
-- without the new key, and AWB approval rights. Run after baseline + all
-- migrations (and again after rol-migration-roundtrip.sql). Test rows are
-- written inside a transaction that is rolled back.
\set ON_ERROR_STOP 1

DO $$ DECLARE r text; BEGIN
  IF public.tomnap_gecerli_rol('ABD_SATINALMA') IS DISTINCT FROM true THEN RAISE EXCEPTION 'ABD_SATINALMA is not a team role'; END IF;
  IF public.tomnap_rol_kota_varsayilani('ABD_SATINALMA') <> 2 THEN RAISE EXCEPTION 'Wrong ABD_SATINALMA quota default'; END IF;
  -- Every other role keeps today's behaviour: a missing key means no seat.
  FOREACH r IN ARRAY ARRAY['PATRON','KANADA_SATINALMA','SATIS_SORUMLUSU','BAKU_FINANS','BAKU_KURYE','SUPER_ADMIN','',NULL] LOOP
    IF public.tomnap_rol_kota_varsayilani(r) IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Missing key of % is no longer 0', coalesce(r,'NULL'); END IF;
  END LOOP;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = 'public.tomnap_rol_kota_varsayilani(text)'::regprocedure)
     OR has_function_privilege('anon', 'public.tomnap_rol_kota_varsayilani(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tomnap_rol_kota_varsayilani(text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tomnap_rol_kota_varsayilani(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Quota default function is unsafe or unreachable';
  END IF;
END $$;

BEGIN;
SET LOCAL ROLE service_role;
-- abd-legacy: an existing firm whose rol_limitleri predates the role (no key).
-- abd-explicit: a firm that set the ABD quota itself.
INSERT INTO public.firmalar(id, ad, onay_durumu, rol_limitleri) VALUES
  ('abd-legacy', 'ABD legacy', 'AKTIF', '{"PATRON":1,"KANADA_SATINALMA":2}'),
  ('abd-explicit', 'ABD explicit', 'AKTIF', '{"PATRON":1,"ABD_SATINALMA":1}');
INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
  ('abd-sales', 'abd-legacy', 'Sales', 'sales@abd.test', 'SATIS_SORUMLUSU', 'AKTIF');
INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, lojistik_durumu, uluslararasi_kargo_kodu, ek_veriler) VALUES
  ('60000000-0000-4000-8000-000000000001', 'abd-legacy', 'm', 'US order', 'Parcel', 'KANADA_DEPO', NULL, '{}'),
  ('60000000-0000-4000-8000-000000000002', 'abd-legacy', 'm', 'US order 2', 'Parcel', 'KANADA_DEPO', NULL, '{}');

DO $$
DECLARE failed boolean; result jsonb; i int;
  exp timestamptz := now() + interval '1 hour';
  m jsonb := '{"dosyaAdi":"us-dispatch.xlsx","sha256":"cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd"}';
  invite jsonb;
BEGIN
  -- Legacy firm without the key: the default of 2 applies to invites and acceptances.
  FOR i IN 1..2 LOOP
    invite := jsonb_build_object('id', 'abd-inv-' || i, 'token', 'abd-inv-' || i, 'firma_id', 'abd-legacy',
                                 'rol', 'ABD_SATINALMA', 'olusturan_rol', 'PATRON', 'son_kullanma_tarihi', exp);
    result := public.tomnap_create_invite(invite);
    IF (result->>'remaining')::int <> 3 - i THEN RAISE EXCEPTION 'Unexpected remaining ABD seats: %', result; END IF;
    result := public.tomnap_accept_invite('abd-inv-' || i, jsonb_build_object(
      'id', 'abd-user-' || i, 'ad_soyad', 'US buyer ' || i, 'email', 'buyer' || i || '@abd.test',
      'telefon', '+99450100010' || i, 'sifre_hash', 'test-hash'));
    IF result->'user'->>'rol' IS DISTINCT FROM 'ABD_SATINALMA' OR result->'user'->>'durum' IS DISTINCT FROM 'AKTIF'
       OR (result->'firma'->'aktif_kullanici_sayilari'->>'ABD_SATINALMA')::int <> i THEN
      RAISE EXCEPTION 'ABD acceptance failed: %', result;
    END IF;
  END LOOP;
  failed := false;
  BEGIN
    PERFORM public.tomnap_create_invite(jsonb_build_object('id', 'abd-inv-3', 'token', 'abd-inv-3', 'firma_id', 'abd-legacy',
      'rol', 'ABD_SATINALMA', 'olusturan_rol', 'PATRON', 'son_kullanma_tarihi', exp));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := SQLERRM = 'Role quota exceeded';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Third ABD seat exceeded the default quota'; END IF;
  -- The legacy firm's other missing keys still mean zero seats (behaviour unchanged).
  failed := false;
  BEGIN
    PERFORM public.tomnap_create_invite(jsonb_build_object('id', 'abd-fin', 'token', 'abd-fin', 'firma_id', 'abd-legacy',
      'rol', 'BAKU_FINANS', 'olusturan_rol', 'PATRON', 'son_kullanma_tarihi', exp));
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := SQLERRM = 'Role quota exceeded';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Missing BAKU_FINANS key no longer means zero seats'; END IF;
  -- The stored firm limits were not rewritten.
  IF (SELECT rol_limitleri FROM public.firmalar WHERE id = 'abd-legacy') <> '{"PATRON":1,"KANADA_SATINALMA":2}'::jsonb THEN
    RAISE EXCEPTION 'Quota fallback rewrote rol_limitleri';
  END IF;

  -- An explicit key wins over the default, on invite and on acceptance.
  result := public.tomnap_create_invite(jsonb_build_object('id', 'abd-x-1', 'token', 'abd-x-1', 'firma_id', 'abd-explicit',
    'rol', 'ABD_SATINALMA', 'olusturan_rol', 'PATRON', 'son_kullanma_tarihi', exp));
  IF (result->>'remaining')::int <> 1 THEN RAISE EXCEPTION 'Explicit ABD quota ignored: %', result; END IF;
  INSERT INTO public.davetler(id, token, firma_id, rol, durum, son_kullanma_tarihi) VALUES
    ('abd-x-2', 'abd-x-2', 'abd-explicit', 'ABD_SATINALMA', 'AKTIF', exp);
  PERFORM public.tomnap_accept_invite('abd-x-1', '{"id":"abd-x-user-1","ad_soyad":"X1","email":"x1@abd.test","sifre_hash":"h"}');
  failed := false;
  BEGIN
    PERFORM public.tomnap_accept_invite('abd-x-2', '{"id":"abd-x-user-2","ad_soyad":"X2","email":"x2@abd.test","sifre_hash":"h"}');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := SQLERRM = 'Role quota exceeded';
  END;
  IF NOT failed OR EXISTS (SELECT 1 FROM public.kullanicilar WHERE id = 'abd-x-user-2') THEN
    RAISE EXCEPTION 'Explicit ABD quota was exceeded on acceptance';
  END IF;

  -- AWB approval: ABD_SATINALMA is in the SHIPPING group; sales still is not.
  result := public.tomnap_approve_awb_matches('abd-legacy', 'abd-user-1', m,
    '[{"satirNo":1,"siparisId":"60000000-0000-4000-8000-000000000001","takipNo":"US-AWB-1","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF result->>'basarili' <> 'true' OR NOT EXISTS (
       SELECT 1 FROM public.awb_match_approvals WHERE tenant_id = 'abd-legacy' AND onaylayan_kullanici_id = 'abd-user-1') THEN
    RAISE EXCEPTION 'ABD buyer could not approve an AWB: %', result;
  END IF;
  failed := false;
  BEGIN
    PERFORM public.tomnap_approve_awb_matches('abd-legacy', 'abd-sales', m,
      '[{"satirNo":2,"siparisId":"60000000-0000-4000-8000-000000000002","takipNo":"US-AWB-2","eslesmeTuru":"TELEFON","isimPuani":1}]');
  EXCEPTION WHEN SQLSTATE 'PT403' THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Sales role approved an AWB'; END IF;
END $$;
ROLLBACK;
