-- Ödeme defteri (A10): access, append-only (service_role and owner), the two RPCs
-- (roles, tenant, v1 refusal, amounts, one reversal), the row checks for direct
-- inserts, K20 derived columns, order delete restriction, and down -> down -> up.
-- Run after baseline + all migrations and siparis-sahibi-kurali.sql, in ONE psql
-- session, BEFORE odemeler-concurrency.mjs (which commits payments).
\set ON_ERROR_STOP 1

-- 1. Access.
DO $$ DECLARE actor text; priv text; fn text; BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.odemeler'::regclass) THEN
    RAISE EXCEPTION 'Row level security is not forced on odemeler';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(actor, 'public.odemeler', priv) THEN RAISE EXCEPTION '% has % on odemeler', actor, priv; END IF;
    END LOOP;
    IF has_any_column_privilege(actor, 'public.odemeler', 'SELECT')
       OR has_any_column_privilege(actor, 'public.odemeler', 'INSERT') THEN
      RAISE EXCEPTION '% has column access on odemeler', actor;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.odemeler', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.odemeler', 'INSERT')
     OR has_table_privilege('service_role', 'public.odemeler', 'UPDATE')
     OR has_table_privilege('service_role', 'public.odemeler', 'DELETE')
     OR has_table_privilege('service_role', 'public.odemeler', 'TRUNCATE')
     OR has_any_column_privilege('service_role', 'public.odemeler', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role privileges on odemeler are wrong';
  END IF;
  FOREACH fn IN ARRAY ARRAY['public.tomnap_v2_odeme_kaydet(text,text,jsonb)',
                            'public.tomnap_v2_odeme_ters_kayit(text,text,uuid,text)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
    END IF;
    IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe configuration of %', fn;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION pg_temp.od_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('od-a', 'Ödeme A', 'AKTIF'), ('od-b', 'Ödeme B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('od-patron-a', 'od-a', 'Patron A', 'patron-a@odeme.test', 'PATRON', 'AKTIF'),
    ('od-finans-a', 'od-a', 'Finans A', 'finans-a@odeme.test', 'BAKU_FINANS', 'AKTIF'),
    ('od-sales-a', 'od-a', 'Sales A', 'sales-a@odeme.test', 'SATIS_SORUMLUSU', 'AKTIF'),
    ('od-sales2-a', 'od-a', 'Sales 2 A', 'sales2-a@odeme.test', 'SATIS_SORUMLUSU', 'AKTIF'),
    ('od-kanada-a', 'od-a', 'Kanada A', 'kanada-a@odeme.test', 'KANADA_SATINALMA', 'AKTIF'),
    ('od-kurye-a', 'od-a', 'Kurye A', 'kurye-a@odeme.test', 'BAKU_KURYE', 'AKTIF'),
    ('od-pasif-a', 'od-a', 'Pasif A', 'pasif-a@odeme.test', 'BAKU_FINANS', 'PASIF'),
    ('od-admin', 'od-b', 'Admin', 'admin@odeme.test', 'SUPER_ADMIN', 'AKTIF'),
    ('od-patron-b', 'od-b', 'Patron B', 'patron-b@odeme.test', 'PATRON', 'AKTIF');
  -- v2 orders: A totals 100.00, B totals 50.00; one v1 order in A.
  PERFORM public.tomnap_v2_siparis_olustur('od-a', 'od-patron-a', '{"musteri_adi":"Ödeme A1"}',
    '[{"urun_aciklamasi":"Çanta","adet":2,"birim_satis_fiyati_azn":50,"kaynak_ulke":"CA"}]');
  PERFORM public.tomnap_v2_siparis_olustur('od-b', 'od-patron-b', '{"musteri_adi":"Ödeme B1"}',
    '[{"urun_aciklamasi":"Kəmər","adet":1,"birim_satis_fiyati_azn":50,"kaynak_ulke":"US"}]');
  INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi)
    VALUES ('71000000-0000-4000-8000-000000000001', 'od-a', 'v1', 'Ödeme v1', 'v1 item');
END $$;

-- Calls one RPC and answers 'ok:<alinan>:<finans_durumu>' or the SQLSTATE.
CREATE FUNCTION pg_temp.od_pay(p_tenant text, p_user text, p_order text, p_body text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_odeme_kaydet(p_tenant, p_user,
         jsonb_build_object('siparis_id', p_order) || p_body::jsonb);
  RETURN 'ok:' || (r->'siparis'->>'alinan_tutar') || ':' || (r->'siparis'->>'finans_durumu');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.od_reverse(p_tenant text, p_user text, p_payment uuid, p_reason text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_odeme_ters_kayit(p_tenant, p_user, p_payment, p_reason);
  RETURN 'ok:' || (r->'siparis'->>'alinan_tutar') || ':' || (r->'siparis'->>'finans_durumu');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.od_order(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT id::text FROM public.siparisler WHERE tenant_id = p_tenant AND model_surumu = 2 LIMIT 1
$$;
CREATE FUNCTION pg_temp.od_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.od_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE a text := pg_temp.od_order('od-a'); b text := pg_temp.od_order('od-b');
        c record; p30 uuid; p5 uuid; failed boolean; code text;
BEGIN
  -- Payments add up and the old columns follow (K20).
  PERFORM pg_temp.od_expect(pg_temp.od_pay('od-a', 'od-patron-a', a, '{"tutar_azn":30,"yontem":"NAKIT","kaynak":"BUTIK"}'), 'ok:30.00:KISMI_ODEME', 'first payment');
  SELECT id INTO p30 FROM public.odemeler WHERE tenant_id = 'od-a' AND tutar_azn = 30;
  PERFORM pg_temp.od_expect(pg_temp.od_pay('od-a', 'od-finans-a', a, '{"tutar_azn":70,"yontem":"KART","kaynak":"ONLINE"}'), 'ok:100.00:ODENDI', 'full payment');
  PERFORM pg_temp.od_expect(pg_temp.od_pay('od-a', 'od-admin', a, '{"tutar_azn":10.5,"yontem":"HAVALE","kaynak":"ONLINE"}'), 'ok:110.50:ODENDI', 'overpayment by admin');
  PERFORM pg_temp.od_expect(pg_temp.od_pay('od-a', 'od-sales-a', a, '{"tutar_azn":5,"yontem":"NAKIT","kaynak":"BUTIK","aciklama":"Butik"}'), 'ok:115.50:ODENDI', 'sales in the boutique');
  SELECT id INTO p5 FROM public.odemeler WHERE tenant_id = 'od-a' AND tutar_azn = 5;
  IF (SELECT kalan_tutar FROM public.siparisler WHERE id = a::uuid) <> -15.50 THEN RAISE EXCEPTION 'kalan_tutar did not follow'; END IF;
  IF (SELECT row(alan_kullanici_id, kaydeden_kullanici_id, aciklama) FROM public.odemeler WHERE id = p5)
     IS DISTINCT FROM row('od-sales-a'::text, 'od-sales-a'::text, 'Butik'::text) THEN
    RAISE EXCEPTION 'Recorder and receiver are the calling user';
  END IF;

  -- Refusals change nothing.
  FOR c IN SELECT * FROM (VALUES
      ('od-a', 'od-sales-a', a, '{"tutar_azn":1,"yontem":"KART","kaynak":"ONLINE"}', 'PT403'),
      ('od-a', 'od-kanada-a', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT403'),
      ('od-a', 'od-kurye-a', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT403'),
      ('od-a', 'od-pasif-a', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT403'),
      ('od-a', 'od-patron-b', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT403'),
      ('od-a', 'od-patron-a', b, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT404'),
      ('od-a', 'od-patron-a', '71000000-0000-4000-8000-000000000001', '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', 'PT409'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"TESLIMAT"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":0,"yontem":"NAKIT","kaynak":"BUTIK"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":-5,"yontem":"NAKIT","kaynak":"BUTIK"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1.005,"yontem":"NAKIT","kaynak":"BUTIK"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1000000,"yontem":"NAKIT","kaynak":"BUTIK"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":"5","yontem":"NAKIT","kaynak":"BUTIK"}', '22023'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1,"yontem":"KRIPTO","kaynak":"BUTIK"}', '23514'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1,"kaynak":"BUTIK"}', '23502'),
      ('od-a', 'od-patron-a', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK","alma_zamani":"2999-01-01T00:00:00Z"}', '22023'),
      ('all', 'od-admin', a, '{"tutar_azn":1,"yontem":"NAKIT","kaynak":"BUTIK"}', '22023')) AS t(ten, uid, ord, body, want) LOOP
    PERFORM pg_temp.od_expect(pg_temp.od_pay(c.ten, c.uid, c.ord, c.body), c.want, c.uid || ' ' || c.body);
  END LOOP;
  IF (SELECT count(*) FROM public.odemeler) <> 4 OR (SELECT alinan_tutar FROM public.siparisler WHERE id = a::uuid) <> 115.50 THEN
    RAISE EXCEPTION 'A refused payment changed the ledger';
  END IF;

  -- Reversal (K16): once, with a reason; a sales user only its own boutique payments.
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-finans-a', p30, ' '), '22023', 'reversal without a reason');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-sales-a', p30, 'Yanlış'), 'PT403', 'sales reverses the patron''s payment');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-sales2-a', p5, 'Yanlış'), 'PT403', 'sales reverses another sales user''s payment');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-b', 'od-patron-b', p30, 'Yanlış'), 'PT404', 'foreign tenant reversal');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-finans-a', p30, 'Yanlış tutar'), 'ok:85.50:KISMI_ODEME', 'reversal');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-patron-a', p30, 'Yeniden'), 'PT409', 'second reversal');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-patron-a',
    (SELECT id FROM public.odemeler WHERE ters_kayit_odeme_id = p30), 'Tersin tersi'), 'PT409', 'reversal of a reversal');
  PERFORM pg_temp.od_expect(pg_temp.od_reverse('od-a', 'od-sales-a', p5, 'Müşteri geri aldı'), 'ok:80.50:KISMI_ODEME', 'sales reverses its own');
  IF (SELECT row(tutar_azn, yontem, kaynak, alan_kullanici_id, kaydeden_kullanici_id) FROM public.odemeler WHERE ters_kayit_odeme_id = p30)
     IS DISTINCT FROM row(-30.00::numeric(12,2), 'NAKIT'::text, 'BUTIK'::text, 'od-patron-a'::text, 'od-finans-a'::text) THEN
    RAISE EXCEPTION 'A reversal mirrors the payment and names who reversed it';
  END IF;

  -- Direct inserts (bypassing the RPCs) still meet the ledger rules and update the order.
  FOR c IN SELECT * FROM (VALUES
      ('od-a', '71000000-0000-4000-8000-000000000001', 5, NULL, NULL),
      ('od-b', a, 5, NULL, NULL),
      ('od-a', a, -5, p30::text, NULL),
      ('od-a', a, 30, (SELECT id::text FROM public.odemeler WHERE ters_kayit_odeme_id = p30), NULL),
      ('od-a', a, 5, NULL, gen_random_uuid()::text)) AS t(ten, ord, amount, rev, kasa) LOOP
    code := NULL;
    BEGIN
      INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id, alma_zamani,
                                  kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id, kasa_teslim_id)
      VALUES (c.ten, c.ord::uuid, c.amount, 'NAKIT', 'BUTIK', 'x', now(), 'x', 'direct', c.rev::uuid, c.kasa::uuid);
    EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
    END;
    IF code IS DISTINCT FROM '23514' THEN RAISE EXCEPTION 'Direct insert % % % % got %', c.ten, c.amount, c.rev, c.kasa, coalesce(code, 'success'); END IF;
  END LOOP;
  code := NULL;
  BEGIN
    INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id, alma_zamani,
                                kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id)
    VALUES ('od-a', a::uuid, -30, 'NAKIT', 'BUTIK', 'x', now(), 'x', 'twice', p30);
  EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
  END;
  IF code IS DISTINCT FROM '23505' THEN RAISE EXCEPTION 'A second direct reversal got %', coalesce(code, 'success'); END IF;
  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id, alma_zamani, kaydeden_kullanici_id)
  VALUES ('od-b', b::uuid, 20, 'KART', 'ONLINE', 'od-patron-b', now(), 'od-patron-b');
  IF (SELECT row(alinan_tutar, finans_durumu::text) FROM public.siparisler WHERE id = b::uuid)
     IS DISTINCT FROM row(20.00::numeric, 'KISMI_ODEME'::text) THEN
    RAISE EXCEPTION 'A direct insert did not update the order summary';
  END IF;

  -- Append-only for service_role: no privilege.
  FOREACH code IN ARRAY ARRAY['UPDATE public.odemeler SET tutar_azn = 1', 'DELETE FROM public.odemeler', 'TRUNCATE public.odemeler'] LOOP
    failed := false;
    BEGIN EXECUTE code; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'service_role ran: %', code; END IF;
  END LOOP;
  -- An order with payments cannot be deleted.
  failed := false;
  BEGIN DELETE FROM public.siparisler WHERE id = a::uuid; EXCEPTION WHEN foreign_key_violation THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'A v2 order with payments was deleted'; END IF;
  -- The ledger total equals the order's alinan_tutar for every order.
  IF EXISTS (SELECT 1 FROM public.siparisler s WHERE s.tenant_id IN ('od-a', 'od-b') AND s.model_surumu = 2
               AND s.alinan_tutar <> (SELECT coalesce(sum(o.tutar_azn), 0) FROM public.odemeler o WHERE o.siparis_id = s.id)) THEN
    RAISE EXCEPTION 'alinan_tutar differs from the ledger';
  END IF;
END $$;
-- Append-only for the table owner too (triggers).
RESET ROLE;
DO $$ DECLARE stmt text; failed boolean; BEGIN
  FOREACH stmt IN ARRAY ARRAY['UPDATE public.odemeler SET aciklama = ''x''', 'DELETE FROM public.odemeler', 'TRUNCATE public.odemeler'] LOOP
    failed := false;
    BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
    IF NOT failed THEN RAISE EXCEPTION 'The owner ran: %', stmt; END IF;
  END LOOP;
END $$;
ROLLBACK;

-- 3. Down -> down -> up (no payment is committed at this point). The refusal while
-- payments exist is checked in odemeler-concurrency.mjs, after payments are committed.
BEGIN;
\ir ../../supabase/rollbacks/20260925110000_odemeler.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260925110000_odemeler.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regclass('public.odemeler') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_odeme_kaydet(text,text,jsonb)') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_odeme_ters_kayit(text,text,uuid,text)') IS NOT NULL
     OR to_regprocedure('public.tomnap_odeme_kontrol()') IS NOT NULL
     OR to_regprocedure('public.tomnap_odeme_siparis_ozeti()') IS NOT NULL
     OR to_regprocedure('public.tomnap_odemeler_append_only()') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback left ledger objects behind';
  END IF;
  IF to_regclass('public.siparisler') IS NULL OR to_regclass('public.siparis_satirlari') IS NULL
     OR to_regprocedure('public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
END $$;
\ir ../../supabase/migrations/20260925110000_odemeler.sql
DO $$ BEGIN
  IF to_regclass('public.odemeler') IS NULL
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_odeme_kaydet(text,text,jsonb)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.odemeler', 'UPDATE')
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.odemeler'::regclass AND NOT tgisinternal) <> 4 THEN
    RAISE EXCEPTION 'Re-applied ledger migration is incomplete';
  END IF;
END $$;
