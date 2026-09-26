BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND policyname LIKE 'tomnap_private_%' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles @> ARRAY['anon','authenticated']::name[])<>2 THEN
   RAISE EXCEPTION 'Missing restrictive storage policies';
 END IF;
END $$;
SET LOCAL ROLE anon;
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='tomnap-private-images';
 IF n<>0 THEN RAISE EXCEPTION 'Private object exposed to anon'; END IF;
 SELECT count(*) INTO n FROM storage.buckets WHERE id='tomnap-private-images';
 IF n<>0 THEN RAISE EXCEPTION 'Private bucket exposed to anon'; END IF;
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='unrelated-public';
 IF n<>1 THEN RAISE EXCEPTION 'Unrelated bucket policy changed'; END IF;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('tomnap-private-images','anon.png'); RAISE EXCEPTION 'Anon insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO storage.buckets(id,name,public) VALUES('tomnap-private-images','hijack',true); RAISE EXCEPTION 'Anon bucket insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE storage.buckets SET public=true WHERE id='tomnap-private-images';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Anon made bucket public'; END IF;
 DELETE FROM storage.objects WHERE bucket_id='tomnap-private-images';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Anon deleted object'; END IF;
 BEGIN UPDATE storage.objects SET bucket_id='tomnap-private-images' WHERE bucket_id='unrelated-public'; RAISE EXCEPTION 'Anon moved into private bucket'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='tomnap-private-images';
 IF n<>0 THEN RAISE EXCEPTION 'Authenticated object leak'; END IF;
 BEGIN INSERT INTO storage.objects(bucket_id,name) VALUES('tomnap-private-images','authenticated.png'); RAISE EXCEPTION 'Authenticated insert succeeded'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE storage.objects SET name='replaced.png' WHERE bucket_id='tomnap-private-images';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Authenticated overwrite succeeded'; END IF;
 UPDATE storage.buckets SET public=true WHERE id='tomnap-private-images';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Authenticated made bucket public'; END IF;
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE n int; BEGIN
 SELECT count(*) INTO n FROM storage.objects WHERE bucket_id='tomnap-private-images';
 IF n<>1 THEN RAISE EXCEPTION 'Server cannot read own bucket'; END IF;
 INSERT INTO storage.objects(bucket_id,name) VALUES('tomnap-private-images','server-created.png');
END $$;
ROLLBACK;
SELECT 'private storage browser denial / server access checks passed' AS result;
