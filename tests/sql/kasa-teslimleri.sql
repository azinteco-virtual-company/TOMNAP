-- Kurye nakdi ve kasa teslimi (A11): access, courier collection (own orders only),
-- hand-over (exact, once, not above the balance), balance = Σ cash − Σ hand-overs,
-- the one allowed change on odemeler, and down -> down -> up.
-- Run after odemeler.sql, in ONE psql session, BEFORE the race tests (which commit).
\set ON_ERROR_STOP 1

-- 1. Access.
DO $$ DECLARE actor text; priv text; fn text; BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.kasa_teslimleri'::regclass) THEN
    RAISE EXCEPTION 'Row level security is not forced on kasa_teslimleri';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege(actor, 'public.kasa_teslimleri', priv) THEN RAISE EXCEPTION '% has % on kasa_teslimleri', actor, priv; END IF;
    END LOOP;
    IF has_any_column_privilege(actor, 'public.kasa_teslimleri', 'SELECT')
       OR has_column_privilege(actor, 'public.odemeler', 'kasa_teslim_id', 'UPDATE') THEN
      RAISE EXCEPTION '% has column access', actor;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.kasa_teslimleri', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.kasa_teslimleri', 'INSERT')
     OR has_table_privilege('service_role', 'public.kasa_teslimleri', 'UPDATE')
     OR has_table_privilege('service_role', 'public.kasa_teslimleri', 'DELETE')
     OR has_any_column_privilege('service_role', 'public.kasa_teslimleri', 'UPDATE')
     OR NOT has_column_privilege('service_role', 'public.odemeler', 'kasa_teslim_id', 'UPDATE')
     OR has_table_privilege('service_role', 'public.odemeler', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role privileges are wrong';
  END IF;
  FOREACH fn IN ARRAY ARRAY['public.tomnap_v2_kurye_tahsilati(text,text,uuid,numeric)',
                            'public.tomnap_v2_kurye_bakiyeleri(text,text)',
                            'public.tomnap_v2_kurye_nakit_durumu(text,text)',
                            'public.tomnap_v2_kasa_teslimi(text,text,text,uuid[],numeric,text)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
    END IF;
    IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe configuration of %', fn;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.ks_fixture() RETURNS void LANGUAGE plpgsql AS $$
DECLARE line text := '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]';
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('ks-a', 'Kasa A', 'AKTIF'), ('ks-b', 'Kasa B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('ks-patron-a', 'ks-a', 'Patron A', 'patron-a@kasa.test', 'PATRON', 'AKTIF'),
    ('ks-finans-a', 'ks-a', 'Finans A', 'finans-a@kasa.test', 'BAKU_FINANS', 'AKTIF'),
    ('ks-sales-a', 'ks-a', 'Sales A', 'sales-a@kasa.test', 'SATIS_SORUMLUSU', 'AKTIF'),
    ('ks-kanada-a', 'ks-a', 'Kanada A', 'kanada-a@kasa.test', 'KANADA_SATINALMA', 'AKTIF'),
    ('ks-kurye1', 'ks-a', 'Kurye 1', 'kurye1@kasa.test', 'BAKU_KURYE', 'AKTIF'),
    ('ks-kurye2', 'ks-a', 'Kurye 2', 'kurye2@kasa.test', 'BAKU_KURYE', 'AKTIF'),
    ('ks-kurye-b', 'ks-b', 'Kurye B', 'kurye-b@kasa.test', 'BAKU_KURYE', 'AKTIF'),
    ('ks-admin', 'ks-b', 'Admin', 'admin@kasa.test', 'SUPER_ADMIN', 'AKTIF');
  INSERT INTO public.kuryeler(id, tenant_id, ad_soyad, telefon, bolge, aktif, kullanici_id) VALUES
    ('ks-k1', 'ks-a', 'Kurye 1', '1', 'Nərimanov', true, 'ks-kurye1'),
    ('ks-k2', 'ks-a', 'Kurye 2', '2', 'Yasamal', true, 'ks-kurye2'),
    ('ks-kb', 'ks-b', 'Kurye B', '3', 'Xətai', true, 'ks-kurye-b');
  FOR i IN 1..4 LOOP
    PERFORM public.tomnap_v2_siparis_olustur('ks-a', 'ks-patron-a', jsonb_build_object('musteri_adi', 'KS' || i), line::jsonb);
  END LOOP;
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('ks-patron-b', 'ks-b', 'Patron B', 'patron-b@kasa.test', 'PATRON', 'AKTIF');
  PERFORM public.tomnap_v2_siparis_olustur('ks-b', 'ks-patron-b', '{"musteri_adi":"KSB"}', line::jsonb);
  -- KS1, KS2 with courier 1 out for delivery; KS3 with courier 2; KS4 still in Canada with courier 1.
  UPDATE public.siparisler SET baku_kurye_id = 'ks-k1', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS' WHERE tenant_id = 'ks-a' AND musteri_adi IN ('KS1', 'KS2');
  UPDATE public.siparisler SET baku_kurye_id = 'ks-k2', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS' WHERE tenant_id = 'ks-a' AND musteri_adi = 'KS3';
  UPDATE public.siparisler SET baku_kurye_id = 'ks-k1', lojistik_durumu = 'KANADA_DEPO' WHERE tenant_id = 'ks-a' AND musteri_adi = 'KS4';
  UPDATE public.siparisler SET baku_kurye_id = 'ks-kb', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS' WHERE tenant_id = 'ks-b';
  INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, toplam_tutar, baku_kurye_id, lojistik_durumu)
    VALUES ('72000000-0000-4000-8000-000000000001', 'ks-a', 'v1', 'KSv1', 'v1', 100, 'ks-k1', 'BAKU_DAGITIM_ARKADAS');
END $$;
CREATE FUNCTION pg_temp.ks_order(p_name text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE musteri_adi = p_name ORDER BY tenant_id LIMIT 1
$$;
CREATE FUNCTION pg_temp.ks_collect(p_tenant text, p_user text, p_order uuid, p_amount numeric) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_kurye_tahsilati(p_tenant, p_user, p_order, p_amount);
  RETURN 'ok:' || (r->'siparis'->>'alinan_tutar');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.ks_handover(p_tenant text, p_user text, p_courier text, p_ids uuid[], p_amount numeric) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_kasa_teslimi(p_tenant, p_user, p_courier, p_ids, p_amount, 'Sayıldı');
  RETURN 'ok:' || (r->'teslim'->>'tutar_azn');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.ks_pay(p_order uuid, p_amount numeric) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.odemeler WHERE siparis_id = p_order AND tutar_azn = p_amount AND kaynak = 'TESLIMAT' LIMIT 1
$$;
CREATE FUNCTION pg_temp.ks_balance(p_courier text) RETURNS numeric LANGUAGE sql AS $$
  SELECT (b->>'tahsilat_toplami')::numeric - (b->>'teslim_toplami')::numeric
    FROM jsonb_array_elements(public.tomnap_v2_kurye_bakiyeleri('ks-a')) b WHERE b->>'kurye_kullanici_id' = p_courier
$$;
CREATE FUNCTION pg_temp.ks_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.ks_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE ks1 uuid := pg_temp.ks_order('KS1'); ks2 uuid := pg_temp.ks_order('KS2'); ks3 uuid := pg_temp.ks_order('KS3');
        ks4 uuid := pg_temp.ks_order('KS4'); ksb uuid := (SELECT id FROM public.siparisler WHERE tenant_id = 'ks-b' LIMIT 1);
        p40 uuid; p60 uuid; p30 uuid; p50 uuid; c record; code text; failed boolean; open_sum numeric;
BEGIN
  -- Collections: only on the courier's own v2 orders out for delivery, up to the amount due.
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye1', ks1, 40), 'ok:40.00', 'first collection');
  FOR c IN SELECT * FROM (VALUES
      ('ks-a', 'ks-kurye1', ks3, 10::numeric, 'PT403'),      -- another courier's order
      ('ks-a', 'ks-kurye1', '72000000-0000-4000-8000-000000000001'::uuid, 10, 'PT409'),  -- v1 order
      ('ks-a', 'ks-kurye1', ks4, 10, 'PT409'),               -- not out for delivery
      ('ks-a', 'ks-kurye1', ks1, 60.01, '22023'),            -- more than due
      ('ks-a', 'ks-kurye1', ks1, 0, '22023'),
      ('ks-a', 'ks-kurye1', ks1, 1.005, '22023'),
      ('ks-a', 'ks-kurye1', ksb, 10, 'PT404'),               -- other tenant's order
      ('ks-a', 'ks-kurye-b', ks1, 10, 'PT403'),              -- courier of another tenant
      ('ks-b', 'ks-kurye1', ksb, 10, 'PT403'),
      ('ks-a', 'ks-patron-a', ks1, 10, 'PT403'),             -- not a courier
      ('all', 'ks-kurye1', ks1, 10, '22023')) AS t(ten, uid, ord, amount, want) LOOP
    PERFORM pg_temp.ks_expect(pg_temp.ks_collect(c.ten, c.uid, c.ord, c.amount), c.want, c.uid || ' on ' || c.ord);
  END LOOP;
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye1', ks1, 60), 'ok:100.00', 'collection up to the total');
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye1', ks1, 1), '22023', 'nothing left to collect');
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye1', ks2, 30), 'ok:30.00', 'second order');
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye2', ks3, 50), 'ok:50.00', 'courier 2');
  p40 := pg_temp.ks_pay(ks1, 40); p60 := pg_temp.ks_pay(ks1, 60); p30 := pg_temp.ks_pay(ks2, 30); p50 := pg_temp.ks_pay(ks3, 50);
  IF (SELECT row(yontem, kaynak, alan_kullanici_id, kaydeden_kullanici_id) FROM public.odemeler WHERE id = p40)
     IS DISTINCT FROM row('NAKIT'::text, 'TESLIMAT'::text, 'ks-kurye1'::text, 'ks-kurye1'::text) THEN
    RAISE EXCEPTION 'A collection is cash, from delivery, held by the courier';
  END IF;
  IF (SELECT finans_durumu::text FROM public.siparisler WHERE id = ks1) <> 'ODENDI' THEN RAISE EXCEPTION 'K20 columns did not follow'; END IF;
  PERFORM pg_temp.ks_expect(pg_temp.ks_balance('ks-kurye1')::text, '130.00', 'balance before reversal');

  -- A wrong collection is reversed (A10 RPC); it leaves the courier's balance.
  PERFORM public.tomnap_v2_odeme_ters_kayit('ks-a', 'ks-finans-a', p30, 'Yanlış yazılıb');
  PERFORM pg_temp.ks_expect(pg_temp.ks_balance('ks-kurye1')::text, '100.00', 'balance after reversal');

  -- Hand-over: exact amount, only open cash of that courier, receiver PATRON/FINANS/admin.
  FOR c IN SELECT * FROM (VALUES
      ('ks-finans-a', 'ks-kurye1', ARRAY[p40, p60], 100.01, 'PT409'),   -- above the selected sum
      ('ks-finans-a', 'ks-kurye1', ARRAY[p40, p60], 99, 'PT409'),
      ('ks-finans-a', 'ks-kurye1', ARRAY[p40, p50], 90, 'PT409'),       -- another courier's cash
      ('ks-finans-a', 'ks-kurye1', ARRAY[p30], 30, 'PT409'),            -- reversed
      ('ks-finans-a', 'ks-kurye1', ARRAY[(SELECT id FROM public.odemeler WHERE ters_kayit_odeme_id = p30)], 30, 'PT409'),
      ('ks-finans-a', 'ks-kurye1', ARRAY[]::uuid[], 0, '22023'),
      ('ks-finans-a', 'ks-kurye1', ARRAY[p40, p40], 80, '22023'),
      ('ks-finans-a', 'ks-kurye2', ARRAY[p40], 40, 'PT409'),
      ('ks-finans-a', 'ks-patron-a', ARRAY[p40], 40, 'PT404'),         -- not a courier
      ('ks-sales-a', 'ks-kurye1', ARRAY[p40], 40, 'PT403'),
      ('ks-kanada-a', 'ks-kurye1', ARRAY[p40], 40, 'PT403'),
      ('ks-kurye2', 'ks-kurye1', ARRAY[p40], 40, 'PT403')) AS t(uid, courier, ids, amount, want) LOOP
    PERFORM pg_temp.ks_expect(pg_temp.ks_handover('ks-a', c.uid, c.courier, c.ids, c.amount), c.want, c.uid || ' ' || c.amount);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.kasa_teslimleri) OR EXISTS (SELECT 1 FROM public.odemeler WHERE kasa_teslim_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A refused hand-over left rows behind';
  END IF;
  PERFORM pg_temp.ks_expect(pg_temp.ks_handover('ks-a', 'ks-finans-a', 'ks-kurye1', ARRAY[p40, p60], 100), 'ok:100.00', 'hand-over');
  PERFORM pg_temp.ks_expect(pg_temp.ks_handover('ks-a', 'ks-patron-a', 'ks-kurye1', ARRAY[p40, p60], 100), 'PT409', 'second hand-over');
  PERFORM pg_temp.ks_expect(pg_temp.ks_handover('ks-a', 'ks-admin', 'ks-kurye2', ARRAY[p50], 50), 'ok:50.00', 'admin takes courier 2');
  PERFORM pg_temp.ks_expect(pg_temp.ks_balance('ks-kurye1')::text, '0.00', 'courier 1 after hand-over');
  PERFORM pg_temp.ks_expect(pg_temp.ks_balance('ks-kurye2')::text, '0.00', 'courier 2 after hand-over');

  -- balance = Σ cash − Σ hand-overs = Σ open collections, for every courier.
  PERFORM pg_temp.ks_expect(pg_temp.ks_collect('ks-a', 'ks-kurye1', ks2, 25), 'ok:25.00', 'new collection');
  FOR c IN SELECT b FROM jsonb_array_elements(public.tomnap_v2_kurye_bakiyeleri('ks-a')) b LOOP
    SELECT coalesce(sum((x->>'tutar_azn')::numeric), 0) INTO open_sum FROM jsonb_array_elements(c.b->'acik_tahsilatlar') x;
    IF (c.b->>'tahsilat_toplami')::numeric - (c.b->>'teslim_toplami')::numeric <> open_sum THEN
      RAISE EXCEPTION 'Balance % differs from open collections %', c.b, open_sum;
    END IF;
  END LOOP;
  PERFORM pg_temp.ks_expect(pg_temp.ks_balance('ks-kurye1')::text, '25.00', 'courier 1 with a new collection');
  IF (public.tomnap_v2_kurye_nakit_durumu('ks-a', 'ks-kurye1')->>'bakiye')::numeric <> 25
     OR (SELECT count(*) FROM jsonb_array_elements(public.tomnap_v2_kurye_nakit_durumu('ks-a', 'ks-kurye1')->'siparisler')) <> 1 THEN
    RAISE EXCEPTION 'The courier view shows the wrong balance or orders';
  END IF;

  -- Handed-over cash cannot be reversed (RPC and direct insert).
  code := NULL;
  BEGIN PERFORM public.tomnap_v2_odeme_ters_kayit('ks-a', 'ks-patron-a', p40, 'Geç'); EXCEPTION WHEN OTHERS THEN code := SQLSTATE; END;
  PERFORM pg_temp.ks_expect(code, 'PT409', 'reversal of handed-over cash');
  code := NULL;
  BEGIN
    INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id, alma_zamani, kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id)
    VALUES ('ks-a', ks1, -40, 'NAKIT', 'TESLIMAT', 'ks-kurye1', now(), 'x', 'direct', p40);
  EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
  END;
  PERFORM pg_temp.ks_expect(code, 'PT409', 'direct reversal of handed-over cash');

  -- The only allowed change on odemeler is closing open courier cash into its own hand-over.
  FOR c IN SELECT * FROM (VALUES
      ('UPDATE public.odemeler SET kasa_teslim_id = NULL WHERE id = ''' || p40 || '''', '42501'),
      ('UPDATE public.odemeler SET kasa_teslim_id = gen_random_uuid() WHERE id = ''' || pg_temp.ks_pay(ks2, 25) || '''', '42501'),
      ('UPDATE public.odemeler SET kasa_teslim_id = (SELECT id FROM public.kasa_teslimleri WHERE kurye_kullanici_id = ''ks-kurye2'') WHERE id = ''' || pg_temp.ks_pay(ks2, 25) || '''', '42501'),
      ('UPDATE public.odemeler SET tutar_azn = 1', '42501'),
      ('DELETE FROM public.odemeler', '42501'),
      ('UPDATE public.kasa_teslimleri SET tutar_azn = 1', '42501'),
      ('DELETE FROM public.kasa_teslimleri', '42501'),
      ('TRUNCATE public.kasa_teslimleri', '42501')) AS t(stmt, want) LOOP
    code := NULL;
    BEGIN EXECUTE c.stmt; EXCEPTION WHEN OTHERS THEN code := SQLSTATE; END;
    PERFORM pg_temp.ks_expect(code, c.want, c.stmt);
  END LOOP;
END $$;
RESET ROLE;
DO $$ DECLARE stmt text; failed boolean; BEGIN
  FOREACH stmt IN ARRAY ARRAY['UPDATE public.kasa_teslimleri SET aciklama = ''x''', 'DELETE FROM public.kasa_teslimleri',
                              'UPDATE public.odemeler SET aciklama = ''x'' WHERE kaynak = ''TESLIMAT'''] LOOP
    failed := false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'The owner ran: %', stmt; END IF;
  END LOOP;
END $$;
ROLLBACK;

-- 3. Down -> down -> up (no hand-over is committed at this point). The refusal while
-- hand-overs exist is checked in kasa-concurrency.mjs.
BEGIN;
\ir ../../supabase/rollbacks/20260925120000_kasa_teslimleri.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260925120000_kasa_teslimleri.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regclass('public.kasa_teslimleri') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_kurye_tahsilati(text,text,uuid,numeric)') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_kasa_teslimi(text,text,text,uuid[],numeric,text)') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_kurye_bakiyeleri(text,text)') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_kurye_nakit_durumu(text,text)') IS NOT NULL
     OR to_regprocedure('public.tomnap_kasa_teslimleri_append_only()') IS NOT NULL
     OR has_column_privilege('service_role', 'public.odemeler', 'kasa_teslim_id', 'UPDATE') THEN
    RAISE EXCEPTION 'Rollback left hand-over objects behind';
  END IF;
  IF to_regclass('public.odemeler') IS NULL
     OR to_regprocedure('public.tomnap_v2_odeme_kaydet(text,text,jsonb)') IS NULL
     OR (SELECT prosrc LIKE '%kasa_teslimleri%' OR prosrc NOT LIKE '%append-only%' FROM pg_proc
          WHERE oid = 'public.tomnap_odemeler_append_only()'::regprocedure)
     OR (SELECT prosrc LIKE '%FOR SHARE%' FROM pg_proc WHERE oid = 'public.tomnap_odeme_kontrol()'::regprocedure) THEN
    RAISE EXCEPTION 'Rollback did not restore the A10 ledger functions';
  END IF;
END $$;
\ir ../../supabase/migrations/20260925120000_kasa_teslimleri.sql
DO $$ BEGIN
  IF to_regclass('public.kasa_teslimleri') IS NULL
     OR NOT has_column_privilege('service_role', 'public.odemeler', 'kasa_teslim_id', 'UPDATE')
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.kasa_teslimleri'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION 'Re-applied hand-over migration is incomplete';
  END IF;
END $$;
