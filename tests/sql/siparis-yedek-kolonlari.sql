-- Backup columns: siparisler must have exactly the columns listed in
-- tests/fixtures/siparisler-kolonlari.json. That list feeds the backup round-trip
-- test (tests/server/routes/yedekGidisDonus.test.ts); when a migration adds a
-- column, this fails until the list and the restore path both handle it.
-- Run from the repository root (CI does), after baseline + all migrations.
\set ON_ERROR_STOP 1
\set kolonlar `tr -d '\n' < tests/fixtures/siparisler-kolonlari.json`
-- psql does not expand variables inside $$ bodies; pass the list through a setting.
SELECT set_config('tomnap_test.kolonlar', :'kolonlar', false) AS kolonlar_ayari \gset

DO $$
DECLARE beklenen jsonb := current_setting('tomnap_test.kolonlar')::jsonb; gercek jsonb;
BEGIN
  SELECT jsonb_agg(column_name::text ORDER BY column_name::text) INTO gercek
    FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler';
  SELECT jsonb_agg(value ORDER BY value) INTO beklenen FROM jsonb_array_elements_text(beklenen);
  IF gercek IS DISTINCT FROM beklenen THEN
    RAISE EXCEPTION 'siparisler columns changed; update tests/fixtures/siparisler-kolonlari.json and the backup restore. Table: %, list: %', gercek, beklenen;
  END IF;
END $$;
