import { Router, Request } from 'express';
import { createHash } from 'node:crypto';
import { supabase } from '../services/supabase';
import {
  hazirlaSupabasePayload,
  formatlaSiparis,
  SUPABASE_GECERLI_KOLONLAR,
  SIPARIS_EK_ALANLAR,
} from '../services/siparisFormatlama';
import {
  siparislerVeritabani,
  setSiparislerVeritabani,
  demoSiparislerVeritabani,
  setDemoSiparislerVeritabani,
  firmalarVeritabani,
  musterilerVeritabani,
} from '../services/state';
import { BASLANGIC_SIPARISLER } from '../../data/ornek-siparisler';
import { assertTenantImageReferences } from './gorsel';
import { PublicResourceError } from '../services/publicFetch';

const router = Router();
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const localReceipts = new Map<string, { fingerprint: string; result: any }>();
const tenantOf = (row: any) => row.tenant_id || formatlaSiparis(row).tenant_id;
const localRows = (tenant: string) =>
  tenant === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
const dbActive = (tenant: string) => !!supabase && tenant !== 'demo_sandbox';
function fail(res: any, error: any) {
  const status =
    error instanceof PublicResourceError
      ? error.status
      : error?.code === '23505'
        ? 409
        : ['22023', '22P02', '23514', '23502'].includes(error?.code)
          ? 400
          : error?.code === '54000'
            ? 413
            : 503;
  res.status(status).json({
    basarili: false,
    hata:
      error instanceof PublicResourceError
        ? error.message
        : status === 409
          ? 'İşlem kimliği veya sipariş kimliği çakışıyor. Mevcut kayıtlar değiştirilmedi.'
          : status === 400
            ? 'Yedek verisi geçersiz. Mevcut kayıtlar değiştirilmedi.'
            : status === 413
              ? 'Yedek sınırı 5000 sipariş / 10 MiB. Daha büyük veri için veritabanı yedeği kullanın.'
              : 'Veritabanı işlemi doğrulanamadı. Aynı işlem kimliğiyle yeniden deneyin.',
  });
}
function concreteTenant(req: Request) {
  if (!req.tenantId || req.tenantId === 'all')
    throw new PublicResourceError('İşlem için tek bir firma seçin.', 400);
  return req.tenantId;
}
function operationKey(req: Request) {
  const key = req.body.islem_id;
  if (typeof key !== 'string' || !UUID.test(key))
    throw new PublicResourceError('Geçerli bir işlem kimliği gerekiyor.', 400);
  return key.toLowerCase();
}
function prepareRows(rows: any, tenant: string, demo = false) {
  if (
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 5000 ||
    Buffer.byteLength(JSON.stringify(rows)) > 10 * 1024 * 1024
  )
    throw new PublicResourceError(
      'Yedek 1–5000 sipariş içermeli ve 10 MiB sınırını aşmamalı.',
      400
    );
  const ids = new Set<string>();
  const supported = new Set([
    ...SUPABASE_GECERLI_KOLONLAR,
    ...SIPARIS_EK_ALANLAR,
    'id',
    'tenantId',
    'olusturma_tarihi',
    'guncellenme_tarihi',
    'kalan_tutar',
    'urunler',
    'gorsel_urlleri',
    'ozel_not',
    'birden_fazla_urun',
  ]);
  return rows.map((raw: any) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      Array.isArray(raw) ||
      typeof raw.id !== 'string' ||
      !raw.id ||
      raw.id.length > 200
    )
      throw new PublicResourceError('Her siparişin kalıcı bir kimliği olmalı.', 400);
    if (
      Object.keys(raw).some((key) => !supported.has(key)) ||
      (raw.ek_veriler &&
        (typeof raw.ek_veriler !== 'object' ||
          Array.isArray(raw.ek_veriler) ||
          Object.keys(raw.ek_veriler).some(
            (key) => !(SIPARIS_EK_ALANLAR as readonly string[]).includes(key)
          )))
    )
      throw new PublicResourceError(
        'Yedekte desteklenmeyen alan var; veri kaybını önlemek için yükleme durduruldu.',
        400
      );
    const claims = [
      raw.tenant_id,
      raw.tenantId,
      ...(Array.isArray(raw.eksik_bilgiler)
        ? raw.eksik_bilgiler
            .filter((x: any) => typeof x === 'string' && x.startsWith('META:tenant_id='))
            .map((x: string) => x.slice('META:tenant_id='.length))
        : []),
    ].filter((x) => x !== undefined);
    if (!demo && (!claims.length || claims.some((x) => x !== tenant)))
      throw new PublicResourceError('Yedek yalnızca seçili firmanın siparişlerini içermeli.', 403);
    if (
      raw.adet !== undefined &&
      (typeof raw.adet !== 'number' || !Number.isSafeInteger(raw.adet) || raw.adet <= 0)
    )
      throw new PublicResourceError('Sipariş adedi geçersiz.', 400);
    for (const field of ['toplam_tutar', 'alinan_tutar'])
      if (
        raw[field] !== undefined &&
        (typeof raw[field] !== 'number' || !Number.isFinite(raw[field]) || raw[field] < 0)
      )
        throw new PublicResourceError('Sipariş tutarı geçersiz.', 400);
    const row = formatlaSiparis(raw);
    if (
      typeof row.musteri_adi !== 'string' ||
      !row.musteri_adi.trim() ||
      typeof row.urun_aciklamasi !== 'string' ||
      !row.urun_aciklamasi.trim() ||
      !Number.isSafeInteger(row.adet) ||
      row.adet <= 0 ||
      !Number.isFinite(row.toplam_tutar) ||
      row.toplam_tutar < 0 ||
      !Number.isFinite(row.alinan_tutar) ||
      row.alinan_tutar < 0
    )
      throw new PublicResourceError('Sipariş adı, ürün, adet veya tutar geçersiz.', 400);
    if (dbActive(tenant) && !UUID.test(raw.id))
      throw new PublicResourceError(
        'Veritabanına yüklenen siparişler UUID kimliği taşımalı. Eski yerel kimlikler önce eşlenmeli.',
        400
      );
    const id = UUID.test(raw.id) ? raw.id.toLowerCase() : raw.id;
    if (ids.has(id)) throw new PublicResourceError('Yedekte tekrarlanan sipariş kimliği var.', 400);
    ids.add(id);
    const payload: any = {
      ...hazirlaSupabasePayload({
        ...row,
        tenant_id: tenant,
        is_demo: demo || tenant === 'demo_sandbox' || row.is_demo === true,
      }),
      id,
    };
    for (const field of ['olusturma_tarihi', 'guncellenme_tarihi'])
      if (raw[field] !== undefined) {
        if (typeof raw[field] !== 'string' || !Number.isFinite(Date.parse(raw[field])))
          throw new PublicResourceError('Sipariş tarihi geçersiz.', 400);
        payload[field] = new Date(raw[field]).toISOString();
      }
    return payload;
  });
}
async function maintain(
  tenant: string,
  key: string,
  mode: 'merge' | 'replace' | 'clear',
  rows: any[]
) {
  if (dbActive(tenant)) {
    const { data, error } = await supabase.rpc('tomnap_restore_orders', {
      p_tenant_id: tenant,
      p_operation_id: key,
      p_mode: mode,
      p_orders: rows,
    });
    if (error) throw error;
    if (!data || data.hedef_tenant !== tenant || typeof data.toplam !== 'number')
      throw new Error('Invalid operation receipt');
    return { ...data, kaynak: 'supabase' };
  }
  if (!firmalarVeritabani.some((f) => f.id === tenant))
    throw new PublicResourceError('Firma bulunamadı.', 404);
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ tenant, mode, rows }))
    .digest('hex');
  const receipt = localReceipts.get(key);
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      throw new PublicResourceError('İşlem kimliği başka bir istek için kullanılmış.', 409);
    return { ...receipt.result, tekrar: true };
  }
  if (localReceipts.size >= 10000)
    throw new PublicResourceError('Yerel işlem kayıt sınırına ulaşıldı.', 503);
  const current = localRows(tenant),
    ids = new Set(rows.map((r) => r.id));
  if (
    current.some(
      (r) =>
        ids.has(UUID.test(r.id) ? r.id.toLowerCase() : r.id) &&
        (mode === 'merge' || tenantOf(r) !== tenant)
    )
  )
    throw new PublicResourceError('Yükleme mevcut sipariş kimliğiyle çakışıyor.', 409);
  const normalized = rows.map((row) =>
    formatlaSiparis({ ...row, olusturma_tarihi: row.olusturma_tarihi || new Date().toISOString() })
  );
  const next = [
    ...current.filter((r) => mode === 'merge' || tenantOf(r) !== tenant),
    ...normalized,
  ];
  if (tenant === 'demo_sandbox') setDemoSiparislerVeritabani(next);
  else setSiparislerVeritabani(next);
  const result = { toplam: rows.length, hedef_tenant: tenant, tekrar: false, kaynak: 'bellek' };
  localReceipts.set(key, { fingerprint, result });
  return result;
}
router.get('/veritabani/durum', async (req, res) => {
  try {
    const tenant = req.tenantId!;
    let status: any;
    if (dbActive(tenant)) {
      const { data, error } = await supabase.rpc('tomnap_order_status', { p_tenant_id: tenant });
      if (error) throw error;
      if (!data || typeof data.toplam_siparis !== 'number') throw new Error('Invalid status');
      status = data;
    } else {
      const rows = localRows(tenant).filter((r) => tenant === 'all' || tenantOf(r) === tenant);
      status = {
        toplam_siparis: rows.length,
        demo_siparis_sayisi: rows.filter((r) => r.is_demo === true).length,
        canli_siparis_sayisi: rows.filter((r) => r.is_demo !== true).length,
        firma_dagilimi: {},
      };
      for (const row of rows)
        status.firma_dagilimi[tenantOf(row)] = (status.firma_dagilimi[tenantOf(row)] || 0) + 1;
    }
    res.json({
      basarili: true,
      ...status,
      supabase_bagli: dbActive(tenant),
      kaynak: dbActive(tenant) ? 'supabase' : 'bellek',
      rejim:
        status.toplam_siparis === 0
          ? 'TEMIZ_CANLI'
          : status.demo_siparis_sayisi > 0
            ? 'DEMO_MODU'
            : 'CANLI_MODU',
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/veritabani/temizle', async (req, res) => {
  try {
    const tenant = concreteTenant(req);
    if (req.body.onay_kodu !== `SIL:${tenant}`)
      throw new PublicResourceError(`Silmek için SIL:${tenant} onayı gerekiyor.`, 403);
    const result = await maintain(tenant, operationKey(req), 'clear', []);
    res.json({ basarili: true, ...result, mesaj: 'Seçili firmanın siparişleri temizlendi.' });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/veritabani/demo-yukle', async (req, res) => {
  try {
    const tenant = concreteTenant(req);
    if (tenant !== 'demo_sandbox')
      throw new PublicResourceError(
        'Demo verileri yalnızca demo_sandbox alanına yüklenebilir.',
        403
      );
    const rows = prepareRows(BASLANGIC_SIPARISLER, tenant, true);
    const result = await maintain(tenant, operationKey(req), 'replace', rows);
    res.json({ basarili: true, ...result, mesaj: 'Demo alanı sıfırlandı.' });
  } catch (error) {
    fail(res, error);
  }
});
router.get('/veritabani/yedek-al', async (req, res) => {
  try {
    const tenant = req.tenantId!;
    let rows: any[];
    if (dbActive(tenant)) {
      const { data, error } = await supabase.rpc('tomnap_export_orders', { p_tenant_id: tenant });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('Invalid backup');
      rows = data;
    } else rows = localRows(tenant).filter((r) => tenant === 'all' || tenantOf(r) === tenant);
    if (rows.length > 5000 || Buffer.byteLength(JSON.stringify(rows)) > 10 * 1024 * 1024)
      throw { code: '54000' };
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=tomnap_${tenant}_${new Date().toISOString().slice(0, 10)}.json`
    );
    res.json({
      proje: 'TOMNAP',
      versiyon: '3.0-orders',
      tarih: new Date().toISOString(),
      tenant_id: tenant,
      kaynak: dbActive(tenant) ? 'supabase' : 'bellek',
      toplam_siparis: rows.length,
      siparisler: rows.map(formatlaSiparis),
    });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/veritabani/yedek-yukle', async (req, res) => {
  try {
    const tenant = concreteTenant(req),
      key = operationKey(req);
    if (req.body.temizleVeYukle !== undefined && typeof req.body.temizleVeYukle !== 'boolean')
      throw new PublicResourceError('Yükleme biçimi geçersiz.', 400);
    const replace = req.body.temizleVeYukle === true;
    if (replace && req.body.onay_kodu !== `DEGISTIR:${tenant}`)
      throw new PublicResourceError(`Değiştirmek için DEGISTIR:${tenant} onayı gerekiyor.`, 403);
    const rows = prepareRows(req.body.siparisler, tenant);
    for (const row of rows) {
      const customerId = row.ek_veriler?.musteri_id;
      if (customerId !== undefined && customerId !== null && customerId !== '') {
        if (typeof customerId !== 'string')
          throw new PublicResourceError('Müşteri kimliği geçersiz.', 400);
        if (
          !dbActive(tenant) &&
          !musterilerVeritabani.some((m) => m.id === customerId && tenantOf(m) === tenant)
        )
          throw new PublicResourceError('Yedekteki müşteri seçili firmada bulunamadı.', 404);
      }
    }
    await assertTenantImageReferences(req, rows);
    const result = await maintain(tenant, key, replace ? 'replace' : 'merge', rows);
    res.json({ basarili: true, ...result, mesaj: 'Sipariş yedeği seçili firmaya yüklendi.' });
  } catch (error) {
    fail(res, error);
  }
});
router.post('/ornek-verileri-yukle', (_req, res) =>
  res.redirect(307, '/api/veritabani/demo-yukle')
);
export default router;
