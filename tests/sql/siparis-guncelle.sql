-- Order edit RPC (20260925150000; Codex R3 F1/F2/F9): writes only the given columns,
-- refuses when an expected value changed, never writes assignment/delivery/owner
-- columns, never a v2 order's derived columns. Then down -> down -> up.
-- Run after baseline + all migrations, in ONE psql session.
\set ON_ERROR_STOP 1

DO $$ BEGIN
  IF has_function_privilege('anon', 'public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Wrong EXECUTE privileges on the order edit RPC';
  END IF;
  IF (SELECT prosecdef OR NOT ('search_path=""' = ANY(proconfig)) FROM pg_proc
       WHERE oid = 'public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'Unsafe order edit RPC configuration';
  END IF;
END $$;

CREATE FUNCTION pg_temp.sg(p_tenant text, p_id uuid, p_change text, p_expected text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.tomnap_siparis_guncelle(p_tenant, p_id, p_change::jsonb, p_expected::jsonb);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE;
END $$;
CREATE FUNCTION pg_temp.sg_expect(p_got text, p_want text, p_what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_got IS DISTINCT FROM p_want THEN RAISE EXCEPTION 'Expected % for %, got %', p_want, p_what, p_got; END IF;
END $$;

BEGIN;
INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('sg-a', 'Düzenleme A', 'AKTIF'), ('sg-b', 'Düzenleme B', 'AKTIF');
INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum)
  VALUES ('sg-patron', 'sg-a', 'Patron', 'patron@duzenleme.test', 'PATRON', 'AKTIF');
-- Older update time: now() is the transaction start, the same for the insert and the edit.
INSERT INTO public.siparisler(id, tenant_id, ham_mesaj, musteri_adi, urun_aciklamasi, toplam_tutar, alinan_tutar,
                              lojistik_durumu, uluslararasi_kargo_kodu, baku_tahsilat_notu, guncellenme_tarihi) VALUES
  ('75000000-0000-4000-8000-000000000001', 'sg-a', 'v1', 'A', 'Çanta', 100, 20, 'ULUSLARARASI_KARGO', 'AWB-1', 'eski', now() - interval '1 day'),
  ('75000000-0000-4000-8000-000000000002', 'sg-b', 'v1', 'B', 'Çanta', 100, 0, 'KANADA_DEPO', NULL, '', now() - interval '1 day');
SELECT public.tomnap_v2_siparis_olustur('sg-a', 'sg-patron', '{"musteri_adi":"V2"}',
  '[{"urun_aciklamasi":"Kəmər","adet":1,"birim_satis_fiyati_azn":40,"kaynak_ulke":"CA"}]') IS NOT NULL AS v2_order;
SET LOCAL ROLE service_role;
DO $$
DECLARE v1 uuid := '75000000-0000-4000-8000-000000000001';
        v2 uuid := (SELECT id FROM public.siparisler WHERE tenant_id = 'sg-a' AND model_surumu = 2);
        before jsonb; after jsonb; c record;
BEGIN
  -- Only the given column changes (and the update time).
  before := to_jsonb(s) FROM public.siparisler s WHERE id = v1;
  PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', v1, '{"baku_tahsilat_notu":"yeni not"}',
    '{"kurye_atama_surumu":0,"lojistik_durumu":"ULUSLARARASI_KARGO"}'), 'ok', 'note edit');
  after := to_jsonb(s) FROM public.siparisler s WHERE id = v1;
  IF (before - 'baku_tahsilat_notu' - 'guncellenme_tarihi') IS DISTINCT FROM (after - 'baku_tahsilat_notu' - 'guncellenme_tarihi')
     OR after->>'baku_tahsilat_notu' <> 'yeni not'
     OR (after->>'guncellenme_tarihi')::timestamptz IS NOT DISTINCT FROM (before->>'guncellenme_tarihi')::timestamptz THEN
    RAISE EXCEPTION 'A note edit changed more than the note: % -> %', before, after;
  END IF;

  -- Optimistic lock: the edit applies only to the values it was based on.
  FOR c IN SELECT * FROM (VALUES
      ('{"alinan_tutar":50}', '{"alinan_tutar":0,"toplam_tutar":100}', 'PT409'),
      ('{"uluslararasi_kargo_kodu":"AWB-2"}', '{"uluslararasi_kargo_kodu":null}', 'PT409'),
      ('{"baku_tahsilat_notu":"x"}', '{"kurye_atama_surumu":3}', 'PT409'),
      ('{"baku_tahsilat_notu":"x"}', '{"lojistik_durumu":"KANADA_DEPO"}', 'PT409'),
      -- Written only by their own transactions.
      ('{"baku_kurye_id":"k"}', '{}', 'PT403'),
      ('{"kurye_atama_surumu":5}', '{}', 'PT403'),
      ('{"model_surumu":2}', '{}', 'PT403'),
      ('{"sahip_kullanici_id":"sg-patron"}', '{}', 'PT403'),
      ('{"tenant_id":"sg-b"}', '{}', 'PT403'),
      -- Unknown, generated or nothing to write.
      ('{"yok_boyle_kolon":1}', '{}', '22023'),
      ('{"kalan_tutar":0}', '{}', '22023'),
      ('{}', '{}', '22023')) AS t(change, expected, want) LOOP
    PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', v1, c.change, c.expected), c.want, c.change || ' / ' || c.expected);
  END LOOP;
  PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', v1, '{"alinan_tutar":50,"finans_durumu":"KISMI_ODEME"}',
    '{"alinan_tutar":20.00,"toplam_tutar":100}'), 'ok', 'money edit on the value it was based on');
  IF (SELECT alinan_tutar FROM public.siparisler WHERE id = v1) <> 50 THEN RAISE EXCEPTION 'Money edit not written'; END IF;

  -- K20: a v2 order's derived columns (currency included) are written only by the v2 RPCs.
  FOREACH c.change IN ARRAY ARRAY['{"alinan_tutar":1}', '{"para_birimi":"USD"}', '{"lojistik_durumu":"KANADA_DEPO"}',
                                  '{"toplam_tutar":1}', '{"urun_aciklamasi":"x"}'] LOOP
    PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', v2, c.change, '{}'), 'PT409', 'v2 ' || c.change);
  END LOOP;
  PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', v2, '{"teslimat_adresi":"Nərimanov 5"}', '{}'), 'ok', 'v2 address');

  -- Tenant scope: another boutique's order is not found.
  PERFORM pg_temp.sg_expect(pg_temp.sg('sg-a', '75000000-0000-4000-8000-000000000002', '{"baku_tahsilat_notu":"x"}', '{}'), 'PT404', 'foreign order');
  PERFORM pg_temp.sg_expect(pg_temp.sg('all', v1, '{"baku_tahsilat_notu":"x"}', '{}'), '22023', 'all tenants');
  IF (SELECT baku_tahsilat_notu FROM public.siparisler WHERE id = '75000000-0000-4000-8000-000000000002') <> '' THEN
    RAISE EXCEPTION 'A foreign order was changed';
  END IF;
END $$;
ROLLBACK;

-- Down -> down -> up.
BEGIN;
\ir ../../supabase/rollbacks/20260925150000_siparis_guncelle.down.sql
\ir ../../supabase/rollbacks/20260925150000_siparis_guncelle.down.sql
COMMIT;
DO $$ BEGIN
  IF to_regprocedure('public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Rollback left the order edit RPC behind';
  END IF;
  IF to_regclass('public.siparisler') IS NULL THEN RAISE EXCEPTION 'Rollback dropped a pre-existing object'; END IF;
END $$;
\ir ../../supabase/migrations/20260925150000_siparis_guncelle.sql
DO $$ BEGIN
  IF NOT has_function_privilege('service_role', 'public.tomnap_siparis_guncelle(text,uuid,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Re-applied order edit migration is incomplete';
  END IF;
END $$;
