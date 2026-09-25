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
DECLARE yeni text[]; eksik text[];
BEGIN
  -- Set comparison: independent of the cluster's collation and of column order.
  SELECT array_agg(k) INTO yeni FROM (
    SELECT column_name::text AS k FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'siparisler'
    EXCEPT SELECT jsonb_array_elements_text(current_setting('tomnap_test.kolonlar')::jsonb)) t;
  SELECT array_agg(k) INTO eksik FROM (
    SELECT jsonb_array_elements_text(current_setting('tomnap_test.kolonlar')::jsonb) AS k
    EXCEPT SELECT column_name::text FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'siparisler') t;
  IF yeni IS NOT NULL OR eksik IS NOT NULL THEN
    RAISE EXCEPTION 'siparisler columns changed; update tests/fixtures/siparisler-kolonlari.json and the backup restore. Only in the table: %; only in the list: %', yeni, eksik;
  END IF;
END $$;
