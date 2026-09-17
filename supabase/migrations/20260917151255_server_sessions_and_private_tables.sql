BEGIN;

-- Server-only data access. Browser requests must pass the TOMNAP session API.
-- service_role bypasses RLS; tenant authorization is enforced by that API.
CREATE TABLE IF NOT EXISTS public.oturumlar (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text NOT NULL REFERENCES public.kullanicilar(id) ON DELETE CASCADE,
  csrf_token text NOT NULL CHECK (csrf_token ~ '^[a-f0-9]{64}$'),
  credential_fingerprint text NOT NULL CHECK (credential_fingerprint ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS oturumlar_expires_at_idx ON public.oturumlar (expires_at);
CREATE INDEX IF NOT EXISTS oturumlar_user_id_idx ON public.oturumlar (user_id);

DO $$
DECLARE
  target text;
  old_policy record;
  column_list text;
BEGIN
  FOREACH target IN ARRAY ARRAY['firmalar', 'davetler', 'kullanicilar', 'siparisler', 'musteriler', 'inbox_mesajlar', 'kuryeler', 'oturumlar'] LOOP
    IF to_regclass(format('public.%I', target)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', target);
    -- Permissive policies combine with OR: remove previous allow-all policies.
    FOR old_policy IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = target LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', old_policy.policyname, target);
    END LOOP;
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', target);
    SELECT string_agg(quote_ident(attname), ', ') INTO column_list FROM pg_attribute
      WHERE attrelid = to_regclass(format('public.%I', target)) AND attnum > 0 AND NOT attisdropped;
    -- Table-level REVOKE does not remove previously granted column privileges.
    EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC, anon, authenticated', column_list, target);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', target);
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;

COMMIT;
