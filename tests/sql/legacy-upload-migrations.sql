-- Run only against the isolated test database after phase 4 functions.
BEGIN;
INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES
  ('images-sql-a','Synthetic image A','AKTIF'),('images-sql-b','Synthetic image B','AKTIF'),
  ('images-sql-inactive','Synthetic inactive','REDDEDILDI');
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,ek_veriler) VALUES
  ('aabb0000-0000-4000-a000-000000000001','images-sql-a','Original','Synthetic A','Bag','{"kanada_fatura_gorseli":"Önce /uploads/legacy.png sonra"}'),
  ('aabb0000-0000-4000-a000-000000000002','images-sql-b','Private B','Synthetic B','Bag','{"kanada_fatura_gorseli":"/uploads/legacy.png"}');
INSERT INTO public.inbox_mesajlar(id,tenant_id,kaynak,gonderen_kullanici,konusma_gecmisi,durum,oneri_siparis) VALUES
  ('images-inbox-a','images-sql-a','WHATSAPP','Synthetic','Original','BEKLEMEDE','{"gorsel_urlleri":["/uploads/legacy.png"]}');
UPDATE public.siparisler SET eksik_bilgiler=jsonb_build_array('META:gorseller=["' || replace('/uploads/legacy.png','/',E'\\/') || '"]')
  WHERE id='aabb0000-0000-4000-a000-000000000001';

DO $$ DECLARE actor text; proc text;
BEGIN
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH proc IN ARRAY ARRAY['public.tomnap_legacy_upload_snapshot()','public.tomnap_migrate_legacy_uploads(uuid,jsonb,jsonb,boolean)'] LOOP
      IF has_function_privilege(actor,proc,'EXECUTE') THEN RAISE EXCEPTION 'Browser execution grant'; END IF;
    END LOOP;
    IF has_table_privilege(actor,'public.legacy_upload_migrations','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Browser receipt access'; END IF;
  END LOOP;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.tomnap_legacy_upload_snapshot();
    RAISE EXCEPTION 'Anonymous inventory succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  order_before jsonb;
  inbox_before jsonb;
  mapping jsonb;
  changes jsonb;
  bad_changes jsonb;
  inactive_mapping jsonb;
  destination text := '/uploads/t_' || substr(encode(sha256(convert_to('images-sql-a','UTF8')),'hex'),1,24) || '_' || repeat('b',32) || '.png';
  result jsonb;
  operation uuid := 'aabb0000-0000-4000-a000-000000000010';
BEGIN
  SELECT to_jsonb(s) INTO order_before FROM public.siparisler s WHERE id='aabb0000-0000-4000-a000-000000000001';
  SELECT to_jsonb(i) INTO inbox_before FROM public.inbox_mesajlar i WHERE id='images-inbox-a';
  mapping := jsonb_build_array(jsonb_build_object('key',repeat('a',64),'tenant_id','images-sql-a','source_name','legacy.png',
    'source_sha256',repeat('c',64),'destination_name',substr(destination,10),'destination_url',destination,
    'source_urls',jsonb_build_array('/uploads/legacy.png',replace('/uploads/legacy.png','/',E'\\/'))));
  changes := jsonb_build_array(
    jsonb_build_object('table','siparisler','id','aabb0000-0000-4000-a000-000000000001','tenant_id','images-sql-a','before',order_before,
      'edits',jsonb_build_array(jsonb_build_object('path',jsonb_build_array('ek_veriler','kanada_fatura_gorseli'),'mapping_key',repeat('a',64),
        'prefix','Önce ','source_url','/uploads/legacy.png','suffix',' sonra'),
        jsonb_build_object('path',jsonb_build_array('eksik_bilgiler','0'),'mapping_key',repeat('a',64),
          'prefix','META:gorseller=["','source_url',replace('/uploads/legacy.png','/',E'\\/'),'suffix','"]'))),
    jsonb_build_object('table','inbox_mesajlar','id','images-inbox-a','tenant_id','images-sql-a','before',inbox_before,
      'edits',jsonb_build_array(jsonb_build_object('path',jsonb_build_array('oneri_siparis','gorsel_urlleri','0'),'mapping_key',repeat('a',64),
        'prefix','','source_url','/uploads/legacy.png','suffix',''))));
  result := public.tomnap_migrate_legacy_uploads(operation,mapping,changes);
  IF (result->>'applied')::boolean OR (result->>'rewrittenReferences')::int<>3
     OR EXISTS(SELECT 1 FROM public.legacy_upload_migrations WHERE operation_id=operation)
     OR (SELECT to_jsonb(s) FROM public.siparisler s WHERE id='aabb0000-0000-4000-a000-000000000001')<>order_before THEN
    RAISE EXCEPTION 'Default dry-run mutated state or misreported readiness';
  END IF;
  -- A later row conflict rolls the earlier update and receipt back together.
  bad_changes := jsonb_set(changes,'{1,before,konusma_gecmisi}','"Stale source"');
  BEGIN
    PERFORM public.tomnap_migrate_legacy_uploads(operation,mapping,bad_changes,false);
    RAISE EXCEPTION 'Stale source CAS succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT to_jsonb(s) FROM public.siparisler s WHERE id='aabb0000-0000-4000-a000-000000000001')<>order_before
     OR EXISTS(SELECT 1 FROM public.legacy_upload_migrations WHERE operation_id=operation) THEN
    RAISE EXCEPTION 'Late CAS failure leaked a partial update';
  END IF;
  BEGIN
    PERFORM public.tomnap_migrate_legacy_uploads(operation,jsonb_set(mapping,'{0,tenant_id}','"images-sql-b"'),changes,false);
    RAISE EXCEPTION 'Foreign tenant destination accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_migrate_legacy_uploads(operation,mapping,jsonb_set(changes,'{0,edits,0,source_url}','"/uploads/unapproved.png"'),false);
    RAISE EXCEPTION 'Unapproved exact reference accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  inactive_mapping := jsonb_set(mapping,'{0,tenant_id}','"images-sql-inactive"');
  inactive_mapping := jsonb_set(inactive_mapping,'{0,destination_name}',to_jsonb('t_' || substr(encode(sha256(convert_to('images-sql-inactive','UTF8')),'hex'),1,24) || '_' || repeat('b',32) || '.png'));
  inactive_mapping := jsonb_set(inactive_mapping,'{0,destination_url}',to_jsonb('/uploads/' || (inactive_mapping#>>'{0,destination_name}')));
  BEGIN
    PERFORM public.tomnap_migrate_legacy_uploads(operation,inactive_mapping,'[]',false);
    RAISE EXCEPTION 'Inactive tenant was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  result := public.tomnap_migrate_legacy_uploads(operation,mapping,changes,false);
  IF NOT (result->>'applied')::boolean OR (result->>'retry')::boolean OR (result->>'rewrittenRows')::int<>2 THEN
    RAISE EXCEPTION 'Commit receipt invalid';
  END IF;
  IF (SELECT ek_veriler->>'kanada_fatura_gorseli' FROM public.siparisler WHERE id='aabb0000-0000-4000-a000-000000000001') <> 'Önce ' || destination || ' sonra'
     OR (SELECT oneri_siparis#>>'{gorsel_urlleri,0}' FROM public.inbox_mesajlar WHERE id='images-inbox-a')<>destination
     OR (SELECT eksik_bilgiler->>0 FROM public.siparisler WHERE id='aabb0000-0000-4000-a000-000000000001')<>'META:gorseller=["' || replace(destination,'/',E'\\/') || '"]'
     OR (SELECT ek_veriler->>'kanada_fatura_gorseli' FROM public.siparisler WHERE id='aabb0000-0000-4000-a000-000000000002')<>'/uploads/legacy.png' THEN
    RAISE EXCEPTION 'Exact rewrite or tenant isolation failed';
  END IF;
  UPDATE public.siparisler SET musteri_adi='Changed after commit' WHERE id='aabb0000-0000-4000-a000-000000000001';
  result := public.tomnap_migrate_legacy_uploads(operation,mapping,changes,false);
  IF NOT (result->>'retry')::boolean OR (SELECT musteri_adi FROM public.siparisler WHERE id='aabb0000-0000-4000-a000-000000000001')<>'Changed after commit'
     OR (SELECT count(*) FROM public.legacy_upload_migrations WHERE operation_id=operation)<>1 THEN
    RAISE EXCEPTION 'Retry overwrote an intervening update or duplicated receipt';
  END IF;
  BEGIN
    PERFORM public.tomnap_migrate_legacy_uploads(operation,jsonb_set(mapping,'{0,source_sha256}',to_jsonb(repeat('d',64))),changes,false);
    RAISE EXCEPTION 'Changed operation key accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF (public.tomnap_legacy_upload_snapshot()->>'schemaVersion')<>'1' THEN RAISE EXCEPTION 'Inventory schema invalid'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
