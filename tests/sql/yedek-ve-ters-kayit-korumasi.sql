-- Migration 21 (Codex R5): B01 — v1 maintenance (merge, replace, and clear: OQ 42) is
-- refused in a tenant with v2 orders; B03 — a reversal keeps the receiver, source and method of its payment.
-- Signatures and grants unchanged; the R5 counterexamples corrupt the data without 21
-- (checked after the down) and are refused with it; down -> down -> up.
-- Run after baseline + all migrations, in ONE psql session, before the concurrency
-- tests (nothing here is committed except the down/up of 21 itself).
\set ON_ERROR_STOP 1

-- 1. Same signatures, configuration and grants as before; the bodies carry 21's markers.
DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.tomnap_restore_orders(text,uuid,text,jsonb)', 'public.tomnap_odeme_kontrol()'] LOOP
    IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe configuration of %', fn;
    END IF;
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Browser EXECUTE on %', fn;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.tomnap_restore_orders(text,uuid,text,jsonb)', 'EXECUTE')
     OR (SELECT prorettype <> 'jsonb'::regtype FROM pg_proc WHERE oid = 'public.tomnap_restore_orders(text,uuid,text,jsonb)'::regprocedure)
     OR (SELECT prosrc NOT LIKE '%Codex R5 B01%' FROM pg_proc WHERE oid = 'public.tomnap_restore_orders(text,uuid,text,jsonb)'::regprocedure)
     OR (SELECT prosrc NOT LIKE '%Codex R5 B03%' OR prosrc NOT LIKE '%FOR SHARE%' FROM pg_proc WHERE oid = 'public.tomnap_odeme_kontrol()'::regprocedure) THEN
    RAISE EXCEPTION 'Migration 21 is not in place as expected';
  END IF;
END $$;

-- Two tenants: yk-a with a v2 order of 100 AZN out for delivery with courier 1, yk-b
-- with v1 orders only.
CREATE FUNCTION pg_temp.yk_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('yk-a', 'Yedek A', 'AKTIF'), ('yk-b', 'Yedek B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('yk-patron-a', 'yk-a', 'Patron A', 'patron-a@yedek.test', 'PATRON', 'AKTIF'),
    ('yk-kurye1', 'yk-a', 'Kurye 1', 'kurye1@yedek.test', 'BAKU_KURYE', 'AKTIF'),
    ('yk-kurye2', 'yk-a', 'Kurye 2', 'kurye2@yedek.test', 'BAKU_KURYE', 'AKTIF');
  INSERT INTO public.kuryeler(id, tenant_id, ad_soyad, telefon, bolge, aktif, kullanici_id) VALUES
    ('yk-k1', 'yk-a', 'Kurye 1', '1', 'Nərimanov', true, 'yk-kurye1'),
    ('yk-k2', 'yk-a', 'Kurye 2', '2', 'Yasamal', true, 'yk-kurye2');
  PERFORM public.tomnap_v2_siparis_olustur('yk-a', 'yk-patron-a', '{"musteri_adi":"YK v2"}',
    '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]');
  UPDATE public.siparisler SET baku_kurye_id = 'yk-k1', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS'
   WHERE tenant_id = 'yk-a' AND model_surumu = 2;
  INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi) VALUES
    ('7b000000-0000-4000-8000-000000000001', 'yk-b', 'v1', 'YK v1', 'v1 item');
END $$;
CREATE FUNCTION pg_temp.yk_order() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE tenant_id = 'yk-a' AND model_surumu = 2
$$;
-- The v1 backup row of the R5 counterexample: the v2 order's id, alinan_tutar 0.
CREATE FUNCTION pg_temp.yk_v1_row(p_id uuid, p_tenant text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(jsonb_build_object('id', p_id, 'tenant_id', p_tenant, 'ham_mesaj', 'v1 backup',
    'musteri_adi', 'YK v1 backup', 'urun_aciklamasi', 'Bag', 'adet', 1, 'toplam_tutar', 100, 'alinan_tutar', 0))
$$;
-- Calls the restore RPC; answers 'ok:<toplam>' or the SQLSTATE.
CREATE FUNCTION pg_temp.yk_restore(p_tenant text, p_mode text, p_orders jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_restore_orders(p_tenant, gen_random_uuid(), p_mode, p_orders);
  RETURN 'ok:' || (r->>'toplam');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
-- Inserts a reversal of p_payment directly (as the service role may); 'ok' or SQLSTATE.
CREATE FUNCTION pg_temp.yk_reverse_direct(p_payment uuid, p_receiver text, p_source text, p_method text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE asil public.odemeler;
BEGIN
  SELECT * INTO asil FROM public.odemeler WHERE id = p_payment;
  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id)
  VALUES (asil.tenant_id, asil.siparis_id, -asil.tutar_azn, p_method, p_source, p_receiver,
          now(), 'yk-patron-a', 'Direct reversal', asil.id);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.yk_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;
-- The order's header next to its ledger: '<alinan>/<ledger sum>/<model>'.
CREATE FUNCTION pg_temp.yk_header(p_order uuid) RETURNS text LANGUAGE sql AS $$
  SELECT s.alinan_tutar::text || '/' || coalesce((SELECT sum(o.tutar_azn) FROM public.odemeler o WHERE o.siparis_id = s.id), 0)::text
         || '/' || s.model_surumu::text
    FROM public.siparisler s WHERE s.id = p_order
$$;

-- 2. B01 with 21: the R5 counterexample (ledger 40, v1 row with alinan_tutar 0), a plain
-- merge and a clear are refused in yk-a; yk-b keeps the old flow. Rolled back.
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid := pg_temp.yk_order(); lines int;
BEGIN
  PERFORM public.tomnap_v2_odeme_kaydet('yk-a', 'yk-patron-a',
    jsonb_build_object('siparis_id', s, 'tutar_azn', 40, 'yontem', 'NAKIT', 'kaynak', 'BUTIK'));
  PERFORM pg_temp.yk_expect(pg_temp.yk_header(s), '40.00/40.00/2', 'header before');
  SELECT count(*) INTO lines FROM public.siparis_satirlari WHERE siparis_id = s;
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'replace', pg_temp.yk_v1_row(s, 'yk-a')), 'PT409', 'R5 counterexample (replace)');
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'merge', pg_temp.yk_v1_row(gen_random_uuid(), 'yk-a')), 'PT409', 'merge into a v2 tenant');
  -- PT409 before the delete (the payment's foreign key would answer 23503).
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'clear', '[]'), 'PT409', 'clear of a v2 tenant');
  PERFORM pg_temp.yk_expect(pg_temp.yk_header(s), '40.00/40.00/2', 'header after the refusals');
  IF (SELECT count(*) FROM public.siparis_satirlari WHERE siparis_id = s) <> lines
     OR (SELECT count(*) FROM public.siparisler WHERE tenant_id = 'yk-a') <> 1
     OR EXISTS (SELECT 1 FROM public.order_maintenance_operations WHERE tenant_id = 'yk-a') THEN
    RAISE EXCEPTION 'A refused restore changed something';
  END IF;
  -- No v2 order in yk-b: replace works exactly as before.
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-b', 'replace', pg_temp.yk_v1_row('7b000000-0000-4000-8000-000000000002', 'yk-b')), 'ok:1', 'v1 tenant restore');
  IF (SELECT array_agg(id::text) FROM public.siparisler WHERE tenant_id = 'yk-b') IS DISTINCT FROM ARRAY['7b000000-0000-4000-8000-000000000002']
     OR pg_temp.yk_header(s) <> '40.00/40.00/2' THEN
    RAISE EXCEPTION 'The v1 tenant restore did not run as before';
  END IF;
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-b', 'clear', '[]'), 'ok:0', 'v1 tenant clear');
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE tenant_id = 'yk-b') THEN RAISE EXCEPTION 'v1 clear did not clear'; END IF;
END $$;
ROLLBACK;
-- A v2 order without payments is not cleared either (no foreign key would stop it).
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'clear', '[]'), 'PT409', 'clear of an unpaid v2 order');
  IF pg_temp.yk_order() IS NULL OR NOT EXISTS (SELECT 1 FROM public.siparis_satirlari WHERE siparis_id = pg_temp.yk_order()) THEN
    RAISE EXCEPTION 'A refused clear deleted the v2 order or its lines';
  END IF;
END $$;
ROLLBACK;

-- 3. B03 with 21: courier 1's 10 AZN cash collection. A direct reversal with another
-- courier, source or method is refused; the reversal RPC (copies all three) works.
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid := pg_temp.yk_order(); p10 uuid; p40 uuid; r public.odemeler;
BEGIN
  PERFORM public.tomnap_v2_kurye_tahsilati('yk-a', 'yk-kurye1', s, 10);
  SELECT id INTO p10 FROM public.odemeler WHERE siparis_id = s AND kaynak = 'TESLIMAT';
  PERFORM pg_temp.yk_expect(pg_temp.yk_reverse_direct(p10, 'yk-kurye2', 'TESLIMAT', 'NAKIT'), '23514', 'other courier');
  PERFORM pg_temp.yk_expect(pg_temp.yk_reverse_direct(p10, 'yk-kurye1', 'BUTIK', 'NAKIT'), '23514', 'other source');
  PERFORM pg_temp.yk_expect(pg_temp.yk_reverse_direct(p10, 'yk-kurye1', 'TESLIMAT', 'KART'), '23514', 'other method');
  IF EXISTS (SELECT 1 FROM public.odemeler WHERE alan_kullanici_id = 'yk-kurye2') THEN
    RAISE EXCEPTION 'A refused reversal left a row';
  END IF;
  PERFORM public.tomnap_v2_odeme_ters_kayit('yk-a', 'yk-patron-a', p10, 'Yanlış yazıldı');
  SELECT * INTO r FROM public.odemeler WHERE ters_kayit_odeme_id = p10;
  IF r.alan_kullanici_id <> 'yk-kurye1' OR r.kaynak <> 'TESLIMAT' OR r.yontem <> 'NAKIT' OR r.tutar_azn <> -10 THEN
    RAISE EXCEPTION 'The reversal RPC did not mirror the collection';
  END IF;
  PERFORM public.tomnap_v2_odeme_kaydet('yk-a', 'yk-patron-a',
    jsonb_build_object('siparis_id', s, 'tutar_azn', 40, 'yontem', 'KART', 'kaynak', 'ONLINE'));
  SELECT id INTO p40 FROM public.odemeler WHERE siparis_id = s AND kaynak = 'ONLINE';
  PERFORM public.tomnap_v2_odeme_ters_kayit('yk-a', 'yk-patron-a', p40, 'Kart geri qaytarıldı');
  PERFORM pg_temp.yk_expect(pg_temp.yk_header(s), '0.00/0.00/2', 'header after two RPC reversals');
END $$;
ROLLBACK;

-- 4. Down -> down: the old bodies are back, byte for byte the previous migrations'.
BEGIN;
\ir ../../supabase/rollbacks/20261002100000_yedek_ve_ters_kayit_korumasi.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20261002100000_yedek_ve_ters_kayit_korumasi.down.sql
COMMIT;
DO $$ BEGIN
  IF (SELECT prosrc LIKE '%Codex R5%' OR prosrc NOT LIKE '%LOCK TABLE public.siparisler IN SHARE ROW EXCLUSIVE MODE%'
        FROM pg_proc WHERE oid = 'public.tomnap_restore_orders(text,uuid,text,jsonb)'::regprocedure)
     OR (SELECT prosrc LIKE '%Codex R5%' OR prosrc NOT LIKE '%FOR SHARE%'
        FROM pg_proc WHERE oid = 'public.tomnap_odeme_kontrol()'::regprocedure)
     OR NOT has_function_privilege('service_role', 'public.tomnap_restore_orders(text,uuid,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'The rollback did not restore the previous bodies';
  END IF;
END $$;

-- Without 21 both R5 counterexamples corrupt the data: this is what the tests above
-- guard against (and why they would fail on the old bodies). Rolled back.
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid := pg_temp.yk_order(); p10 uuid;
BEGIN
  PERFORM public.tomnap_v2_odeme_kaydet('yk-a', 'yk-patron-a',
    jsonb_build_object('siparis_id', s, 'tutar_azn', 40, 'yontem', 'NAKIT', 'kaynak', 'BUTIK'));
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'replace', pg_temp.yk_v1_row(s, 'yk-a')), 'ok:1', 'old body accepts the v1 row');
  PERFORM pg_temp.yk_expect(pg_temp.yk_header(s), '0.00/40.00/2', 'old body: header apart from the ledger');
  PERFORM public.tomnap_v2_kurye_tahsilati('yk-a', 'yk-kurye1', s, 10);
  SELECT id INTO p10 FROM public.odemeler WHERE siparis_id = s AND kaynak = 'TESLIMAT';
  PERFORM pg_temp.yk_expect(pg_temp.yk_reverse_direct(p10, 'yk-kurye2', 'TESLIMAT', 'NAKIT'), 'ok', 'old body: reversal with another courier');
END $$;
ROLLBACK;
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'clear', '[]'), 'ok:0', 'old body clears a v2 tenant');
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE tenant_id = 'yk-a') THEN
    RAISE EXCEPTION 'Expected the old body to delete the unpaid v2 order';
  END IF;
END $$;
ROLLBACK;

-- 5. Up again: markers back, the counterexample refused once more.
\ir ../../supabase/migrations/20261002100000_yedek_ve_ters_kayit_korumasi.sql
BEGIN;
SELECT pg_temp.yk_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE s uuid := pg_temp.yk_order();
BEGIN
  IF (SELECT prosrc NOT LIKE '%Codex R5 B01%' FROM pg_proc WHERE oid = 'public.tomnap_restore_orders(text,uuid,text,jsonb)'::regprocedure)
     OR (SELECT prosrc NOT LIKE '%Codex R5 B03%' FROM pg_proc WHERE oid = 'public.tomnap_odeme_kontrol()'::regprocedure) THEN
    RAISE EXCEPTION 'Re-applied migration 21 is incomplete';
  END IF;
  PERFORM public.tomnap_v2_odeme_kaydet('yk-a', 'yk-patron-a',
    jsonb_build_object('siparis_id', s, 'tutar_azn', 40, 'yontem', 'NAKIT', 'kaynak', 'BUTIK'));
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'replace', pg_temp.yk_v1_row(s, 'yk-a')), 'PT409', 'after re-apply');
  PERFORM pg_temp.yk_expect(pg_temp.yk_restore('yk-a', 'clear', '[]'), 'PT409', 'clear after re-apply');
  PERFORM pg_temp.yk_expect(pg_temp.yk_header(s), '40.00/40.00/2', 'header after re-apply');
END $$;
ROLLBACK;
