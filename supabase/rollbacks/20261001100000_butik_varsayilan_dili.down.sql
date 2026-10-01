-- Rollback for supabase/migrations/20261001100000_butik_varsayilan_dili.sql.
-- Drops only what this migration created: the varsayilan_dil column (and its CHECK).
-- The boutiques' chosen languages are lost; the application falls back to 'az'.
-- Can run twice.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
ALTER TABLE IF EXISTS public.tenant_v2_ayarlari DROP COLUMN IF EXISTS varsayilan_dil;
