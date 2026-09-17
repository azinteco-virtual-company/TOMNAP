-- Run after the canonical schema and phase 3 migration, only in an isolated DB.
BEGIN;
DO $$
DECLARE actor text; proc text;
BEGIN
  FOREACH proc IN ARRAY ARRAY[
    'public.tomnap_approve_inbox(text,text,uuid,jsonb)',
    'public.tomnap_reject_inbox(text,text)'
  ] LOOP
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(actor, proc, 'EXECUTE') THEN
        RAISE EXCEPTION 'Unexpected % execution grant on %', actor, proc;
      END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'Missing service_role execution grant on %', proc;
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = proc::regprocedure) THEN
      RAISE EXCEPTION 'Inbox RPC must use SECURITY INVOKER';
    END IF;
    IF NOT (SELECT coalesce(proconfig @> ARRAY['search_path=""'], false) FROM pg_proc WHERE oid = proc::regprocedure) THEN
      RAISE EXCEPTION 'Inbox RPC must have fixed empty search_path';
    END IF;
  END LOOP;
END $$;

INSERT INTO public.firmalar(id,ad) VALUES ('inbox-sql-a','Inbox SQL A'),('inbox-sql-b','Inbox SQL B');
INSERT INTO public.inbox_mesajlar(id,tenant_id,kaynak,gonderen_kullanici,konusma_gecmisi,durum,oneri_siparis)
VALUES
  ('inbox-sql-ok','inbox-sql-a','WHATSAPP','Synthetic','Original authoritative message','BEKLEMEDE','{}'),
  ('inbox-sql-foreign','inbox-sql-b','WHATSAPP','Synthetic','Private other tenant message','BEKLEMEDE','{}'),
  ('inbox-sql-rejected','inbox-sql-a','WHATSAPP','Synthetic','Rejected message','BEKLEMEDE','{}'),
  ('inbox-sql-failure','inbox-sql-a','WHATSAPP','Synthetic','Rollback message','BEKLEMEDE','{}'),
  ('inbox-sql-invalid','inbox-sql-a','WHATSAPP','Synthetic','Invalid payload message','BEKLEMEDE','{}');

-- Real permission probes, not just grant metadata.
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.tomnap_reject_inbox('inbox-sql-a','inbox-sql-ok');
    RAISE EXCEPTION 'Anonymous RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-ok','00000000-0000-4000-a000-000000000001','{}');
    RAISE EXCEPTION 'Authenticated browser RPC unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  payload jsonb := '{"tenant_id":"inbox-sql-a","ham_mesaj":"Untrusted message override","siparis_kaynagi":"INSTAGRAM_DM","musteri_adi":"SQL Customer","urun_aciklamasi":"SQL Bag","adet":2,"toplam_tutar":125.50,"alinan_tutar":20.25,"para_birimi":"AZN","finans_durumu":"KISMI_ODEME","lojistik_durumu":"KANADA_SATINALIM_BEKLIYOR","eksik_bilgiler":[],"ai_guven_skoru":0.95,"is_demo":false,"id":"00000000-0000-4000-a000-999999999999","kalan_tutar":999}';
  first_result jsonb;
  retry_result jsonb;
BEGIN
  payload := payload || '{"ek_veriler":{"musteri_id":"inbox-customer-a","musteri_tipi":"VIP","kanada_fatura_no":"FIXTURE-INVOICE-1","kanada_fatura_gorseli":"/images/fixture-owned.png","kanada_alis_fiyati_cad":80,"kargo_agirligi_kg":1.25}}'::jsonb;
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-foreign','00000000-0000-4000-a000-000000000002',payload);
    RAISE EXCEPTION 'Cross-tenant approval succeeded';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_reject_inbox('inbox-sql-a','inbox-sql-foreign');
    RAISE EXCEPTION 'Cross-tenant rejection succeeded';
  EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_reject_inbox('all','inbox-sql-ok');
    RAISE EXCEPTION 'Global tenant scope succeeded';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-invalid','00000000-0000-4000-a000-000000000003',payload || '{"tenant_id":"inbox-sql-b"}'::jsonb);
    RAISE EXCEPTION 'Payload tenant retargeting succeeded';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-invalid','00000000-0000-4000-a000-000000000003',payload || '{"adet":0}'::jsonb);
    RAISE EXCEPTION 'Zero quantity succeeded';
  EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  IF (SELECT durum FROM public.inbox_mesajlar WHERE id='inbox-sql-invalid') <> 'BEKLEMEDE' THEN
    RAISE EXCEPTION 'Invalid request mutated inbox';
  END IF;

  first_result := public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-ok','00000000-0000-4000-a000-000000000001',payload);
  IF first_result ->> 'tekrar' <> 'false'
     OR first_result #>> '{siparis,id}' <> '00000000-0000-4000-a000-000000000001'
     OR first_result #>> '{siparis,ham_mesaj}' <> 'Original authoritative message'
     OR first_result #>> '{siparis,siparis_kaynagi}' <> 'WHATSAPP'
     OR (first_result #>> '{siparis,kalan_tutar}')::numeric <> 105.25 THEN
    RAISE EXCEPTION 'Initial approval returned incorrect canonical order: %', first_result;
  END IF;
  IF first_result #> '{siparis,ek_veriler}' IS DISTINCT FROM payload -> 'ek_veriler'
     OR (SELECT ek_veriler FROM public.siparisler WHERE id='00000000-0000-4000-a000-000000000001') IS DISTINCT FROM payload -> 'ek_veriler' THEN
    RAISE EXCEPTION 'Approval lost CRM, customer or invoice data';
  END IF;
  IF (SELECT durum FROM public.inbox_mesajlar WHERE id='inbox-sql-ok') <> 'ONAYLANDI'
     OR (SELECT onaylanan_siparis_id FROM public.inbox_mesajlar WHERE id='inbox-sql-ok') <> '00000000-0000-4000-a000-000000000001'::uuid THEN
    RAISE EXCEPTION 'Approval did not store its decision and order link';
  END IF;
  retry_result := public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-ok','00000000-0000-4000-a000-000000000001',payload || '{"toplam_tutar":999}'::jsonb);
  IF retry_result ->> 'tekrar' <> 'true' OR retry_result -> 'siparis' <> first_result -> 'siparis' THEN
    RAISE EXCEPTION 'Repeated approval must return the original order';
  END IF;
  IF (SELECT count(*) FROM public.siparisler WHERE id='00000000-0000-4000-a000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Approval duplicated an order';
  END IF;
  BEGIN
    PERFORM public.tomnap_reject_inbox('inbox-sql-a','inbox-sql-ok');
    RAISE EXCEPTION 'Approved message was rejected';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

  PERFORM public.tomnap_reject_inbox('inbox-sql-a','inbox-sql-rejected');
  IF public.tomnap_reject_inbox('inbox-sql-a','inbox-sql-rejected') ->> 'tekrar' <> 'true' THEN
    RAISE EXCEPTION 'Repeated rejection was not idempotent';
  END IF;
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-rejected','00000000-0000-4000-a000-000000000004',payload);
    RAISE EXCEPTION 'Rejected message was approved';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE id='00000000-0000-4000-a000-000000000004') THEN
    RAISE EXCEPTION 'Rejected approval created an order';
  END IF;
END $$;
RESET ROLE;

-- Fail AFTER the order INSERT to prove that its row and inbox update roll back.
CREATE FUNCTION public.inbox_sql_fail_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id = 'inbox-sql-failure' AND NEW.durum = 'ONAYLANDI' THEN
    RAISE EXCEPTION 'Injected failure after order insertion';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inbox_sql_failure BEFORE UPDATE ON public.inbox_mesajlar
FOR EACH ROW EXECUTE FUNCTION public.inbox_sql_fail_update();
SET LOCAL ROLE service_role;
DO $$
DECLARE payload jsonb := '{"tenant_id":"inbox-sql-a","musteri_adi":"SQL Customer","urun_aciklamasi":"SQL Bag","adet":1,"toplam_tutar":50,"alinan_tutar":0,"para_birimi":"AZN","finans_durumu":"BEKLIYOR","lojistik_durumu":"KANADA_SATINALIM_BEKLIYOR","eksik_bilgiler":[],"ai_guven_skoru":0.95}';
BEGIN
  BEGIN
    PERFORM public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-failure','00000000-0000-4000-a000-000000000005',payload);
    RAISE EXCEPTION 'Injected transaction failure did not run';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Injected failure after order insertion' THEN RAISE; END IF;
  END;
  IF EXISTS (SELECT 1 FROM public.siparisler WHERE id='00000000-0000-4000-a000-000000000005') THEN
    RAISE EXCEPTION 'Failed approval left a partially committed order';
  END IF;
  IF (SELECT durum FROM public.inbox_mesajlar WHERE id='inbox-sql-failure') <> 'BEKLEMEDE' THEN
    RAISE EXCEPTION 'Failed approval consumed its inbox message';
  END IF;
END $$;
RESET ROLE;
DROP TRIGGER inbox_sql_failure ON public.inbox_mesajlar;
DROP FUNCTION public.inbox_sql_fail_update();
SET LOCAL ROLE service_role;
SELECT public.tomnap_approve_inbox('inbox-sql-a','inbox-sql-failure','00000000-0000-4000-a000-000000000005',
  '{"tenant_id":"inbox-sql-a","musteri_adi":"SQL Customer","urun_aciklamasi":"SQL Bag","adet":1,"toplam_tutar":50,"alinan_tutar":0,"para_birimi":"AZN","finans_durumu":"BEKLIYOR","lojistik_durumu":"KANADA_SATINALIM_BEKLIYOR","eksik_bilgiler":[],"ai_guven_skoru":0.95}');
DO $$ BEGIN
  IF (SELECT durum FROM public.inbox_mesajlar WHERE id='inbox-sql-failure') <> 'ONAYLANDI' THEN
    RAISE EXCEPTION 'Retry after rolled-back failure did not succeed';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
