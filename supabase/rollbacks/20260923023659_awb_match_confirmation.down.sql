-- Rollback for supabase/migrations/20260923023659_awb_match_confirmation.sql.
-- Guardrail: no DROP. The function stays in the catalog but no API role can
-- execute it, so confirmations fail closed. Also set FF_V2_FLOW=false.
-- Re-enable by running the forward migration again (CREATE OR REPLACE + GRANT).
-- Deliberately without BEGIN/COMMIT: a single statement, and it can be included
-- inside a test transaction (tests/sql/awb-match-confirmation.sql).
REVOKE ALL ON FUNCTION public.tomnap_confirm_awb_matches(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
