-- Rollback for supabase/migrations/20260925110000_odemeler.sql.
-- Drops ONLY the objects that migration created: the two RPCs, the ledger table and
-- its trigger functions. Refuses to run while payments exist: dropping the ledger would
-- silently lose the money trail (the orders keep alinan_tutar, but not who took it,
-- how and when). Export or resolve them first.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DO $$ DECLARE var boolean := false; BEGIN
  IF to_regclass('public.odemeler') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.odemeler)' INTO var;
  END IF;
  IF var THEN
    RAISE EXCEPTION 'Rollback refused: payments exist in public.odemeler';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.tomnap_v2_odeme_ters_kayit(text, text, uuid, text);
DROP FUNCTION IF EXISTS public.tomnap_v2_odeme_kaydet(text, text, jsonb);
DROP TABLE IF EXISTS public.odemeler;
DROP FUNCTION IF EXISTS public.tomnap_odeme_siparis_ozeti();
DROP FUNCTION IF EXISTS public.tomnap_odeme_kontrol();
DROP FUNCTION IF EXISTS public.tomnap_odemeler_append_only();
