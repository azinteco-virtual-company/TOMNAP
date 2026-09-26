-- Ödeme defteri (Faz A, A10; durak 6, K16, K20). Yalnız yeni tablo ve fonksiyonlar.
--
-- odemeler: v2 siparişlerinin tahsilatları. Append-only (kurlar deseni):
--   * yetkiler: service_role dahil hiçbir API rolünde UPDATE, DELETE, TRUNCATE yok;
--   * tetikleyiciler: BEFORE UPDATE/DELETE (satır) ve BEFORE TRUNCATE hata verir.
--   Düzeltme ters kayıttır (K16): aynı tutarın eksisi, ters_kayit_odeme_id ile, bir kez.
--   kasa_teslim_id kurye nakdinin kasaya teslimi içindir (A11); bu migration'da hep NULL.
-- Siparişin eski kolonları (K20): her yeni defter satırından sonra, aynı transaction'da
--   alinan_tutar = Σ tutar_azn ve finans_durumu (0 → BEKLIYOR, < toplam → KISMI_ODEME,
--   ≥ toplam → ODENDI) yazılır. Bunu satır tetikleyicisi yapar; RPC dışından eklenen bir
--   satır da özeti bozamaz.
-- Sipariş silinirse: yabancı anahtar ON DELETE RESTRICT. Ödemesi olan bir v2 siparişi
--   silinemez; para izi siparişsiz kalmaz.
-- RPC'ler: tomnap_v2_odeme_kaydet, tomnap_v2_odeme_ters_kayit (SECURITY INVOKER,
--   service_role). Kaynağı TESLIMAT olan tahsilat kurye akışından gelir (A11); bu RPC
--   yalnız BUTIK ve ONLINE yazar.
-- Geri alma: supabase/rollbacks/20260925110000_odemeler.down.sql
BEGIN;

CREATE TABLE public.odemeler (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  siparis_id uuid NOT NULL REFERENCES public.siparisler(id) ON DELETE RESTRICT,
  tutar_azn numeric(12, 2) NOT NULL CHECK (tutar_azn <> 0 AND abs(tutar_azn) < 1000000),
  yontem text NOT NULL CHECK (yontem IN ('NAKIT', 'KART', 'HAVALE', 'DIGER')),
  kaynak text NOT NULL CHECK (kaynak IN ('TESLIMAT', 'BUTIK', 'ONLINE')),
  alan_kullanici_id text NOT NULL CHECK (char_length(alan_kullanici_id) BETWEEN 1 AND 100),
  alma_zamani timestamptz NOT NULL,
  kaydeden_kullanici_id text NOT NULL CHECK (char_length(kaydeden_kullanici_id) BETWEEN 1 AND 100),
  aciklama text CHECK (aciklama IS NULL OR char_length(aciklama) BETWEEN 1 AND 500),
  ters_kayit_odeme_id uuid REFERENCES public.odemeler(id) ON DELETE RESTRICT,
  kasa_teslim_id uuid,
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  -- A payment is positive; only a reversal is negative, and it carries its reason.
  CONSTRAINT odemeler_ters_kayit_isareti CHECK ((ters_kayit_odeme_id IS NULL) = (tutar_azn > 0)),
  CONSTRAINT odemeler_ters_kayit_gerekcesi CHECK (ters_kayit_odeme_id IS NULL OR aciklama IS NOT NULL)
);
-- A payment is reversed at most once.
CREATE UNIQUE INDEX odemeler_tek_ters_kayit ON public.odemeler (ters_kayit_odeme_id)
  WHERE ters_kayit_odeme_id IS NOT NULL;
CREATE INDEX odemeler_siparis_idx ON public.odemeler (tenant_id, siparis_id, olusturma_zamani);

ALTER TABLE public.odemeler ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.odemeler FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.odemeler FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.odemeler'::regclass AND attnum > 0 AND NOT attisdropped;
  -- Table-level REVOKE does not remove column privileges; revoke both.
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.odemeler FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
GRANT SELECT, INSERT ON public.odemeler TO service_role;

CREATE FUNCTION public.tomnap_odemeler_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'odemeler is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.tomnap_odemeler_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER odemeler_append_only_rows
  BEFORE UPDATE OR DELETE ON public.odemeler
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_odemeler_append_only();
CREATE TRIGGER odemeler_append_only_truncate
  BEFORE TRUNCATE ON public.odemeler
  FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_odemeler_append_only();

-- Every row, however it is inserted: a v2 order of the same tenant; a reversal
-- mirrors one positive payment of the same order.
CREATE FUNCTION public.tomnap_odeme_kontrol()
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
    SELECT * INTO asil FROM public.odemeler WHERE id = NEW.ters_kayit_odeme_id;
    IF NOT FOUND OR asil.tenant_id <> NEW.tenant_id OR asil.siparis_id <> NEW.siparis_id
       OR asil.ters_kayit_odeme_id IS NOT NULL OR asil.tutar_azn <> -NEW.tutar_azn THEN
      RAISE EXCEPTION 'A reversal must mirror one payment of the same order' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tomnap_odeme_kontrol() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER odemeler_kontrol
  BEFORE INSERT ON public.odemeler
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_odeme_kontrol();

-- K20: the order's old columns follow the ledger in the same transaction. The order
-- row is locked first, so concurrent payments are summed one after the other.
CREATE FUNCTION public.tomnap_odeme_siparis_ozeti()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE toplam numeric(12, 2); odenen numeric(12, 2);
BEGIN
  SELECT s.toplam_tutar INTO toplam FROM public.siparisler s
   WHERE s.id = NEW.siparis_id AND s.tenant_id = NEW.tenant_id FOR UPDATE;
  SELECT coalesce(sum(o.tutar_azn), 0) INTO odenen FROM public.odemeler o
   WHERE o.siparis_id = NEW.siparis_id AND o.tenant_id = NEW.tenant_id;
  UPDATE public.siparisler SET
    alinan_tutar = odenen,
    finans_durumu = (CASE WHEN odenen <= 0 THEN 'BEKLIYOR'
                          WHEN odenen < toplam THEN 'KISMI_ODEME'
                          ELSE 'ODENDI' END)::public.finans_durumu_enum,
    guncellenme_tarihi = now()
   WHERE id = NEW.siparis_id AND tenant_id = NEW.tenant_id;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.tomnap_odeme_siparis_ozeti() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER odemeler_siparis_ozeti
  AFTER INSERT ON public.odemeler
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_odeme_siparis_ozeti();

-- Who records and reverses (v2 role matrix): PATRON, SUPER_ADMIN (acts as PATRON in a
-- tenant), BAKU_FINANS; SATIS_SORUMLUSU only in the boutique (kaynak BUTIK) and only
-- reverses what it recorded itself.
CREATE FUNCTION public.tomnap_v2_odeme_kaydet(p_tenant_id text, p_user_id text, p_odeme jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  o public.odemeler;
  v_siparis uuid;
  v_tutar numeric;
  v_kaynak text;
  v_zaman timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' THEN
    RAISE EXCEPTION 'Invalid tenant' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_odeme) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_odeme->'tutar_azn') IS DISTINCT FROM 'number'
     OR coalesce(p_odeme->>'siparis_id', '') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid payment' USING ERRCODE = '22023';
  END IF;
  v_siparis := (p_odeme->>'siparis_id')::uuid;
  v_tutar := (p_odeme->>'tutar_azn')::numeric;
  IF v_tutar <= 0 OR v_tutar >= 1000000 OR v_tutar <> round(v_tutar, 2) THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;
  v_kaynak := p_odeme->>'kaynak';
  IF v_kaynak IS NULL OR v_kaynak NOT IN ('BUTIK', 'ONLINE') THEN
    RAISE EXCEPTION 'Only boutique and online payments are recorded here' USING ERRCODE = '22023';
  END IF;
  v_zaman := coalesce((p_odeme->>'alma_zamani')::timestamptz, now());
  IF v_zaman > now() + interval '5 minutes' OR v_zaman < now() - interval '366 days' THEN
    RAISE EXCEPTION 'Invalid payment time' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF'
     AND rol IN ('SUPER_ADMIN', 'PATRON', 'SATIS_SORUMLUSU', 'BAKU_FINANS')
     AND (tenant_id = p_tenant_id OR rol = 'SUPER_ADMIN')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to record payments for this tenant' USING ERRCODE = 'PT403';
  END IF;
  IF u.rol = 'SATIS_SORUMLUSU' AND v_kaynak <> 'BUTIK' THEN
    RAISE EXCEPTION 'A sales user records boutique payments only' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firmalar f
                  WHERE f.id = p_tenant_id AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')) THEN
    RAISE EXCEPTION 'Company unavailable' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO s FROM public.siparisler WHERE id = v_siparis AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  IF s.model_surumu <> 2 THEN
    RAISE EXCEPTION 'Payments are recorded only for v2 orders' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama)
  VALUES (p_tenant_id, v_siparis, v_tutar, p_odeme->>'yontem', v_kaynak, u.id, v_zaman, u.id,
          nullif(btrim(coalesce(p_odeme->>'aciklama', '')), ''))
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = v_siparis AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_odeme_kaydet(text, text, jsonb) TO service_role;

CREATE FUNCTION public.tomnap_v2_odeme_ters_kayit(p_tenant_id text, p_user_id text, p_odeme_id uuid, p_aciklama text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  asil public.odemeler;
  o public.odemeler;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all' OR p_odeme_id IS NULL THEN
    RAISE EXCEPTION 'Invalid reversal' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(coalesce(p_aciklama, ''))) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'A reversal needs a reason' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF'
     AND rol IN ('SUPER_ADMIN', 'PATRON', 'SATIS_SORUMLUSU', 'BAKU_FINANS')
     AND (tenant_id = p_tenant_id OR rol = 'SUPER_ADMIN')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to reverse payments for this tenant' USING ERRCODE = 'PT403';
  END IF;

  SELECT * INTO asil FROM public.odemeler WHERE id = p_odeme_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'PT404'; END IF;
  -- Lock the order first: a concurrent reversal of the same payment waits here and
  -- then finds the first one.
  SELECT * INTO s FROM public.siparisler WHERE id = asil.siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF u.rol = 'SATIS_SORUMLUSU' AND (asil.kaynak <> 'BUTIK' OR asil.kaydeden_kullanici_id <> u.id) THEN
    RAISE EXCEPTION 'A sales user reverses only its own boutique payments' USING ERRCODE = 'PT403';
  END IF;
  IF asil.ters_kayit_odeme_id IS NOT NULL
     OR asil.kasa_teslim_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.odemeler r WHERE r.ters_kayit_odeme_id = asil.id) THEN
    RAISE EXCEPTION 'Payment is a reversal, handed over or already reversed' USING ERRCODE = 'PT409';
  END IF;

  INSERT INTO public.odemeler(tenant_id, siparis_id, tutar_azn, yontem, kaynak, alan_kullanici_id,
                              alma_zamani, kaydeden_kullanici_id, aciklama, ters_kayit_odeme_id)
  VALUES (p_tenant_id, asil.siparis_id, -asil.tutar_azn, asil.yontem, asil.kaynak, asil.alan_kullanici_id,
          now(), u.id, btrim(p_aciklama), asil.id)
  RETURNING * INTO o;
  SELECT * INTO s FROM public.siparisler WHERE id = asil.siparis_id AND tenant_id = p_tenant_id;
  RETURN jsonb_build_object('odeme', to_jsonb(o), 'siparis', jsonb_build_object(
    'id', s.id, 'toplam_tutar', s.toplam_tutar, 'alinan_tutar', s.alinan_tutar,
    'kalan_tutar', s.kalan_tutar, 'finans_durumu', s.finans_durumu));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_odeme_ters_kayit(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_odeme_ters_kayit(text, text, uuid, text) TO service_role;

COMMIT;
