BEGIN;

-- Revision counters are server-only. Each committed business mutation invalidates
-- tenant cursors; the global counter also covers SUPER_ADMIN's all-tenant view.
CREATE TABLE public.list_revisions (
  dataset text NOT NULL CHECK (dataset IN ('siparisler','musteriler','inbox_mesajlar')),
  scope text NOT NULL,
  revision bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (dataset, scope)
);
ALTER TABLE public.list_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.list_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.list_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.list_revisions TO service_role;

CREATE FUNCTION public.tomnap_bump_list_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_scope text; v_scopes text[];
BEGIN
  -- Lock the global row first consistently, including re-parenting and truncation.
  INSERT INTO public.list_revisions(dataset,scope,revision) VALUES(TG_TABLE_NAME,'*',1)
    ON CONFLICT(dataset,scope) DO UPDATE SET revision=list_revisions.revision+1;
  IF TG_OP='TRUNCATE' THEN
    INSERT INTO public.list_revisions(dataset,scope,revision) VALUES(TG_TABLE_NAME,'!truncate',1)
      ON CONFLICT(dataset,scope) DO UPDATE SET revision=list_revisions.revision+1;
    RETURN NULL;
  END IF;
  IF TG_OP='INSERT' THEN SELECT array_agg(DISTINCT tenant_id) INTO v_scopes FROM changed_new;
  ELSIF TG_OP='DELETE' THEN SELECT array_agg(DISTINCT tenant_id) INTO v_scopes FROM changed_old;
  ELSE SELECT array_agg(DISTINCT tenant_id) INTO v_scopes FROM (SELECT tenant_id FROM changed_old UNION SELECT tenant_id FROM changed_new) changed; END IF;
  FOR v_scope IN SELECT DISTINCT unnest(v_scopes) ORDER BY 1 LOOP
    INSERT INTO public.list_revisions(dataset,scope,revision) VALUES(TG_TABLE_NAME,'tenant:'||v_scope,1)
      ON CONFLICT(dataset,scope) DO UPDATE SET revision=list_revisions.revision+1;
  END LOOP;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tomnap_bump_list_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_bump_list_revision() TO service_role;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['siparisler','musteriler','inbox_mesajlar'] LOOP
    EXECUTE format('CREATE TRIGGER list_revision_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_bump_list_revision()',t);
    EXECUTE format('CREATE TRIGGER list_revision_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS changed_old NEW TABLE AS changed_new FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_bump_list_revision()',t);
    EXECUTE format('CREATE TRIGGER list_revision_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS changed_old FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_bump_list_revision()',t);
    EXECUTE format('CREATE TRIGGER list_revision_truncate AFTER TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_bump_list_revision()',t);
  END LOOP;
END $$;

CREATE FUNCTION public.tomnap_list_revision(p_tenant text,p_tables text[]) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT md5(coalesce(jsonb_agg(jsonb_build_array(dataset,scope,revision) ORDER BY dataset,scope)::text,'[]'))
  FROM public.list_revisions
  WHERE dataset=ANY(p_tables) AND scope IN (
    CASE WHEN p_tenant='all' THEN '*' ELSE 'tenant:'||p_tenant END,'!truncate');
$$;
REVOKE ALL ON FUNCTION public.tomnap_list_revision(text,text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_list_revision(text,text[]) TO service_role;

-- One JSON value avoids PostgREST's default row cap. STABLE makes the revision,
-- exact count and page read share the calling statement's MVCC snapshot.
CREATE FUNCTION public.tomnap_list_page(p_tenant text,p_dataset text,p_limit integer,p_after text DEFAULT NULL,p_revision text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_revision text; v_total bigint; v_pending bigint:=0; v_items jsonb; v_bytes bigint;
BEGIN
  IF p_tenant IS NULL OR p_tenant='' OR p_dataset IS NULL OR p_dataset NOT IN ('siparisler','inbox_mesajlar','musteriler') OR p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Geçersiz liste isteği.';
  END IF;
  v_revision:=public.tomnap_list_revision(p_tenant,ARRAY[p_dataset]);
  IF p_revision IS NOT NULL AND p_revision<>v_revision THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Liste değişti; baştan yükleyin.';
  END IF;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE ($1=''all'' OR tenant_id=$1)',p_dataset) INTO v_total USING p_tenant;
  IF v_total>10000 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='Liste 10000 kayıt sınırını aşıyor; daraltılmış rapor gerekir.'; END IF;
  -- Bound the selected keyset page before building its JSON array. Count rows
  -- one at a time, including the look-ahead row used to determine hasMore.
  EXECUTE format('SELECT coalesce(sum(octet_length(to_jsonb(t)::text)),0) FROM (SELECT * FROM public.%I WHERE ($1=''all'' OR tenant_id=$1) AND ($2 IS NULL OR id::text COLLATE "C">$2 COLLATE "C") ORDER BY id::text COLLATE "C" LIMIT $3) t',p_dataset)
    INTO v_bytes USING p_tenant,p_after,p_limit+1;
  IF v_bytes>33554432 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='Liste sayfası 32 MiB sınırını aşıyor.'; END IF;
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id::text COLLATE "C"),''[]''::jsonb) FROM (SELECT * FROM public.%I WHERE ($1=''all'' OR tenant_id=$1) AND ($2 IS NULL OR id::text COLLATE "C">$2 COLLATE "C") ORDER BY id::text COLLATE "C" LIMIT $3) t',p_dataset)
    INTO v_items USING p_tenant,p_after,p_limit+1;
  IF p_dataset='inbox_mesajlar' THEN
    SELECT count(*) INTO v_pending FROM public.inbox_mesajlar WHERE (p_tenant='all' OR tenant_id=p_tenant) AND durum='BEKLEMEDE';
  END IF;
  RETURN jsonb_build_object('revision',v_revision,'total',v_total,'pending',v_pending,'items',v_items);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_list_page(text,text,integer,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_list_page(text,text,integer,text,text) TO service_role;

-- CRM legacy cards depend on all matching orders, including virtual customer
-- cards. Keep both source tables in one bounded snapshot until that matching
-- model is normalized. No partial source list may produce financial totals.
CREATE FUNCTION public.tomnap_customer_snapshot(p_tenant text,p_revision text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_revision text; v_customers jsonb; v_orders jsonb; v_total bigint; v_bytes bigint;
BEGIN
  IF p_tenant IS NULL OR p_tenant='' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Butik zorunludur.'; END IF;
  v_revision:=public.tomnap_list_revision(p_tenant,ARRAY['musteriler','siparisler']);
  IF p_revision IS NOT NULL AND p_revision<>v_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Liste değişti; baştan yükleyin.'; END IF;
  SELECT (SELECT count(*) FROM public.musteriler WHERE p_tenant='all' OR tenant_id=p_tenant)+(SELECT count(*) FROM public.siparisler WHERE p_tenant='all' OR tenant_id=p_tenant) INTO v_total;
  IF v_total>10000 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='CRM kaynakları 10000 kayıt sınırını aşıyor; daraltılmış rapor gerekir.'; END IF;
  SELECT (SELECT coalesce(sum(octet_length(to_jsonb(t)::text)),0) FROM public.musteriler t WHERE p_tenant='all' OR tenant_id=p_tenant)+(SELECT coalesce(sum(octet_length(to_jsonb(t)::text)),0) FROM public.siparisler t WHERE p_tenant='all' OR tenant_id=p_tenant) INTO v_bytes;
  IF v_bytes>33554432 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='CRM kaynakları 32 MiB sınırını aşıyor.'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id COLLATE "C"),'[]'::jsonb) INTO v_customers FROM public.musteriler t WHERE p_tenant='all' OR tenant_id=p_tenant;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id::text COLLATE "C"),'[]'::jsonb) INTO v_orders FROM public.siparisler t WHERE p_tenant='all' OR tenant_id=p_tenant;
  IF octet_length(v_customers::text)+octet_length(v_orders::text)>33554432 THEN RAISE EXCEPTION USING ERRCODE='PT413',MESSAGE='CRM kaynakları 32 MiB sınırını aşıyor.'; END IF;
  RETURN jsonb_build_object('revision',v_revision,'customers',v_customers,'orders',v_orders);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_customer_snapshot(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_customer_snapshot(text,text) TO service_role;
CREATE INDEX siparisler_list_tenant_id ON public.siparisler(tenant_id,(id::text COLLATE "C"));
CREATE INDEX customers_list_tenant_id ON public.musteriler(tenant_id,(id COLLATE "C"));
CREATE INDEX inbox_list_tenant_id ON public.inbox_mesajlar(tenant_id,(id COLLATE "C"));

-- Storage files/buckets are provisioned through the Storage API, not metadata writes.
-- Custom restrictive policies close this bucket even when older permissive policies
-- grant broad access. Other buckets retain their existing policies.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='objects' AND c.relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relname='buckets' AND c.relrowsecurity) THEN
    RAISE EXCEPTION 'Supabase Storage tables with RLS enabled are required.';
  END IF;
END $$;
CREATE POLICY tomnap_private_objects_server_only ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id <> 'tomnap-private-images')
  WITH CHECK (bucket_id <> 'tomnap-private-images');
CREATE POLICY tomnap_private_bucket_server_only ON storage.buckets
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (id <> 'tomnap-private-images')
  WITH CHECK (id <> 'tomnap-private-images');

COMMIT;
