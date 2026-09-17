-- Transactional persistence; apply after the server-session migration.
BEGIN;
-- Preserve supported order business fields that previously disappeared on DB writes.
ALTER TABLE public.siparisler
  ADD COLUMN ek_veriler jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.siparisler
  ADD CONSTRAINT siparisler_ek_veriler_object CHECK (jsonb_typeof(ek_veriler) = 'object');

-- No destructive deduplication: the migration aborts on existing ambiguous identities.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.kullanicilar GROUP BY lower(btrim(email)) HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM public.kullanicilar WHERE regexp_replace(coalesce(telefon,''),'[^0-9]','','g') <> '' GROUP BY regexp_replace(telefon,'[^0-9]','','g') HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM public.kullanicilar WHERE aktivasyon_token IS NOT NULL GROUP BY aktivasyon_token HAVING count(*) > 1)
  THEN RAISE EXCEPTION 'Ambiguous user email, phone or activation token: review existing identities before migration'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_email_normalized_unique ON public.kullanicilar (lower(btrim(email)));
CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_phone_normalized_unique ON public.kullanicilar (regexp_replace(telefon,'[^0-9]','','g')) WHERE regexp_replace(coalesce(telefon,''),'[^0-9]','','g') <> '';
CREATE UNIQUE INDEX IF NOT EXISTS kullanicilar_activation_token_unique ON public.kullanicilar (aktivasyon_token) WHERE aktivasyon_token IS NOT NULL;
ALTER TABLE public.davetler ADD COLUMN IF NOT EXISTS email varchar(150);

CREATE TABLE public.onboarding_email_jobs (
  id uuid PRIMARY KEY,
  tenant_id varchar(100) NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ACTIVATION','INVITE')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RUNNING','SENT')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  claim_token uuid,
  leased_until timestamptz,
  sent_at timestamptz
);
CREATE INDEX onboarding_email_jobs_pending_idx ON public.onboarding_email_jobs (next_attempt_at,created_at) WHERE status <> 'SENT';
ALTER TABLE public.onboarding_email_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_email_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_email_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.onboarding_email_jobs TO service_role;

CREATE FUNCTION public.tomnap_queue_onboarding_email(p_job jsonb, p_tenant text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
BEGIN
  IF p_job IS NULL THEN RETURN; END IF;
  IF p_job->>'tenant_id' IS DISTINCT FROM p_tenant OR (p_job->>'expires_at')::timestamptz <= now()
    OR coalesce(p_job->'payload'->>'to','') = '' OR coalesce(p_job->'payload'->>'html','') = ''
  THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Invalid email job'; END IF;
  INSERT INTO public.onboarding_email_jobs(id,tenant_id,kind,payload,expires_at)
  VALUES ((p_job->>'id')::uuid,p_tenant,p_job->>'kind',p_job->'payload',(p_job->>'expires_at')::timestamptz);
END $$;

CREATE FUNCTION public.tomnap_register_boutique(p_firma jsonb,p_user jsonb,p_email_job jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE f public.firmalar; u public.kullanicilar;
BEGIN
  IF p_user->>'tenant_id' IS DISTINCT FROM p_firma->>'id' OR p_user->>'rol' IS DISTINCT FROM 'PATRON'
    OR p_user->>'durum' IS DISTINCT FROM 'BEKLEMEDE_SIFRE' OR coalesce(p_user->>'aktivasyon_token','') = ''
    OR coalesce((p_user->>'token_gecerlilik')::timestamptz > now(),false) = false
    OR p_firma->>'onay_durumu' IS DISTINCT FROM 'BEKLEMEDE' OR p_email_job IS NULL
  THEN RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Invalid registration'; END IF;
  INSERT INTO public.firmalar(id,ad,sehir,varsayilan_para_birimi,varsayilan_komisyon_yuzdesi,aciklama,is_demo,onay_durumu,paket,sahip_adi,sahip_email,sahip_telefon,mensei_ulke,rol_limitleri,aktif_kullanici_sayilari)
  VALUES (p_firma->>'id',p_firma->>'ad',p_firma->>'sehir',p_firma->>'varsayilan_para_birimi',(p_firma->>'varsayilan_komisyon_yuzdesi')::numeric,p_firma->>'aciklama',false,'BEKLEMEDE',p_firma->>'paket',p_firma->>'sahip_adi',lower(btrim(p_firma->>'sahip_email')),p_firma->>'sahip_telefon',p_firma->>'mensei_ulke',p_firma->'rol_limitleri',p_firma->'aktif_kullanici_sayilari') RETURNING * INTO f;
  INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,telefon,rol,durum,aktivasyon_token,token_gecerlilik)
  VALUES (p_user->>'id',f.id,p_user->>'ad_soyad',lower(btrim(p_user->>'email')),p_user->>'telefon','PATRON','BEKLEMEDE_SIFRE',p_user->>'aktivasyon_token',(p_user->>'token_gecerlilik')::timestamptz) RETURNING * INTO u;
  PERFORM public.tomnap_queue_onboarding_email(p_email_job,f.id);
  RETURN jsonb_build_object('firma',to_jsonb(f),'user',to_jsonb(u));
END $$;

CREATE FUNCTION public.tomnap_activate_user(p_token text,p_password_hash text,p_name text,p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE tid text; f public.firmalar; u public.kullanicilar;
BEGIN
  SELECT tenant_id INTO tid FROM public.kullanicilar WHERE aktivasyon_token=p_token;
  IF tid IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid activation token'; END IF;
  -- All onboarding functions lock the company before its users/invites.
  SELECT * INTO f FROM public.firmalar WHERE id=tid FOR UPDATE;
  IF NOT FOUND OR (f.onay_durumu IS NULL OR f.onay_durumu NOT IN ('BEKLEMEDE','AKTIF')) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Company unavailable'; END IF;
  SELECT * INTO u FROM public.kullanicilar WHERE aktivasyon_token=p_token AND tenant_id=tid FOR UPDATE;
  IF NOT FOUND OR u.durum IS DISTINCT FROM 'BEKLEMEDE_SIFRE' OR u.token_gecerlilik IS NULL OR u.token_gecerlilik <= now()
    OR coalesce(p_password_hash,'') = '' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid activation token'; END IF;
  UPDATE public.kullanicilar SET sifre_hash=p_password_hash, ad_soyad=coalesce(nullif(btrim(p_name),''),ad_soyad),telefon=coalesce(nullif(btrim(p_phone),''),telefon),durum='AKTIF',aktivasyon_token=NULL,token_gecerlilik=NULL WHERE id=u.id RETURNING * INTO u;
  IF f.onay_durumu='BEKLEMEDE' THEN UPDATE public.firmalar SET onay_durumu='AKTIF' WHERE id=tid RETURNING * INTO f; END IF;
  RETURN jsonb_build_object('firma',to_jsonb(f),'user',to_jsonb(u));
END $$;

CREATE FUNCTION public.tomnap_create_invite(p_invite jsonb,p_email_job jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE f public.firmalar; d public.davetler; n integer; lim integer; r text := p_invite->>'rol';
BEGIN
  SELECT * INTO f FROM public.firmalar WHERE id=p_invite->>'firma_id' FOR UPDATE;
  IF NOT FOUND OR f.onay_durumu IS DISTINCT FROM 'AKTIF' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Company unavailable'; END IF;
  IF r IS NULL OR r NOT IN ('PATRON','KANADA_SATINALMA','SATIS_SORUMLUSU','BAKU_FINANS','BAKU_KURYE') OR coalesce((p_invite->>'son_kullanma_tarihi')::timestamptz > now(),false)=false THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  lim := coalesce((f.rol_limitleri->>r)::integer,0);
  SELECT count(*) INTO n FROM public.kullanicilar WHERE tenant_id=f.id AND rol=r AND durum IS DISTINCT FROM 'PASIF';
  IF n >= lim THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Role quota exceeded'; END IF;
  INSERT INTO public.davetler(id,token,firma_id,rol,olusturan_rol,durum,son_kullanma_tarihi,email,kullanan_adi)
  VALUES(p_invite->>'id',p_invite->>'token',f.id,r,p_invite->>'olusturan_rol','AKTIF',(p_invite->>'son_kullanma_tarihi')::timestamptz,nullif(lower(btrim(p_invite->>'email')),''),p_invite->>'kullanan_adi') RETURNING * INTO d;
  PERFORM public.tomnap_queue_onboarding_email(p_email_job,f.id);
  RETURN jsonb_build_object('invite',to_jsonb(d),'remaining',lim-n);
END $$;

CREATE FUNCTION public.tomnap_accept_invite(p_token text,p_user jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE tid text; f public.firmalar; d public.davetler; u public.kullanicilar; n integer; lim integer;
BEGIN
  SELECT firma_id INTO tid FROM public.davetler WHERE token=p_token;
  IF tid IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  SELECT * INTO f FROM public.firmalar WHERE id=tid FOR UPDATE;
  IF NOT FOUND OR f.onay_durumu IS DISTINCT FROM 'AKTIF' THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Company unavailable'; END IF;
  SELECT * INTO d FROM public.davetler WHERE token=p_token AND firma_id=tid FOR UPDATE;
  IF NOT FOUND OR d.durum IS DISTINCT FROM 'AKTIF' OR d.son_kullanma_tarihi <= now()
    OR d.rol IS NULL OR d.rol NOT IN ('PATRON','KANADA_SATINALMA','SATIS_SORUMLUSU','BAKU_FINANS','BAKU_KURYE') OR coalesce(p_user->>'sifre_hash','')=''
  THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid invitation'; END IF;
  IF nullif(lower(btrim(d.email)),'') IS NOT NULL AND lower(btrim(p_user->>'email')) IS DISTINCT FROM lower(btrim(d.email)) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Invitation contact mismatch'; END IF;
  lim := coalesce((f.rol_limitleri->>d.rol)::integer,0);
  SELECT count(*) INTO n FROM public.kullanicilar WHERE tenant_id=tid AND rol=d.rol AND durum IS DISTINCT FROM 'PASIF';
  IF n >= lim THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Role quota exceeded'; END IF;
  INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,telefon,rol,sifre_hash,durum)
  VALUES(p_user->>'id',tid,p_user->>'ad_soyad',coalesce(nullif(lower(btrim(d.email)),''),lower(btrim(p_user->>'email'))),p_user->>'telefon',d.rol,p_user->>'sifre_hash','AKTIF') RETURNING * INTO u;
  UPDATE public.davetler SET durum='KULLANILDI',kullanan_adi=u.ad_soyad,kullanan_telefon=u.telefon,kullanildi_tarih=now() WHERE id=d.id;
  UPDATE public.firmalar SET aktif_kullanici_sayilari=jsonb_set(coalesce(aktif_kullanici_sayilari,'{}'::jsonb),ARRAY[d.rol],to_jsonb(n+1),true) WHERE id=tid RETURNING * INTO f;
  RETURN jsonb_build_object('firma',to_jsonb(f),'user',to_jsonb(u));
END $$;

CREATE FUNCTION public.tomnap_claim_onboarding_email(p_id text,p_claim_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE j public.onboarding_email_jobs;
BEGIN
  IF p_claim_token IS NULL THEN RAISE EXCEPTION 'Missing claim token'; END IF;
  SELECT * INTO j FROM public.onboarding_email_jobs WHERE (p_id IS NULL OR id::text=p_id) AND expires_at > now()
    AND ((status='PENDING' AND next_attempt_at <= now()) OR (status='RUNNING' AND leased_until <= now()))
    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.onboarding_email_jobs SET status='RUNNING',claim_token=p_claim_token,leased_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=j.id RETURNING * INTO j;
  RETURN to_jsonb(j);
END $$;

CREATE FUNCTION public.tomnap_finish_onboarding_email(p_id text,p_claim_token uuid,p_sent boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' SET timezone='UTC' AS $$
DECLARE n integer;
BEGIN
  UPDATE public.onboarding_email_jobs SET status=CASE WHEN p_sent THEN 'SENT' ELSE 'PENDING' END,
    sent_at=CASE WHEN p_sent THEN now() ELSE NULL END,claim_token=NULL,leased_until=NULL,next_attempt_at=now()+interval '5 minutes'
    WHERE id::text=p_id AND status='RUNNING' AND claim_token=p_claim_token;
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END $$;

REVOKE ALL ON FUNCTION public.tomnap_queue_onboarding_email(jsonb,text),public.tomnap_register_boutique(jsonb,jsonb,jsonb),public.tomnap_activate_user(text,text,text,text),public.tomnap_create_invite(jsonb,jsonb),public.tomnap_accept_invite(text,jsonb),public.tomnap_claim_onboarding_email(text,uuid),public.tomnap_finish_onboarding_email(text,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_queue_onboarding_email(jsonb,text),public.tomnap_register_boutique(jsonb,jsonb,jsonb),public.tomnap_activate_user(text,text,text,text),public.tomnap_create_invite(jsonb,jsonb),public.tomnap_accept_invite(text,jsonb),public.tomnap_claim_onboarding_email(text,uuid),public.tomnap_finish_onboarding_email(text,uuid,boolean) TO service_role;

-- Draft: root combines this with the phase 3 migration generated by Supabase CLI.
-- Orders are created and inbox decisions committed in the same transaction.
ALTER TABLE public.inbox_mesajlar
  ADD COLUMN IF NOT EXISTS onaylanan_siparis_id uuid
  REFERENCES public.siparisler(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tomnap_approve_inbox(
  p_tenant_id text,
  p_inbox_id text,
  p_order_id uuid,
  p_order_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_inbox public.inbox_mesajlar%ROWTYPE;
  v_order public.siparisler%ROWTYPE;
  v_fields public.siparisler%ROWTYPE;
  v_order_id uuid;
  v_reused boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = '' OR p_tenant_id = 'all'
     OR p_inbox_id IS NULL OR p_inbox_id = '' OR p_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid inbox scope';
  END IF;

  -- Both transitions lock the same tenant-owned row before reading its state.
  SELECT * INTO v_inbox FROM public.inbox_mesajlar
    WHERE id = p_inbox_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Inbox message not found';
  END IF;
  IF v_inbox.durum NOT IN ('BEKLEMEDE', 'ONAYLANDI') OR v_inbox.durum IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Inbox message was already rejected';
  END IF;

  -- A retry returns the first committed order, even if its submitted body differs.
  -- The deterministic ID also recovers a partial approval from the old route.
  v_order_id := COALESCE(v_inbox.onaylanan_siparis_id, p_order_id);
  SELECT * INTO v_order FROM public.siparisler
    WHERE id = v_order_id AND tenant_id = p_tenant_id;
  IF v_inbox.durum = 'ONAYLANDI' THEN
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Approved order is no longer available';
    END IF;
    IF v_inbox.onaylanan_siparis_id IS NULL THEN
      UPDATE public.inbox_mesajlar SET onaylanan_siparis_id = v_order.id
        WHERE id = p_inbox_id AND tenant_id = p_tenant_id;
    END IF;
    RETURN jsonb_build_object('siparis', to_jsonb(v_order), 'tekrar', true);
  END IF;

  IF FOUND THEN
    v_reused := true;
  ELSE
    IF p_order_payload IS NULL OR jsonb_typeof(p_order_payload) <> 'object'
       OR p_order_payload ->> 'tenant_id' IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid order payload';
    END IF;
    -- The row type supplies the real enum and column casts. Generated balance,
    -- primary key and timestamps are never accepted from the caller payload.
    v_fields := jsonb_populate_record(NULL::public.siparisler, p_order_payload);
    IF v_fields.toplam_tutar IS NULL OR v_fields.alinan_tutar IS NULL
       OR v_fields.toplam_tutar < 0 OR v_fields.alinan_tutar < 0
       OR v_fields.adet IS NULL OR v_fields.adet <= 0
       OR v_fields.musteri_adi IS NULL OR v_fields.urun_aciklamasi IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid order values';
    END IF;
    INSERT INTO public.siparisler (
      id, tenant_id, ham_mesaj, siparis_kaynagi, musteri_adi,
      instagram_kullanici_adi, telefon_numarasi, teslimat_sehri, teslimat_adresi,
      urun_aciklamasi, beden_veya_olcu, renk, adet, toplam_tutar, alinan_tutar,
      para_birimi, finans_durumu, lojistik_durumu, baku_tahsilat_notu,
      eksik_bilgiler, ai_guven_skoru, is_demo, ek_veriler
    ) VALUES (
      p_order_id, p_tenant_id, v_inbox.konusma_gecmisi, v_inbox.kaynak, v_fields.musteri_adi,
      v_fields.instagram_kullanici_adi, v_fields.telefon_numarasi, v_fields.teslimat_sehri, v_fields.teslimat_adresi,
      v_fields.urun_aciklamasi, v_fields.beden_veya_olcu, v_fields.renk, v_fields.adet,
      v_fields.toplam_tutar, v_fields.alinan_tutar, v_fields.para_birimi,
      v_fields.finans_durumu, v_fields.lojistik_durumu, v_fields.baku_tahsilat_notu,
      COALESCE(v_fields.eksik_bilgiler, '[]'::jsonb), v_fields.ai_guven_skoru, false,
      COALESCE(v_fields.ek_veriler, '{}'::jsonb)
    ) RETURNING * INTO v_order;
  END IF;

  UPDATE public.inbox_mesajlar SET durum = 'ONAYLANDI', onaylanan_siparis_id = v_order.id
    WHERE id = p_inbox_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('siparis', to_jsonb(v_order), 'tekrar', v_reused);
END;
$$;

CREATE OR REPLACE FUNCTION public.tomnap_reject_inbox(p_tenant_id text, p_inbox_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_inbox public.inbox_mesajlar%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = '' OR p_tenant_id = 'all'
     OR p_inbox_id IS NULL OR p_inbox_id = '' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT400', MESSAGE = 'Invalid inbox scope';
  END IF;
  SELECT * INTO v_inbox FROM public.inbox_mesajlar
    WHERE id = p_inbox_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Inbox message not found';
  END IF;
  IF v_inbox.durum = 'REDDEDILDI' THEN
    RETURN jsonb_build_object('durum', 'REDDEDILDI', 'tekrar', true);
  END IF;
  IF v_inbox.durum IS DISTINCT FROM 'BEKLEMEDE' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Inbox message was already approved';
  END IF;
  UPDATE public.inbox_mesajlar SET durum = 'REDDEDILDI'
    WHERE id = p_inbox_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('durum', 'REDDEDILDI', 'tekrar', false);
END;
$$;

REVOKE ALL ON FUNCTION public.tomnap_approve_inbox(text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tomnap_reject_inbox(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_approve_inbox(text,text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tomnap_reject_inbox(text,text) TO service_role;

CREATE TABLE public.order_maintenance_operations (
  operation_id uuid PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
  fingerprint text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.order_maintenance_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_maintenance_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_maintenance_operations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_maintenance_operations TO service_role;

-- Rare administrative bulk changes serialize with all order writers. All validation,
-- deletes, inserts and the retry receipt commit together or roll back together.
CREATE OR REPLACE FUNCTION public.tomnap_restore_orders(
  p_tenant_id text, p_operation_id uuid, p_mode text, p_orders jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  fingerprint text;
  receipt public.order_maintenance_operations;
  item jsonb;
  cols text;
  updates text;
  result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = 'all' OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$'
     OR p_operation_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('merge','replace','clear')
     OR p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid restore request';
  END IF;
  IF jsonb_array_length(p_orders) > 5000 OR octet_length(p_orders::text) > 10485760
     OR (p_mode = 'clear' AND jsonb_array_length(p_orders) <> 0)
     OR (p_mode <> 'clear' AND jsonb_array_length(p_orders) = 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid restore size';
  END IF;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant_id,'mode',p_mode,'orders',p_orders)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('tomnap-maintenance:' || p_operation_id::text, 0));
  SELECT * INTO receipt FROM public.order_maintenance_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF receipt.fingerprint <> fingerprint OR receipt.tenant_id <> p_tenant_id THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Operation key already used for different request';
    END IF;
    RETURN receipt.result || '{"tekrar":true}'::jsonb;
  END IF;
  PERFORM 1 FROM public.firmalar WHERE id=p_tenant_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unknown tenant'; END IF;
  -- Reject malformed identities and tenant aliases before deleting anything.
  FOR item IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    IF jsonb_typeof(item) <> 'object' OR item->>'id' IS NULL OR item->>'id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
       OR item->>'tenant_id' IS DISTINCT FROM p_tenant_id
       OR (item ? 'tenantId' AND item->>'tenantId' IS DISTINCT FROM p_tenant_id)
       OR NOT (item ? 'musteri_adi') OR NOT (item ? 'urun_aciklamasi') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid order identity or tenant';
    END IF;
    IF coalesce(item->'ek_veriler'->>'musteri_id','') <> '' THEN
      PERFORM 1 FROM public.musteriler WHERE id=item->'ek_veriler'->>'musteri_id' AND tenant_id=p_tenant_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Customer outside restore scope'; END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) <> count(DISTINCT lower(value->>'id')) FROM jsonb_array_elements(p_orders)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate order IDs';
  END IF;
  LOCK TABLE public.inbox_mesajlar IN EXCLUSIVE MODE;
  LOCK TABLE public.siparisler IN SHARE ROW EXCLUSIVE MODE;
  IF EXISTS (SELECT 1 FROM public.siparisler s JOIN jsonb_array_elements(p_orders) x ON s.id=(x.value->>'id')::uuid WHERE s.tenant_id <> p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Order identity conflict';
  END IF;
  IF p_mode='merge' AND EXISTS (SELECT 1 FROM public.siparisler s JOIN jsonb_array_elements(p_orders) x ON s.id=(x.value->>'id')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Merge would overwrite existing order';
  END IF;
  IF p_mode IN ('replace','clear') THEN
    DELETE FROM public.siparisler WHERE tenant_id=p_tenant_id
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_orders) x WHERE (x.value->>'id')::uuid=siparisler.id);
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity='')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unsupported order fields';
    END IF;
    -- Preserve omitted database defaults; never write generated/identity columns.
    -- Only actual table columns are interpolated, and identifiers are quoted.
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
      AND item ? a.attname;
    SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ' ORDER BY a.attnum) INTO updates
      FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
      AND a.attname NOT IN ('id','tenant_id') AND item ? a.attname;
    EXECUTE format('INSERT INTO public.siparisler (%s) SELECT %s FROM jsonb_populate_record(NULL::public.siparisler, $1) ON CONFLICT (id) DO UPDATE SET %s',cols,cols,updates) USING item;
  END LOOP;
  result := jsonb_build_object('toplam',jsonb_array_length(p_orders),'hedef_tenant',p_tenant_id,'tekrar',false);
  INSERT INTO public.order_maintenance_operations(operation_id,tenant_id,fingerprint,result)
    VALUES(p_operation_id,p_tenant_id,fingerprint,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.tomnap_export_orders(p_tenant_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE rows jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid tenant';
  END IF;
  -- One statement snapshot. The limit is explicit, never a silently truncated REST page.
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.olusturma_tarihi,s.id),'[]'::jsonb) INTO rows
    FROM (SELECT * FROM public.siparisler WHERE p_tenant_id='all' OR tenant_id=p_tenant_id LIMIT 5001) s;
  IF jsonb_array_length(rows)>5000 OR octet_length(rows::text)>10485760 THEN
    RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='Use database backup for exports exceeding 5000 orders or 10 MiB';
  END IF;
  RETURN rows;
END $$;

CREATE OR REPLACE FUNCTION public.tomnap_order_status(p_tenant_id text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  WITH scoped AS (SELECT tenant_id,is_demo FROM public.siparisler WHERE p_tenant_id='all' OR tenant_id=p_tenant_id),
  groups AS (SELECT tenant_id,count(*) AS n FROM scoped GROUP BY tenant_id)
  SELECT jsonb_build_object('toplam_siparis',count(*),'demo_siparis_sayisi',count(*) FILTER (WHERE is_demo IS TRUE),
    'canli_siparis_sayisi',count(*) FILTER (WHERE is_demo IS NOT TRUE),
    'firma_dagilimi',(SELECT coalesce(jsonb_object_agg(tenant_id,n),'{}'::jsonb) FROM groups)) FROM scoped;
$$;

REVOKE ALL ON FUNCTION public.tomnap_restore_orders(text,uuid,text,jsonb),public.tomnap_export_orders(text),public.tomnap_order_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_restore_orders(text,uuid,text,jsonb),public.tomnap_export_orders(text),public.tomnap_order_status(text) TO service_role;

COMMIT;
