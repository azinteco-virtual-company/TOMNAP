-- Rollback for supabase/migrations/20260927100000_v2_asama_koprusu.sql.
-- Drops only what this migration created: the temporary v2 stage bridge. Orders it moved
-- keep their stage and their history entries (data is not rolled back). Can run twice.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP FUNCTION IF EXISTS public.tomnap_v2_asama_ilerlet(text, text, uuid, text);
