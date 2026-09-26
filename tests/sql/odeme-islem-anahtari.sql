-- Payment operation key (20260926100000; Codex R3 F15): one payment per key and tenant,
-- a retry returns the first payment ('tekrar'), the same key for another payment is
-- PT412; boutique payments and courier collections alike. Then down -> down -> up.
-- Run after not-sozlesmesi.sql, in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Access and safety settings.
DO $$ DECLARE fn text; BEGIN
  FOREACH fn IN ARRAY ARRAY['public.tomnap_v2_odeme_kaydet(text,text,jsonb)',
                            'public.tomnap_v2_kurye_tahsilati(text,text,uuid,numeric)',
                            'public.tomnap_v2_kurye_tahsilati(text,text,uuid,numeric,uuid)'] LOOP
    IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('authenticated', fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'Wrong EXECUTE privileges on %', fn;
    END IF;
    IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc WHERE oid = fn::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe configuration of %', fn;
    END IF;
  END LOOP;
  IF has_column_privilege('anon', 'public.odemeler', 'islem_anahtari', 'SELECT')
     OR has_column_privilege('authenticated', 'public.odemeler', 'islem_anahtari', 'SELECT')
     OR has_column_privilege('service_role', 'public.odemeler', 'islem_anahtari', 'UPDATE') THEN
    RAISE EXCEPTION 'Wrong privileges on the operation key column';
  END IF;
END $$;

CREATE FUNCTION pg_temp.ia_fixture() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('ia-a', 'Anahtar A', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('ia-patron', 'ia-a', 'Patron', 'patron@anahtar.test', 'PATRON', 'AKTIF'),
    ('ia-finans', 'ia-a', 'Finans', 'finans@anahtar.test', 'BAKU_FINANS', 'AKTIF'),
    ('ia-kurye', 'ia-a', 'Kurye', 'kurye@anahtar.test', 'BAKU_KURYE', 'AKTIF');
  INSERT INTO public.kuryeler(id, tenant_id, ad_soyad, telefon, bolge, aktif, kullanici_id)
    VALUES ('ia-k', 'ia-a', 'Kurye', '1', 'Baku', true, 'ia-kurye');
  PERFORM public.tomnap_v2_siparis_olustur('ia-a', 'ia-patron', '{"musteri_adi":"Anahtar"}',
    '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]');
  UPDATE public.siparisler SET baku_kurye_id = 'ia-k', lojistik_durumu = 'BAKU_DAGITIM_ARKADAS' WHERE tenant_id = 'ia-a';
END $$;
CREATE FUNCTION pg_temp.ia_order() RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.siparisler WHERE tenant_id = 'ia-a' AND model_surumu = 2 LIMIT 1
$$;
-- 'new:<id>' / 'replay:<id>' or the SQLSTATE of one payment.
CREATE FUNCTION pg_temp.ia_pay(p_user text, p_amount numeric, p_key text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_odeme_kaydet('ia-a', p_user, jsonb_strip_nulls(jsonb_build_object(
    'siparis_id', pg_temp.ia_order(), 'tutar_azn', p_amount, 'yontem', 'NAKIT', 'kaynak', 'BUTIK',
    'islem_anahtari', p_key)));
  RETURN CASE WHEN (r->>'tekrar')::boolean THEN 'replay:' ELSE 'new:' END || (r->'odeme'->>'id');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.ia_courier(p_amount numeric, p_key uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  IF p_key IS NULL THEN
    r := public.tomnap_v2_kurye_tahsilati('ia-a', 'ia-kurye', pg_temp.ia_order(), p_amount);
  ELSE
    r := public.tomnap_v2_kurye_tahsilati('ia-a', 'ia-kurye', pg_temp.ia_order(), p_amount, p_key);
  END IF;
  RETURN CASE WHEN (r->>'tekrar')::boolean THEN 'replay:' ELSE 'new:' END || (r->'odeme'->>'id');
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.ia_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;
CREATE FUNCTION pg_temp.ia_paid() RETURNS text LANGUAGE sql AS $$
  SELECT s.alinan_tutar::text || '|' || (SELECT count(*) FROM public.odemeler o WHERE o.siparis_id = s.id)
    FROM public.siparisler s WHERE s.id = pg_temp.ia_order()
$$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.ia_fixture();
SET LOCAL ROLE service_role;
DO $$
DECLARE k1 text := '7a000000-0000-4000-8000-000000000001'; c1 uuid := '7a000000-0000-4000-8000-0000000000c1';
        first text; courier text;
BEGIN
  first := pg_temp.ia_pay('ia-patron', 30, k1);
  PERFORM pg_temp.ia_expect(left(first, 4), 'new:', 'first payment');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 30, k1), 'replay:' || substr(first, 5), 'retry');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 30, upper(k1)), 'replay:' || substr(first, 5), 'retry, upper case');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 40, k1), 'PT412', 'same key, other amount');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-finans', 30, k1), 'PT412', 'same key, other recorder');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 30, 'abc'), '22023', 'invalid key');
  PERFORM pg_temp.ia_expect(pg_temp.ia_paid(), '30.00|1', 'one payment for the key');
  -- Without a key nothing changes: two calls, two payments.
  PERFORM pg_temp.ia_expect(left(pg_temp.ia_pay('ia-patron', 5, NULL), 4), 'new:', 'no key 1');
  PERFORM pg_temp.ia_expect(left(pg_temp.ia_pay('ia-patron', 5, NULL), 4), 'new:', 'no key 2');
  -- Courier: the four-argument call still works; a keyed retry replays even though the
  -- first collection left nothing due.
  PERFORM pg_temp.ia_expect(left(pg_temp.ia_courier(5, NULL), 4), 'new:', 'courier without key');
  courier := pg_temp.ia_courier(55, c1);
  PERFORM pg_temp.ia_expect(left(courier, 4), 'new:', 'courier with key');
  PERFORM pg_temp.ia_expect(pg_temp.ia_paid(), '100.00|5', 'fully paid');
  PERFORM pg_temp.ia_expect(pg_temp.ia_courier(55, c1), 'replay:' || substr(courier, 5), 'courier retry');
  PERFORM pg_temp.ia_expect(pg_temp.ia_courier(10, c1), 'PT412', 'courier key, other amount');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 55, c1::text), 'PT412', 'courier key as a boutique payment');
  PERFORM pg_temp.ia_expect(pg_temp.ia_paid(), '100.00|5', 'retries wrote nothing');
  -- The database keeps the key unique per tenant, whatever the caller does.
  BEGIN
    INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                                alma_zamani, kaydeden_kullanici_id, islem_anahtari)
    VALUES ('ia-a', pg_temp.ia_order(), 1, 'NAKIT', 'BUTIK', 'ia-patron', now(), 'ia-patron', k1::uuid);
    RAISE EXCEPTION 'A duplicate operation key was stored';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
ROLLBACK;

-- 3. Down (twice): the key column and the five-argument function are gone, payments
-- are recorded as before, nothing older is dropped.
BEGIN;
\ir ../../supabase/rollbacks/20260926100000_odeme_islem_anahtari.down.sql
\ir ../../supabase/rollbacks/20260926100000_odeme_islem_anahtari.down.sql
COMMIT;
BEGIN;
SELECT pg_temp.ia_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'odemeler'
               AND column_name = 'islem_anahtari')
     OR to_regprocedure('public.tomnap_v2_kurye_tahsilati(text,text,uuid,numeric,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback left the operation key behind';
  END IF;
  IF to_regclass('public.odemeler') IS NULL OR to_regclass('public.kasa_teslimleri') IS NULL THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
  PERFORM pg_temp.ia_expect(left(pg_temp.ia_pay('ia-patron', 10, NULL), 4), 'new:', 'payment after rollback');
  PERFORM pg_temp.ia_expect(left(pg_temp.ia_courier(10, NULL), 4), 'new:', 'courier after rollback');
END $$;
ROLLBACK;

-- 4. Up again: the key is back.
\ir ../../supabase/migrations/20260926100000_odeme_islem_anahtari.sql
BEGIN;
SELECT pg_temp.ia_fixture();
SET LOCAL ROLE service_role;
DO $$ DECLARE first text; BEGIN
  first := pg_temp.ia_pay('ia-patron', 30, '7a000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.ia_expect(pg_temp.ia_pay('ia-patron', 30, '7a000000-0000-4000-8000-000000000002'),
    'replay:' || substr(first, 5), 'retry after re-apply');
END $$;
ROLLBACK;
