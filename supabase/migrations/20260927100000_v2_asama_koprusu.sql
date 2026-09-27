-- v2 lojistik aşama köprüsü (GEÇİCİ; OPEN_QUESTIONS 38). Yalnız yeni bir fonksiyon.
--
-- K20'ye göre v2 siparişinin lojistik aşaması birim ekseninden türetilecek (Faz B–C). O
-- gelene kadar v2 siparişini ilerletecek bir yol yoktu: eski düzenleme bu kolonu v2'de
-- reddeder (migration 16), canlı kargo takibi de AWB'siz v2 siparişine dokunmaz. Bu
-- yüzden kurye nakdi, kasa teslimi ve Q4 uçtan uca çalışamıyordu (Deploy 2 denemesi).
--
-- tomnap_v2_asama_ilerlet: v2 siparişini yalnız BİR SONRAKİ aşamaya taşır:
--   KANADA_SATINALIM_BEKLIYOR → KANADA_DEPO → ULUSLARARASI_KARGO → BAKU_DAGITIM_ARKADAS.
--   * Geri alma ve atlama yok; TESLIM_EDILDI yazılmaz (kurye teslim akışı yazar).
--   * Çağıran mevcut aşamayı (p_beklenen_asama) verir; satır kilidinden sonra uyuşmazsa
--     PT409 (eşzamanlı iki ilerletmeden biri kazanır).
--   * Roller v1 gruplarından: Kanada ve kargo adımları SHIPPING (PATRON ve satın
--     almacılar), Bakü dağıtımına geçiş COURIER_ASSIGN (PATRON, KANADA_SATINALMA).
--     SUPER_ADMIN ekip üyesi değil, hiçbir geçişi yapamaz. src/shared/v2Asama.ts aynı kural.
--   * Her adım ek_veriler.islem_gecmisi'ne eklenir: kim, ne zaman, eski -> yeni.
-- Faz C'de birim ekseni gelince bu fonksiyon birimi olan siparişi reddedecek, sonra
-- kaldırılacak. Fonksiyon gövdesi ASCII: kodlama kalkanı (DEPLOY_1 b) gövdeleri tarar.
-- Geri alma: supabase/rollbacks/20260927100000_v2_asama_koprusu.down.sql
BEGIN;

CREATE FUNCTION public.tomnap_v2_asama_ilerlet(p_tenant_id text, p_user_id text, p_siparis_id uuid,
                                               p_beklenen_asama text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  u public.kullanicilar;
  s public.siparisler;
  -- TEMPORARY bridge until the unit axis (Phase C) derives the stage of a v2 order.
  sira constant text[] := ARRAY['KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO', 'ULUSLARARASI_KARGO',
                                'BAKU_DAGITIM_ARKADAS'];
  v_eski text;
  v_yeni text;
  v_konum int;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$' OR p_tenant_id = 'all'
     OR p_siparis_id IS NULL OR p_beklenen_asama IS NULL THEN
    RAISE EXCEPTION 'Invalid stage step' USING ERRCODE = '22023';
  END IF;
  -- A team member of this boutique in a role of the v1 SHIPPING group; SUPER_ADMIN is
  -- not a team member and never matches.
  SELECT * INTO u FROM public.kullanicilar
   WHERE id = p_user_id AND durum = 'AKTIF' AND tenant_id = p_tenant_id
     AND rol IN ('PATRON', 'KANADA_SATINALMA', 'ABD_SATINALMA')
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not allowed to move orders of this tenant' USING ERRCODE = 'PT403';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.firmalar f
                  WHERE f.id = p_tenant_id AND (f.onay_durumu IS NULL OR f.onay_durumu = 'AKTIF')) THEN
    RAISE EXCEPTION 'Company unavailable' USING ERRCODE = 'PT403';
  END IF;

  -- The lock makes a concurrent step finish first; the expected stage then tells.
  SELECT * INTO s FROM public.siparisler WHERE id = p_siparis_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'PT404'; END IF;
  IF s.model_surumu IS DISTINCT FROM 2 THEN
    RAISE EXCEPTION 'The stage bridge moves v2 orders only' USING ERRCODE = 'PT409';
  END IF;
  v_eski := s.lojistik_durumu::text;
  IF v_eski IS DISTINCT FROM p_beklenen_asama THEN
    RAISE EXCEPTION 'Order stage changed meanwhile' USING ERRCODE = 'PT409';
  END IF;
  v_konum := array_position(sira, v_eski);
  IF v_konum IS NULL OR v_konum = array_length(sira, 1) THEN
    RAISE EXCEPTION 'No next stage for this order here' USING ERRCODE = 'PT409';
  END IF;
  v_yeni := sira[v_konum + 1];
  -- The Baku step is the v1 COURIER_ASSIGN group: PATRON and KANADA_SATINALMA.
  IF v_yeni = 'BAKU_DAGITIM_ARKADAS' AND u.rol NOT IN ('PATRON', 'KANADA_SATINALMA') THEN
    RAISE EXCEPTION 'Not allowed to hand this order to Baku distribution' USING ERRCODE = 'PT403';
  END IF;

  UPDATE public.siparisler SET
    lojistik_durumu = v_yeni::public.lojistik_durumu_enum,
    guncellenme_tarihi = now(),
    ek_veriler = jsonb_set(ek_veriler, '{islem_gecmisi}',
      (CASE WHEN jsonb_typeof(ek_veriler->'islem_gecmisi') = 'array'
            THEN ek_veriler->'islem_gecmisi' ELSE '[]'::jsonb END)
      || jsonb_build_array(jsonb_build_object(
           'tarih', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'yapan_rol', u.rol,
           'yapan_kisi', u.id,
           'eylem', 'V2_ASAMA_ILERLETILDI',
           'aciklama', v_eski || ' -> ' || v_yeni)))
   WHERE id = s.id AND tenant_id = p_tenant_id
  RETURNING * INTO s;
  RETURN jsonb_build_object('siparis', jsonb_build_object(
    'id', s.id, 'tenant_id', s.tenant_id, 'lojistik_durumu', s.lojistik_durumu,
    'onceki_asama', v_eski));
END $$;
REVOKE ALL ON FUNCTION public.tomnap_v2_asama_ilerlet(text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomnap_v2_asama_ilerlet(text, text, uuid, text) TO service_role;
COMMENT ON FUNCTION public.tomnap_v2_asama_ilerlet(text, text, uuid, text) IS
  'TEMPORARY v2 stage bridge (OPEN_QUESTIONS 38): one step forward until the unit axis '
  'derives the stage (Phase C); then it refuses orders with units and is removed.';

COMMIT;
