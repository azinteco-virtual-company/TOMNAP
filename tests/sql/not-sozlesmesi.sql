-- One order note contract (20260925160000; Codex R3 F8): the v2 order RPC writes the
-- delivery note as the "[TƏLİMAT: …]" tag of baku_tahsilat_notu, never a physical
-- ozel_not column (no migration creates one). Owner rule unchanged. Then down -> down
-- -> up. Run after siparis-sahibi-kurali.sql, in ONE psql session.
\set ON_ERROR_STOP 1

-- 1. Access and safety settings are unchanged; the body no longer names the column.
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Order RPC privileges changed';
  END IF;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc
       WHERE oid = 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'Unsafe order RPC configuration';
  END IF;
  -- Static SQL on a missing column fails only when it runs, so check the INSERT list.
  IF (SELECT prosrc ~ 'lojistik_durumu,\s*ozel_not' OR prosrc !~ 'lojistik_durumu,\s*baku_tahsilat_notu'
        FROM pg_proc WHERE oid = 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'The order RPC still writes a physical ozel_not column';
  END IF;
END $$;

CREATE FUNCTION pg_temp.ns_fixture() RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('ns-a', 'Not A', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('ns-patron', 'ns-a', 'Patron', 'patron@not.test', 'PATRON', 'AKTIF'),
    ('ns-admin', 'ns-a', 'Admin', 'admin@not.test', 'SUPER_ADMIN', 'AKTIF');
$$;
-- The stored note columns of a new v2 order, or the SQLSTATE.
CREATE FUNCTION pg_temp.ns_create(p_user text, p_head text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_siparis_olustur('ns-a', p_user, p_head::jsonb,
         '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":10,"kaynak_ulke":"CA"}]');
  RETURN (SELECT jsonb_build_object('tahsilat', s.baku_tahsilat_notu, 'fiziksel', to_jsonb(s)->'ozel_not')
            FROM public.siparisler s WHERE s.id = (r->'siparis'->>'id')::uuid);
EXCEPTION WHEN OTHERS THEN
  RETURN to_jsonb(SQLSTATE);
END $$;
CREATE FUNCTION pg_temp.ns_expect(p_got jsonb, p_want jsonb, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.ns_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-patron', '{"musteri_adi":"A","ozel_not":"  Qapıda zəng edin \n"}'),
    '{"tahsilat":"[TƏLİMAT: Qapıda zəng edin]","fiziksel":null}', 'note as the tag');
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-patron', '{"musteri_adi":"B","ozel_not":"Kod [12] qapı"}'),
    '{"tahsilat":"[TƏLİMAT: Kod (12) qapı]","fiziksel":null}', 'brackets kept out of the tag');
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-patron', '{"musteri_adi":"C","ozel_not":"  "}'),
    '{"tahsilat":null,"fiziksel":null}', 'no note');
  -- Owner rule (20260925100000) unchanged.
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-admin', '{"musteri_adi":"D"}'), '"22023"', 'admin without owner');
END $$;
ROLLBACK;

-- 3. Down (twice) restores the physical-column body and drops nothing.
BEGIN;
\ir ../../supabase/rollbacks/20260925160000_not_sozlesmesi.down.sql
\ir ../../supabase/rollbacks/20260925160000_not_sozlesmesi.down.sql
COMMIT;
BEGIN;
SELECT pg_temp.ns_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-patron', '{"musteri_adi":"E","ozel_not":"Köhnə"}'),
    '{"tahsilat":null,"fiziksel":"Köhnə"}', 'note after rollback');
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-admin', '{"musteri_adi":"F"}'), '"22023"', 'owner rule after rollback');
  IF NOT has_function_privilege('service_role', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR to_regclass('public.siparis_satirlari') IS NULL THEN
    RAISE EXCEPTION 'Rollback changed more than the order RPC body';
  END IF;
END $$;
ROLLBACK;

-- With the function gone (older rollbacks already ran), this rollback is a no-op.
BEGIN;
\ir ../../supabase/rollbacks/20260925140000_para_yazma_yetkisi.down.sql
\ir ../../supabase/rollbacks/20260925120000_kasa_teslimleri.down.sql
\ir ../../supabase/rollbacks/20260925110000_odemeler.down.sql
\ir ../../supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql
\ir ../../supabase/rollbacks/20260924150000_siparis_satirlari.down.sql
\ir ../../supabase/rollbacks/20260925160000_not_sozlesmesi.down.sql
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback recreated the order RPC without its tables';
  END IF;
END $$;
ROLLBACK;

-- 4. Up again: the tag is back.
\ir ../../supabase/migrations/20260925160000_not_sozlesmesi.sql
BEGIN;
SELECT pg_temp.ns_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  PERFORM pg_temp.ns_expect(pg_temp.ns_create('ns-patron', '{"musteri_adi":"G","ozel_not":"Yeni"}'),
    '{"tahsilat":"[TƏLİMAT: Yeni]","fiziksel":null}', 'note after re-apply');
END $$;
ROLLBACK;
