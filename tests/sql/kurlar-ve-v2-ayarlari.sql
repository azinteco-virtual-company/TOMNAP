-- Kurlar ve v2 ayarları (A7): access, append-only rates, settings upsert, and
-- up -> down -> up of the migration. Run after baseline + all migrations, in
-- ONE psql session. Test rows are written inside transactions that are rolled back.
\set ON_ERROR_STOP 1

-- 1. Access: RLS forced, nothing for browser roles, service_role only what the API needs.
DO $$ DECLARE actor text; tbl text; priv text; BEGIN
  FOREACH tbl IN ARRAY ARRAY['public.kurlar', 'public.tenant_v2_ayarlari'] LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = tbl::regclass) THEN
      RAISE EXCEPTION 'Row level security is not forced on %', tbl;
    END IF;
    FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
        IF has_table_privilege(actor, tbl, priv) THEN RAISE EXCEPTION '% has % on %', actor, priv, tbl; END IF;
      END LOOP;
      FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
        IF has_any_column_privilege(actor, tbl, priv) THEN RAISE EXCEPTION '% has column % on %', actor, priv, tbl; END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.kurlar', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.kurlar', 'INSERT')
     OR has_table_privilege('service_role', 'public.kurlar', 'UPDATE')
     OR has_table_privilege('service_role', 'public.kurlar', 'DELETE')
     OR has_table_privilege('service_role', 'public.kurlar', 'TRUNCATE')
     OR has_any_column_privilege('service_role', 'public.kurlar', 'UPDATE') THEN
    RAISE EXCEPTION 'kurlar grants more than SELECT and INSERT to service_role';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.tenant_v2_ayarlari', 'UPDATE')
     OR has_table_privilege('service_role', 'public.tenant_v2_ayarlari', 'DELETE')
     OR has_table_privilege('service_role', 'public.tenant_v2_ayarlari', 'TRUNCATE') THEN
    RAISE EXCEPTION 'tenant_v2_ayarlari privileges are wrong';
  END IF;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = 'public.tomnap_kurlar_append_only()'::regprocedure)
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.kurlar'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'kurlar append-only triggers are missing or unsafe';
  END IF;
END $$;

-- 2. Rates are append-only: the API role cannot change them, and the triggers
--    stop even the table owner. Invalid rates are rejected by constraints.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.kurlar(tenant_id, para_birimi, tarih, azn_karsiligi, kaynak, giren_kullanici_id) VALUES
  ('kur-a', 'CAD', '2026-09-24', 1.2345, 'Test', 'u-a'),
  ('kur-a', 'CAD', '2026-09-24', 1.24, NULL, 'u-a'),
  ('kur-b', 'USD', '2026-09-24', 1.7, 'B', 'u-b');
DO $$ DECLARE failed boolean; stmt text; bad text; BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    'UPDATE public.kurlar SET azn_karsiligi = 9 WHERE tenant_id = ''kur-a''',
    'DELETE FROM public.kurlar WHERE tenant_id = ''kur-a''',
    'TRUNCATE public.kurlar'] LOOP
    failed := false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'service_role could run: %', stmt; END IF;
  END LOOP;
  FOREACH bad IN ARRAY ARRAY[
    '(''kur-a'', ''EUR'', DATE ''2026-09-24'', 1.1, ''u'')',
    '(''kur-a'', ''CAD'', DATE ''2026-09-24'', 0, ''u'')',
    '(''kur-a'', ''CAD'', DATE ''2026-09-24'', -1, ''u'')',
    '(''kur-a'', ''CAD'', DATE ''2026-09-24'', 100, ''u'')',
    '(''all'', ''CAD'', DATE ''2026-09-24'', 1.2, ''u'')',
    '(''kur-a'', ''CAD'', DATE ''1999-12-31'', 1.2, ''u'')',
    '(''kur-a'', ''CAD'', DATE ''2026-09-24'', 1.2, '''')'] LOOP
    failed := false;
    BEGIN
      EXECUTE 'INSERT INTO public.kurlar(tenant_id, para_birimi, tarih, azn_karsiligi, giren_kullanici_id) VALUES ' || bad;
    EXCEPTION WHEN check_violation THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid rate accepted: %', bad; END IF;
  END LOOP;
  IF (SELECT azn_karsiligi FROM public.kurlar WHERE tenant_id = 'kur-a' AND para_birimi = 'CAD'
       ORDER BY olusturma_zamani DESC, id DESC LIMIT 1) IS NULL
     OR (SELECT count(*) FROM public.kurlar WHERE tenant_id IN ('kur-a', 'kur-b')) <> 3 THEN
    RAISE EXCEPTION 'Rates changed or disappeared';
  END IF;
END $$;
RESET ROLE;
DO $$ DECLARE failed boolean; stmt text; BEGIN
  FOREACH stmt IN ARRAY ARRAY[
    'UPDATE public.kurlar SET kaynak = ''x'' WHERE tenant_id = ''kur-a''',
    'DELETE FROM public.kurlar WHERE tenant_id = ''kur-b''',
    'TRUNCATE public.kurlar'] LOOP
    failed := false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN failed := SQLERRM LIKE 'kurlar is append-only%'; END;
    IF NOT failed THEN RAISE EXCEPTION 'The table owner could run: %', stmt; END IF;
  END LOOP;
END $$;
ROLLBACK;

-- 3. Settings: defaults, upsert, bounds; a row cannot be deleted by the API role.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.tenant_v2_ayarlari(tenant_id, guncelleyen_kullanici_id) VALUES ('ayar-a', 'u-a');
DO $$ DECLARE s public.tenant_v2_ayarlari; failed boolean; bad text; BEGIN
  SELECT * INTO s FROM public.tenant_v2_ayarlari WHERE tenant_id = 'ayar-a';
  IF s.aylik_beyan_sinir_usd <> 300 OR s.prim_orani_varsayilan <> 0.05 OR s.varsayilan_kg_fiyati_azn IS NOT NULL THEN
    RAISE EXCEPTION 'Wrong settings defaults: %', to_jsonb(s);
  END IF;
  INSERT INTO public.tenant_v2_ayarlari(tenant_id, aylik_beyan_sinir_usd, varsayilan_kg_fiyati_azn, guncelleyen_kullanici_id)
  VALUES ('ayar-a', 350, 12.5, 'u-b')
  ON CONFLICT (tenant_id) DO UPDATE SET aylik_beyan_sinir_usd = EXCLUDED.aylik_beyan_sinir_usd,
    varsayilan_kg_fiyati_azn = EXCLUDED.varsayilan_kg_fiyati_azn, guncelleyen_kullanici_id = EXCLUDED.guncelleyen_kullanici_id;
  SELECT * INTO s FROM public.tenant_v2_ayarlari WHERE tenant_id = 'ayar-a';
  IF s.aylik_beyan_sinir_usd <> 350 OR s.varsayilan_kg_fiyati_azn <> 12.5 OR s.prim_orani_varsayilan <> 0.05
     OR s.guncelleyen_kullanici_id <> 'u-b' THEN
    RAISE EXCEPTION 'Upsert did not update the settings: %', to_jsonb(s);
  END IF;
  FOREACH bad IN ARRAY ARRAY['aylik_beyan_sinir_usd = 0', 'aylik_beyan_sinir_usd = -5', 'prim_orani_varsayilan = 1.5',
                             'prim_orani_varsayilan = -0.1', 'varsayilan_kg_fiyati_azn = -1'] LOOP
    failed := false;
    BEGIN EXECUTE 'UPDATE public.tenant_v2_ayarlari SET ' || bad || ' WHERE tenant_id = ''ayar-a''';
    EXCEPTION WHEN check_violation THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'Invalid setting accepted: %', bad; END IF;
  END LOOP;
  failed := false;
  BEGIN DELETE FROM public.tenant_v2_ayarlari WHERE tenant_id = 'ayar-a'; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'service_role deleted settings'; END IF;
END $$;
ROLLBACK;

-- 4. Up -> down -> up. The rollback is idempotent and drops only this
--    migration's objects.
BEGIN;
\ir ../../supabase/rollbacks/20260924140000_kurlar_ve_v2_ayarlari.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260924140000_kurlar_ve_v2_ayarlari.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regclass('public.kurlar') IS NOT NULL OR to_regclass('public.tenant_v2_ayarlari') IS NOT NULL
     OR to_regprocedure('public.tomnap_kurlar_append_only()') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback left kurlar objects behind';
  END IF;
  IF to_regclass('public.firmalar') IS NULL OR to_regclass('public.siparisler') IS NULL
     OR to_regclass('public.awb_match_approvals') IS NULL
     OR to_regprocedure('public.tomnap_gecerli_rol(text)') IS NULL THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
END $$;
\ir ../../supabase/migrations/20260924140000_kurlar_ve_v2_ayarlari.sql
DO $$ BEGIN
  IF to_regclass('public.kurlar') IS NULL OR to_regclass('public.tenant_v2_ayarlari') IS NULL
     OR NOT has_table_privilege('service_role', 'public.kurlar', 'INSERT')
     OR has_table_privilege('service_role', 'public.kurlar', 'UPDATE')
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.kurlar'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Re-applied kurlar migration is incomplete';
  END IF;
END $$;
