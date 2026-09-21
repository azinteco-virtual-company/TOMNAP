\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES('pagination-a','Synthetic A','AKTIF'),('pagination-b','Synthetic B','AKTIF');
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,toplam_tutar,alinan_tutar)
SELECT ('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pagination-a','synthetic','Customer '||n,'Item',10,2 FROM generate_series(1,1207)n;
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi)
VALUES('f5000000-0000-4000-9000-000000000001','pagination-b','secret','Foreign','Secret item');
INSERT INTO public.musteriler(id,tenant_id,ad_soyad) SELECT 'pg-customer-'||n,'pagination-a','Customer '||n FROM generate_series(1,1207)n;
INSERT INTO public.inbox_mesajlar(id,tenant_id,gonderen_kullanici,kaynak,konusma_gecmisi,durum)
SELECT 'pg-inbox-'||lpad(n::text,5,'0'),'pagination-a','Synthetic','WHATSAPP','synthetic',CASE WHEN n%2=1 THEN 'BEKLEMEDE' ELSE 'REDDEDILDI' END FROM generate_series(1,1207)n;
SET LOCAL ROLE service_role;
DO $$ DECLARE d text; p jsonb; revision text; after_id text; count_rows integer; seen text[]; item jsonb; snapshot jsonb;
BEGIN
  FOREACH d IN ARRAY ARRAY['siparisler','inbox_mesajlar','musteriler'] LOOP
    after_id:=NULL;revision:=NULL;count_rows:=0;seen:=ARRAY[]::text[];
    LOOP
      p:=public.tomnap_list_page('pagination-a',d,500,after_id,revision);
      IF (p->>'total')::int<>1207 THEN RAISE EXCEPTION 'exact total failed %',d; END IF;
      IF revision IS NOT NULL AND revision<>p->>'revision' THEN RAISE EXCEPTION 'revision changed'; END IF;
      revision:=p->>'revision';
      FOR item IN SELECT value FROM jsonb_array_elements(p->'items') WITH ORDINALITY e(value,n) WHERE n<=500 LOOP
        IF item->>'tenant_id'<>'pagination-a' OR item->>'id'=ANY(seen) THEN RAISE EXCEPTION 'foreign or duplicate item'; END IF;
        seen:=array_append(seen,item->>'id');after_id:=item->>'id';count_rows:=count_rows+1;
      END LOOP;
      EXIT WHEN jsonb_array_length(p->'items')<=500;
    END LOOP;
    IF count_rows<>1207 THEN RAISE EXCEPTION 'truncated %: %',d,count_rows; END IF;
    IF d='inbox_mesajlar' AND (p->>'pending')::int<>604 THEN RAISE EXCEPTION 'pending total wrong'; END IF;
  END LOOP;
  snapshot:=public.tomnap_customer_snapshot('pagination-a');
  IF jsonb_array_length(snapshot->'customers')<>1207 OR jsonb_array_length(snapshot->'orders')<>1207 THEN RAISE EXCEPTION 'CRM truncated'; END IF;
  IF (SELECT sum((v->>'kalan_tutar')::numeric) FROM jsonb_array_elements(snapshot->'orders') v)<>9656 THEN RAISE EXCEPTION 'CRM finance source incomplete'; END IF;
  IF (SELECT (public.tomnap_list_page('all','siparisler',500)->>'total')::bigint<>count(*) FROM public.siparisler) THEN RAISE EXCEPTION 'all tenant exact count'; END IF;
END $$;
DO $$ DECLARE own_revision text; global_revision text; customer_revision text; inbox_revision text; r text;
BEGIN
  own_revision:=public.tomnap_list_page('pagination-a','siparisler',1)->>'revision';
  global_revision:=public.tomnap_list_page('all','siparisler',1)->>'revision';
  customer_revision:=public.tomnap_customer_snapshot('pagination-a')->>'revision';
  UPDATE public.siparisler SET toplam_tutar=20 WHERE tenant_id='pagination-b';
  PERFORM public.tomnap_list_page('pagination-a','siparisler',1,NULL,own_revision);
  BEGIN PERFORM public.tomnap_list_page('all','siparisler',1,NULL,global_revision); RAISE EXCEPTION 'all stale cursor accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  UPDATE public.siparisler SET toplam_tutar=20 WHERE id='f5000000-0000-4000-8000-000000000001';
  BEGIN PERFORM public.tomnap_list_page('pagination-a','siparisler',1,NULL,own_revision); RAISE EXCEPTION 'own stale cursor accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN PERFORM public.tomnap_customer_snapshot('pagination-a',customer_revision); RAISE EXCEPTION 'CRM stale order totals accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  customer_revision:=public.tomnap_customer_snapshot('pagination-a')->>'revision';
  UPDATE public.musteriler SET ad_soyad='Changed' WHERE id='pg-customer-1';
  BEGIN PERFORM public.tomnap_customer_snapshot('pagination-a',customer_revision); RAISE EXCEPTION 'CRM stale customer accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  inbox_revision:=public.tomnap_list_page('pagination-a','inbox_mesajlar',1)->>'revision';
  DELETE FROM public.inbox_mesajlar WHERE id='pg-inbox-00001';
  BEGIN PERFORM public.tomnap_list_page('pagination-a','inbox_mesajlar',1,NULL,inbox_revision); RAISE EXCEPTION 'delete stale cursor accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  own_revision:=public.tomnap_list_page('pagination-a','siparisler',1)->>'revision';
  BEGIN
    UPDATE public.siparisler SET toplam_tutar=999 WHERE tenant_id='pagination-a';
    RAISE EXCEPTION 'rollback';
  EXCEPTION WHEN RAISE_EXCEPTION THEN NULL; END;
  PERFORM public.tomnap_list_page('pagination-a','siparisler',1,NULL,own_revision);
  BEGIN PERFORM public.tomnap_list_page('pagination-a','siparisler',501); RAISE EXCEPTION 'large page accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
  BEGIN PERFORM public.tomnap_list_page('pagination-a','firmalar',1); RAISE EXCEPTION 'unlisted table accepted'; EXCEPTION WHEN SQLSTATE 'PT400' THEN NULL; END;
END $$;
-- A huge selected row must fail before jsonb_agg; unrelated tenants and pages
-- after that key remain readable. The oversized fixture is synthetic and rolled back.
UPDATE public.siparisler SET ham_mesaj=repeat('x',33554432)
  WHERE id='f5000000-0000-4000-9000-000000000001';
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi)
VALUES('f5000000-0000-4000-9000-000000000002','pagination-b','small','Small','Small item');
DO $$ DECLARE p jsonb; BEGIN
  BEGIN
    PERFORM public.tomnap_list_page('pagination-b','siparisler',1);
    RAISE EXCEPTION 'oversized page was aggregated and accepted';
  EXCEPTION WHEN SQLSTATE 'PT413' THEN NULL; END;
  p:=public.tomnap_list_page('pagination-b','siparisler',1,'f5000000-0000-4000-9000-000000000001');
  IF jsonb_array_length(p->'items')<>1 OR p->'items'->0->>'ham_mesaj'<>'small' THEN
    RAISE EXCEPTION 'size guard did not use the selected keyset page';
  END IF;
  p:=public.tomnap_list_page('pagination-a','siparisler',1);
  IF (p->>'total')::int<>1207 THEN RAISE EXCEPTION 'foreign oversized record affected own page'; END IF;
END $$;
UPDATE public.siparisler SET ham_mesaj='small'
  WHERE id='f5000000-0000-4000-9000-000000000001';

-- Caps are explicit errors, never a successful truncated response.
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi)
SELECT ('f5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pagination-a','synthetic','Cap','Item' FROM generate_series(1208,10001)n;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_list_page('pagination-a','siparisler',200); RAISE EXCEPTION 'record cap silently truncated'; EXCEPTION WHEN SQLSTATE 'PT413' THEN NULL; END;
  BEGIN PERFORM public.tomnap_customer_snapshot('pagination-a'); RAISE EXCEPTION 'CRM record cap silently truncated'; EXCEPTION WHEN SQLSTATE 'PT413' THEN NULL; END;
END $$;
RESET ROLE;
-- TRUNCATE invalidates even a tenant that has no remaining rows.
DO $$ DECLARE r text; BEGIN
  r:=public.tomnap_list_page('pagination-a','inbox_mesajlar',1)->>'revision';
  TRUNCATE public.inbox_mesajlar;
  BEGIN PERFORM public.tomnap_list_page('pagination-a','inbox_mesajlar',1,NULL,r); RAISE EXCEPTION 'truncate stale cursor accepted'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
DO $$ DECLARE f regprocedure; BEGIN
  FOREACH f IN ARRAY ARRAY['public.tomnap_list_page(text,text,integer,text,text)'::regprocedure,'public.tomnap_customer_snapshot(text,text)'::regprocedure,'public.tomnap_list_revision(text,text[])'::regprocedure] LOOP
    IF (SELECT provolatile<>'s' OR prosecdef OR NOT proconfig @> ARRAY['search_path=""'] FROM pg_proc WHERE oid=f) THEN RAISE EXCEPTION 'unsafe snapshot function %',f; END IF;
    IF has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('authenticated',f,'EXECUTE') OR NOT has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'wrong function privileges %',f; END IF;
  END LOOP;
  IF has_table_privilege('anon','public.list_revisions','SELECT') OR has_table_privilege('authenticated','public.list_revisions','SELECT') THEN RAISE EXCEPTION 'revision table leaked'; END IF;
END $$;
ROLLBACK;
