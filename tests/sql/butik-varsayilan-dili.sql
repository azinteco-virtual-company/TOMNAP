-- Boutique default language (20261001100000; docs/i18n.md). One new column on
-- tenant_v2_ayarlari: NOT NULL, default 'az', format CHECK (two or three lower-case
-- letters; the supported list lives in the application), service_role only. Existing rows
-- get 'az'. Then down -> down -> up: only the column goes, rows and other columns stay.
-- Run after kurlar-ve-v2-ayarlari.sql (it re-applies this migration), in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Shape and access.
DO $$ DECLARE actor text; priv text; BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'public.tenant_v2_ayarlari'::regclass AND a.attname = 'varsayilan_dil'
       AND a.attnotnull AND format_type(a.atttypid, a.atttypmod) = 'text'
       AND pg_get_expr(d.adbin, d.adrelid) = '''az''::text') THEN
    RAISE EXCEPTION 'varsayilan_dil is not text NOT NULL DEFAULT ''az''';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
      IF has_column_privilege(actor, 'public.tenant_v2_ayarlari', 'varsayilan_dil', priv) THEN
        RAISE EXCEPTION '% has % on varsayilan_dil', actor, priv;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF NOT has_column_privilege('service_role', 'public.tenant_v2_ayarlari', 'varsayilan_dil', priv) THEN
      RAISE EXCEPTION 'service_role lacks % on varsayilan_dil', priv;
    END IF;
  END LOOP;
END $$;

-- 2. Default, format and the untouched upsert of the other settings.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.tenant_v2_ayarlari(tenant_id, guncelleyen_kullanici_id) VALUES ('dil-a', 'u-a');
INSERT INTO public.tenant_v2_ayarlari(tenant_id, guncelleyen_kullanici_id, varsayilan_dil)
  VALUES ('dil-b', 'u-b', 'en'), ('dil-c', 'u-c', 'fil');
-- An upsert that does not name the language keeps it (the API updates only given fields).
INSERT INTO public.tenant_v2_ayarlari(tenant_id, guncelleyen_kullanici_id, aylik_beyan_sinir_usd)
  VALUES ('dil-b', 'u-b', 250)
  ON CONFLICT (tenant_id) DO UPDATE SET aylik_beyan_sinir_usd = EXCLUDED.aylik_beyan_sinir_usd;
DO $$ DECLARE bad text; failed boolean; BEGIN
  IF (SELECT string_agg(tenant_id || '=' || varsayilan_dil, ',' ORDER BY tenant_id)
        FROM public.tenant_v2_ayarlari WHERE tenant_id LIKE 'dil-%') <> 'dil-a=az,dil-b=en,dil-c=fil' THEN
    RAISE EXCEPTION 'Wrong default or the upsert changed the language';
  END IF;
  FOREACH bad IN ARRAY ARRAY['AZ', 'a', 'abcd', 'a1', '', 'az-AZ', 'en '] LOOP
    failed := false;
    BEGIN
      UPDATE public.tenant_v2_ayarlari SET varsayilan_dil = bad WHERE tenant_id = 'dil-a';
    EXCEPTION WHEN check_violation THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'The format check accepted "%"', bad; END IF;
  END LOOP;
  failed := false;
  BEGIN
    UPDATE public.tenant_v2_ayarlari SET varsayilan_dil = NULL WHERE tenant_id = 'dil-a';
  EXCEPTION WHEN not_null_violation THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'varsayilan_dil accepted NULL'; END IF;
END $$;
ROLLBACK;

-- 3. Down (twice) drops only the column; rows stay. Up again (outside a transaction: the
--    migration has its own): existing rows read 'az'. The probe row is removed at the end.
BEGIN;
INSERT INTO public.tenant_v2_ayarlari(tenant_id, guncelleyen_kullanici_id, varsayilan_dil, aylik_beyan_sinir_usd)
  VALUES ('dil-geri', 'u-g', 'en', 123);
\ir ../../supabase/rollbacks/20261001100000_butik_varsayilan_dili.down.sql
\ir ../../supabase/rollbacks/20261001100000_butik_varsayilan_dili.down.sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.tenant_v2_ayarlari'::regclass
               AND attname = 'varsayilan_dil' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'The column survived its rollback';
  END IF;
  IF (SELECT aylik_beyan_sinir_usd FROM public.tenant_v2_ayarlari WHERE tenant_id = 'dil-geri') <> 123 THEN
    RAISE EXCEPTION 'The rollback lost the settings row';
  END IF;
END $$;
COMMIT;
\ir ../../supabase/migrations/20261001100000_butik_varsayilan_dili.sql
DO $$ BEGIN
  IF (SELECT varsayilan_dil FROM public.tenant_v2_ayarlari WHERE tenant_id = 'dil-geri') <> 'az' THEN
    RAISE EXCEPTION 'An existing row does not read az after re-apply';
  END IF;
END $$;
DELETE FROM public.tenant_v2_ayarlari WHERE tenant_id = 'dil-geri';

SELECT 'boutique default language passed' AS result;
