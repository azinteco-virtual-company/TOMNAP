-- Rol kataloğu (A4): tomnap_gecerli_rol, davet ve kabul RPC'leri, up -> down -> up.
-- Run after baseline + all migrations, in ONE psql session. Test rows are
-- written inside transactions that are rolled back.
\set ON_ERROR_STOP 1

-- 1. Contract and privileges of the catalog function.
DO $$ DECLARE r text; f record; BEGIN
  FOREACH r IN ARRAY ARRAY['PATRON','KANADA_SATINALMA','SATIS_SORUMLUSU','BAKU_FINANS','BAKU_KURYE'] LOOP
    IF public.tomnap_gecerli_rol(r) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Team role rejected: %', r; END IF;
  END LOOP;
  FOREACH r IN ARRAY ARRAY['SUPER_ADMIN','HACKER','patron',' PATRON','',NULL] LOOP
    IF public.tomnap_gecerli_rol(r) IS DISTINCT FROM false THEN RAISE EXCEPTION 'Invalid role accepted: %', coalesce(r,'NULL'); END IF;
  END LOOP;
  SELECT oid, prosecdef, proconfig INTO f FROM pg_proc WHERE oid = 'public.tomnap_gecerli_rol(text)'::regprocedure;
  IF f.prosecdef OR NOT ('search_path=""' = ANY(f.proconfig)) THEN RAISE EXCEPTION 'Unsafe catalog function configuration'; END IF;
  IF has_function_privilege('anon', f.oid, 'EXECUTE') OR has_function_privilege('authenticated', f.oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Catalog function privileges are wrong';
  END IF;
END $$;

-- 2. Up -> down -> up. Down is idempotent and restores the previous RPC
--    definitions with their grants; nothing else is dropped.
BEGIN;
\ir ../../supabase/rollbacks/20260924120000_rol_katalogu.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260924120000_rol_katalogu.down.sql
COMMIT;
DO $$ DECLARE fn text; BEGIN
  IF to_regprocedure('public.tomnap_gecerli_rol(text)') IS NOT NULL THEN RAISE EXCEPTION 'Rollback left the catalog function'; END IF;
  FOREACH fn IN ARRAY ARRAY['public.tomnap_create_invite(jsonb,jsonb)','public.tomnap_accept_invite(text,jsonb)'] LOOP
    IF to_regprocedure(fn) IS NULL THEN RAISE EXCEPTION 'Rollback dropped %', fn; END IF;
    IF position('tomnap_gecerli_rol' IN pg_get_functiondef(fn::regprocedure)) > 0
       OR position('''PATRON'',''KANADA_SATINALMA''' IN pg_get_functiondef(fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'Rollback did not restore the previous definition of %', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Rollback changed the privileges of %', fn;
    END IF;
  END LOOP;
END $$;
\ir ../../supabase/migrations/20260924120000_rol_katalogu.sql
DO $$ DECLARE fn text; BEGIN
  IF to_regprocedure('public.tomnap_gecerli_rol(text)') IS NULL
     OR NOT has_function_privilege('service_role', 'public.tomnap_gecerli_rol(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tomnap_gecerli_rol(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Re-applied catalog function is incomplete';
  END IF;
  FOREACH fn IN ARRAY ARRAY['public.tomnap_create_invite(jsonb,jsonb)','public.tomnap_accept_invite(text,jsonb)'] LOOP
    IF position('tomnap_gecerli_rol' IN pg_get_functiondef(fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION '% does not use the catalog', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Re-applied migration changed the privileges of %', fn;
    END IF;
  END LOOP;
END $$;

-- 3. Behaviour on the re-applied schema: an invalid role is rejected by the
--    invite and by the acceptance, and nothing is written.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id, ad, onay_durumu, rol_limitleri) VALUES
  ('rk-main', 'Rol katalogu', 'AKTIF', '{"BAKU_KURYE":2,"PATRON":1}');
INSERT INTO public.davetler(id, token, firma_id, rol, durum, son_kullanma_tarihi) VALUES
  ('rk-forged', 'rk-forged', 'rk-main', 'SUPER_ADMIN', 'AKTIF', now() + interval '1 hour'),
  ('rk-unknown', 'rk-unknown', 'rk-main', 'HACKER', 'AKTIF', now() + interval '1 hour');

DO $$
DECLARE bad text; failed boolean; result jsonb;
  base jsonb := jsonb_build_object('firma_id', 'rk-main', 'olusturan_rol', 'PATRON',
                                   'son_kullanma_tarihi', now() + interval '1 hour');
  u jsonb := '{"id":"rk-user","ad_soyad":"Invitee","email":"invitee@rol-katalogu.test","telefon":"+994501000099","sifre_hash":"test-hash"}';
BEGIN
  FOREACH bad IN ARRAY ARRAY['SUPER_ADMIN','HACKER','patron',''] LOOP
    failed := false;
    BEGIN
      PERFORM public.tomnap_create_invite(base || jsonb_build_object('id', 'rk-bad-' || bad, 'token', 'rk-bad-' || bad, 'rol', bad));
    EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Invitation with invalid role % was accepted', bad; END IF;
  END LOOP;
  failed := false;
  BEGIN
    PERFORM public.tomnap_create_invite(base || '{"id":"rk-bad-null","token":"rk-bad-null"}');
  EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Invitation without a role was accepted'; END IF;
  IF EXISTS (SELECT 1 FROM public.davetler WHERE id LIKE 'rk-bad-%') THEN RAISE EXCEPTION 'Rejected invitation was written'; END IF;

  result := public.tomnap_create_invite(base || '{"id":"rk-ok","token":"rk-ok","rol":"BAKU_KURYE"}');
  IF result->'invite'->>'rol' IS DISTINCT FROM 'BAKU_KURYE' OR (result->>'remaining')::int <> 2 THEN
    RAISE EXCEPTION 'Valid invitation failed: %', result;
  END IF;

  FOREACH bad IN ARRAY ARRAY['rk-forged','rk-unknown'] LOOP
    failed := false;
    BEGIN
      PERFORM public.tomnap_accept_invite(bad, u);
    EXCEPTION WHEN SQLSTATE 'PT409' THEN failed := true;
    END;
    IF NOT failed OR NOT EXISTS (SELECT 1 FROM public.davetler WHERE token = bad AND durum = 'AKTIF') THEN
      RAISE EXCEPTION 'Invitation % with an invalid role was consumed', bad;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.kullanicilar WHERE id = 'rk-user') THEN RAISE EXCEPTION 'Invalid role created a user'; END IF;

  result := public.tomnap_accept_invite('rk-ok', u);
  IF result->'user'->>'rol' IS DISTINCT FROM 'BAKU_KURYE' THEN RAISE EXCEPTION 'Valid acceptance failed: %', result; END IF;
END $$;
ROLLBACK;
