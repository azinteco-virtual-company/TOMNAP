-- Append-only approval log for human-confirmed manifest AWB matches.
-- tomnap_approve_awb_matches writes the AWB and its approval row in ONE
-- transaction: if anything fails, neither the order change nor the row exists.
-- Append-only, enforced twice:
--   * privileges: UPDATE, DELETE and TRUNCATE are revoked from every API role,
--     service_role included (only SELECT and INSERT are granted);
--   * triggers: BEFORE UPDATE/DELETE (per row) and BEFORE TRUNCATE raise an
--     error, which also stops the table owner and any later accidental GRANT.
-- Provenance fields are derived by the server (it recomputes the suggestions
-- from the uploaded manifest); the approving user comes from the session and
-- is re-checked here. The earlier tomnap_confirm_awb_matches (no log) loses its
-- EXECUTE grant so no AWB write path without an approval row remains.
-- Rollback: supabase/rollbacks/20260923164650_awb_match_approvals.down.sql
BEGIN;

CREATE TABLE public.awb_match_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,100}$' AND tenant_id <> 'all'),
  siparis_id uuid NOT NULL,
  awb text NOT NULL CHECK (awb ~ '^[A-Z0-9][A-Z0-9-]{3,39}$'),
  manifest_dosya_adi text NOT NULL CHECK (char_length(manifest_dosya_adi) BETWEEN 1 AND 255),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  manifest_satir_no integer NOT NULL CHECK (manifest_satir_no BETWEEN 1 AND 100000),
  eslesme_turu text NOT NULL CHECK (eslesme_turu IN ('TELEFON', 'SIPARIS_KODU', 'ISIM')),
  isim_puani numeric(4, 3) NOT NULL CHECK (isim_puani BETWEEN 0 AND 1),
  onaylayan_kullanici_id text NOT NULL CHECK (char_length(onaylayan_kullanici_id) BETWEEN 1 AND 100),
  onay_zamani timestamptz NOT NULL DEFAULT now()
);
-- No foreign keys on purpose: the log must outlive order/company deletion and
-- must never block it (a cascading delete would contradict append-only).
CREATE INDEX awb_match_approvals_tenant_order_idx ON public.awb_match_approvals (tenant_id, siparis_id);
CREATE INDEX awb_match_approvals_tenant_awb_idx ON public.awb_match_approvals (tenant_id, awb);

ALTER TABLE public.awb_match_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.awb_match_approvals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.awb_match_approvals FROM PUBLIC, anon, authenticated, service_role;
DO $$ DECLARE column_list text; BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO column_list FROM pg_attribute
   WHERE attrelid = 'public.awb_match_approvals'::regclass AND attnum > 0 AND NOT attisdropped;
  -- Table-level REVOKE does not remove column privileges; revoke both.
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.awb_match_approvals FROM PUBLIC, anon, authenticated, service_role', column_list);
END $$;
GRANT SELECT, INSERT ON public.awb_match_approvals TO service_role;

CREATE FUNCTION public.tomnap_awb_match_approvals_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'awb_match_approvals is append-only: % is not allowed', TG_OP USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.tomnap_awb_match_approvals_append_only() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER awb_match_approvals_append_only_rows
  BEFORE UPDATE OR DELETE ON public.awb_match_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tomnap_awb_match_approvals_append_only();
CREATE TRIGGER awb_match_approvals_append_only_truncate
  BEFORE TRUNCATE ON public.awb_match_approvals
  FOR EACH STATEMENT EXECUTE FUNCTION public.tomnap_awb_match_approvals_append_only();

CREATE FUNCTION public.tomnap_approve_awb_matches(p_tenant_id text, p_user_id text, p_manifest jsonb, p_matches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  item jsonb;
  holders jsonb;
  current_order public.siparisler;
  next_order public.siparisler;
  current_awb text;
  awb text;
  written integer := 0;
  rejected jsonb := '[]'::jsonb;
  applied jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_user_id IS NULL OR p_user_id !~ '^[A-Za-z0-9_.@-]{1,100}$'
     OR jsonb_typeof(p_manifest) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_manifest->'dosyaAdi') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_manifest->'sha256') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid AWB approval' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_manifest->>'dosyaAdi') NOT BETWEEN 1 AND 255 OR p_manifest->>'dosyaAdi' ~ '[[:cntrl:]]'
     OR p_manifest->>'sha256' !~ '^[a-f0-9]{64}$' OR jsonb_array_length(p_matches) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid AWB approval' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'siparisId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'takipNo') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'satirNo') IS DISTINCT FROM 'number'
       OR jsonb_typeof(item->'eslesmeTuru') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'isimPuani') IS DISTINCT FROM 'number'
       OR coalesce(jsonb_typeof(item->'agirlikKg'), 'null') NOT IN ('null', 'number') THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    -- AWB codes arrive normalized by the application (uppercase, no whitespace).
    IF item->>'siparisId' !~ '^[A-Za-z0-9_-]{1,100}$'
       OR item->>'takipNo' !~ '^[A-Z0-9][A-Z0-9-]{3,39}$'
       OR item->>'satirNo' !~ '^[1-9][0-9]{0,5}$'
       OR item->>'eslesmeTuru' NOT IN ('TELEFON', 'SIPARIS_KODU', 'ISIM') THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    IF (item->>'satirNo')::integer > 100000 OR (item->>'isimPuani')::numeric < 0 OR (item->>'isimPuani')::numeric > 1 THEN
      RAISE EXCEPTION 'Invalid AWB approval item' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item->'agirlikKg') = 'number' THEN
      IF (item->>'agirlikKg')::numeric <= 0 OR (item->>'agirlikKg')::numeric > 1000 THEN
        RAISE EXCEPTION 'Invalid cargo weight' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- An ambiguous selection (one order, one AWB or one manifest row twice) is never resolved here.
  IF (SELECT count(*) <> count(DISTINCT lower(value->>'siparisId'))
             OR count(*) <> count(DISTINCT value->>'takipNo')
             OR count(*) <> count(DISTINCT value->>'satirNo')
        FROM jsonb_array_elements(p_matches)) THEN
    RAISE EXCEPTION 'Duplicate order, AWB or manifest row in approval' USING ERRCODE = '22023';
  END IF;
  -- Defense in depth: the approving user must be active in this tenant and allowed to set AWBs.
  IF NOT EXISTS (SELECT 1 FROM public.kullanicilar u
                  WHERE u.id = p_user_id AND u.durum = 'AKTIF'
                    AND u.rol IN ('SUPER_ADMIN', 'PATRON', 'KANADA_SATINALMA')
                    AND (u.tenant_id = p_tenant_id OR u.rol = 'SUPER_ADMIN')) THEN
    RAISE EXCEPTION 'Approving user is not allowed for this tenant' USING ERRCODE = 'PT403';
  END IF;

  -- One approval per tenant at a time: two concurrent requests cannot put the
  -- same AWB on two orders. Selected rows are locked in a stable order.
  PERFORM pg_advisory_xact_lock(hashtextextended('tomnap-awb-confirm:' || p_tenant_id, 0));
  PERFORM 1 FROM public.siparisler s
    WHERE s.tenant_id = p_tenant_id
      AND s.id::text IN (SELECT lower(value->>'siparisId') FROM jsonb_array_elements(p_matches))
    ORDER BY s.id FOR UPDATE;

  -- Current holders of the requested AWB codes inside this tenant only.
  SELECT coalesce(jsonb_object_agg(h.normalized, h.ids), '{}'::jsonb) INTO holders
    FROM (SELECT upper(regexp_replace(normalize(o.uluslararasi_kargo_kodu, NFKC), '\s', '', 'g')) AS normalized,
                 jsonb_agg(o.id::text) AS ids
            FROM public.siparisler o
           WHERE o.tenant_id = p_tenant_id AND coalesce(o.uluslararasi_kargo_kodu, '') <> ''
           GROUP BY 1) h
   WHERE h.normalized IN (SELECT value->>'takipNo' FROM jsonb_array_elements(p_matches));

  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    awb := item->>'takipNo';
    current_order := NULL;
    SELECT * INTO current_order FROM public.siparisler s
      WHERE s.tenant_id = p_tenant_id AND s.id::text = lower(item->>'siparisId');
    IF current_order.id IS NULL THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'SIPARIS_BULUNAMADI'));
      CONTINUE;
    END IF;
    current_awb := upper(regexp_replace(normalize(coalesce(current_order.uluslararasi_kargo_kodu, ''), NFKC), '\s', '', 'g'));
    IF current_awb = awb THEN
      -- Lost-response retry: already attached, nothing written, no new approval row.
      applied := applied || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'tekrar', true));
    ELSIF current_order.lojistik_durumu::text = 'TESLIM_EDILDI' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'TESLIM_EDILDI'));
    ELSIF current_awb <> '' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'MEVCUT_AWB',
        'mevcutAwb', current_order.uluslararasi_kargo_kodu));
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(holders->awb, '[]'::jsonb)) holder
                   WHERE holder <> current_order.id::text) THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'AWB_BASKA_SIPARISTE'));
    ELSE
      pending := pending || jsonb_build_array(item || jsonb_build_object('orderId', current_order.id::text));
    END IF;
  END LOOP;

  IF jsonb_array_length(rejected) > 0 THEN
    RETURN jsonb_build_object('basarili', false, 'uygulananlar', '[]'::jsonb, 'reddedilenler', rejected, 'kayitSayisi', 0);
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(pending) LOOP
    SELECT * INTO current_order FROM public.siparisler s
      WHERE s.tenant_id = p_tenant_id AND s.id::text = item->>'orderId';
    -- Existing status values are kept; only pre-flight orders move to international cargo.
    next_order := jsonb_populate_record(current_order, jsonb_build_object(
      'uluslararasi_kargo_kodu', item->>'takipNo',
      'lojistik_durumu', CASE WHEN current_order.lojistik_durumu::text IN ('KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO')
                              THEN 'ULUSLARARASI_KARGO' ELSE current_order.lojistik_durumu::text END));
    UPDATE public.siparisler SET
      uluslararasi_kargo_kodu = next_order.uluslararasi_kargo_kodu,
      lojistik_durumu = next_order.lojistik_durumu,
      ek_veriler = coalesce(current_order.ek_veriler, '{}'::jsonb)
        || CASE WHEN jsonb_typeof(item->'agirlikKg') = 'number'
                THEN jsonb_build_object('kargo_agirligi_kg', item->'agirlikKg') ELSE '{}'::jsonb END
        || jsonb_build_object('guncellenme_tarihi', now())
    WHERE id = current_order.id AND tenant_id = p_tenant_id;
    INSERT INTO public.awb_match_approvals(tenant_id, siparis_id, awb, manifest_dosya_adi, manifest_sha256,
      manifest_satir_no, eslesme_turu, isim_puani, onaylayan_kullanici_id)
    VALUES (p_tenant_id, current_order.id, item->>'takipNo', p_manifest->>'dosyaAdi', p_manifest->>'sha256',
      (item->>'satirNo')::integer, item->>'eslesmeTuru', round((item->>'isimPuani')::numeric, 3), p_user_id);
    written := written + 1;
    applied := applied || jsonb_build_array(jsonb_build_object('satirNo', (item->>'satirNo')::integer,
      'siparisId', item->>'siparisId', 'takipNo', item->>'takipNo', 'tekrar', false));
  END LOOP;
  RETURN jsonb_build_object('basarili', true, 'uygulananlar', applied, 'reddedilenler', '[]'::jsonb, 'kayitSayisi', written);
END $$;
REVOKE ALL ON FUNCTION public.tomnap_approve_awb_matches(text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_approve_awb_matches(text, text, jsonb, jsonb) TO service_role;

-- Superseded: writing an AWB without an approval row is no longer possible.
REVOKE EXECUTE ON FUNCTION public.tomnap_confirm_awb_matches(text, jsonb) FROM service_role;

COMMIT;
