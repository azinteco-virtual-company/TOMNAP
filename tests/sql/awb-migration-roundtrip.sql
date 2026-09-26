-- Up -> down -> up round trip of the AWB migrations on a database that already
-- has all migrations applied (and real committed AWB data from earlier tests).
-- Run in ONE psql session: the snapshot is a session-local temporary table.
\set ON_ERROR_STOP 1
CREATE TEMP TABLE awb_roundtrip_before AS
  SELECT count(*) AS orders,
         count(*) FILTER (WHERE coalesce(uluslararasi_kargo_kodu, '') <> '') AS orders_with_awb,
         md5(coalesce(string_agg(id::text || ':' || coalesce(uluslararasi_kargo_kodu, '') || ':' || lojistik_durumu::text, ',' ORDER BY id), '')) AS digest
    FROM public.siparisler;

-- Down, newest first, each in its own transaction; then again (must be idempotent).
BEGIN;
\ir ../../supabase/rollbacks/20260923164650_awb_match_approvals.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260923164650_awb_match_approvals.down.sql
\ir ../../supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
COMMIT;

DO $$ BEGIN
  IF to_regclass('public.awb_match_approvals') IS NOT NULL
     OR to_regprocedure('public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.tomnap_awb_match_approvals_append_only()') IS NOT NULL
     OR to_regprocedure('public.tomnap_confirm_awb_matches(text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'AWB rollback left objects behind';
  END IF;
  -- Objects that existed before the AWB migrations must survive the rollback.
  IF to_regclass('public.siparisler') IS NULL OR to_regclass('public.kullanicilar') IS NULL
     OR to_regclass('public.firmalar') IS NULL OR to_regclass('public.list_revisions') IS NULL
     OR to_regprocedure('public.tomnap_update_cargo_order(text,uuid,text,bigint,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'AWB rollback dropped a pre-existing object';
  END IF;
  IF (SELECT row(orders, orders_with_awb, digest) FROM awb_roundtrip_before)
     IS DISTINCT FROM (SELECT row(count(*), count(*) FILTER (WHERE coalesce(uluslararasi_kargo_kodu, '') <> ''),
       md5(coalesce(string_agg(id::text || ':' || coalesce(uluslararasi_kargo_kodu, '') || ':' || lojistik_durumu::text, ',' ORDER BY id), '')))
       FROM public.siparisler) THEN
    RAISE EXCEPTION 'AWB rollback changed order data';
  END IF;
END $$;

-- Up again, oldest first (each migration has its own BEGIN/COMMIT).
\ir ../../supabase/migrations/20260923023659_awb_match_confirmation.sql
\ir ../../supabase/migrations/20260923164650_awb_match_approvals.sql

DO $$ BEGIN
  IF to_regclass('public.awb_match_approvals') IS NULL
     OR NOT has_function_privilege('service_role', 'public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.tomnap_confirm_awb_matches(text,jsonb)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.awb_match_approvals', 'UPDATE')
     OR NOT (SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.awb_match_approvals'::regclass)
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.awb_match_approvals'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Re-applied AWB migrations are incomplete';
  END IF;
  IF (SELECT orders FROM awb_roundtrip_before) <> (SELECT count(*) FROM public.siparisler) THEN
    RAISE EXCEPTION 'Re-applying the AWB migrations changed order data';
  END IF;
END $$;
