-- Human-confirmed manifest AWB matching (application flag FF_V2_FLOW).
-- The application only SUGGESTS matches; this function writes AWB codes solely
-- for pairs a user explicitly confirmed, and only if every pair passes:
--   * the order belongs to p_tenant_id (service_role bypasses RLS),
--   * the order is not delivered (TESLIM_EDILDI),
--   * the order has no AWB yet (an existing AWB is never overwritten),
--   * no other order of the tenant already carries this AWB.
-- Any rejected pair leaves every selected order unchanged (all-or-nothing).
-- Rollback without DROP: supabase/rollbacks/20260923023659_awb_match_confirmation.down.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.tomnap_confirm_awb_matches(p_tenant_id text, p_matches jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  item jsonb;
  holders jsonb;
  current_order public.siparisler;
  next_order public.siparisler;
  current_awb text;
  awb text;
  rejected jsonb := '[]'::jsonb;
  applied jsonb := '[]'::jsonb;
  pending jsonb := '[]'::jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR jsonb_typeof(p_matches) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid AWB confirmation' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_matches) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid AWB confirmation size' USING ERRCODE = '22023';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object'
       OR jsonb_typeof(item->'siparisId') IS DISTINCT FROM 'string'
       OR jsonb_typeof(item->'takipNo') IS DISTINCT FROM 'string'
       OR coalesce(jsonb_typeof(item->'agirlikKg'), 'null') NOT IN ('null', 'number') THEN
      RAISE EXCEPTION 'Invalid AWB confirmation item' USING ERRCODE = '22023';
    END IF;
    -- AWB codes arrive normalized by the application (uppercase, no whitespace).
    IF item->>'siparisId' !~ '^[A-Za-z0-9_-]{1,100}$'
       OR item->>'takipNo' !~ '^[A-Z0-9][A-Z0-9-]{3,39}$' THEN
      RAISE EXCEPTION 'Invalid AWB confirmation item' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(item->'agirlikKg') = 'number' THEN
      IF (item->>'agirlikKg')::numeric <= 0 OR (item->>'agirlikKg')::numeric > 1000 THEN
        RAISE EXCEPTION 'Invalid cargo weight' USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;
  -- An ambiguous selection (one order or one AWB twice) is never resolved here.
  IF (SELECT count(*) <> count(DISTINCT lower(value->>'siparisId'))
             OR count(*) <> count(DISTINCT value->>'takipNo')
        FROM jsonb_array_elements(p_matches)) THEN
    RAISE EXCEPTION 'Duplicate order or AWB in confirmation' USING ERRCODE = '22023';
  END IF;

  -- One confirmation per tenant at a time: two concurrent requests cannot put
  -- the same AWB on two orders. Selected rows are locked in a stable order.
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
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'SIPARIS_BULUNAMADI'));
      CONTINUE;
    END IF;
    current_awb := upper(regexp_replace(normalize(coalesce(current_order.uluslararasi_kargo_kodu, ''), NFKC), '\s', '', 'g'));
    IF current_awb = awb THEN
      -- Lost-response retry: already attached, nothing to write.
      applied := applied || jsonb_build_array(jsonb_build_object(
        'siparisId', item->>'siparisId', 'takipNo', awb, 'tekrar', true));
    ELSIF current_order.lojistik_durumu::text = 'TESLIM_EDILDI' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'TESLIM_EDILDI'));
    ELSIF current_awb <> '' THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'MEVCUT_AWB',
        'mevcutAwb', current_order.uluslararasi_kargo_kodu));
    ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(holders->awb, '[]'::jsonb)) holder
                   WHERE holder <> current_order.id::text) THEN
      rejected := rejected || jsonb_build_array(jsonb_build_object(
        'siparisId', item->>'siparisId', 'takipNo', awb, 'sebep', 'AWB_BASKA_SIPARISTE'));
    ELSE
      pending := pending || jsonb_build_array(item || jsonb_build_object('orderId', current_order.id::text));
    END IF;
  END LOOP;

  IF jsonb_array_length(rejected) > 0 THEN
    RETURN jsonb_build_object('basarili', false, 'uygulananlar', '[]'::jsonb, 'reddedilenler', rejected);
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
    applied := applied || jsonb_build_array(jsonb_build_object(
      'siparisId', item->>'siparisId', 'takipNo', item->>'takipNo', 'tekrar', false));
  END LOOP;
  RETURN jsonb_build_object('basarili', true, 'uygulananlar', applied, 'reddedilenler', '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.tomnap_confirm_awb_matches(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_confirm_awb_matches(text, jsonb) TO service_role;

COMMIT;
