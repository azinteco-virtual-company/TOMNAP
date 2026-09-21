BEGIN;
INSERT INTO public.firmalar(id,ad,onay_durumu) VALUES ('cargo-sql-a','Synthetic A','AKTIF'),('cargo-sql-b','Synthetic B','AKTIF'),('cargo-sql-inactive','Inactive','DONDURULMUS');
SET LOCAL ROLE service_role;
DO $$
DECLARE envelope text := 'enc:v2:test:'||repeat('a',24)||':'||repeat('b',32)||':aabb'; a jsonb; b jsonb;
BEGIN
  a:=jsonb_build_object('tenant_id','cargo-sql-a','revision',1,'settings',jsonb_build_object('saglayici','ARAMEX'),'encrypted_credentials',envelope);
  b:=a||jsonb_build_object('tenant_id','cargo-sql-b');
  IF public.import_cargo_settings(jsonb_build_array(a,b))<>2 THEN RAISE EXCEPTION 'Import count'; END IF;
  BEGIN
    PERFORM public.save_cargo_settings(a,0); RAISE EXCEPTION 'Duplicate first save accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  a:=a||'{"revision":2}'::jsonb;
  IF (public.save_cargo_settings(a,1)->>'revision')::integer<>2 THEN RAISE EXCEPTION 'CAS save'; END IF;
  BEGIN
    PERFORM public.import_cargo_settings(jsonb_build_array(a||'{"revision":3}'::jsonb,b));
    RAISE EXCEPTION 'Stale batch succeeded';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT revision FROM public.cargo_settings WHERE tenant_id='cargo-sql-a')<>2 THEN RAISE EXCEPTION 'Partial import leaked'; END IF;
  BEGIN
    PERFORM public.save_cargo_settings(a||jsonb_build_object('revision',3,'encrypted_credentials','plaintext'),2);
    RAISE EXCEPTION 'Plaintext accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.save_cargo_settings(a||jsonb_build_object('revision',1,'tenant_id','cargo-sql-inactive'),0);
    RAISE EXCEPTION 'Inactive tenant accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.cargo_settings; RAISE EXCEPTION 'anon read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_cargo_settings('{}',0); RAISE EXCEPTION 'anon save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.import_cargo_settings('[]'); RAISE EXCEPTION 'anon import'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN PERFORM * FROM public.cargo_settings; RAISE EXCEPTION 'authenticated read'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.save_cargo_settings('{}',0); RAISE EXCEPTION 'authenticated save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.import_cargo_settings('[]'); RAISE EXCEPTION 'authenticated import'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
