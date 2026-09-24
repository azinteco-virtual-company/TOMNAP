-- Rollback for supabase/migrations/20260924140000_kurlar_ve_v2_ayarlari.sql.
-- Drops ONLY the objects that migration created (their rows are lost with the
-- tables). No pre-existing object is touched.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP TABLE IF EXISTS public.tenant_v2_ayarlari;
DROP TABLE IF EXISTS public.kurlar;
DROP FUNCTION IF EXISTS public.tomnap_kurlar_append_only();
