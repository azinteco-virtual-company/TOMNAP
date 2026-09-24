-- Rollback for supabase/migrations/20260924120000_rol_katalogu.sql.
-- Writes tomnap_create_invite and tomnap_accept_invite back to their previous
-- definitions (20260917160612, verbatim) and drops ONLY the function this
-- migration created. CREATE OR REPLACE keeps the existing grants.
-- Run standalone as one transaction: psql -1 -v ON_ERROR_STOP=1 -f <this file>
-- (no BEGIN/COMMIT inside, so tests can include it in their own transaction).
CREATE OR REPLACE FUNCTION public.tomnap_create_invite(p_invite jsonb,p_email_job jsonb DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.tomnap_accept_invite(p_token text,p_user jsonb)
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

DROP FUNCTION IF EXISTS public.tomnap_gecerli_rol(text);
