-- v2 order owner rule (O-24): SUPER_ADMIN must name the owner and never owns an
-- order; the owner is always an active PATRON / SATIS_SORUMLUSU of the tenant.
-- Then down -> down -> up. Run after siparis-satirlari.sql and BEFORE
-- siparis-satirlari-concurrency.mjs (the A8 rollback check needs no v2 orders).
\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.sk_fixture() RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('sk-a', 'Sahip A', 'AKTIF'), ('sk-b', 'Sahip B', 'AKTIF');
  INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
    ('sk-admin', 'sk-b', 'Admin', 'admin@sahip.test', 'SUPER_ADMIN', 'AKTIF'),
    ('sk-admin-a', 'sk-a', 'Admin A', 'admin-a@sahip.test', 'SUPER_ADMIN', 'AKTIF'),
    ('sk-patron-a', 'sk-a', 'Patron A', 'patron-a@sahip.test', 'PATRON', 'AKTIF'),
    ('sk-sales-a', 'sk-a', 'Sales A', 'sales-a@sahip.test', 'SATIS_SORUMLUSU', 'AKTIF'),
    ('sk-patron-b', 'sk-b', 'Patron B', 'patron-b@sahip.test', 'PATRON', 'AKTIF');
$$;

CREATE FUNCTION pg_temp.sk_owner(p_user text, p_head text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  r := public.tomnap_v2_siparis_olustur('sk-a', p_user, p_head::jsonb,
         '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":10,"kaynak_ulke":"CA"}]');
  RETURN 'owner:' || (r->'siparis'->>'sahip_kullanici_id');
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE;
END $$;

-- 1. The RPC keeps its access and safety settings.
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
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SELECT pg_temp.sk_fixture();
SET LOCAL ROLE service_role;
DO $$ DECLARE c record; got text; BEGIN
  FOR c IN SELECT * FROM (VALUES
      -- A platform admin must name the owner ...
      ('sk-admin', '{"musteri_adi":"R1"}', '22023'),
      ('sk-admin', '{"musteri_adi":"R2","sahip_kullanici_id":"  "}', '22023'),
      -- ... and can never be it, not even another admin of the tenant.
      ('sk-admin', '{"musteri_adi":"R3","sahip_kullanici_id":"sk-admin"}', 'PT409'),
      ('sk-admin', '{"musteri_adi":"R4","sahip_kullanici_id":"sk-admin-a"}', 'PT409'),
      ('sk-admin-a', '{"musteri_adi":"R5"}', '22023'),
      ('sk-admin', '{"musteri_adi":"R6","sahip_kullanici_id":"sk-patron-b"}', 'PT409'),
      -- Named team members of the tenant own it.
      ('sk-admin', '{"musteri_adi":"O1","sahip_kullanici_id":"sk-sales-a"}', 'owner:sk-sales-a'),
      ('sk-admin', '{"musteri_adi":"O2","sahip_kullanici_id":"sk-patron-a"}', 'owner:sk-patron-a'),
      -- Team members keep their A8 rules.
      ('sk-patron-a', '{"musteri_adi":"O3"}', 'owner:sk-patron-a'),
      ('sk-sales-a', '{"musteri_adi":"O4"}', 'owner:sk-sales-a'),
      ('sk-patron-a', '{"musteri_adi":"O5","sahip_kullanici_id":"sk-sales-a"}', 'owner:sk-sales-a'),
      ('sk-sales-a', '{"musteri_adi":"R7","sahip_kullanici_id":"sk-patron-a"}', 'PT403')) AS t(uid, head, want) LOOP
    got := pg_temp.sk_owner(c.uid, c.head);
    IF got IS DISTINCT FROM c.want THEN RAISE EXCEPTION 'Expected % for % %, got %', c.want, c.uid, c.head, got; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE musteri_adi LIKE 'R_' AND tenant_id = 'sk-a')
     OR EXISTS (SELECT 1 FROM public.siparisler s JOIN public.kullanicilar k ON k.id = s.sahip_kullanici_id
                 WHERE k.rol = 'SUPER_ADMIN') THEN
    RAISE EXCEPTION 'A refused order was written or an admin owns an order';
  END IF;
END $$;
ROLLBACK;

-- 3. Down (twice) restores the A8 behaviour and drops nothing.
BEGIN;
\ir ../../supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql
\ir ../../supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql
COMMIT;
BEGIN;
SELECT pg_temp.sk_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF pg_temp.sk_owner('sk-admin', '{"musteri_adi":"A8"}') IS DISTINCT FROM 'owner:sk-admin' THEN
    RAISE EXCEPTION 'Rollback did not restore the A8 owner default';
  END IF;
  IF to_regclass('public.siparis_satirlari') IS NULL
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Rollback changed more than the order RPC body';
  END IF;
END $$;
ROLLBACK;

-- With the A8 function gone (older rollback already ran), this rollback is a no-op.
BEGIN;
\ir ../../supabase/rollbacks/20260924150000_siparis_satirlari.down.sql
\ir ../../supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback recreated the order RPC without its tables';
  END IF;
END $$;
ROLLBACK;

-- 4. Up again: the rule is back.
\ir ../../supabase/migrations/20260925100000_siparis_sahibi_kurali.sql
BEGIN;
SELECT pg_temp.sk_fixture();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  IF pg_temp.sk_owner('sk-admin', '{"musteri_adi":"U1"}') IS DISTINCT FROM '22023'
     OR pg_temp.sk_owner('sk-admin', '{"musteri_adi":"U2","sahip_kullanici_id":"sk-admin"}') IS DISTINCT FROM 'PT409'
     OR pg_temp.sk_owner('sk-admin', '{"musteri_adi":"U3","sahip_kullanici_id":"sk-sales-a"}') IS DISTINCT FROM 'owner:sk-sales-a' THEN
    RAISE EXCEPTION 'Re-applied owner rule is incomplete';
  END IF;
END $$;
ROLLBACK;
