CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
CREATE TABLE public.siparisler(id text PRIMARY KEY, lojistik_durumu text, finans_durumu text, olusturma_tarihi timestamptz, adet integer);
CREATE TABLE public.kuryeler(id text PRIMARY KEY);
