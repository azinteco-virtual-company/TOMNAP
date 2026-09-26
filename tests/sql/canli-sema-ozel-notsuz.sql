-- Live-like schema (Codex R4, test realism): the production siparisler table has no
-- physical ozel_not column; the delivery note lives only as the "[TƏLİMAT: …]" tag of
-- baku_tahsilat_notu (Codex R3 F8). The main CI database has the column (base-fixture),
-- so a body that still writes it passed there. CI builds a second database from
-- base-fixture.sql without that column, runs every migration and the whole rollback
-- chain (tum-zincir-gidis-donus.mjs) on it, then this file: the RPCs that write an order
-- row work there. Everything is rolled back. Run in ONE psql session.
\set ON_ERROR_STOP 1

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_attribute
              WHERE attrelid = 'public.siparisler'::regclass AND attname = 'ozel_not'
                AND attnum > 0 AND NOT attisdropped) THEN
    RAISE EXCEPTION 'This database must not have a physical siparisler.ozel_not column';
  END IF;
END $$;

BEGIN;
INSERT INTO public.firmalar(id, ad, onay_durumu) VALUES ('cs-a', 'Canlı A', 'AKTIF');
INSERT INTO public.kullanicilar(id, tenant_id, ad_soyad, email, rol, durum) VALUES
  ('cs-patron', 'cs-a', 'Patron', 'patron@canli.test', 'PATRON', 'AKTIF');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  r jsonb;
  sid uuid;
  s public.siparisler;
BEGIN
  -- 1. A v2 order with a note: the tag is written, no column is named.
  r := public.tomnap_v2_siparis_olustur('cs-a', 'cs-patron',
         '{"musteri_adi":"Aytən","ozel_not":"Qapıda zəng edin","teslimat_adresi":"Bakü"}',
         '[{"urun_aciklamasi":"Çanta","adet":1,"birim_satis_fiyati_azn":100,"kaynak_ulke":"CA"}]');
  sid := (r->'siparis'->>'id')::uuid;
  SELECT * INTO s FROM public.siparisler WHERE id = sid AND tenant_id = 'cs-a';
  IF s.baku_tahsilat_notu IS DISTINCT FROM '[TƏLİMAT: Qapıda zəng edin]' THEN
    RAISE EXCEPTION 'v2 note tag: %', s.baku_tahsilat_notu;
  END IF;
  -- Without a note: nothing is written.
  r := public.tomnap_v2_siparis_olustur('cs-a', 'cs-patron', '{"musteri_adi":"Rəşad"}',
         '[{"urun_aciklamasi":"Kəmər","adet":1,"birim_satis_fiyati_azn":20,"kaynak_ulke":"CA"}]');
  IF (SELECT baku_tahsilat_notu FROM public.siparisler
       WHERE id = (r->'siparis'->>'id')::uuid AND tenant_id = 'cs-a') IS NOT NULL THEN
    RAISE EXCEPTION 'v2 order without a note has a tag';
  END IF;

  -- 2. A payment: the ledger trigger updates the order row.
  r := public.tomnap_v2_odeme_kaydet('cs-a', 'cs-patron', jsonb_build_object(
         'siparis_id', sid, 'tutar_azn', 30, 'yontem', 'NAKIT', 'kaynak', 'BUTIK',
         'islem_anahtari', gen_random_uuid()));
  SELECT * INTO s FROM public.siparisler WHERE id = sid AND tenant_id = 'cs-a';
  IF s.alinan_tutar IS DISTINCT FROM 30.00 OR s.finans_durumu::text <> 'KISMI_ODEME' THEN
    RAISE EXCEPTION 'payment header: % %', s.alinan_tutar, s.finans_durumu;
  END IF;

  -- 3. The order edit writes the tag; a physical note column is an unknown column.
  r := public.tomnap_siparis_guncelle('cs-a', sid, '{"baku_tahsilat_notu":"[TƏLİMAT: Yeni]"}',
         jsonb_build_object('baku_tahsilat_notu', s.baku_tahsilat_notu));
  IF r->>'baku_tahsilat_notu' IS DISTINCT FROM '[TƏLİMAT: Yeni]' THEN
    RAISE EXCEPTION 'order edit: %', r->>'baku_tahsilat_notu';
  END IF;
  BEGIN
    PERFORM public.tomnap_siparis_guncelle('cs-a', sid, '{"ozel_not":"x"}', '{}');
    RAISE EXCEPTION 'The order edit accepted a physical ozel_not column';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
END $$;
ROLLBACK;

SELECT 'live-like schema without ozel_not passed' AS result;
