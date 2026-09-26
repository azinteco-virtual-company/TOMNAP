-- Phase 4: private credentials, explicit courier identity, reviewed legacy images.
BEGIN;
-- Some deployed legacy schemas never created a courier table. Provision the
-- empty table here without seeding couriers or changing existing identities.
-- Existing courier rows remain in place for the explicit binding migration.
CREATE TABLE IF NOT EXISTS public.kuryeler (
  id varchar(100) PRIMARY KEY,
  tenant_id varchar(100) NOT NULL REFERENCES public.firmalar(id),
  ad_soyad varchar(150) NOT NULL,
  telefon varchar(50) NOT NULL,
  bolge varchar(150) NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);
-- Explicit tenant-owned courier identities. Legacy records remain unbound.
ALTER TABLE public.kuryeler ADD COLUMN kullanici_id text REFERENCES public.kullanicilar(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX kuryeler_kullanici_unique ON public.kuryeler(kullanici_id) WHERE kullanici_id IS NOT NULL;
ALTER TABLE public.siparisler
  ADD COLUMN kurye_atama_surumu bigint NOT NULL DEFAULT 0 CHECK(kurye_atama_surumu >= 0),
  ADD COLUMN kurye_teslim_kullanici_id text REFERENCES public.kullanicilar(id) ON DELETE SET NULL,
  ADD COLUMN kurye_teslim_alan text;
ALTER TABLE public.kuryeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kuryeler FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.kuryeler FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.kuryeler TO service_role;

CREATE FUNCTION public.tomnap_courier_task(p_order public.siparisler)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('id',p_order.id,'musteri_adi',p_order.musteri_adi,
    'telefon_numarasi',coalesce(p_order.telefon_numarasi,''),'teslimat_sehri',coalesce(p_order.teslimat_sehri,''),
    'teslimat_adresi',coalesce(p_order.teslimat_adresi,''),'urun_aciklamasi',p_order.urun_aciklamasi,
    'adet',p_order.adet,'lojistik_durumu',p_order.lojistik_durumu,'kalan_tutar',p_order.kalan_tutar,
    'para_birimi',p_order.para_birimi,'kurye_atama_surumu',p_order.kurye_atama_surumu,
    'teslim_tarihi',p_order.teslim_tarihi,'teslim_alan',p_order.kurye_teslim_alan);
$$;

CREATE FUNCTION public.tomnap_bind_courier(p_tenant_id text,p_courier_id text,p_user_id text,p_expected_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.kuryeler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IN ('','all') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Concrete tenant required'; END IF;
  IF p_user_id IS NOT NULL THEN
    PERFORM 1 FROM public.kullanicilar u JOIN public.firmalar f ON f.id=u.tenant_id
      WHERE u.id=p_user_id AND u.tenant_id=p_tenant_id AND u.rol='BAKU_KURYE' AND u.durum='AKTIF' AND f.onay_durumu='AKTIF' FOR SHARE OF u,f;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Active courier user not found'; END IF;
  END IF;
  SELECT * INTO c FROM public.kuryeler WHERE id=p_courier_id AND tenant_id=p_tenant_id AND (aktif IS TRUE OR p_user_id IS NULL) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Courier not found'; END IF;
  IF c.kullanici_id IS NOT DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('kurye',to_jsonb(c),'tekrar',true); END IF;
  IF c.kullanici_id IS DISTINCT FROM p_expected_user_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Courier binding changed'; END IF;
  UPDATE public.kuryeler SET kullanici_id=p_user_id WHERE id=c.id RETURNING * INTO c;
  RETURN jsonb_build_object('kurye',to_jsonb(c),'tekrar',false);
END $$;

CREATE FUNCTION public.tomnap_assign_courier(p_tenant_id text,p_order_id uuid,p_courier_id text,p_expected_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.kuryeler; s public.siparisler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IN ('','all') OR p_expected_version IS NULL OR p_expected_version < 0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid assignment'; END IF;
  IF p_courier_id IS NOT NULL THEN
    SELECT * INTO c FROM public.kuryeler WHERE id=p_courier_id AND tenant_id=p_tenant_id AND aktif IS TRUE FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Courier not found'; END IF;
  END IF;
  SELECT * INTO s FROM public.siparisler WHERE id=p_order_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Order not found'; END IF;
  IF nullif(s.baku_kurye_id,'') IS NOT DISTINCT FROM p_courier_id AND s.kurye_atama_surumu IN (p_expected_version,p_expected_version+1) THEN
    RETURN jsonb_build_object('siparis',to_jsonb(s),'tekrar',true);
  END IF;
  IF s.kurye_atama_surumu <> p_expected_version OR s.lojistik_durumu='TESLIM_EDILDI' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Assignment changed or delivery completed'; END IF;
  UPDATE public.siparisler SET baku_kurye_id=p_courier_id,baku_kurye_adi=c.ad_soyad,baku_kurye_bolgesi=c.bolge,kurye_atama_surumu=kurye_atama_surumu+1 WHERE id=s.id RETURNING * INTO s;
  RETURN jsonb_build_object('siparis',to_jsonb(s),'tekrar',false);
END $$;

CREATE FUNCTION public.tomnap_courier_tasks(p_tenant_id text,p_user_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.kuryeler; tasks jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IN ('','all') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Concrete tenant required'; END IF;
  PERFORM 1 FROM public.kullanicilar u JOIN public.firmalar f ON f.id=u.tenant_id
    WHERE u.id=p_user_id AND u.tenant_id=p_tenant_id AND u.rol='BAKU_KURYE' AND u.durum='AKTIF' AND f.onay_durumu='AKTIF' FOR SHARE OF u,f;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Active courier user not found'; END IF;
  SELECT * INTO c FROM public.kuryeler WHERE tenant_id=p_tenant_id AND kullanici_id=p_user_id AND aktif IS TRUE FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('kurye',NULL,'gorevler','[]'::jsonb); END IF;
  SELECT coalesce(jsonb_agg(public.tomnap_courier_task(s::public.siparisler) ORDER BY s.olusturma_tarihi,s.id),'[]'::jsonb) INTO tasks
    FROM (SELECT * FROM public.siparisler WHERE tenant_id=p_tenant_id AND baku_kurye_id=c.id AND (lojistik_durumu='BAKU_DAGITIM_ARKADAS' OR (lojistik_durumu='TESLIM_EDILDI' AND kurye_teslim_kullanici_id=p_user_id)) LIMIT 5001) s;
  IF jsonb_array_length(tasks)>5000 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Courier task limit exceeded'; END IF;
  RETURN jsonb_build_object('kurye',jsonb_build_object('id',c.id,'ad_soyad',c.ad_soyad,'bolge',c.bolge),'gorevler',tasks);
END $$;

CREATE FUNCTION public.tomnap_deliver_courier_order(p_tenant_id text,p_user_id text,p_order_id uuid,p_expected_version bigint,p_recipient text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c public.kuryeler; s public.siparisler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IN ('','all') OR p_expected_version IS NULL OR p_expected_version<0 OR p_recipient IS NULL OR length(btrim(p_recipient)) NOT BETWEEN 1 AND 150 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid delivery'; END IF;
  PERFORM 1 FROM public.kullanicilar u JOIN public.firmalar f ON f.id=u.tenant_id
    WHERE u.id=p_user_id AND u.tenant_id=p_tenant_id AND u.rol='BAKU_KURYE' AND u.durum='AKTIF' AND f.onay_durumu='AKTIF' FOR SHARE OF u,f;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Active courier user not found'; END IF;
  SELECT * INTO c FROM public.kuryeler WHERE tenant_id=p_tenant_id AND kullanici_id=p_user_id AND aktif IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Courier not found'; END IF;
  SELECT * INTO s FROM public.siparisler WHERE id=p_order_id AND tenant_id=p_tenant_id AND baku_kurye_id=c.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Task not found'; END IF;
  IF s.kurye_atama_surumu <> p_expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Assignment changed'; END IF;
  IF s.lojistik_durumu='TESLIM_EDILDI' AND s.kurye_teslim_kullanici_id=p_user_id THEN
    RETURN jsonb_build_object('gorev',public.tomnap_courier_task(s),'tekrar',true);
  END IF;
  IF s.lojistik_durumu IS DISTINCT FROM 'BAKU_DAGITIM_ARKADAS' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Task not ready for delivery'; END IF;
  UPDATE public.siparisler SET lojistik_durumu='TESLIM_EDILDI',teslim_tarihi=now(),teslim_eden_kisi=c.ad_soyad,kurye_teslim_kullanici_id=p_user_id,kurye_teslim_alan=btrim(p_recipient) WHERE id=s.id RETURNING * INTO s;
  RETURN jsonb_build_object('gorev',public.tomnap_courier_task(s),'tekrar',false);
END $$;

REVOKE ALL ON FUNCTION public.tomnap_courier_task(public.siparisler),public.tomnap_bind_courier(text,text,text,text),public.tomnap_assign_courier(text,uuid,text,bigint),public.tomnap_courier_tasks(text,text),public.tomnap_deliver_courier_order(text,text,uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_courier_task(public.siparisler),public.tomnap_bind_courier(text,text,text,text),public.tomnap_assign_courier(text,uuid,text,bigint),public.tomnap_courier_tasks(text,text),public.tomnap_deliver_courier_order(text,text,uuid,bigint,text) TO service_role;

CREATE TABLE public.cargo_settings (
  tenant_id varchar(100) PRIMARY KEY REFERENCES public.firmalar(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object' AND NOT settings ?| ARRAY['kimlikBilgileri','sifre','pin','apiKey','apiSecret']),
  encrypted_credentials text NOT NULL CHECK (encrypted_credentials ~ '^enc:v2:[A-Za-z0-9_-]{1,40}:[a-f0-9]{24}:[a-f0-9]{32}:([a-f0-9]{2})+$'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cargo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cargo_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.cargo_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.cargo_settings TO service_role;

CREATE FUNCTION public.save_cargo_settings(p_record jsonb, p_expected_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result public.cargo_settings;
BEGIN
  IF p_expected_revision IS NULL OR p_expected_revision < 0 OR
     (p_record->>'revision')::integer IS DISTINCT FROM p_expected_revision + 1 OR
     coalesce(p_record->>'tenant_id','') IN ('','all') THEN
    RAISE EXCEPTION 'Invalid settings revision or tenant' USING ERRCODE='22023';
  END IF;
  -- Also serializes two first saves for the same tenant without a missing-row race.
  PERFORM 1 FROM public.firmalar WHERE id = p_record->>'tenant_id' AND onay_durumu = 'AKTIF' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active tenant required' USING ERRCODE='22023'; END IF;
  IF p_expected_revision = 0 THEN
    INSERT INTO public.cargo_settings(tenant_id,revision,settings,encrypted_credentials)
    VALUES(p_record->>'tenant_id',1,p_record->'settings',p_record->>'encrypted_credentials')
    ON CONFLICT DO NOTHING RETURNING * INTO result;
  ELSE
    UPDATE public.cargo_settings SET revision=p_expected_revision+1, settings=p_record->'settings',
      encrypted_credentials=p_record->>'encrypted_credentials',updated_at=now()
    WHERE tenant_id=p_record->>'tenant_id' AND revision=p_expected_revision RETURNING * INTO result;
  END IF;
  IF result.tenant_id IS NULL THEN RAISE EXCEPTION 'Settings revision changed' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('tenant_id',result.tenant_id,'revision',result.revision,'settings',result.settings,'encrypted_credentials',result.encrypted_credentials);
END $$;
REVOKE ALL ON FUNCTION public.save_cargo_settings(jsonb,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_cargo_settings(jsonb,integer) TO service_role;

-- Operator migration/rotation is all-or-nothing across the explicitly supplied tenants.
CREATE FUNCTION public.import_cargo_settings(p_records jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE row jsonb; total integer := 0;
BEGIN
  IF jsonb_typeof(p_records) IS DISTINCT FROM 'array' OR jsonb_array_length(p_records) > 1000 OR
     (SELECT count(*) <> count(DISTINCT x->>'tenant_id') FROM jsonb_array_elements(p_records) x) THEN
    RAISE EXCEPTION 'Invalid cargo import' USING ERRCODE='22023';
  END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(p_records) ORDER BY value->>'tenant_id' LOOP
    PERFORM public.save_cargo_settings(row,(row->>'revision')::integer-1);
    total := total + 1;
  END LOOP;
  RETURN total;
END $$;
REVOKE ALL ON FUNCTION public.import_cargo_settings(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_cargo_settings(jsonb) TO service_role;

-- Cargo updates merge metadata at commit time and never write courier assignments.
CREATE FUNCTION public.tomnap_update_cargo_order(p_tenant_id text,p_order_id uuid,p_expected_status text,p_expected_assignment bigint,p_expected_awb text,p_changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE current_order public.siparisler; next_order public.siparisler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id IN ('','all') OR jsonb_typeof(p_changes) IS DISTINCT FROM 'object' OR
     p_changes - ARRAY['lojistik_durumu','uluslararasi_kargo_kodu','kargo_agirligi_kg','kargo_notu'] <> '{}'::jsonb THEN
    RAISE EXCEPTION 'Invalid cargo update' USING ERRCODE='22023';
  END IF;
  SELECT * INTO current_order FROM public.siparisler WHERE id=p_order_id AND tenant_id=p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cargo order not found' USING ERRCODE='P0002'; END IF;
  IF current_order.lojistik_durumu::text IS DISTINCT FROM p_expected_status OR
     current_order.kurye_atama_surumu IS DISTINCT FROM p_expected_assignment OR
     coalesce(current_order.uluslararasi_kargo_kodu,'') IS DISTINCT FROM coalesce(p_expected_awb,'') THEN
    RAISE EXCEPTION 'Cargo order changed' USING ERRCODE='40001';
  END IF;
  next_order := jsonb_populate_record(current_order,p_changes - ARRAY['kargo_agirligi_kg','kargo_notu']);
  UPDATE public.siparisler SET lojistik_durumu=next_order.lojistik_durumu,
    uluslararasi_kargo_kodu=next_order.uluslararasi_kargo_kodu,
    baku_tahsilat_notu=CASE WHEN p_changes ? 'kargo_notu' THEN concat_ws(' ',nullif(current_order.baku_tahsilat_notu,''),p_changes->>'kargo_notu') ELSE current_order.baku_tahsilat_notu END,
    ek_veriler=current_order.ek_veriler || CASE WHEN p_changes ? 'kargo_agirligi_kg' THEN jsonb_build_object('kargo_agirligi_kg',p_changes->'kargo_agirligi_kg') ELSE '{}'::jsonb END || jsonb_build_object('guncellenme_tarihi',now())
  WHERE id=p_order_id AND tenant_id=p_tenant_id;
  RETURN jsonb_build_object('id',p_order_id);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_update_cargo_order(text,uuid,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_update_cargo_order(text,uuid,text,bigint,text,jsonb) TO service_role;

-- Operator-only legacy upload ownership migration. Root incorporates this draft
-- into the CLI-generated phase 4 migration; never run against a live DB implicitly.
CREATE TABLE public.legacy_upload_migrations (
  operation_id uuid PRIMARY KEY,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.legacy_upload_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_upload_migrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.legacy_upload_migrations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.legacy_upload_migrations TO service_role;

CREATE OR REPLACE FUNCTION public.tomnap_legacy_upload_snapshot()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE snapshot jsonb;
BEGIN
  -- A single statement snapshot; no REST pagination truncation or memory fallback.
  SELECT jsonb_build_object('schemaVersion',1,
    'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'onay_durumu',onay_durumu) ORDER BY id),'[]') FROM public.firmalar),
    'orders',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') FROM (SELECT * FROM public.siparisler ORDER BY id LIMIT 5001) s),
    'inbox',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') FROM (SELECT * FROM public.inbox_mesajlar ORDER BY id LIMIT 5001) i))
  INTO snapshot;
  IF jsonb_array_length(snapshot->'orders') + jsonb_array_length(snapshot->'inbox') > 5000
     OR octet_length(snapshot::text) > 20971520 THEN
    RAISE EXCEPTION USING ERRCODE='54000', MESSAGE='Inventory exceeds 5000 records or 20 MiB; use an explicitly scoped offline export';
  END IF;
  RETURN snapshot;
END $$;

CREATE OR REPLACE FUNCTION public.tomnap_migrate_legacy_uploads(
  p_operation_id uuid,
  p_mappings jsonb,
  p_changes jsonb,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  fingerprint text;
  receipt public.legacy_upload_migrations;
  mapping jsonb;
  change jsonb;
  edit jsonb;
  current_row jsonb;
  changed_row jsonb;
  edit_path text[];
  destination text;
  prefix text;
  assignments text;
  affected integer;
  reference_count integer := 0;
  result jsonb;
  tenant text;
BEGIN
  IF p_operation_id IS NULL OR p_dry_run IS NULL OR p_mappings IS NULL OR p_changes IS NULL
     OR jsonb_typeof(p_mappings) <> 'array' OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_mappings) NOT BETWEEN 1 AND 1000 OR jsonb_array_length(p_changes)>5000
     OR octet_length(p_mappings::text)+octet_length(p_changes::text)>20971520 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid migration request';
  END IF;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('mappings',p_mappings,'changes',p_changes)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('tomnap-legacy-uploads:' || p_operation_id::text,0));
  SELECT * INTO receipt FROM public.legacy_upload_migrations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF receipt.fingerprint<>fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Operation ID was used with another mapping';
    END IF;
    RETURN receipt.result || '{"retry":true}'::jsonb;
  END IF;

  IF (SELECT count(*)<>count(DISTINCT value->>'key') FROM jsonb_array_elements(p_mappings))
     OR (SELECT count(*)<>count(DISTINCT (value->>'source_name',value->>'tenant_id')) FROM jsonb_array_elements(p_mappings))
     OR (SELECT count(*)<>count(DISTINCT (value->>'table',value->>'id')) FROM jsonb_array_elements(p_changes)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate mapping or source row';
  END IF;
  FOR mapping IN SELECT value FROM jsonb_array_elements(p_mappings) LOOP
    tenant := mapping->>'tenant_id';
    IF jsonb_typeof(mapping)<>'object' OR tenant IS NULL OR tenant='all' OR tenant !~ '^[a-zA-Z0-9_-]{1,100}$'
       OR mapping->>'key' IS NULL OR mapping->>'key' !~ '^[a-f0-9]{64}$'
       OR mapping->>'source_sha256' IS NULL OR mapping->>'source_sha256' !~ '^[a-f0-9]{64}$'
       OR mapping->>'source_name' IS NULL OR mapping->>'source_name' IN ('','.','..')
       OR mapping->>'source_name' ~ E'[/\\\\[:cntrl:]]'
       OR jsonb_typeof(mapping->'source_urls') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid source mapping';
    END IF;
    prefix := 't_' || substr(encode(sha256(convert_to(tenant,'UTF8')),'hex'),1,24) || '_';
    IF mapping->>'destination_name' IS NULL OR mapping->>'destination_name' !~ ('^' || prefix || '[a-f0-9]{32}\.(png|jpg|webp)$')
       OR mapping->>'destination_url' IS DISTINCT FROM '/uploads/' || (mapping->>'destination_name')
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(mapping->'source_urls') u
         WHERE jsonb_typeof(u)<>'string' OR replace(u#>>'{}',E'\\/','/') !~ '^(/api)?/uploads/[^/?#]+$') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid private destination or source URL';
    END IF;
  END LOOP;
  -- Keep tenant activation stable throughout the transaction; lock in ID order.
  FOR tenant IN SELECT DISTINCT value->>'tenant_id' FROM jsonb_array_elements(p_mappings) ORDER BY 1 LOOP
    PERFORM 1 FROM public.firmalar WHERE id=tenant AND onay_durumu='AKTIF' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Mapped tenant is not active'; END IF;
  END LOOP;
  -- Match inbox approval / restore lock order, avoiding inbox-row -> order deadlocks.
  LOCK TABLE public.inbox_mesajlar IN EXCLUSIVE MODE;
  LOCK TABLE public.siparisler IN SHARE ROW EXCLUSIVE MODE;
  FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
    IF jsonb_typeof(change)<>'object' OR change->>'table' IS NULL OR change->>'table' NOT IN ('siparisler','inbox_mesajlar')
       OR change->>'id' IS NULL OR change->>'tenant_id' IS NULL
       OR jsonb_typeof(change->'before') IS DISTINCT FROM 'object'
       OR jsonb_typeof(change->'edits') IS DISTINCT FROM 'array' OR jsonb_array_length(change->'edits')=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid source row change';
    END IF;
    EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id::text=$1 AND tenant_id=$2 FOR UPDATE',change->>'table')
      INTO current_row USING change->>'id', change->>'tenant_id';
    IF current_row IS NULL OR current_row IS DISTINCT FROM change->'before' THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Source row changed after planning';
    END IF;
    changed_row := current_row;
    FOR edit IN SELECT value FROM jsonb_array_elements(change->'edits') LOOP
      IF jsonb_typeof(edit->'path') IS DISTINCT FROM 'array' OR jsonb_array_length(edit->'path') NOT BETWEEN 1 AND 50
         OR EXISTS(SELECT 1 FROM jsonb_array_elements(edit->'path') p WHERE jsonb_typeof(p)<>'string' OR p#>>'{}' IN ('__proto__','constructor','prototype'))
         OR edit#>>'{path,0}' IN ('id','tenant_id','tenantId')
         OR jsonb_typeof(edit->'prefix') IS DISTINCT FROM 'string'
         OR jsonb_typeof(edit->'source_url') IS DISTINCT FROM 'string'
         OR jsonb_typeof(edit->'suffix') IS DISTINCT FROM 'string' THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid exact reference edit';
      END IF;
      SELECT value INTO mapping FROM jsonb_array_elements(p_mappings)
        WHERE value->>'key'=edit->>'mapping_key' AND value->>'tenant_id'=change->>'tenant_id';
      IF mapping IS NULL OR NOT ((mapping->'source_urls') ? (edit->>'source_url')) THEN
        RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='Reference has no explicit matching tenant mapping';
      END IF;
      SELECT array_agg(value ORDER BY ordinal) INTO edit_path FROM jsonb_array_elements_text(edit->'path') WITH ORDINALITY p(value,ordinal);
      IF changed_row #> edit_path IS DISTINCT FROM to_jsonb((edit->>'prefix') || (edit->>'source_url') || (edit->>'suffix')) THEN
        RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Exact source reference changed';
      END IF;
      destination := mapping->>'destination_url';
      IF position(E'\\/' IN edit->>'source_url')>0 THEN destination := replace(destination,'/',E'\\/'); END IF;
      changed_row := jsonb_set(changed_row,edit_path,to_jsonb((edit->>'prefix') || destination || (edit->>'suffix')),false);
      reference_count := reference_count+1;
    END LOOP;
    IF NOT p_dry_run THEN
      SELECT string_agg(format('%I=r.%I',a.attname,a.attname),', ' ORDER BY a.attnum) INTO assignments
        FROM pg_attribute a WHERE a.attrelid=to_regclass(format('public.%I',change->>'table'))
        AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
        AND a.attname NOT IN ('id','tenant_id') AND current_row->a.attname IS DISTINCT FROM changed_row->a.attname;
      IF assignments IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='No writable reference changed'; END IF;
      EXECUTE format('UPDATE public.%I t SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE t.id::text=$2 AND t.tenant_id=$3',change->>'table',assignments,change->>'table')
        USING changed_row, change->>'id', change->>'tenant_id';
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected<>1 THEN RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Source row update conflicted'; END IF;
    END IF;
  END LOOP;
  result := jsonb_build_object('operationId',p_operation_id,'copied',jsonb_array_length(p_mappings),
    'rewrittenRows',jsonb_array_length(p_changes),'rewrittenReferences',reference_count,'applied',NOT p_dry_run,'retry',false);
  IF NOT p_dry_run THEN
    INSERT INTO public.legacy_upload_migrations(operation_id,fingerprint,result) VALUES(p_operation_id,fingerprint,result);
  END IF;
  RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.tomnap_legacy_upload_snapshot(),public.tomnap_migrate_legacy_uploads(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_legacy_upload_snapshot(),public.tomnap_migrate_legacy_uploads(uuid,jsonb,jsonb,boolean) TO service_role;

COMMIT;
