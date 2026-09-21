-- Minimal synthetic catalog for bare PostgreSQL CI. Never run on a Supabase project.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY, name text NOT NULL, public boolean NOT NULL DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text NOT NULL, metadata jsonb DEFAULT '{}', UNIQUE(bucket_id,name));
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets, storage.objects TO anon, authenticated, service_role;
-- Adversarial pre-existing policy: the migration must not trust its absence.
CREATE POLICY legacy_everything ON storage.buckets FOR ALL TO anon, authenticated USING(true) WITH CHECK(true);
CREATE POLICY legacy_everything ON storage.objects FOR ALL TO anon, authenticated USING(true) WITH CHECK(true);
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES
 ('tomnap-private-images','tomnap-private-images',false,10485760,ARRAY['image/png','image/jpeg','image/webp']),
 ('unrelated-public','unrelated-public',true,NULL,NULL);
INSERT INTO storage.objects(bucket_id,name) VALUES ('tomnap-private-images','synthetic-private.png'),('unrelated-public','public.png');
