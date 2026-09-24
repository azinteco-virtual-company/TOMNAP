-- Rollback for supabase/migrations/20260924150000_siparis_satirlari.sql.
-- Drops ONLY the objects that migration created: the RPC, the line table and
-- its trigger function, and the two columns it added to siparisler.
-- Refuses to run while v2 orders exist: dropping them silently would turn their
-- headers into v1 orders and lose their lines. Export or resolve them first.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DO $$ DECLARE v2_var boolean := false; BEGIN
  -- Dynamic: after a first rollback the column is gone and a static query would not parse.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'siparisler' AND column_name = 'model_surumu') THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.siparisler WHERE model_surumu = 2)' INTO v2_var;
  END IF;
  IF v2_var THEN
    RAISE EXCEPTION 'Rollback refused: v2 orders exist (model_surumu = 2)';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.tomnap_v2_siparis_olustur(text, text, jsonb, jsonb);
DROP TABLE IF EXISTS public.siparis_satirlari;
DROP FUNCTION IF EXISTS public.tomnap_siparis_satiri_kontrol();
ALTER TABLE public.siparisler DROP COLUMN IF EXISTS sahip_kullanici_id;
ALTER TABLE public.siparisler DROP COLUMN IF EXISTS model_surumu;
