-- Canonical schema + migrations, isolated PostgreSQL only; all fixtures roll back.
-- Covers tomnap_approve_awb_matches and the append-only awb_match_approvals log.
BEGIN;
DO $$ DECLARE proc text; actor text; privilege text; BEGIN
  FOREACH proc IN ARRAY ARRAY['public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)', 'public.tomnap_awb_match_approvals_append_only()'] LOOP
    IF (SELECT prosecdef FROM pg_proc WHERE oid = proc::regprocedure)
       OR NOT (SELECT coalesce(proconfig @> ARRAY['search_path=""'], false) FROM pg_proc WHERE oid = proc::regprocedure) THEN
      RAISE EXCEPTION 'Unsafe function %', proc;
    END IF;
  END LOOP;
  FOREACH actor IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(actor, 'public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)', 'EXECUTE')
       OR has_any_column_privilege(actor, 'public.awb_match_approvals', 'SELECT')
       OR has_any_column_privilege(actor, 'public.awb_match_approvals', 'INSERT') THEN
      RAISE EXCEPTION 'Browser role % can reach the approval log', actor;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role', 'public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_table_privilege('service_role', 'public.awb_match_approvals', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.awb_match_approvals', 'INSERT') THEN
    RAISE EXCEPTION 'Missing service role grant';
  END IF;
  FOREACH privilege IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('service_role', 'public.awb_match_approvals', privilege) THEN
      RAISE EXCEPTION 'service_role has % on the append-only log', privilege;
    END IF;
  END LOOP;
  IF has_any_column_privilege('service_role', 'public.awb_match_approvals', 'UPDATE') THEN
    RAISE EXCEPTION 'service_role has column UPDATE on the append-only log';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.awb_match_approvals'::regclass) THEN
    RAISE EXCEPTION 'Row level security is not forced on the approval log';
  END IF;
  -- The superseded confirmation RPC must not offer a write path without a log row.
  IF has_function_privilege('service_role', 'public.tomnap_confirm_awb_matches(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Unlogged tomnap_confirm_awb_matches is still executable';
  END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_approve_awb_matches('awb-sql-a', 'u', '{}', '[]'); RAISE EXCEPTION 'Anonymous approval ran';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM * FROM public.awb_match_approvals; RAISE EXCEPTION 'Anonymous log read';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_approve_awb_matches('awb-sql-a', 'u', '{}', '[]'); RAISE EXCEPTION 'Browser approval ran';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('awb-sql-a', 'AWB test A', 'AKTIF'), ('awb-sql-b', 'AWB test B', 'AKTIF');
INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
 ('awb-sql-owner', 'awb-sql-a', 'Owner A', 'awb-owner-a@sql.fixture', 'PATRON', 'AKTIF'),
 ('awb-sql-buyer', 'awb-sql-a', 'Buyer A', 'awb-buyer-a@sql.fixture', 'KANADA_SATINALMA', 'AKTIF'),
 ('awb-sql-sales', 'awb-sql-a', 'Sales A', 'awb-sales-a@sql.fixture', 'SATIS_SORUMLUSU', 'AKTIF'),
 ('awb-sql-passive', 'awb-sql-a', 'Passive A', 'awb-passive-a@sql.fixture', 'PATRON', 'PASIF'),
 ('awb-sql-owner-b', 'awb-sql-b', 'Owner B', 'awb-owner-b@sql.fixture', 'PATRON', 'AKTIF'),
 ('awb-sql-admin', 'awb-sql-b', 'Admin', 'awb-admin@sql.fixture', 'SUPER_ADMIN', 'AKTIF');
INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, lojistik_durumu, uluslararasi_kargo_kodu, ek_veriler) VALUES
 ('50000000-0000-4000-8000-000000000001', 'awb-sql-a', 'm', 'Target', 'Parcel', 'KANADA_DEPO', NULL, '{"kanada_fatura_no":"KEEP"}'),
 ('50000000-0000-4000-8000-000000000002', 'awb-sql-a', 'm', 'Delivered', 'Parcel', 'TESLIM_EDILDI', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000003', 'awb-sql-a', 'm', 'Labelled', 'Parcel', 'ULUSLARARASI_KARGO', 'OLD-AWB-1', '{}'),
 ('50000000-0000-4000-8000-000000000004', 'awb-sql-a', 'm', 'Holder', 'Parcel', 'ULUSLARARASI_KARGO', ' awb-0004', '{}'),
 ('50000000-0000-4000-8000-000000000005', 'awb-sql-a', 'm', 'Free', 'Parcel', 'KANADA_SATINALIM_BEKLIYOR', '', '{}'),
 ('50000000-0000-4000-8000-000000000006', 'awb-sql-b', 'm', 'Foreign', 'Parcel', 'KANADA_DEPO', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000007', 'awb-sql-a', 'm', 'Later', 'Parcel', 'BAKU_DAGITIM_ARKADAS', NULL, '{}'),
 ('50000000-0000-4000-8000-000000000008', 'awb-sql-b', 'm', 'Foreign holder', 'Parcel', 'ULUSLARARASI_KARGO', 'AWB-2008', '{}'),
 ('50000000-0000-4000-8000-000000000009', 'awb-sql-a', 'm', 'Admin target', 'Parcel', 'KANADA_DEPO', NULL, '{}'),
 ('50000000-0000-4000-8000-00000000000a', 'awb-sql-a', 'm', 'Fails mid-way', 'Parcel', 'KANADA_DEPO', NULL, '{}'),
 ('50000000-0000-4000-8000-00000000000b', 'awb-sql-a', 'm', 'Before failure', 'Parcel', 'KANADA_DEPO', NULL, '{}');
DO $$
DECLARE r jsonb; o public.siparisler; a public.awb_match_approvals; bad jsonb;
  m jsonb := '{"dosyaAdi":"dispatch-0923.xlsx","sha256":"abababababababababababababababababababababababababababababababab"}';
BEGIN
  -- One valid pair next to blocked pairs: no order changes and no approval rows.
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', m, '[
    {"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001","agirlikKg":1.5,"eslesmeTuru":"TELEFON","isimPuani":1},
    {"satirNo":2,"siparisId":"50000000-0000-4000-8000-000000000002","takipNo":"AWB-1002","eslesmeTuru":"TELEFON","isimPuani":1},
    {"satirNo":3,"siparisId":"50000000-0000-4000-8000-000000000003","takipNo":"AWB-1003","eslesmeTuru":"TELEFON","isimPuani":1},
    {"satirNo":4,"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-0004","eslesmeTuru":"ISIM","isimPuani":0.7},
    {"satirNo":5,"siparisId":"50000000-0000-4000-8000-000000000006","takipNo":"AWB-1006","eslesmeTuru":"TELEFON","isimPuani":1},
    {"satirNo":6,"siparisId":"not-a-uuid","takipNo":"AWB-1009","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF r->>'basarili' <> 'false' OR (r->>'kayitSayisi')::integer <> 0 THEN RAISE EXCEPTION 'Rejected batch reported writes %', r; END IF;
  IF (SELECT string_agg(e->>'satirNo' || ':' || (e->>'sebep'), ',' ORDER BY n) FROM jsonb_array_elements(r->'reddedilenler') WITH ORDINALITY AS t(e, n))
     <> '2:TESLIM_EDILDI,3:MEVCUT_AWB,4:AWB_BASKA_SIPARISTE,5:SIPARIS_BULUNAMADI,6:SIPARIS_BULUNAMADI' THEN
    RAISE EXCEPTION 'Unexpected rejection reasons %', r;
  END IF;
  IF (SELECT count(*) FROM public.awb_match_approvals WHERE tenant_id IN ('awb-sql-a', 'awb-sql-b')) <> 0
     OR (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000001') IS NOT NULL
     OR (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000003') <> 'OLD-AWB-1' THEN
    RAISE EXCEPTION 'A rejected batch changed an order or logged an approval';
  END IF;

  -- Confirmed pairs: order change and approval row per written AWB, same transaction.
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', m, '[
    {"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001","agirlikKg":1.5,"eslesmeTuru":"TELEFON","isimPuani":0.5},
    {"satirNo":2,"siparisId":"50000000-0000-4000-8000-000000000007","takipNo":"AWB-2008","eslesmeTuru":"ISIM","isimPuani":0.62349}]');
  IF r->>'basarili' <> 'true' OR (r->>'kayitSayisi')::integer <> 2 THEN RAISE EXCEPTION 'Approval failed %', r; END IF;
  SELECT * INTO o FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000001';
  IF o.uluslararasi_kargo_kodu <> 'AWB-1001' OR o.lojistik_durumu::text <> 'ULUSLARARASI_KARGO'
     OR o.ek_veriler->>'kargo_agirligi_kg' <> '1.5' OR o.ek_veriler->>'kanada_fatura_no' <> 'KEEP' THEN
    RAISE EXCEPTION 'Approved order not written as expected %', to_jsonb(o);
  END IF;
  SELECT * INTO a FROM public.awb_match_approvals WHERE siparis_id = '50000000-0000-4000-8000-000000000007';
  IF a.tenant_id <> 'awb-sql-a' OR a.awb <> 'AWB-2008' OR a.manifest_dosya_adi <> 'dispatch-0923.xlsx'
     OR a.manifest_sha256 <> repeat('ab', 32) OR a.manifest_satir_no <> 2 OR a.eslesme_turu <> 'ISIM'
     OR a.isim_puani <> 0.623 OR a.onaylayan_kullanici_id <> 'awb-sql-owner' OR a.onay_zamani IS NULL THEN
    RAISE EXCEPTION 'Approval row not recorded as expected %', to_jsonb(a);
  END IF;
  IF (SELECT lojistik_durumu::text FROM public.siparisler WHERE id = '50000000-0000-4000-8000-000000000007') <> 'BAKU_DAGITIM_ARKADAS' THEN
    RAISE EXCEPTION 'Later status was rewritten';
  END IF;

  -- Lost-response retry: nothing written, no second approval row. AWB cannot move.
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', m,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000001","takipNo":"AWB-1001","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF r#>>'{uygulananlar,0,tekrar}' <> 'true' OR (r->>'kayitSayisi')::integer <> 0
     OR (SELECT count(*) FROM public.awb_match_approvals WHERE tenant_id IN ('awb-sql-a', 'awb-sql-b')) <> 2 THEN RAISE EXCEPTION 'Retry was not idempotent %', r; END IF;
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', m,
    '[{"satirNo":3,"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-1001","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF r#>>'{reddedilenler,0,sebep}' <> 'AWB_BASKA_SIPARISTE' THEN RAISE EXCEPTION 'Duplicate AWB accepted %', r; END IF;

  -- Tenant isolation: another tenant can neither write this order nor create a log row for it.
  r := public.tomnap_approve_awb_matches('awb-sql-b', 'awb-sql-owner-b', m,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-3001","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF r#>>'{reddedilenler,0,sebep}' <> 'SIPARIS_BULUNAMADI' OR EXISTS (SELECT 1 FROM public.awb_match_approvals WHERE tenant_id = 'awb-sql-b') THEN
    RAISE EXCEPTION 'Cross-tenant approval accepted %', r;
  END IF;
  IF EXISTS (SELECT 1 FROM public.awb_match_approvals a2 JOIN public.siparisler s ON s.id = a2.siparis_id WHERE s.tenant_id <> a2.tenant_id) THEN
    RAISE EXCEPTION 'An approval row points at another tenant order';
  END IF;

  -- The approving user must be active, allowed to set AWBs and belong to the tenant (or be SUPER_ADMIN).
  FOREACH bad IN ARRAY ARRAY['"awb-sql-owner-b"', '"awb-sql-sales"', '"awb-sql-passive"', '"no-such-user"']::jsonb[] LOOP
    BEGIN
      PERFORM public.tomnap_approve_awb_matches('awb-sql-a', bad #>> '{}', m,
        '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000009","takipNo":"AWB-4001","eslesmeTuru":"TELEFON","isimPuani":1}]');
      RAISE EXCEPTION 'Unauthorized approver % accepted', bad;
    EXCEPTION WHEN SQLSTATE 'PT403' THEN NULL;
    END;
  END LOOP;
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-admin', m,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000009","takipNo":"AWB-4001","eslesmeTuru":"TELEFON","isimPuani":1}]');
  IF r->>'basarili' <> 'true' OR (SELECT onaylayan_kullanici_id FROM public.awb_match_approvals WHERE awb = 'AWB-4001') <> 'awb-sql-admin' THEN
    RAISE EXCEPTION 'SUPER_ADMIN approval not logged %', r;
  END IF;
  r := public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-buyer', m,
    '[{"satirNo":2,"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-4002","eslesmeTuru":"SIPARIS_KODU","isimPuani":0.2}]');
  IF r->>'basarili' <> 'true' THEN RAISE EXCEPTION 'Purchasing approval rejected %', r; END IF;

  -- Malformed or ambiguous requests are refused before any lock, write or log row.
  FOREACH bad IN ARRAY ARRAY[
    '[]'::jsonb,
    '{}'::jsonb,
    '[1]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON"}]'::jsonb,
    '[{"satirNo":0,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb,
    '[{"satirNo":1.5,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"GUESS","isimPuani":1}]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"ISIM","isimPuani":1.5}]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"awb-lower","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON","isimPuani":1,"agirlikKg":-1}]'::jsonb,
    '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON","isimPuani":1},{"satirNo":1,"siparisId":"50000000-0000-4000-8000-000000000005","takipNo":"AWB-5006","eslesmeTuru":"TELEFON","isimPuani":1}]'::jsonb,
    (SELECT jsonb_agg(jsonb_build_object('satirNo', n, 'siparisId', 'o' || n, 'takipNo', 'AWB-' || (10000 + n), 'eslesmeTuru', 'TELEFON', 'isimPuani', 1)) FROM generate_series(1, 501) n)
  ] LOOP
    BEGIN
      PERFORM public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', m, bad);
      RAISE EXCEPTION 'Malformed approval accepted %', left(bad::text, 120);
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  FOREACH bad IN ARRAY ARRAY['{}'::jsonb, '{"dosyaAdi":"x.xlsx"}'::jsonb, '{"dosyaAdi":"x.xlsx","sha256":"ABC"}'::jsonb,
                             '{"dosyaAdi":"","sha256":"abababababababababababababababababababababababababababababababab"}'::jsonb,
                             jsonb_build_object('dosyaAdi', 'bad' || chr(10) || 'name', 'sha256', repeat('ab', 32))] LOOP
    BEGIN
      PERFORM public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner', bad,
        '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-5005","eslesmeTuru":"TELEFON","isimPuani":1}]');
      RAISE EXCEPTION 'Malformed manifest reference accepted %', bad;
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;
  END LOOP;
  BEGIN PERFORM public.tomnap_approve_awb_matches('all', 'awb-sql-owner', m, '[{"satirNo":1,"siparisId":"x","takipNo":"AWB-5007","eslesmeTuru":"TELEFON","isimPuani":1}]');
    RAISE EXCEPTION 'Global tenant accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN PERFORM public.tomnap_approve_awb_matches('awb-sql-a', NULL, m, '[{"satirNo":1,"siparisId":"x","takipNo":"AWB-5007","eslesmeTuru":"TELEFON","isimPuani":1}]');
    RAISE EXCEPTION 'Missing user accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-00000000000b') IS NOT NULL THEN
    RAISE EXCEPTION 'A malformed request changed an order';
  END IF;
END $$;
RESET ROLE;

-- Same transaction: a failure after the first order and log row were written
-- (a synthetic trigger fails the second UPDATE) leaves neither behind.
CREATE FUNCTION public.awb_sql_fail_second_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = '50000000-0000-4000-8000-00000000000a' THEN RAISE EXCEPTION 'synthetic mid-transaction failure' USING ERRCODE = 'XX001'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER awb_sql_fail_second_update BEFORE UPDATE ON public.siparisler
  FOR EACH ROW EXECUTE FUNCTION public.awb_sql_fail_second_update();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN
    PERFORM public.tomnap_approve_awb_matches('awb-sql-a', 'awb-sql-owner',
      '{"dosyaAdi":"dispatch.xlsx","sha256":"abababababababababababababababababababababababababababababababab"}',
      '[{"satirNo":1,"siparisId":"50000000-0000-4000-8000-00000000000b","takipNo":"AWB-6001","eslesmeTuru":"TELEFON","isimPuani":1},
        {"satirNo":2,"siparisId":"50000000-0000-4000-8000-00000000000a","takipNo":"AWB-6002","eslesmeTuru":"TELEFON","isimPuani":1}]');
    RAISE EXCEPTION 'Synthetic failure did not surface';
  EXCEPTION WHEN SQLSTATE 'XX001' THEN NULL;
  END;
  IF (SELECT uluslararasi_kargo_kodu FROM public.siparisler WHERE id = '50000000-0000-4000-8000-00000000000b') IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.awb_match_approvals WHERE awb IN ('AWB-6001', 'AWB-6002')) THEN
    RAISE EXCEPTION 'A failed approval left an order change or a log row behind';
  END IF;

  -- Append-only for the service role: privileges are revoked.
  BEGIN UPDATE public.awb_match_approvals SET awb = 'AWB-9999'; RAISE EXCEPTION 'service_role UPDATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.awb_match_approvals WHERE awb = 'AWB-1001'; RAISE EXCEPTION 'service_role DELETE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.awb_match_approvals; RAISE EXCEPTION 'service_role TRUNCATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Append-only even for the table owner: the triggers raise.
DO $$ BEGIN
  BEGIN UPDATE public.awb_match_approvals SET awb = 'AWB-9999' WHERE awb = 'AWB-1001'; RAISE EXCEPTION 'Owner UPDATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.awb_match_approvals WHERE awb = 'AWB-1001'; RAISE EXCEPTION 'Owner DELETE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.awb_match_approvals; RAISE EXCEPTION 'Owner TRUNCATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.awb_match_approvals WHERE tenant_id IN ('awb-sql-a', 'awb-sql-b')) <> 4 THEN RAISE EXCEPTION 'Approval log changed'; END IF;
END $$;

-- Rollback files, newest first: objects created by each migration disappear
-- and the previous grants return.
\ir ../../supabase/rollbacks/20260923164650_awb_match_approvals.down.sql
DO $$ BEGIN
  IF to_regclass('public.awb_match_approvals') IS NOT NULL
     OR to_regprocedure('public.tomnap_approve_awb_matches(text,text,jsonb,jsonb)') IS NOT NULL
     OR to_regprocedure('public.tomnap_awb_match_approvals_append_only()') IS NOT NULL THEN
    RAISE EXCEPTION 'Approval rollback left objects behind';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.tomnap_confirm_awb_matches(text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Approval rollback did not restore the previous confirmation grant';
  END IF;
END $$;
\ir ../../supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_confirm_awb_matches(text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Confirmation rollback left its function behind';
  END IF;
END $$;
ROLLBACK;
