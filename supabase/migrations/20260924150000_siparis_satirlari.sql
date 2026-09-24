-- Sipariş satırları ve sipariş sahibi (Faz A, A8; durak 0, K1, K2, K20).
--
-- siparisler (mevcut tablo) yalnız iki yeni kolon alır:
--   model_surumu      1 = v1 (bütün mevcut satırlar, varsayılan), 2 = v2 sipariş (K1);
--   sahip_kullanici_id siparişin sahibi (satış sorumlusu; primi ona aittir).
-- v1 kodu bu kolonları hiç yazmaz; v1 siparişler ve ekranları değişmez.
-- Müşteri bağı v2'de de ek_veriler.musteri_id içinde kalır: "musteri_id" adlı
-- fiziksel bir kolon v1 okumasında ek_veriler'deki değeri null ile ezerdi
-- (bkz. docs/OPEN_QUESTIONS.md).
--
-- siparis_satirlari: müşterinin istediği ürünler (K2: satır = ürün, adet ile).
--   Satırlar yalnız tomnap_v2_siparis_olustur ile, sipariş başlığıyla aynı
--   transaction'da yazılır. API rolü satır okuyup ekleyebilir; değiştiremez,
--   silemez (sipariş silinirse satırları da silinir). Bir satır yalnız aynı
--   tenant'taki bir v2 siparişine bağlanabilir (tetikleyici).
--
-- tomnap_v2_siparis_olustur: başlık + satırlar tek transaction. Eski kolonları
--   türetir (K20): toplam_tutar = Σ adet × birim fiyat, adet = Σ adet,
--   urun_aciklamasi = satır açıklamaları, alinan_tutar = 0,
--   finans_durumu = BEKLIYOR, lojistik_durumu = KANADA_SATINALIM_BEKLIYOR.
--   Herhangi bir adım hata verirse hiçbir şey yazılmaz.
-- Geri alma: supabase/rollbacks/20260924150000_siparis_satirlari.down.sql
BEGIN;

ALTER TABLE public.siparisler
  ADD COLUMN model_surumu smallint NOT NULL DEFAULT 1 CHECK (model_surumu IN (1, 2)),
  ADD COLUMN sahip_kullanici_id text
    CHECK (sahip_kullanici_id IS NULL OR char_length(sahip_kullanici_id) BETWEEN 1 AND 100);

CREATE TABLE public.siparis_satirlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  siparis_id uuid NOT NULL REFERENCES public.siparisler(id) ON DELETE CASCADE,
  sira smallint NOT NULL CHECK (sira BETWEEN 1 AND 100),
  urun_aciklamasi text NOT NULL CHECK (char_length(btrim(urun_aciklamasi)) BETWEEN 1 AND 500),
  beden text CHECK (beden IS NULL OR char_length(beden) BETWEEN 1 AND 50),
  renk text CHECK (renk IS NULL OR char_length(renk) BETWEEN 1 AND 50),
  adet integer NOT NULL CHECK (adet BETWEEN 1 AND 1000),
  birim_satis_fiyati_azn numeric(12, 2) NOT NULL
    CHECK (birim_satis_fiyati_azn >= 0 AND birim_satis_fiyati_azn < 1000000),
  kaynak_ulke text NOT NULL CHECK (kaynak_ulke IN ('CA', 'US')),
  iptal boolean NOT NULL DEFAULT false,
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  UNIQUE (siparis_id, sira)
);
CREATE INDEX siparis_satirlari_tenant_siparis_idx ON public.siparis_satirlari (tenant_id, siparis_id);

ALTER TABLE public.siparis_satirlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.siparis_satirlari FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.siparis_satirlari FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.siparis_satirlari'::regclass AND attnum > 0 AND NOT attisdropped;
  -- Table-level REVOKE does not remove column privileges; revoke both.
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.siparis_satirlari FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
GRANT SELECT, INSERT ON public.siparis_satirlari TO service_role;

-- A line belongs to a v2 order of the same tenant, whoever inserts it.
CREATE FUNCTION public.tomnap_siparis_satiri_kontrol()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.siparisler s
                  WHERE s.id = NEW.siparis_id AND s.tenant_id = NEW.tenant_id AND s.model_surumu = 2) THEN
    RAISE EXCEPTION 'Order line must belong to a v2 order of the same tenant' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tomnap_siparis_satiri_kontrol() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER siparis_satirlari_siparis_kontrol
  BEFORE INSERT ON public.siparis_satirlari
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_siparis_satiri_kontrol();

CREATE FUNCTION public.tomnap_v2_siparis_olustur(p_tenant_id text, p_user_id text, p_siparis jsonb, p_satirlar jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  v_sahip text;
  v_musteri text;
  v_toplam numeric(12, 2);
  v_adet integer;
  v_aciklama text;
  v_hatali integer;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_siparis) IS DISTINCT FROM 'object' OR jsonb_typeof(p_satirlar) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_satirlar) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'An order needs 1-100 lines' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_siparis->>'musteri_adi', ''))) NOT BETWEEN 1 AND 150 THEN
    RAISE EXCEPTION 'Invalid customer name' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO v_hatali FROM jsonb_array_elements(p_satirlar) AS l(x)
   WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
      OR jsonb_typeof(x->'adet') IS DISTINCT FROM 'number'
      OR jsonb_typeof(x->'birim_satis_fiyati_azn') IS DISTINCT FROM 'number';
  IF v_hatali > 0 THEN RAISE EXCEPTION 'Invalid order line' USING ERRCODE = '22023'; END IF;

  -- The creator: active in this tenant (or a platform admin) and allowed to create orders.
  -- FOR SHARE: a concurrent deactivation waits for this order, or wins and stops it.
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF' AND rol IN ('SUPER_ADMIN', 'PATRON', 'SATIS_SORUMLUSU')
     AND (tenant_id = p_tenant_id OR rol = 'SUPER_ADMIN')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creator is not allowed for this tenant' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firmalar f
                  WHERE f.id = p_tenant_id AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')) THEN
    RAISE EXCEPTION 'Company unavailable' USING ERRCODE = 'PT403';
  END IF;

  -- The owner defaults to the creator; a sales user owns only their own orders.
  v_sahip := coalesce(nullif(btrim(coalesce(p_siparis->>'sahip_kullanici_id', '')), ''), u.id);
  IF u.rol = 'SATIS_SORUMLUSU' AND v_sahip <> u.id THEN
    RAISE EXCEPTION 'A sales user may only own their own orders' USING ERRCODE = 'PT403';
  END IF;
  IF v_sahip <> u.id THEN
    PERFORM 1 FROM public.kullanicilar
     WHERE id = v_sahip AND tenant_id = p_tenant_id AND durum = 'AKTIF' AND rol IN ('PATRON', 'SATIS_SORUMLUSU')
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Owner is not an active sales user of this tenant' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  v_musteri := nullif(btrim(coalesce(p_siparis->>'musteri_id', '')), '');
  IF v_musteri IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.musteriler m WHERE m.id = v_musteri AND m.tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Unknown customer' USING ERRCODE = 'PT409';
  END IF;

  SELECT sum(round((x->>'adet')::integer * (x->>'birim_satis_fiyati_azn')::numeric, 2)),
         sum((x->>'adet')::integer),
         string_agg(btrim(x->>'urun_aciklamasi'), ' + ' ORDER BY n)
    INTO v_toplam, v_adet, v_aciklama
    FROM jsonb_array_elements(p_satirlar) WITH ORDINALITY AS l(x, n);

  INSERT INTO public.siparisler(
    tenant_id, model_surumu, sahip_kullanici_id, ham_mesaj, siparis_kaynagi, musteri_adi,
    instagram_kullanici_adi, telefon_numarasi, teslimat_sehri, teslimat_adresi, urun_aciklamasi,
    adet, toplam_tutar, alinan_tutar, para_birimi, finans_durumu, lojistik_durumu, ozel_not,
    eksik_bilgiler, is_demo, ek_veriler)
  VALUES (
    p_tenant_id, 2, v_sahip, coalesce(p_siparis->>'ham_mesaj', ''),
    coalesce(nullif(p_siparis->>'siparis_kaynagi', ''), 'INSTAGRAM_DM'), btrim(p_siparis->>'musteri_adi'),
    nullif(p_siparis->>'instagram_kullanici_adi', ''), nullif(p_siparis->>'telefon_numarasi', ''),
    coalesce(nullif(p_siparis->>'teslimat_sehri', ''), 'Bakü'), nullif(p_siparis->>'teslimat_adresi', ''),
    v_aciklama, v_adet, v_toplam, 0, 'AZN', 'BEKLIYOR', 'KANADA_SATINALIM_BEKLIYOR',
    nullif(p_siparis->>'ozel_not', ''), '[]'::jsonb, false,
    jsonb_strip_nulls(jsonb_build_object('musteri_id', v_musteri)))
  RETURNING * INTO s;

  -- Column checks reject an invalid line; the whole order is then rolled back.
  INSERT INTO public.siparis_satirlari(
    tenant_id, siparis_id, sira, urun_aciklamasi, beden, renk, adet, birim_satis_fiyati_azn, kaynak_ulke)
  SELECT p_tenant_id, s.id, n, btrim(x->>'urun_aciklamasi'), nullif(btrim(coalesce(x->>'beden', '')), ''),
         nullif(btrim(coalesce(x->>'renk', '')), ''), (x->>'adet')::integer,
         (x->>'birim_satis_fiyati_azn')::numeric, x->>'kaynak_ulke'
    FROM jsonb_array_elements(p_satirlar) WITH ORDINALITY AS l(x, n);

  RETURN jsonb_build_object(
    'siparis', to_jsonb(s),
    'satirlar', (SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sira) FROM public.siparis_satirlari l
                  WHERE l.siparis_id = s.id AND l.tenant_id = p_tenant_id));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_siparis_olustur(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_siparis_olustur(text, text, jsonb, jsonb) TO service_role;

COMMIT;
