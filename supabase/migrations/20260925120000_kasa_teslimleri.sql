-- Kurye nakdi ve kasa teslimi (Faz A, A11; K17). Yeni tablo, yeni fonksiyonlar ve
-- A10'un iki tetikleyici fonksiyonunun daraltılmış yeni gövdesi.
--
-- K17: Kuryenin nakit tahsilatı önce onun zimmetine yazılır (odemeler: kaynak TESLIMAT,
-- yontem NAKIT, alan_kullanici_id = kurye). Kasaya teslim ayrı bir kayıttır
-- (kasa_teslimleri, append-only) ve teslim edilen tahsilatları kasa_teslim_id ile kapatır.
--   kurye bakiyesi = Σ nakit tahsilat (ters kayıtlar dahil) − Σ kasa teslimi
--                  = Σ açık (teslim edilmemiş, ters kaydı olmayan) nakit tahsilat.
-- odemeler append-only kalır; tek istisna: açık bir kurye nakit tahsilatının
-- kasa_teslim_id'si bir kez, aynı kuryenin aynı tenant'taki bir teslimine yazılabilir.
-- service_role'a yalnız bu kolon için UPDATE verilir; tetikleyici geri kalan her şeyi reddeder.
-- Yarış: teslim ve ters kayıt aynı ödeme satırında çakışır (teslim satırı günceller, ters
-- kayıt asıl satırı FOR SHARE kilitler); hangisi önce biterse diğeri reddedilir.
-- Geri alma: supabase/rollbacks/20260925120000_kasa_teslimleri.down.sql
BEGIN;

CREATE TABLE public.kasa_teslimleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  kurye_kullanici_id text NOT NULL CHECK (char_length(kurye_kullanici_id) BETWEEN 1 AND 100),
  teslim_alan_kullanici_id text NOT NULL CHECK (char_length(teslim_alan_kullanici_id) BETWEEN 1 AND 100),
  tutar_azn numeric(12, 2) NOT NULL CHECK (tutar_azn > 0 AND tutar_azn < 10000000),
  odeme_sayisi integer NOT NULL CHECK (odeme_sayisi BETWEEN 1 AND 5000),
  aciklama text CHECK (aciklama IS NULL OR char_length(aciklama) BETWEEN 1 AND 500),
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kasa_teslimleri_kendine_teslim_yok CHECK (kurye_kullanici_id <> teslim_alan_kullanici_id)
);
CREATE INDEX kasa_teslimleri_kurye_idx ON public.kasa_teslimleri (tenant_id, kurye_kullanici_id, zaman);

ALTER TABLE public.kasa_teslimleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kasa_teslimleri FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.kasa_teslimleri FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.kasa_teslimleri'::regclass AND attnum > 0 AND NOT attisdropped;
  -- Table-level REVOKE does not remove column privileges; revoke both.
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.kasa_teslimleri FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
GRANT SELECT, INSERT ON public.kasa_teslimleri TO service_role;

CREATE FUNCTION public.tomnap_kasa_teslimleri_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'kasa_teslimleri is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.tomnap_kasa_teslimleri_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kasa_teslimleri_append_only_rows
  BEFORE UPDATE OR DELETE ON public.kasa_teslimleri
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_kasa_teslimleri_append_only();
CREATE TRIGGER kasa_teslimleri_append_only_truncate
  BEFORE TRUNCATE ON public.kasa_teslimleri
  FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_kasa_teslimleri_append_only();

-- The one allowed change on odemeler: closing an open courier cash payment into a
-- hand-over of the same courier and tenant. Everything else stays refused.
GRANT UPDATE (kasa_teslim_id) ON public.odemeler TO service_role;
CREATE OR REPLACE FUNCTION public.tomnap_odemeler_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.kasa_teslim_id IS NULL AND NEW.kasa_teslim_id IS NOT NULL
     AND (to_jsonb(NEW) - 'kasa_teslim_id') = (to_jsonb(OLD) - 'kasa_teslim_id')
     AND OLD.kaynak = 'TESLIMAT' AND OLD.yontem = 'NAKIT' AND OLD.tutar_azn > 0
     AND OLD.ters_kayit_odeme_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.odemeler r WHERE r.ters_kayit_odeme_id = OLD.id)
     AND EXISTS (SELECT 1 FROM public.kasa_teslimleri k
                  WHERE k.id = NEW.kasa_teslim_id AND k.tenant_id = OLD.tenant_id
                    AND k.kurye_kullanici_id = OLD.alan_kullanici_id) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'odemeler is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $$;

-- A10 row check, plus: a reversal locks the payment it mirrors (FOR SHARE), so it
-- waits for a concurrent hand-over of that payment and then sees it closed.
CREATE OR REPLACE FUNCTION public.tomnap_odeme_kontrol()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE asil public.odemeler;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.siparisler s
                  WHERE s.id = NEW.siparis_id AND s.tenant_id = NEW.tenant_id AND s.model_surumu = 2) THEN
    RAISE EXCEPTION 'A payment needs a v2 order of the same tenant' USING ERRCODE = '23514';
  END IF;
  IF NEW.kasa_teslim_id IS NOT NULL THEN
    RAISE EXCEPTION 'A payment is recorded before any cash hand-over' USING ERRCODE = '23514';
  END IF;
  IF NEW.ters_kayit_odeme_id IS NOT NULL THEN
    SELECT * INTO asil FROM public.odemeler WHERE id = NEW.ters_kayit_odeme_id FOR SHARE;
    IF NOT FOUND OR asil.tenant_id <> NEW.tenant_id OR asil.siparis_id <> NEW.siparis_id
       OR asil.ters_kayit_odeme_id IS NOT NULL OR asil.tutar_azn <> -NEW.tutar_azn THEN
      RAISE EXCEPTION 'A reversal must mirror one payment of the same order' USING ERRCODE = '23514';
    END IF;
    IF asil.kasa_teslim_id IS NOT NULL THEN
      RAISE EXCEPTION 'A payment handed over to the cash desk cannot be reversed' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- A courier records the cash taken for a v2 order assigned to it (K17).
CREATE FUNCTION public.tomnap_v2_kurye_tahsilati(p_tenant_id text, p_user_id text, p_siparis_id uuid, p_tutar numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  c public.kuryeler;
  s public.siparisler;
  o public.odemeler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' OR p_siparis_id IS NULL THEN
    RAISE EXCEPTION 'Invalid collection' USING ERRCODE = '22023';
  END IF;
  IF p_tutar IS NULL OR p_tutar <= 0 OR p_tutar >= 1000000 OR p_tutar <> round(p_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.kullanicilar u JOIN public.firmalar f ON f.id = u.tenant_id
   WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id AND u.rol = 'BAKU_KURYE' AND u.durum = 'AKTIF'
     AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')
   FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active courier user not found' USING ERRCODE = 'PT403'; END IF;
  SELECT * INTO c FROM public.kuryeler WHERE tenant_id = p_tenant_id AND kullanici_id = p_user_id AND aktif IS TRUE FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No active courier record for this user' USING ERRCODE = 'PT403'; END IF;

  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  IF s.baku_kurye_id IS DISTINCT FROM c.id THEN
    RAISE EXCEPTION 'The order is assigned to another courier' USING ERRCODE = 'PT403';
  END IF;
  IF s.model_surumu <> 2 THEN RAISE EXCEPTION 'Only v2 orders have a ledger' USING ERRCODE = 'PT409'; END IF;
  IF NOT (s.lojistik_durumu = 'BAKU_DAGITIM_ARKADAS'
          OR (s.lojistik_durumu = 'TESLIM_EDILDI' AND s.kurye_teslim_kullanici_id = p_user_id)) THEN
    RAISE EXCEPTION 'The order is not out for delivery with this courier' USING ERRCODE = 'PT409';
  END IF;
  IF p_tutar > s.kalan_tutar THEN
    RAISE EXCEPTION 'More than the amount due' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id)
  VALUES (p_tenant_id, s.id, p_tutar, 'NAKIT', 'TESLIMAT', p_user_id, now(), p_user_id)
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;

-- Per courier: cash taken, handed over, balance and the open collections (read-only).
CREATE FUNCTION public.tomnap_v2_kurye_bakiyeleri(p_tenant_id text, p_kurye_kullanici_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE sonuc jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  WITH nakit AS (
    SELECT o.* FROM public.odemeler o
     WHERE o.tenant_id = p_tenant_id AND o.kaynak = 'TESLIMAT' AND o.yontem = 'NAKIT'
       AND (p_kurye_kullanici_id IS NULL OR o.alan_kullanici_id = p_kurye_kullanici_id)
  ), acik AS (
    SELECT n.* FROM nakit n
     WHERE n.tutar_azn > 0 AND n.kasa_teslim_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM nakit r WHERE r.ters_kayit_odeme_id = n.id)
  ), teslim AS (
    SELECT k.kurye_kullanici_id, sum(k.tutar_azn) AS toplam FROM public.kasa_teslimleri k
     WHERE k.tenant_id = p_tenant_id
       AND (p_kurye_kullanici_id IS NULL OR k.kurye_kullanici_id = p_kurye_kullanici_id)
     GROUP BY 1
  ), kuryeler AS (
    SELECT alan_kullanici_id AS id FROM nakit UNION SELECT kurye_kullanici_id FROM teslim
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'kurye_kullanici_id', q.id,
      'ad_soyad', (SELECT u.ad_soyad FROM public.kullanicilar u WHERE u.id = q.id AND u.tenant_id = p_tenant_id),
      'tahsilat_toplami', coalesce((SELECT sum(n.tutar_azn) FROM nakit n WHERE n.alan_kullanici_id = q.id), 0),
      'teslim_toplami', coalesce((SELECT t.toplam FROM teslim t WHERE t.kurye_kullanici_id = q.id), 0),
      'acik_tahsilatlar', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', a.id, 'siparis_id', a.siparis_id, 'tutar_azn', a.tutar_azn, 'alma_zamani', a.alma_zamani,
          'musteri_adi', (SELECT s.musteri_adi FROM public.siparisler s WHERE s.id = a.siparis_id AND s.tenant_id = p_tenant_id))
          ORDER BY a.alma_zamani, a.id) FROM acik a WHERE a.alan_kullanici_id = q.id), '[]'::jsonb)
    ) ORDER BY q.id), '[]'::jsonb) INTO sonuc
    FROM kuryeler q;
  RETURN sonuc;
END $$;

-- A courier's own view: its balance and the v2 orders it may collect cash for.
CREATE FUNCTION public.tomnap_v2_kurye_nakit_durumu(p_tenant_id text, p_user_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.kuryeler; bakiye jsonb; siparisler jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.kullanicilar u
   WHERE u.id = p_user_id AND u.tenant_id = p_tenant_id AND u.rol = 'BAKU_KURYE' AND u.durum = 'AKTIF';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active courier user not found' USING ERRCODE = 'PT403'; END IF;
  bakiye := public.tomnap_v2_kurye_bakiyeleri(p_tenant_id, p_user_id)->0;
  SELECT * INTO c FROM public.kuryeler WHERE tenant_id = p_tenant_id AND kullanici_id = p_user_id AND aktif IS TRUE;
  IF FOUND THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', s.id, 'musteri_adi', s.musteri_adi, 'lojistik_durumu', s.lojistik_durumu,
        'toplam_tutar', s.toplam_tutar, 'kalan_tutar', s.kalan_tutar) ORDER BY s.olusturma_tarihi, s.id), '[]'::jsonb)
      INTO siparisler
      FROM (SELECT * FROM public.siparisler
             WHERE tenant_id = p_tenant_id AND baku_kurye_id = c.id AND model_surumu = 2 AND kalan_tutar > 0
               AND (lojistik_durumu = 'BAKU_DAGITIM_ARKADAS'
                    OR (lojistik_durumu = 'TESLIM_EDILDI' AND kurye_teslim_kullanici_id = p_user_id))
             LIMIT 500) s;
  END IF;
  RETURN jsonb_build_object(
    'bakiye', coalesce((bakiye->>'tahsilat_toplami')::numeric, 0) - coalesce((bakiye->>'teslim_toplami')::numeric, 0),
    'acik_tahsilatlar', coalesce(bakiye->'acik_tahsilatlar', '[]'::jsonb),
    'siparisler', coalesce(siparisler, '[]'::jsonb));
END $$;

-- The cash desk (PATRON, BAKU_FINANS; SUPER_ADMIN acts as PATRON) takes over the
-- selected open collections of one courier. The amount must equal their sum.
CREATE FUNCTION public.tomnap_v2_kasa_teslimi(p_tenant_id text, p_user_id text, p_kurye_kullanici_id text,
                                              p_odeme_idleri uuid[], p_tutar numeric, p_aciklama text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  k public.kasa_teslimleri;
  v_sayi integer;
  v_toplam numeric(12, 2);
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_odeme_idleri IS NULL OR cardinality(p_odeme_idleri) NOT BETWEEN 1 AND 5000
     OR array_position(p_odeme_idleri, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT x) FROM unnest(p_odeme_idleri) x) <> cardinality(p_odeme_idleri)
     OR p_tutar IS NULL OR p_tutar <= 0 OR p_tutar <> round(p_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid hand-over' USING ERRCODE = '22023';
  END IF;
  IF p_aciklama IS NOT NULL AND char_length(btrim(p_aciklama)) > 500 THEN
    RAISE EXCEPTION 'Note too long' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF' AND rol IN ('SUPER_ADMIN', 'PATRON', 'BAKU_FINANS')
     AND (tenant_id = p_tenant_id OR rol = 'SUPER_ADMIN')
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not allowed to take cash for this tenant' USING ERRCODE = 'PT403'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kullanicilar c
                  WHERE c.id = p_kurye_kullanici_id AND c.tenant_id = p_tenant_id AND c.rol = 'BAKU_KURYE') THEN
    RAISE EXCEPTION 'Courier not found' USING ERRCODE = 'PT404';
  END IF;

  -- Lock the selected rows; a concurrent hand-over of any of them waits and then
  -- finds it closed. A second statement re-checks with a fresh snapshot, so a
  -- reversal committed meanwhile is seen.
  PERFORM 1 FROM public.odemeler o WHERE o.id = ANY (p_odeme_idleri) AND o.tenant_id = p_tenant_id FOR UPDATE;
  SELECT count(*), sum(o.tutar_azn) INTO v_sayi, v_toplam FROM public.odemeler o
   WHERE o.id = ANY (p_odeme_idleri) AND o.tenant_id = p_tenant_id
     AND o.alan_kullanici_id = p_kurye_kullanici_id AND o.kaynak = 'TESLIMAT' AND o.yontem = 'NAKIT'
     AND o.tutar_azn > 0 AND o.ters_kayit_odeme_id IS NULL AND o.kasa_teslim_id IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.odemeler r WHERE r.ters_kayit_odeme_id = o.id);
  IF v_sayi <> cardinality(p_odeme_idleri) THEN
    RAISE EXCEPTION 'A selected collection is not open cash of this courier' USING ERRCODE = 'PT409';
  END IF;
  IF v_toplam <> p_tutar THEN
    RAISE EXCEPTION 'The amount differs from the selected collections' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.kasa_teslimleri(tenant_id, kurye_kullanici_id, teslim_alan_kullanici_id, tutar_azn, odeme_sayisi, aciklama)
  VALUES (p_tenant_id, p_kurye_kullanici_id, u.id, v_toplam, v_sayi, nullif(btrim(coalesce(p_aciklama, '')), ''))
  RETURNING * INTO k;
  UPDATE public.odemeler SET kasa_teslim_id = k.id
   WHERE id = ANY (p_odeme_idleri) AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('teslim', to_jsonb(k),
    'bakiye', public.tomnap_v2_kurye_bakiyeleri(p_tenant_id, p_kurye_kullanici_id)->0);
END $$;

REVOKE ALL ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric),
  public.tomnap_v2_kurye_bakiyeleri(text, text), public.tomnap_v2_kurye_nakit_durumu(text, text),
  public.tomnap_v2_kasa_teslimi(text, text, text, uuid[], numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_kurye_tahsilati(text, text, uuid, numeric),
  public.tomnap_v2_kurye_bakiyeleri(text, text), public.tomnap_v2_kurye_nakit_durumu(text, text),
  public.tomnap_v2_kasa_teslimi(text, text, text, uuid[], numeric, text) TO service_role;

COMMIT;
