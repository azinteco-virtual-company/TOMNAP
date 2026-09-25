-- Rollback for supabase/migrations/20260925120000_kasa_teslimleri.sql.
-- Drops ONLY what that migration created (the hand-over table, its trigger function and
-- the four RPCs), takes back the UPDATE (kasa_teslim_id) grant on odemeler and puts back
-- the A10 bodies of tomnap_odemeler_append_only and tomnap_odeme_kontrol.
-- Refuses while hand-overs exist: they close payments (kasa_teslim_id), and dropping them
-- would leave the ledger pointing at nothing. Courier collections (kaynak TESLIMAT) stay:
-- they are A10 ledger rows.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
DO $$ DECLARE var boolean := false; BEGIN
  IF to_regclass('public.kasa_teslimleri') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.kasa_teslimleri)' INTO var;
  END IF;
  IF var THEN
    RAISE EXCEPTION 'Rollback refused: cash hand-overs exist in public.kasa_teslimleri';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.tomnap_v2_kasa_teslimi(text, text, text, uuid[], numeric, text);
DROP FUNCTION IF EXISTS public.tomnap_v2_kurye_nakit_durumu(text, text);
DROP FUNCTION IF EXISTS public.tomnap_v2_kurye_bakiyeleri(text, text);
DROP FUNCTION IF EXISTS public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric);
DROP TABLE IF EXISTS public.kasa_teslimleri;
DROP FUNCTION IF EXISTS public.tomnap_kasa_teslimleri_append_only();
-- The ledger objects belong to A10; restore them only while A10 is in place.
DO $down$ BEGIN
  IF to_regclass('public.odemeler') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'REVOKE UPDATE (kasa_teslim_id) ON public.odemeler FROM service_role';
  EXECUTE $a10$
CREATE OR REPLACE FUNCTION public.tomnap_odemeler_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
BEGIN
  RAISE EXCEPTION 'odemeler is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $body$;
$a10$;
  EXECUTE $a10$
CREATE OR REPLACE FUNCTION public.tomnap_odeme_kontrol()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $body$
DECLARE asil public.odemeler;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.siparisler s
                  WHERE s.id = NEW.siparis_id AND s.tenant_id = NEW.tenant_id AND s.model_surumu = 2) THEN
    RAISE EXCEPTION 'A payment needs a v2 order of the same tenant' USING ERRCODE = '23514';
  END IF;
  IF NEW.kasa_teslim_id IS NOT NULL THEN
    RAISE EXCEPTION 'A payment is recorded before any cash hand-over' USING ERRCODE = '23514';
  END IF;
  IF NEW.ters_kayit_odeme_id IS NOT NULL THEN
    SELECT * INTO asil FROM public.odemeler WHERE id = NEW.ters_kayit_odeme_id;
    IF NOT FOUND OR asil.tenant_id <> NEW.tenant_id OR asil.siparis_id <> NEW.siparis_id
       OR asil.ters_kayit_odeme_id IS NOT NULL OR asil.tutar_azn <> -NEW.tutar_azn THEN
      RAISE EXCEPTION 'A reversal must mirror one payment of the same order' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $body$;
$a10$;
END $down$;
