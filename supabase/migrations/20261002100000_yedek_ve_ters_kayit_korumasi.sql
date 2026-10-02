-- Codex R5 (2 Ekim 2026): v1 bakımı ve ters kayıt bütünlüğü. Yalnız iki fonksiyonun
-- gövdesi değişir (CREATE OR REPLACE; ad, argümanlar, dönüş türü, SECURITY INVOKER,
-- search_path ve yetkiler aynı). Tablo, kolon, yetki değişmez; veri yazılmaz.
--
-- B01 — tomnap_restore_orders (2): v1 bakım işlemleri v2 verisine hiç dokunmaz. Butikte
--   en az bir v2 siparişi (model_surumu = 2) varsa yedek yükleme (merge), temizle-yükle
--   (replace) ve temizleme (clear, OPEN_QUESTIONS 42 kararı) tamamen reddedilir (PT409 →
--   HTTP 409, kod YEDEK_V2_SIPARIS_VAR). Gelen v1 satırı bir v2 siparişinin para
--   başlığını defterden bağımsız ezemez; replace ve clear v2 siparişlerini silemez.
--   Kontrol tablo kilidinden sonra, yeniden deneme fişinden sonra, hiçbir silme ya da
--   yazmadan önce. v2'siz butikte davranış aynıdır. Aynı kural rotada ve bellek yolunda
--   da var (src/server/routes/veritabani.ts).
-- B03 — tomnap_odeme_kontrol (13): ters kayıt, asıl ödemenin alan kullanıcısını,
--   kaynağını ve yöntemini aynen taşır; farklıysa reddedilir (23514). Normal ters kayıt
--   RPC'si (tomnap_v2_odeme_ters_kayit) bu üç alanı zaten kopyalar.
-- Eski kod (57c5b95) aynı imzaları çağırır: v2'siz butikte sonuç aynı; v2'li butikte
--   v1 yükleme ve temizleme reddedilir (eski kodda 503 yanıtıyla, veri değişmeden).
-- Gövdeler yalnız ASCII: SQL Editor'a yapıştırırken kodlama bozulamaz.
-- 2, 10, 12 ya da 13 yeniden uygulanırsa 21 de ardından yeniden uygulanır.
-- Geri alma: supabase/rollbacks/20261002100000_yedek_ve_ters_kayit_korumasi.down.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.tomnap_restore_orders(
  p_tenant_id text, p_operation_id uuid, p_mode text, p_orders jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  fingerprint text;
  receipt public.order_maintenance_operations;
  item jsonb;
  cols text;
  updates text;
  result jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_id = 'all' OR p_tenant_id !~ '^[a-zA-Z0-9_-]{1,100}$'
     OR p_operation_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('merge','replace','clear')
     OR p_orders IS NULL OR jsonb_typeof(p_orders) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid restore request';
  END IF;
  IF jsonb_array_length(p_orders) > 5000 OR octet_length(p_orders::text) > 10485760
     OR (p_mode = 'clear' AND jsonb_array_length(p_orders) <> 0)
     OR (p_mode <> 'clear' AND jsonb_array_length(p_orders) = 0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid restore size';
  END IF;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant_id,'mode',p_mode,'orders',p_orders)::text,'UTF8')),'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('tomnap-maintenance:' || p_operation_id::text, 0));
  SELECT * INTO receipt FROM public.order_maintenance_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF receipt.fingerprint <> fingerprint OR receipt.tenant_id <> p_tenant_id THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Operation key already used for different request';
    END IF;
    RETURN receipt.result || '{"tekrar":true}'::jsonb;
  END IF;
  PERFORM 1 FROM public.firmalar WHERE id=p_tenant_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unknown tenant'; END IF;
  -- Reject malformed identities and tenant aliases before deleting anything.
  FOR item IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    IF jsonb_typeof(item) <> 'object' OR item->>'id' IS NULL OR item->>'id' !~* '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
       OR item->>'tenant_id' IS DISTINCT FROM p_tenant_id
       OR (item ? 'tenantId' AND item->>'tenantId' IS DISTINCT FROM p_tenant_id)
       OR NOT (item ? 'musteri_adi') OR NOT (item ? 'urun_aciklamasi') THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid order identity or tenant';
    END IF;
    IF coalesce(item->'ek_veriler'->>'musteri_id','') <> '' THEN
      PERFORM 1 FROM public.musteriler WHERE id=item->'ek_veriler'->>'musteri_id' AND tenant_id=p_tenant_id FOR KEY SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Customer outside restore scope'; END IF;
    END IF;
  END LOOP;
  IF (SELECT count(*) <> count(DISTINCT lower(value->>'id')) FROM jsonb_array_elements(p_orders)) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Duplicate order IDs';
  END IF;
  LOCK TABLE public.inbox_mesajlar IN EXCLUSIVE MODE;
  LOCK TABLE public.siparisler IN SHARE ROW EXCLUSIVE MODE;
  -- Codex R5 B01: v1 maintenance (merge, replace = clear-and-load, clear) never touches
  -- a tenant with v2 orders. The incoming row would overwrite a v2 order's money header
  -- apart from its ledger; replace and clear would delete v2 orders. Checked under the
  -- table lock (a concurrent order insert waits or is seen), after the retry receipt
  -- and before any delete or write.
  IF EXISTS (
       SELECT 1 FROM public.siparisler WHERE tenant_id=p_tenant_id AND model_surumu=2) THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='v1 restore refused: the tenant has v2 orders';
  END IF;
  IF EXISTS (SELECT 1 FROM public.siparisler s JOIN jsonb_array_elements(p_orders) x ON s.id=(x.value->>'id')::uuid WHERE s.tenant_id <> p_tenant_id) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Order identity conflict';
  END IF;
  IF p_mode='merge' AND EXISTS (SELECT 1 FROM public.siparisler s JOIN jsonb_array_elements(p_orders) x ON s.id=(x.value->>'id')::uuid) THEN
    RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='Merge would overwrite existing order';
  END IF;
  IF p_mode IN ('replace','clear') THEN
    DELETE FROM public.siparisler WHERE tenant_id=p_tenant_id
      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_orders) x WHERE (x.value->>'id')::uuid=siparisler.id);
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_orders) LOOP
    IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass AND a.attname=k AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity='')) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Unsupported order fields';
    END IF;
    -- Preserve omitted database defaults; never write generated/identity columns.
    -- Only actual table columns are interpolated, and identifiers are quoted.
    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO cols
      FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
      AND item ? a.attname;
    SELECT string_agg(format('%I = EXCLUDED.%I', a.attname, a.attname), ', ' ORDER BY a.attnum) INTO updates
      FROM pg_attribute a WHERE a.attrelid='public.siparisler'::regclass
      AND a.attnum>0 AND NOT a.attisdropped AND a.attgenerated='' AND a.attidentity=''
      AND a.attname NOT IN ('id','tenant_id') AND item ? a.attname;
    EXECUTE format('INSERT INTO public.siparisler (%s) SELECT %s FROM jsonb_populate_record(NULL::public.siparisler, $1) ON CONFLICT (id) DO UPDATE SET %s',cols,cols,updates) USING item;
  END LOOP;
  result := jsonb_build_object('toplam',jsonb_array_length(p_orders),'hedef_tenant',p_tenant_id,'tekrar',false);
  INSERT INTO public.order_maintenance_operations(operation_id,tenant_id,fingerprint,result)
    VALUES(p_operation_id,p_tenant_id,fingerprint,result);
  RETURN result;
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
    -- Codex R5 B03: a reversal keeps who received the money, its source and its method,
    -- so the courier and source totals stay right (the reversal RPC copies all three).
    IF asil.alan_kullanici_id IS DISTINCT FROM NEW.alan_kullanici_id
       OR asil.kaynak IS DISTINCT FROM NEW.kaynak OR asil.yontem IS DISTINCT FROM NEW.yontem THEN
      RAISE EXCEPTION 'A reversal keeps the receiver, source and method of its payment' USING ERRCODE = '23514';
    END IF;
    IF asil.kasa_teslim_id IS NOT NULL THEN
      RAISE EXCEPTION 'A payment handed over to the cash desk cannot be reversed' USING ERRCODE = 'PT409';
    END IF;
  END IF;
  RETURN NEW;
END $$;

COMMIT;
