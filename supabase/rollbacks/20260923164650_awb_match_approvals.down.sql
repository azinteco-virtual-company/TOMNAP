-- Rollback for supabase/migrations/20260923164650_awb_match_approvals.sql.
-- Drops ONLY objects that migration created (the approval rows are lost with
-- the table) and restores the previous grant of tomnap_confirm_awb_matches.
-- Apply BEFORE rolling back 20260923023659_awb_match_confirmation.sql.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP FUNCTION IF EXISTS public.tomnap_approve_awb_matches(text, text, jsonb, jsonb);
DROP TABLE IF EXISTS public.awb_match_approvals;
DROP FUNCTION IF EXISTS public.tomnap_awb_match_approvals_append_only();
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_confirm_awb_matches(text,jsonb)') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.tomnap_confirm_awb_matches(text, jsonb) TO service_role;
  END IF;
END $$;
