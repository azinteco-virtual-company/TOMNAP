-- Sipariş satırları (A8): access, tomnap_v2_siparis_olustur (derived columns,
-- owner and creator rules, all-or-nothing), the line trigger, and
-- up -> down -> up. Run after baseline + all migrations, in ONE psql session,
-- BEFORE siparis-satirlari-concurrency.mjs (which commits v2 orders).
\set ON_ERROR_STOP 1

-- 1. Access.
DO $$ DECLARE actor text; priv text; BEGIN
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.siparis_satirlari'::regclass) THEN
    RAISE EXCEPTION 'Row level security is not forced on siparis_satirlari';
  END IF;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege(actor, 'public.siparis_satirlari', priv) THEN RAISE EXCEPTION '% has % on siparis_satirlari', actor, priv; END IF;
    END LOOP;
    IF has_any_column_privilege(actor, 'public.siparis_satirlari', 'SELECT')
       OR has_function_privilege(actor, 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION '% can reach order lines', actor;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.siparis_satirlari', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.siparis_satirlari', 'INSERT')
     OR has_table_privilege('service_role', 'public.siparis_satirlari', 'UPDATE')
     OR has_table_privilege('service_role', 'public.siparis_satirlari', 'DELETE')
     OR has_any_column_privilege('service_role', 'public.siparis_satirlari', 'UPDATE')
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role privileges on order lines are wrong';
  END IF;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc
       WHERE oid = 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'Unsafe order RPC configuration';
  END IF;
END $$;

-- 2. Behaviour, rolled back.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('ss-a', 'Satır A', 'AKTIF'), ('ss-b', 'Satır B', 'AKTIF');
INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
  ('ss-patron-a', 'ss-a', 'Patron A', 'patron-a@satir.test', 'PATRON', 'AKTIF'),
  ('ss-sales-a', 'ss-a', 'Sales A', 'sales-a@satir.test', 'SATIS_SORUMLUSU', 'AKTIF'),
  ('ss-pasif-a', 'ss-a', 'Pasif A', 'pasif-a@satir.test', 'SATIS_SORUMLUSU', 'PASIF'),
  ('ss-kanada-a', 'ss-a', 'Kanada A', 'kanada-a@satir.test', 'KANADA_SATINALMA', 'AKTIF'),
  ('ss-patron-b', 'ss-b', 'Patron B', 'patron-b@satir.test', 'PATRON', 'AKTIF');
INSERT INTO public.musteriler(id, tenant_id, ad_soyad) VALUES ('ss-mus-a', 'ss-a', 'Müşteri A'), ('ss-mus-b', 'ss-b', 'Müşteri B');
INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi) VALUES
  ('70000000-0000-4000-8000-000000000001', 'ss-a', 'v1', 'v1 order', 'v1 item');

DO $$
DECLARE r jsonb; o public.siparisler; failed boolean; bad record; code text;
  iki jsonb := '[{"urun_aciklamasi":" A ","beden":"M","renk":" ","adet":2,"birim_satis_fiyati_azn":50,"kaynak_ulke":"CA"},
                 {"urun_aciklamasi":"B","adet":1,"birim_satis_fiyati_azn":30.5,"kaynak_ulke":"US"}]';
BEGIN
  -- v1 inserts keep model 1 and no owner.
  IF (SELECT row(model_surumu, sahip_kullanici_id) FROM public.siparisler WHERE id = '70000000-0000-4000-8000-000000000001')
     IS DISTINCT FROM row(1::smallint, NULL::text) THEN
    RAISE EXCEPTION 'A v1 insert changed';
  END IF;

  -- The creator owns the order by default; old columns are derived from the lines.
  r := public.tomnap_v2_siparis_olustur('ss-a', 'ss-patron-a',
    '{"musteri_adi":"  Aytən  ","telefon_numarasi":"+994501112233","musteri_id":"ss-mus-a"}', iki);
  SELECT * INTO o FROM public.siparisler WHERE id = (r->'siparis'->>'id')::uuid;
  IF o.model_surumu <> 2 OR o.sahip_kullanici_id <> 'ss-patron-a' OR o.toplam_tutar <> 130.50 OR o.adet <> 3
     OR o.urun_aciklamasi <> 'A + B' OR o.alinan_tutar <> 0 OR o.kalan_tutar <> 130.50
     OR o.finans_durumu::text <> 'BEKLIYOR' OR o.lojistik_durumu::text <> 'KANADA_SATINALIM_BEKLIYOR'
     OR o.musteri_adi <> 'Aytən' OR o.ek_veriler <> '{"musteri_id":"ss-mus-a"}'::jsonb OR o.tenant_id <> 'ss-a' THEN
    RAISE EXCEPTION 'Wrong derived order: %', to_jsonb(o);
  END IF;
  IF (SELECT string_agg(sira || ':' || urun_aciklamasi || ':' || coalesce(beden, '-') || ':' || coalesce(renk, '-') || ':' || adet
                        || ':' || birim_satis_fiyati_azn || ':' || kaynak_ulke || ':' || tenant_id, ',' ORDER BY sira)
        FROM public.siparis_satirlari WHERE siparis_id = o.id) <> '1:A:M:-:2:50.00:CA:ss-a,2:B:-:-:1:30.50:US:ss-a'
     OR jsonb_array_length(r->'satirlar') <> 2 THEN
    RAISE EXCEPTION 'Wrong order lines';
  END IF;

  -- An owner may be chosen by the owner/admin, among active sales users and owners of the tenant.
  r := public.tomnap_v2_siparis_olustur('ss-a', 'ss-patron-a', '{"musteri_adi":"X","sahip_kullanici_id":"ss-sales-a"}', iki);
  IF r->'siparis'->>'sahip_kullanici_id' <> 'ss-sales-a' THEN RAISE EXCEPTION 'Chosen owner ignored'; END IF;
  r := public.tomnap_v2_siparis_olustur('ss-a', 'ss-sales-a', '{"musteri_adi":"X","sahip_kullanici_id":"ss-sales-a"}', iki);
  IF r->'siparis'->>'sahip_kullanici_id' <> 'ss-sales-a' THEN RAISE EXCEPTION 'Sales self-owner failed'; END IF;

  -- Refusals write nothing.
  FOR bad IN SELECT * FROM (VALUES
      ('ss-sales-a', '{"musteri_adi":"Ret1","sahip_kullanici_id":"ss-patron-a"}', 'PT403'),
      ('ss-kanada-a', '{"musteri_adi":"Ret2"}', 'PT403'),
      ('ss-patron-b', '{"musteri_adi":"Ret3"}', 'PT403'),
      ('nobody', '{"musteri_adi":"Ret4"}', 'PT403'),
      ('ss-pasif-a', '{"musteri_adi":"Ret5"}', 'PT403'),
      ('ss-patron-a', '{"musteri_adi":"Ret6","sahip_kullanici_id":"ss-pasif-a"}', 'PT409'),
      ('ss-patron-a', '{"musteri_adi":"Ret7","sahip_kullanici_id":"ss-kanada-a"}', 'PT409'),
      ('ss-patron-a', '{"musteri_adi":"Ret8","sahip_kullanici_id":"ss-patron-b"}', 'PT409'),
      ('ss-patron-a', '{"musteri_adi":"Ret9","musteri_id":"ss-mus-b"}', 'PT409'),
      ('ss-patron-a', '{"musteri_adi":"   "}', '22023')) AS t(uid, head, want) LOOP
    code := NULL;
    BEGIN PERFORM public.tomnap_v2_siparis_olustur('ss-a', bad.uid, bad.head::jsonb, iki);
    EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
    END;
    IF code IS DISTINCT FROM bad.want THEN RAISE EXCEPTION 'Expected % for %, got %', bad.want, bad.head, coalesce(code, 'success'); END IF;
  END LOOP;

  -- A failure half way (the second line breaks a column check after the header
  -- and first line were inserted) leaves nothing behind; same for bad totals.
  FOR bad IN SELECT * FROM (VALUES
      ('[{"urun_aciklamasi":"ok","adet":1,"birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"},{"urun_aciklamasi":"bad","adet":0,"birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"}]', '23514'),
      ('[{"urun_aciklamasi":"ok","adet":1,"birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"},{"urun_aciklamasi":"bad","adet":1,"birim_satis_fiyati_azn":1,"kaynak_ulke":"DE"}]', '23514'),
      ('[{"urun_aciklamasi":"ok","adet":1,"birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"},{"urun_aciklamasi":" ","adet":1,"birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"}]', '23514'),
      ('[{"urun_aciklamasi":"ok","adet":1000,"birim_satis_fiyati_azn":999999.99,"kaynak_ulke":"CA"},{"urun_aciklamasi":"ok","adet":1000,"birim_satis_fiyati_azn":999999.99,"kaynak_ulke":"CA"}]', '22003'),
      ('[{"urun_aciklamasi":"ok","adet":"2","birim_satis_fiyati_azn":1,"kaynak_ulke":"CA"}]', '22023'),
      ('[]', '22023')) AS t(lines, want) LOOP
    code := NULL;
    BEGIN PERFORM public.tomnap_v2_siparis_olustur('ss-a', 'ss-patron-a', '{"musteri_adi":"Yarım"}', bad.lines::jsonb);
    EXCEPTION WHEN OTHERS THEN code := SQLSTATE;
    END;
    IF code IS DISTINCT FROM bad.want THEN RAISE EXCEPTION 'Expected % for %, got %', bad.want, bad.lines, coalesce(code, 'success'); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE musteri_adi IN ('Yarım', 'Ret1', 'Ret2', 'Ret3', 'Ret4', 'Ret5', 'Ret6', 'Ret7', 'Ret8', 'Ret9'))
     OR EXISTS (SELECT 1 FROM public.siparis_satirlari l WHERE l.urun_aciklamasi IN ('ok', 'bad')) THEN
    RAISE EXCEPTION 'A refused or failed order left rows behind';
  END IF;

  -- Lines attach only to a v2 order of the same tenant, and cannot be changed.
  FOR bad IN SELECT * FROM (VALUES
      ('70000000-0000-4000-8000-000000000001', 'ss-a'),
      ((SELECT id::text FROM public.siparisler WHERE sahip_kullanici_id = 'ss-patron-a' AND tenant_id = 'ss-a' LIMIT 1), 'ss-b')) AS t(ord, ten) LOOP
    failed := false;
    BEGIN
      INSERT INTO public.siparis_satirlari(tenant_id, siparis_id, sira, urun_aciklamasi, adet, birim_satis_fiyati_azn, kaynak_ulke)
      VALUES (bad.ten, bad.ord::uuid, 50, 'Sızma', 1, 1, 'CA');
    EXCEPTION WHEN check_violation THEN failed := true;
    END;
    IF NOT failed THEN RAISE EXCEPTION 'A line attached to % in %', bad.ord, bad.ten; END IF;
  END LOOP;
  failed := false;
  BEGIN UPDATE public.siparis_satirlari SET adet = 9 WHERE tenant_id = 'ss-a'; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'service_role updated an order line'; END IF;
  failed := false;
  BEGIN DELETE FROM public.siparis_satirlari WHERE tenant_id = 'ss-a'; EXCEPTION WHEN insufficient_privilege THEN failed := true; END;
  IF NOT failed THEN RAISE EXCEPTION 'service_role deleted an order line'; END IF;

  -- Deleting a v2 order removes its lines with it.
  DELETE FROM public.siparisler WHERE id = o.id;
  IF EXISTS (SELECT 1 FROM public.siparis_satirlari WHERE siparis_id = o.id) THEN RAISE EXCEPTION 'Orphan lines left'; END IF;
END $$;
ROLLBACK;

-- 3. Up -> down -> up (no v2 order is committed at this point). Newer migrations
-- that replace the order RPC roll back first and are re-applied last.
BEGIN;
\ir ../../supabase/rollbacks/20260925110000_odemeler.down.sql
\ir ../../supabase/rollbacks/20260925100000_siparis_sahibi_kurali.down.sql
\ir ../../supabase/rollbacks/20260924150000_siparis_satirlari.down.sql
COMMIT;
BEGIN;
\ir ../../supabase/rollbacks/20260924150000_siparis_satirlari.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regclass('public.siparis_satirlari') IS NOT NULL
     OR to_regprocedure('public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.tomnap_siparis_satiri_kontrol()') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler'
                  AND column_name IN ('model_surumu', 'sahip_kullanici_id')) THEN
    RAISE EXCEPTION 'Rollback left order line objects behind';
  END IF;
  IF to_regclass('public.siparisler') IS NULL OR to_regclass('public.kurlar') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'siparisler'
                      AND column_name = 'kurye_atama_surumu') THEN
    RAISE EXCEPTION 'Rollback dropped a pre-existing object';
  END IF;
END $$;
\ir ../../supabase/migrations/20260924150000_siparis_satirlari.sql
DO $$ BEGIN
  IF to_regclass('public.siparis_satirlari') IS NULL
     OR NOT has_function_privilege('service_role', 'public.tomnap_v2_siparis_olustur(text,text,jsonb,jsonb)', 'EXECUTE')
     OR has_table_privilege('service_role', 'public.siparis_satirlari', 'UPDATE')
     OR (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.siparis_satirlari'::regclass AND NOT tgisinternal) <> 1
     OR (SELECT count(*) FROM public.siparisler WHERE model_surumu <> 1) <> 0 THEN
    RAISE EXCEPTION 'Re-applied order line migration is incomplete';
  END IF;
END $$;
\ir ../../supabase/migrations/20260925100000_siparis_sahibi_kurali.sql
\ir ../../supabase/migrations/20260925110000_odemeler.sql
