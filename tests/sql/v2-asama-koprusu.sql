-- v2 stage bridge (20260927100000; TEMPORARY, OPEN_QUESTIONS 38). A v2 order moves one
-- stage forward only: KANADA_SATINALIM_BEKLIYOR -> KANADA_DEPO -> ULUSLARARASI_KARGO ->
-- BAKU_DAGITIM_ARKADAS. No step back, no skip, never TESLIM_EDILDI (the courier delivery
-- keeps writing that). The caller's expected stage must match (PT409); v2 orders only.
-- Roles come from the v1 groups: SHIPPING (PATRON, buyers) for the Canada and cargo
-- steps, COURIER_ASSIGN (PATRON, KANADA_SATINALMA) for the Baku step; SUPER_ADMIN never.
-- Every step is appended to ek_veriler.islem_gecmisi. Then down -> down -> up.
-- Run after odeme-islem-anahtari.sql, in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Access and safety settings; the function says it is temporary.
DO $$ DECLARE fn text := 'public.tomnap_v2_asama_ilerlet(text,text,uuid,text)'; BEGIN
  IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
     OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
  END IF;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
    RAISE EXCEPTION 'Unsafe configuration of %', fn;
  END IF;
  IF coalesce(obj_description(fn::regprocedure, 'pg_proc'), '') !~ 'TEMPORARY' THEN
    RAISE EXCEPTION 'The bridge is not marked temporary';
  END IF;
END $$;

CREATE FUNCTION pg_temp.ak_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('ak-a', 'Asama A', 'AKTIF'), ('ak-b', 'Asama B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('ak-patron', 'ak-a', 'Patron', 'patron@asama.test', 'PATRON', 'AKTIF'),
    ('ak-kanada', 'ak-a', 'Kanada', 'kanada@asama.test', 'KANADA_SATINALMA', 'AKTIF'),
    ('ak-abd', 'ak-a', 'ABD', 'abd@asama.test', 'ABD_SATINALMA', 'AKTIF'),
    ('ak-satis', 'ak-a', 'Satis', 'satis@asama.test', 'SATIS_SORUMLUSU', 'AKTIF'),
    ('ak-finans', 'ak-a', 'Finans', 'finans@asama.test', 'BAKU_FINANS', 'AKTIF'),
    ('ak-kurye', 'ak-a', 'Kurye', 'kurye@asama.test', 'BAKU_KURYE', 'AKTIF'),
    ('ak-admin', 'ak-a', 'Admin', 'admin@asama.test', 'SUPER_ADMIN', 'AKTIF'),
    ('ak-pasif', 'ak-a', 'Pasif', 'pasif@asama.test', 'PATRON', 'PASIF'),
    ('ak-patron-b', 'ak-b', 'Patron B', 'patronb@asama.test', 'PATRON', 'AKTIF');
  PERFORM public.tomnap_v2_siparis_olustur('ak-a', 'ak-patron', '{"musteri_adi":"Asama"}',
    '[{"urun_aciklamasi":"Canta","adet":1,"birim_satis_fiyati_azn":10,"kaynak_ulke":"CA"}]');
  PERFORM public.tomnap_v2_siparis_olustur('ak-b', 'ak-patron-b', '{"musteri_adi":"Asama B"}',
    '[{"urun_aciklamasi":"Canta","adet":1,"birim_satis_fiyati_azn":10,"kaynak_ulke":"CA"}]');
  INSERT INTO public.siparisler(tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, toplam_tutar)
    VALUES ('ak-a', 'v1', 'V1 musteri', 'Canta', 10);
END $$;
CREATE FUNCTION pg_temp.ak_order(p_tenant text, p_v2 boolean DEFAULT true) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE tenant_id = p_tenant AND (model_surumu = 2) = p_v2
   ORDER BY olusturma_tarihi LIMIT 1
$$;
-- The new stage of one step, or the SQLSTATE.
CREATE FUNCTION pg_temp.ak_step(p_user text, p_expected text, p_order uuid DEFAULT NULL,
                                p_tenant text DEFAULT 'ak-a') RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_asama_ilerlet(p_tenant, p_user, coalesce(p_order, pg_temp.ak_order('ak-a')), p_expected);
  RETURN r->'siparis'->>'lojistik_durumu';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.ak_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;
CREATE FUNCTION pg_temp.ak_stage() RETURNS text LANGUAGE sql AS $$
  SELECT lojistik_durumu::text FROM public.siparisler WHERE id = pg_temp.ak_order('ak-a')
$$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.ak_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE gecmis jsonb;
BEGIN
  -- Who may take the first step: SHIPPING without SUPER_ADMIN, active, of this tenant.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-admin', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'platform admin');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-satis', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'sales');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-finans', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'Baku finance');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-kurye', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'courier');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-pasif', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'inactive owner');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron-b', 'KANADA_SATINALIM_BEKLIYOR'), 'PT403', 'owner of another tenant');
  PERFORM pg_temp.ak_expect(pg_temp.ak_stage(), 'KANADA_SATINALIM_BEKLIYOR', 'refusals changed nothing');
  -- The expected stage must be the current one: no skip ahead, no stale step.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_DEPO'), 'PT409', 'expected a later stage');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'TESLIM_EDILDI'), 'PT409', 'expected delivered');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'YOK_BOYLE'), 'PT409', 'unknown stage');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', NULL), '22023', 'no expected stage');
  -- One step at a time, in order.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-abd', 'KANADA_SATINALIM_BEKLIYOR'), 'KANADA_DEPO', 'US buyer, step 1');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR'), 'PT409', 'the same step again');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-kanada', 'KANADA_DEPO'), 'ULUSLARARASI_KARGO', 'Canada buyer, step 2');
  -- The Baku step is COURIER_ASSIGN: PATRON and KANADA_SATINALMA only.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-abd', 'ULUSLARARASI_KARGO'), 'PT403', 'US buyer, Baku step');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-admin', 'ULUSLARARASI_KARGO'), 'PT403', 'platform admin, Baku step');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-kanada', 'ULUSLARARASI_KARGO'), 'BAKU_DAGITIM_ARKADAS', 'Canada buyer, Baku step');
  -- No step after Baku distribution: delivery belongs to the courier flow; no step back.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'BAKU_DAGITIM_ARKADAS'), 'PT409', 'no step to delivered');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'ULUSLARARASI_KARGO'), 'PT409', 'no step back');
  PERFORM pg_temp.ak_expect(pg_temp.ak_stage(), 'BAKU_DAGITIM_ARKADAS', 'final stage');
  -- History: who, when, old -> new, one entry per step.
  SELECT ek_veriler->'islem_gecmisi' INTO gecmis FROM public.siparisler WHERE id = pg_temp.ak_order('ak-a');
  PERFORM pg_temp.ak_expect(jsonb_array_length(gecmis)::text, '3', 'three history entries');
  PERFORM pg_temp.ak_expect(
    (SELECT string_agg(e->>'yapan_kisi' || ':' || (e->>'yapan_rol') || ':' || (e->>'eylem') || ':' || (e->>'aciklama'), ' | ')
       FROM jsonb_array_elements(gecmis) e),
    'ak-abd:ABD_SATINALMA:V2_ASAMA_ILERLETILDI:KANADA_SATINALIM_BEKLIYOR -> KANADA_DEPO | '
    || 'ak-kanada:KANADA_SATINALMA:V2_ASAMA_ILERLETILDI:KANADA_DEPO -> ULUSLARARASI_KARGO | '
    || 'ak-kanada:KANADA_SATINALMA:V2_ASAMA_ILERLETILDI:ULUSLARARASI_KARGO -> BAKU_DAGITIM_ARKADAS',
    'history entries');
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(gecmis) e WHERE (e->>'tarih')::timestamptz IS NULL) THEN
    RAISE EXCEPTION 'History entry without a time';
  END IF;
  -- v1 orders, other tenants' orders and unknown orders are not moved.
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR', pg_temp.ak_order('ak-a', false)), 'PT409', 'v1 order');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR', pg_temp.ak_order('ak-b')), 'PT404', 'order of another tenant');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR', gen_random_uuid()), 'PT404', 'unknown order');
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR', NULL, 'all'), '22023', 'tenant all');
  PERFORM pg_temp.ak_expect(
    (SELECT lojistik_durumu::text FROM public.siparisler WHERE id = pg_temp.ak_order('ak-b')),
    'KANADA_SATINALIM_BEKLIYOR', 'the other tenant''s order did not move');
END $$;
ROLLBACK;

-- A delivered v2 order has no next stage either.
BEGIN;
SELECT pg_temp.ak_fixture();
UPDATE public.siparisler SET lojistik_durumu = 'TESLIM_EDILDI' WHERE id = pg_temp.ak_order('ak-a');
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'TESLIM_EDILDI'), 'PT409', 'delivered order');
END $$;
ROLLBACK;

-- 3. Down (twice) drops only the bridge; up again brings it back.
BEGIN;
\ir ../../supabase/rollbacks/20260927100000_v2_asama_koprusu.down.sql
\ir ../../supabase/rollbacks/20260927100000_v2_asama_koprusu.down.sql
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_v2_asama_ilerlet(text,text,uuid,text)') IS NOT NULL THEN
    RAISE EXCEPTION 'The bridge survived its rollback';
  END IF;
  IF to_regprocedure('public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)') IS NULL
     OR to_regclass('public.odemeler') IS NULL THEN
    RAISE EXCEPTION 'The rollback dropped more than the bridge';
  END IF;
END $$;
COMMIT;
\ir ../../supabase/migrations/20260927100000_v2_asama_koprusu.sql
BEGIN;
SELECT pg_temp.ak_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.ak_expect(pg_temp.ak_step('ak-patron', 'KANADA_SATINALIM_BEKLIYOR'), 'KANADA_DEPO', 'after re-apply');
END $$;
ROLLBACK;

SELECT 'v2 stage bridge passed' AS result;
