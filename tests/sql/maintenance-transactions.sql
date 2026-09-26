BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id,ad) VALUES('restore_a','Synthetic A'),('restore_b','Synthetic B');
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi) VALUES
('aa000000-0000-4000-a000-000000000001','restore_a','old','Old A','Bag'),
('bb000000-0000-4000-a000-000000000001','restore_b','other','Private B','Bag');
INSERT INTO public.musteriler(id,tenant_id,ad_soyad) VALUES('restore-foreign-customer','restore_b','Synthetic');
DO $$
DECLARE body jsonb := '[{"id":"aa000000-0000-4000-a000-000000000002","tenant_id":"restore_a","ham_mesaj":"restore","musteri_adi":"New A","urun_aciklamasi":"Bag","adet":1,"toplam_tutar":100,"alinan_tutar":30,"olusturma_tarihi":"2020-01-01T00:00:00Z"}]'; result jsonb;
BEGIN
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000099','replace',jsonb_set(body,'{0,ek_veriler}','{"musteri_id":"restore-foreign-customer"}'));
    RAISE EXCEPTION 'Expected CRM tenant rejection';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  -- A late insert constraint failure must restore the deleted originals and leave no receipt.
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000001','replace',body || '[{"id":"aa000000-0000-4000-a000-000000000003","tenant_id":"restore_a","ham_mesaj":"bad","musteri_adi":"Bad","urun_aciklamasi":"Bag","adet":0}]');
    RAISE EXCEPTION 'Expected failing insert';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF NOT EXISTS(SELECT 1 FROM public.siparisler WHERE id='aa000000-0000-4000-a000-000000000001') OR EXISTS(SELECT 1 FROM public.siparisler WHERE id='aa000000-0000-4000-a000-000000000002') OR EXISTS(SELECT 1 FROM public.order_maintenance_operations) THEN RAISE EXCEPTION 'Restore rollback failed'; END IF;
  result := public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000001','replace',body);
  IF (result->>'toplam')::int<>1 OR (result->>'tekrar')::boolean THEN RAISE EXCEPTION 'Invalid receipt'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.siparisler WHERE id='aa000000-0000-4000-a000-000000000002' AND kalan_tutar=70 AND olusturma_tarihi='2020-01-01T00:00:00Z') THEN RAISE EXCEPTION 'ID/date/generated balance not preserved'; END IF;
  INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi) VALUES('aa000000-0000-4000-a000-000000000004','restore_a','after','New after restore','Bag');
  result := public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000001','replace',body);
  IF NOT (result->>'tekrar')::boolean OR NOT EXISTS(SELECT 1 FROM public.siparisler WHERE id='aa000000-0000-4000-a000-000000000004') THEN RAISE EXCEPTION 'Retry deleted intervening orders'; END IF;
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000001','clear','[]');
    RAISE EXCEPTION 'Expected changed-key conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000002','merge',body);
    RAISE EXCEPTION 'Expected merge conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000003','replace',jsonb_set(body,'{0,tenant_id}','"restore_b"'));
    RAISE EXCEPTION 'Expected foreign scope rejection';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000004','replace',jsonb_set(body,'{0,id}','"bb000000-0000-4000-a000-000000000001"'));
    RAISE EXCEPTION 'Expected cross-tenant ID conflict';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM public.tomnap_restore_orders('restore_a','cc000000-0000-4000-a000-000000000005','clear','[]');
  IF EXISTS(SELECT 1 FROM public.siparisler WHERE tenant_id='restore_a') OR (SELECT count(*) FROM public.siparisler WHERE tenant_id='restore_b')<>1 THEN RAISE EXCEPTION 'Clear scope failed'; END IF;
END $$;
-- Over the default REST page size: the aggregate RPC must return every row.
INSERT INTO public.siparisler(tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi)
SELECT 'restore_a','test','Synthetic','Bag' FROM generate_series(1,1001);
DO $$ BEGIN
  IF jsonb_array_length(public.tomnap_export_orders('restore_a'))<>1001 THEN RAISE EXCEPTION 'Truncated backup'; END IF;
  IF (public.tomnap_order_status('restore_a')->>'toplam_siparis')::int<>1001 THEN RAISE EXCEPTION 'Truncated counts'; END IF;
END $$;
INSERT INTO public.siparisler(tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi)
SELECT 'restore_a','test','Synthetic','Bag' FROM generate_series(1,4000);
DO $$ BEGIN
  BEGIN
    PERFORM public.tomnap_export_orders('restore_a');
    RAISE EXCEPTION 'Expected explicit export size limit';
  EXCEPTION WHEN program_limit_exceeded THEN NULL; END;
END $$;
RESET ROLE;
DO $$ DECLARE actor text; function_name text;
BEGIN
  FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH function_name IN ARRAY ARRAY['public.tomnap_restore_orders(text,uuid,text,jsonb)','public.tomnap_export_orders(text)','public.tomnap_order_status(text)'] LOOP
      IF has_function_privilege(actor,function_name,'EXECUTE') THEN RAISE EXCEPTION 'Browser execute grant'; END IF;
    END LOOP;
    IF has_table_privilege(actor,'public.order_maintenance_operations','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Browser receipt grant'; END IF;
  END LOOP;
END $$;
ROLLBACK;
