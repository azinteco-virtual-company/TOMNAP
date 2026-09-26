-- Rollback for supabase/migrations/20260925130000_kacaklar.sql.
-- Drops ONLY the two read-only leak functions that migration created. No data involved.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP FUNCTION IF EXISTS public.tomnap_v2_kacak_q5(text, integer);
DROP FUNCTION IF EXISTS public.tomnap_v2_kacak_q4(text, integer);
