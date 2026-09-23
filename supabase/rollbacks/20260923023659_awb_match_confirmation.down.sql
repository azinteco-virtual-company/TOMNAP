-- Rollback for supabase/migrations/20260923023659_awb_match_confirmation.sql.
-- Drops ONLY the object that migration created; nothing that existed before it.
-- Apply AFTER 20260923164650_awb_match_approvals.down.sql (newest first).
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP FUNCTION IF EXISTS public.tomnap_confirm_awb_matches(text, jsonb);
