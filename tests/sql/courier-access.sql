-- Canonical schema + migrations, isolated PostgreSQL only; all fixtures roll back.
BEGIN;
DO $$ DECLARE proc text; actor text; BEGIN
  FOREACH proc IN ARRAY ARRAY['public.tomnap_courier_task(public.siparisler)','public.tomnap_bind_courier(text,text,text,text)','public.tomnap_assign_courier(text,uuid,text,bigint)','public.tomnap_courier_tasks(text,text)','public.tomnap_deliver_courier_order(text,text,uuid,bigint,text)'] LOOP
    IF (SELECT prosecdef FROM pg_proc WHERE oid=proc::regprocedure) OR NOT (SELECT coalesce(proconfig @> ARRAY['search_path=""'],false) FROM pg_proc WHERE oid=proc::regprocedure) THEN RAISE EXCEPTION 'Unsafe courier function %',proc; END IF;
    FOREACH actor IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF has_function_privilege(actor,proc,'EXECUTE') THEN RAISE EXCEPTION 'Browser can execute %',proc; END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role',proc,'EXECUTE') THEN RAISE EXCEPTION 'Missing service role grant %',proc; END IF;
  END LOOP;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_courier_tasks('courier-sql-a','courier-sql-user'); RAISE EXCEPTION 'Anonymous courier read succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user',NULL); RAISE EXCEPTION 'Browser binding succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES ('courier-sql-a','Courier test A','AKTIF'),('courier-sql-b','Courier test B','AKTIF');
INSERT INTO public.kullanicilar(id,tenant_id,ad_soyad,email,rol,durum) VALUES
 ('courier-sql-user','courier-sql-a','Same Name','courier1@sql.fixture','BAKU_KURYE','AKTIF'),
 ('courier-sql-user2','courier-sql-a','Same Name','courier2@sql.fixture','BAKU_KURYE','AKTIF'),
 ('courier-sql-foreign','courier-sql-b','Same Name','courier3@sql.fixture','BAKU_KURYE','AKTIF'),
 ('courier-sql-owner','courier-sql-a','Owner','courierowner@sql.fixture','PATRON','AKTIF'),
 ('courier-sql-inactive','courier-sql-a','Inactive','courierinactive@sql.fixture','BAKU_KURYE','PASIF');
INSERT INTO public.kuryeler(id,tenant_id,ad_soyad,telefon,bolge) VALUES
 ('courier-sql-1','courier-sql-a','Same Name','000','Matching address'),
 ('courier-sql-2','courier-sql-a','Same Name','000','Matching address'),
 ('courier-sql-b','courier-sql-b','Same Name','000','Matching address');
INSERT INTO public.siparisler(id,tenant_id,ham_mesaj,musteri_adi,urun_aciklamasi,teslimat_adresi,toplam_tutar,alinan_tutar,lojistik_durumu,ek_veriler) VALUES
 ('40000000-0000-4000-8000-000000000001','courier-sql-a','PRIVATE MESSAGE','Customer','Parcel','Matching address',100,20,'BAKU_DAGITIM_ARKADAS','{"kanada_fatura_no":"PRIVATE INVOICE","kanada_alis_fiyati_cad":10,"islem_gecmisi":["PRIVATE HISTORY"]}'),
 ('40000000-0000-4000-8000-000000000002','courier-sql-b','FOREIGN MESSAGE','Foreign','Parcel','Matching address',100,0,'BAKU_DAGITIM_ARKADAS','{}'),
 ('40000000-0000-4000-8000-000000000003','courier-sql-a','EARLY MESSAGE','Customer','Parcel','Matching address',100,0,'KANADA_DEPO','{}'),
 ('40000000-0000-4000-8000-000000000004','courier-sql-a','ROLLBACK MESSAGE','Customer','Parcel','Matching address',100,0,'BAKU_DAGITIM_ARKADAS','{}'),
 ('40000000-0000-4000-8000-000000000005','courier-sql-a','UNASSIGNED MESSAGE','Customer','Parcel','Matching address',100,0,'BAKU_DAGITIM_ARKADAS','{}');
DO $$ DECLARE r jsonb; first_result jsonb; key text; BEGIN
  r:=public.tomnap_courier_tasks('courier-sql-a','courier-sql-user');
  IF r->'kurye' <> 'null'::jsonb OR jsonb_array_length(r->'gorevler')<>0 THEN RAISE EXCEPTION 'Name/address heuristics gave task access'; END IF;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-foreign',NULL); RAISE EXCEPTION 'Foreign user bound'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-owner',NULL); RAISE EXCEPTION 'Owner was courier-bound'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-inactive',NULL); RAISE EXCEPTION 'Inactive user bound'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-b','courier-sql-user',NULL); RAISE EXCEPTION 'Foreign courier bound'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  r:=public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user',NULL);
  IF r->>'tekrar'<>'false' THEN RAISE EXCEPTION 'Initial binding did not persist'; END IF;
  IF public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user',NULL)->>'tekrar'<>'true' THEN RAISE EXCEPTION 'Binding retry failed'; END IF;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-2','courier-sql-user',NULL); RAISE EXCEPTION 'One user gained two courier profiles'; EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user2',NULL); RAISE EXCEPTION 'Stale binding overwrote owner change'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-2','courier-sql-user2',NULL);
  BEGIN PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000001','courier-sql-b',0); RAISE EXCEPTION 'Foreign courier assigned'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000002','courier-sql-1',0); RAISE EXCEPTION 'Foreign order assigned'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  r:=public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000001','courier-sql-1',0);
  IF r#>>'{siparis,kurye_atama_surumu}'<>'1' OR r->>'tekrar'<>'false' THEN RAISE EXCEPTION 'Assignment did not persist'; END IF;
  IF public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000001','courier-sql-1',0)->>'tekrar'<>'true' THEN RAISE EXCEPTION 'Lost-response assignment retry failed'; END IF;
  BEGIN PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000001','courier-sql-2',0); RAISE EXCEPTION 'Stale assignment overwrote change'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000003','courier-sql-1',0);
  r:=public.tomnap_courier_tasks('courier-sql-a','courier-sql-user');
  IF jsonb_array_length(r->'gorevler')<>1 OR r#>>'{gorevler,0,id}'<>'40000000-0000-4000-8000-000000000001' OR r::text LIKE '%PRIVATE%' THEN RAISE EXCEPTION 'Courier received unassigned/foreign/hidden data %',r; END IF;
  FOR key IN SELECT jsonb_object_keys(r#>'{gorevler,0}') LOOP
    IF key NOT IN ('id','musteri_adi','telefon_numarasi','teslimat_sehri','teslimat_adresi','urun_aciklamasi','adet','lojistik_durumu','kalan_tutar','para_birimi','kurye_atama_surumu','teslim_tarihi','teslim_alan') THEN RAISE EXCEPTION 'Unexpected task data %',key; END IF;
  END LOOP;
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user2','40000000-0000-4000-8000-000000000001',1,'Recipient'); RAISE EXCEPTION 'Other courier delivered'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000002',1,'Recipient'); RAISE EXCEPTION 'Foreign order delivered'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000003',1,'Recipient'); RAISE EXCEPTION 'Early order delivered'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000001',0,'Recipient'); RAISE EXCEPTION 'Stale task delivered'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  first_result:=public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000001',1,'Original recipient');
  r:=public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000001',1,'Changed retry');
  IF r->>'tekrar'<>'true' OR r->'gorev' IS DISTINCT FROM first_result->'gorev' OR (SELECT alinan_tutar FROM public.siparisler WHERE id='40000000-0000-4000-8000-000000000001')<>20 THEN RAISE EXCEPTION 'Delivery retry mutated receipt or payment'; END IF;
  BEGIN PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000001','courier-sql-2',1); RAISE EXCEPTION 'Delivered order reassigned'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-2',NULL,'courier-sql-user2');
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user2','courier-sql-user');
  IF jsonb_array_length(public.tomnap_courier_tasks('courier-sql-a','courier-sql-user2')->'gorevler')<>0 THEN RAISE EXCEPTION 'Replacement user received previous courier delivery history'; END IF;
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user','courier-sql-user2');
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-2','courier-sql-user2',NULL);
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1',NULL,'courier-sql-user');
  IF jsonb_array_length(public.tomnap_courier_tasks('courier-sql-a','courier-sql-user')->'gorevler')<>0 THEN RAISE EXCEPTION 'Unbound courier retained access'; END IF;
  PERFORM public.tomnap_bind_courier('courier-sql-a','courier-sql-1','courier-sql-user',NULL);
  PERFORM public.tomnap_assign_courier('courier-sql-a','40000000-0000-4000-8000-000000000004','courier-sql-1',0);
END $$;
RESET ROLE;
CREATE FUNCTION public.courier_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.id='40000000-0000-4000-8000-000000000004' AND NEW.lojistik_durumu='TESLIM_EDILDI' THEN RAISE EXCEPTION 'Injected delivery failure'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER courier_test_failure BEFORE UPDATE ON public.siparisler FOR EACH ROW EXECUTE FUNCTION public.courier_test_fail();
SET LOCAL ROLE service_role;
DO $$ BEGIN
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000004',1,'Recipient'); RAISE EXCEPTION 'Expected injection did not run'; EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Injected delivery failure' THEN RAISE; END IF; END;
  IF EXISTS(SELECT 1 FROM public.siparisler WHERE id='40000000-0000-4000-8000-000000000004' AND (lojistik_durumu<>'BAKU_DAGITIM_ARKADAS' OR kurye_teslim_kullanici_id IS NOT NULL OR kurye_teslim_alan IS NOT NULL OR teslim_tarihi IS NOT NULL)) THEN RAISE EXCEPTION 'Failed delivery left a partial receipt'; END IF;
  UPDATE public.kullanicilar SET durum='PASIF' WHERE id='courier-sql-user';
  BEGIN PERFORM public.tomnap_courier_tasks('courier-sql-a','courier-sql-user'); RAISE EXCEPTION 'Disabled user read tasks'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
  BEGIN PERFORM public.tomnap_deliver_courier_order('courier-sql-a','courier-sql-user','40000000-0000-4000-8000-000000000004',1,'Recipient'); RAISE EXCEPTION 'Disabled user delivered'; EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
