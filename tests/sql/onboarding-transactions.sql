-- Run after baseline + migrations in a disposable database. No external delivery.
BEGIN;
CREATE FUNCTION public.test_reject_company_activation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.id='tx-activation-fail' THEN RAISE EXCEPTION 'Injected company write failure'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER test_reject_company_activation BEFORE UPDATE ON public.firmalar FOR EACH ROW EXECUTE FUNCTION public.test_reject_company_activation();

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT oid,proname,prosecdef,proconfig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'tomnap_%onboarding%' OR pronamespace='public'::regnamespace AND proname IN ('tomnap_register_boutique','tomnap_activate_user','tomnap_create_invite','tomnap_accept_invite') LOOP
    IF f.prosecdef OR NOT ('search_path=""'=ANY(f.proconfig)) THEN RAISE EXCEPTION 'Unsafe RPC configuration: %', f.proname; END IF;
    IF has_function_privilege('anon',f.oid,'EXECUTE') OR has_function_privilege('authenticated',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Browser can call %',f.proname; END IF;
    IF NOT has_function_privilege('service_role',f.oid,'EXECUTE') THEN RAISE EXCEPTION 'Service cannot call %',f.proname; END IF;
  END LOOP;
  IF has_table_privilege('anon','public.onboarding_email_jobs','SELECT') OR has_table_privilege('authenticated','public.onboarding_email_jobs','SELECT') THEN RAISE EXCEPTION 'Browser can read mail secrets'; END IF;
END $$;
SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id,ad,onay_durumu,rol_limitleri) VALUES
 ('tx-main','Transaction test','AKTIF','{"BAKU_KURYE":1,"PATRON":1}'),
 ('tx-activation-fail','Activation rollback','BEKLEMEDE','{"PATRON":1}'),
 ('tx-null-status','Null status',NULL,'{"BAKU_KURYE":1}');
INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,telefon,rol,durum) VALUES
 ('tx-existing','tx-main','Existing','existing@transaction.test','+994 50 100 00 01','PATRON','AKTIF');
INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum,aktivasyon_token,token_gecerlilik) VALUES
 ('tx-pending','tx-activation-fail','Pending','pending@transaction.test','PATRON','BEKLEMEDE_SIFRE','tx-activation-token',now()+interval '1 hour');
INSERT INTO public.davetler(id,token,firma_id,rol,durum,son_kullanma_tarihi,email) VALUES
 ('tx-invite-1','tx-invite-1','tx-main','BAKU_KURYE','AKTIF',now()+interval '1 hour',NULL),
 ('tx-invite-2','tx-invite-2','tx-main','BAKU_KURYE','AKTIF',now()+interval '1 hour',NULL),
 ('tx-invite-null','tx-invite-null','tx-null-status','BAKU_KURYE','AKTIF',now()+interval '1 hour',NULL),
 ('tx-invite-bound','tx-invite-bound','tx-main','BAKU_KURYE','AKTIF',now()+interval '1 hour','bound@transaction.test');

DO $$
DECLARE f jsonb; u jsonb; job jsonb; result jsonb; failed boolean; claim uuid := '20000000-0000-4000-8000-000000000001';
BEGIN
  f := '{"id":"tx-signup","ad":"Atomic signup","onay_durumu":"BEKLEMEDE","varsayilan_para_birimi":"AZN","varsayilan_komisyon_yuzdesi":15,"rol_limitleri":{"PATRON":1},"aktif_kullanici_sayilari":{"PATRON":1}}';
  u := jsonb_build_object('id','tx-owner','tenant_id','tx-signup','ad_soyad','Owner','email','EXISTING@transaction.test','telefon','+994501000002','rol','PATRON','durum','BEKLEMEDE_SIFRE','aktivasyon_token','tx-owner-token','token_gecerlilik',now()+interval '1 hour');
  job := jsonb_build_object('id','10000000-0000-4000-8000-000000000001','tenant_id','tx-signup','kind','ACTIVATION','payload',jsonb_build_object('to','owner@transaction.test','html','test','subject','Test'),'expires_at',now()+interval '1 hour');
  failed := false;
  BEGIN PERFORM public.tomnap_register_boutique(f,u,job); EXCEPTION WHEN unique_violation THEN failed:=true; END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.firmalar WHERE id='tx-signup') OR EXISTS(SELECT 1 FROM public.onboarding_email_jobs WHERE tenant_id='tx-signup') THEN RAISE EXCEPTION 'Signup user failure did not roll back company+mail'; END IF;
  u := jsonb_set(u,'{email}','"owner@transaction.test"');
  failed := false;
  BEGIN PERFORM public.tomnap_register_boutique(f,u,jsonb_set(job,'{tenant_id}','"wrong-tenant"')); EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true; END;
  IF NOT failed OR EXISTS(SELECT 1 FROM public.firmalar WHERE id='tx-signup') OR EXISTS(SELECT 1 FROM public.kullanicilar WHERE id='tx-owner') THEN RAISE EXCEPTION 'Outbox failure did not roll back registration'; END IF;
  PERFORM public.tomnap_register_boutique(f,u,job);
  IF NOT EXISTS(SELECT 1 FROM public.kullanicilar WHERE id='tx-owner') OR NOT EXISTS(SELECT 1 FROM public.onboarding_email_jobs WHERE tenant_id='tx-signup' AND status='PENDING') THEN RAISE EXCEPTION 'Signup was not committed with mail job'; END IF;
  failed := false;
  BEGIN PERFORM public.tomnap_activate_user('tx-activation-token','test-hash','Pending',''); EXCEPTION WHEN raise_exception THEN failed:=true; END;
  IF NOT failed OR NOT EXISTS(SELECT 1 FROM public.kullanicilar WHERE id='tx-pending' AND durum='BEKLEMEDE_SIFRE' AND aktivasyon_token='tx-activation-token' AND sifre_hash IS NULL) THEN RAISE EXCEPTION 'Company update failure consumed activation token'; END IF;
  PERFORM public.tomnap_activate_user('tx-owner-token','test-hash','Owner','+994501000002');
  failed := false;
  BEGIN PERFORM public.tomnap_activate_user('tx-owner-token','test-hash','Owner',''); EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Activation replay succeeded'; END IF;

  u := '{"id":"tx-invite-user","ad_soyad":"Invitee","email":"existing@transaction.test","telefon":"+994501000003","sifre_hash":"test-hash","rol":"SUPER_ADMIN","tenant_id":"other"}';
  failed := false;
  BEGIN PERFORM public.tomnap_accept_invite('tx-invite-1',u); EXCEPTION WHEN unique_violation THEN failed:=true; END;
  IF NOT failed OR NOT EXISTS(SELECT 1 FROM public.davetler WHERE token='tx-invite-1' AND durum='AKTIF') THEN RAISE EXCEPTION 'Invite user failure consumed invitation'; END IF;
  u := jsonb_set(u,'{email}','"invitee@transaction.test"');
  failed := false;
  BEGIN PERFORM public.tomnap_accept_invite('tx-invite-bound',u); EXCEPTION WHEN SQLSTATE 'PT403' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Bound invitation accepted wrong email'; END IF;
  failed := false;
  BEGIN PERFORM public.tomnap_accept_invite('tx-invite-null',u); EXCEPTION WHEN SQLSTATE 'PT403' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Null company status accepted'; END IF;
  result := public.tomnap_accept_invite('tx-invite-1',u);
  IF result->'user'->>'rol' <> 'BAKU_KURYE' OR result->'user'->>'tenant_id' <> 'tx-main' THEN RAISE EXCEPTION 'Invitation did not constrain role/tenant'; END IF;
  failed := false;
  BEGIN PERFORM public.tomnap_accept_invite('tx-invite-2',jsonb_set(u,'{id}','"tx-second-user"')); EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true; END;
  IF NOT failed OR NOT EXISTS(SELECT 1 FROM public.davetler WHERE token='tx-invite-2' AND durum='AKTIF') THEN RAISE EXCEPTION 'Full quota consumed invitation'; END IF;
  failed := false;
  BEGIN PERFORM public.tomnap_accept_invite('tx-invite-1',u); EXCEPTION WHEN SQLSTATE 'PT409' THEN failed:=true; END;
  IF NOT failed THEN RAISE EXCEPTION 'Invitation replay succeeded'; END IF;

  result := public.tomnap_claim_onboarding_email(job->>'id',claim);
  IF result->>'status' <> 'RUNNING' THEN RAISE EXCEPTION 'Outbox claim failed'; END IF;
  IF public.tomnap_claim_onboarding_email(job->>'id',gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'Concurrent mail claim succeeded'; END IF;
  IF public.tomnap_finish_onboarding_email(job->>'id',gen_random_uuid(),true) THEN RAISE EXCEPTION 'Wrong claim acknowledged'; END IF;
  IF NOT public.tomnap_finish_onboarding_email(job->>'id',claim,false) THEN RAISE EXCEPTION 'Failed mail delivery could not be retried'; END IF;
  IF public.tomnap_claim_onboarding_email(job->>'id',claim) IS NOT NULL THEN RAISE EXCEPTION 'Retry ignored backoff'; END IF;
  UPDATE public.onboarding_email_jobs SET next_attempt_at=now()-interval '1 second' WHERE id=(job->>'id')::uuid;
  PERFORM public.tomnap_claim_onboarding_email(job->>'id',claim);
  UPDATE public.onboarding_email_jobs SET leased_until=now()-interval '1 second' WHERE id=(job->>'id')::uuid;
  result := public.tomnap_claim_onboarding_email(job->>'id',gen_random_uuid());
  IF result IS NULL THEN RAISE EXCEPTION 'Abandoned delivery lease was not recoverable'; END IF;
  IF public.tomnap_finish_onboarding_email(job->>'id',claim,true) THEN RAISE EXCEPTION 'Old worker acknowledged a reclaimed job'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.onboarding_email_jobs WHERE id=(job->>'id')::uuid AND status='RUNNING' AND claim_token=(result->>'claim_token')::uuid) THEN RAISE EXCEPTION 'Old worker modified reclaimed lease'; END IF;
  IF NOT public.tomnap_finish_onboarding_email(job->>'id',(result->>'claim_token')::uuid,true) THEN RAISE EXCEPTION 'Mail acknowledgement failed'; END IF;
  IF public.tomnap_claim_onboarding_email(job->>'id',claim) IS NOT NULL THEN RAISE EXCEPTION 'Sent mail claimed again'; END IF;
END $$;
ROLLBACK;
