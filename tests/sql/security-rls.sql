-- Run only against the isolated test database, after both schema scripts/migration.
BEGIN;
DO $$
DECLARE target text; actor text;
BEGIN
  FOREACH target IN ARRAY ARRAY['firmalar','davetler','kullanicilar','siparisler','musteriler','inbox_mesajlar','kuryeler','oturumlar'] LOOP
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=target) THEN
      RAISE EXCEPTION 'Unexpected policy on %', target;
    END IF;
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_table_privilege(actor, format('public.%I',target),'SELECT,INSERT,UPDATE,DELETE') OR
         has_any_column_privilege(actor,format('public.%I',target),'SELECT,INSERT,UPDATE,REFERENCES') THEN
        RAISE EXCEPTION 'Unexpected grant to % on %',actor,target;
      END IF;
      EXECUTE format('SET LOCAL ROLE %I', actor);
      BEGIN
        EXECUTE format('SELECT * FROM public.%I LIMIT 1',target);
        RAISE EXCEPTION 'Unexpected browser table access';
      EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      RESET ROLE;
    END LOOP;
  END LOOP;
END $$;
-- Verify RLS independently from grants: accidental read grants still reveal no rows.
GRANT SELECT ON public.firmalar TO anon,authenticated;
SET LOCAL ROLE anon;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.firmalar) THEN RAISE EXCEPTION 'RLS failed for anon'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.firmalar) THEN RAISE EXCEPTION 'RLS failed for authenticated'; END IF; END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol) VALUES ('sql-session-fixture','kanada_shopper_baku','Synthetic','sql@example.invalid','PATRON');
INSERT INTO public.oturumlar(token_hash,user_id,csrf_token,credential_fingerprint,expires_at)
VALUES(repeat('a',64),'sql-session-fixture',repeat('b',64),repeat('c',64),now()+interval '8 hours');
DO $$ BEGIN
  IF (SELECT count(*) FROM public.oturumlar WHERE user_id='sql-session-fixture') <> 1 THEN RAISE EXCEPTION 'Service session insert failed'; END IF;
END $$;
DELETE FROM public.kullanicilar WHERE id='sql-session-fixture';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.oturumlar WHERE user_id='sql-session-fixture') THEN RAISE EXCEPTION 'Session cascade failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
