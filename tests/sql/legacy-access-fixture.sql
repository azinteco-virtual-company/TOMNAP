-- Synthetic insecure legacy permissions; ONLY for the isolated CI database.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT (email) ON public.kullanicilar TO PUBLIC;
CREATE POLICY legacy_allow_all ON public.kullanicilar FOR ALL USING (true);
CREATE POLICY legacy_read_all ON public.siparisler FOR SELECT USING (true);
