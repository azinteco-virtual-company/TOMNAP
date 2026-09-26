-- Rollback for supabase/migrations/20260925150000_siparis_guncelle.sql.
-- Drops ONLY the function that migration created. Roll the code back first: the order
-- edit route (PATCH /api/siparisler/:id) calls it.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DROP FUNCTION IF EXISTS public.tomnap_siparis_guncelle(text, uuid, jsonb, jsonb);
