-- Up -> down -> up of the role migrations (A4 rol_katalogu, A5 abd_satinalma)
-- on a database that already has all migrations applied. Downs run newest
-- first, twice (they must be idempotent); ups run oldest first.
-- Run in ONE psql session.
\set ON_ERROR_STOP 1

BEGIN;
\ir ../../supabase/rollbacks/20260924130000_abd_satinalma.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260924120000_rol_katalogu.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260924130000_abd_satinalma.down.sql
\ir ../../supabase/rollbacks/20260924120000_rol_katalogu.down.sql
COMMIT;

DO $$ DECLARE fn text; BEGIN
  IF to_regprocedure('public.tomnap_gecerli_rol(text)') IS NOT NULL
     OR to_regprocedure('public.tomnap_rol_kota_varsayilani(text)') IS NOT NULL THEN
    RAISE EXCEPTION 'Role rollback left a catalog function behind';
  END IF;
  -- The RPCs are back to their pre-catalog definitions, with their grants.
  FOREACH fn IN ARRAY ARRAY['public.tomnap_create_invite(jsonb,jsonb)', 'public.tomnap_accept_invite(text,jsonb)',
                            'public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)'] LOOP
    IF to_regprocedure(fn) IS NULL THEN RAISE EXCEPTION 'Role rollback dropped %', fn; END IF;
    IF position('tomnap_gecerli_rol' IN pg_get_functiondef(fn::regprocedure)) > 0
       OR position('tomnap_rol_kota_varsayilani' IN pg_get_functiondef(fn::regprocedure)) > 0
       OR position('ABD_SATINALMA' IN pg_get_functiondef(fn::regprocedure)) > 0 THEN
      RAISE EXCEPTION 'Role rollback did not restore the previous definition of %', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Role rollback changed the privileges of %', fn;
    END IF;
  END LOOP;
  IF position('''PATRON'',''KANADA_SATINALMA''' IN pg_get_functiondef('public.tomnap_create_invite(jsonb,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'tomnap_create_invite lost its original role check';
  END IF;
  -- Objects that existed before the role migrations survive.
  IF to_regclass('public.firmalar') IS NULL OR to_regclass('public.davetler') IS NULL
     OR to_regclass('public.kullanicilar') IS NULL OR to_regclass('public.awb_match_approvals') IS NULL THEN
    RAISE EXCEPTION 'Role rollback dropped a pre-existing table';
  END IF;
END $$;

\ir ../../supabase/migrations/20260924120000_rol_katalogu.sql
\ir ../../supabase/migrations/20260924130000_abd_satinalma.sql

DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.tomnap_gecerli_rol(text)', 'public.tomnap_rol_kota_varsayilani(text)',
                            'public.tomnap_create_invite(jsonb,jsonb)', 'public.tomnap_accept_invite(text,jsonb)',
                            'public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)'] LOOP
    IF to_regprocedure(fn) IS NULL
       OR has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Re-applied role migrations left % missing or exposed', fn;
    END IF;
  END LOOP;
  IF position('tomnap_rol_kota_varsayilani' IN pg_get_functiondef('public.tomnap_accept_invite(text,jsonb)'::regprocedure)) = 0
     OR position('ABD_SATINALMA' IN pg_get_functiondef('public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)'::regprocedure)) = 0
     OR NOT public.tomnap_gecerli_rol('ABD_SATINALMA') THEN
    RAISE EXCEPTION 'Re-applied role migrations are incomplete';
  END IF;
END $$;
