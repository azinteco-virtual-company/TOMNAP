import { Router, Request } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { assertTenantImageReferences } from './gorsel';
import { PublicResourceError } from '../services/publicFetch';
import { Type } from '@google/genai';
import { GEMINI_API_KEY } from '../config';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import {
  hazirlaSupabasePayload,
  formatlaSiparis,
  siparisEkVerileriniAl,
} from '../services/siparisFormatlama';
import {
  onayBekleyenler,
  siparislerVeritabani,
  demoSiparislerVeritabani,
  musterilerVeritabani,
} from '../services/state';
import { OnayBekleyenKaydi } from '../types';

const router = Router();
const rowTenant = (row: any): string => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler)
    ? row.eksik_bilgiler
        .filter((item: any) => typeof item === 'string' && item.startsWith('META:tenant_id='))
        .at(-1)
    : undefined;
  return legacy?.slice('META:tenant_id='.length) || 'kanada_shopper_baku';
};
const belongs = (row: any, tenant: string) => tenant === 'all' || rowTenant(row) === tenant;
function tenantFor(req: Request, mutation = false): string {
  const tenant = (req as any).tenantId;
  if (!tenant || (mutation && tenant === 'all'))
    throw new PublicResourceError('Bir butik seçilmelidir.', 400);
  return tenant;
}
const dbActive = (tenant: string) => !!supabase && tenant !== 'demo_sandbox';
const inboxFailure = (res: any, error: any) =>
  res.status(error instanceof PublicResourceError ? error.status : 503).json({
    basarili: false,
    hata:
      error instanceof PublicResourceError ? error.message : 'Gelen kutusu işlemi tamamlanamadı.',
  });
type InboxItem = OnayBekleyenKaydi & { onaylanan_siparis_id?: string | null };
const mappedInbox = (row: any): InboxItem => ({
  ...row,
  gelis_tarihi: row.gelis_tarihi || row.olusturma_tarihi,
  oneri_siparis: { ...(row.oneri_siparis || {}), tenant_id: rowTenant(row) },
});
async function ownedInbox(tenant: string, id: string) {
  if (dbActive(tenant)) {
    const { data, error } = await supabase
      .from('inbox_mesajlar')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant)
      .maybeSingle();
    if (error) throw new PublicResourceError('Mesaj okunamadı.', 503);
    return data && belongs(data, tenant) ? mappedInbox(data) : undefined;
  }
  return onayBekleyenler.find((m) => m.id === id && belongs(m, tenant)) as InboxItem | undefined;
}

// GET /api/inbox — Onay Bekleyen Gelen Kutusu Listele
router.get('/inbox', async (req, res) => {
  try {
    const tenant = tenantFor(req);
    let messages: OnayBekleyenKaydi[];
    if (dbActive(tenant)) {
      let query = supabase.from('inbox_mesajlar').select('*');
      if (tenant !== 'all') query = query.eq('tenant_id', tenant);
      const { data, error } = await query;
      if (error) throw new PublicResourceError('Gelen kutusu okunamadı.', 503);
      messages = (data || []).filter((m) => belongs(m, tenant)).map(mappedInbox);
    } else messages = onayBekleyenler.filter((m) => belongs(m, tenant)).map(mappedInbox);
    res.json({
      basarili: true,
      toplam: messages.filter((m) => m.durum === 'BEKLEMEDE').length,
      mesajlar: messages,
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});

// POST /api/webhook/siparis — Webhook Simülasyonu / Canlı Webhook Uç Noktası
router.post('/webhook/siparis', async (req, res) => {
  try {
    const hedefTenantId = tenantFor(req, true);
    const { mesaj, gonderen, kaynak, tetikleyici_kod } = req.body;

    if (!mesaj || typeof mesaj !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Mesaj metni zorunludur.' });
    }

    // Tetikleyici kontrolü: Eğer #SİPARİŞ, #ONAY, #KNB geçmiyorsa isteğe bağlı uyarı veya doğrudan onay havuzuna atma
    const metin = mesaj.toUpperCase();
    const bulunanKod =
      tetikleyici_kod ||
      (metin.includes('#SİPARİŞ') || metin.includes('#SIPARIS')
        ? '#SİPARİŞ'
        : metin.includes('#ONAY')
          ? '#ONAY'
          : metin.includes('#KNB')
            ? '#KNB'
            : 'MANUEL');

    // Gemini ile mesaj geçmişini ayrıştır
    let aiSonuc: any = null;
    if (GEMINI_API_KEY) {
      try {
        const ai = getGeminiClient();
        const prompt = `Aşağıdaki müşteri ile satıcı arasındaki sohbet geçmişini oku. Konuşmadaki pazarlık veya alternatif konuşmaları eleyerek EN SON ÜZERİNDE ANLAŞILAN nihai siparişi çıkar.
Sohbet: "${mesaj}"`;

        const resp = await generateContentWithRetryAndFallback(ai, {
          contents: prompt,
          config: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                musteri_adi: { type: Type.STRING },
                instagram_kullanici_adi: { type: Type.STRING },
                telefon_numarasi: { type: Type.STRING },
                teslimat_sehri: { type: Type.STRING },
                teslimat_adresi: { type: Type.STRING },
                urun_aciklamasi: { type: Type.STRING },
                beden_veya_olcu: { type: Type.STRING },
                renk: { type: Type.STRING },
                adet: { type: Type.NUMBER },
                toplam_tutar: { type: Type.NUMBER },
                alinan_tutar: { type: Type.NUMBER },
                para_birimi: { type: Type.STRING },
                baku_tahsilat_notu: { type: Type.STRING },
                eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
                ai_guven_skoru: { type: Type.NUMBER },
              },
              required: ['musteri_adi', 'urun_aciklamasi', 'toplam_tutar'],
            },
          },
        });
        aiSonuc = JSON.parse(resp.text || '{}');
      } catch (e: any) {
        console.warn('Webhook AI hatası:', e.message);
      }
    }

    if (!aiSonuc || !aiSonuc.urun_aciklamasi) {
      aiSonuc = {
        musteri_adi: gonderen || 'Yeni Müşteri',
        instagram_kullanici_adi: gonderen?.startsWith('@') ? gonderen : '',
        telefon_numarasi: gonderen?.includes('+') ? gonderen : '',
        teslimat_sehri: 'Bakü',
        teslimat_adresi: '',
        urun_aciklamasi: 'Sohbetten gelen sipariş',
        beden_veya_olcu: '',
        renk: '',
        adet: 1,
        toplam_tutar: 0,
        alinan_tutar: 0,
        kalan_tutar: 0,
        para_birimi: 'AZN',
        finans_durumu: 'BEKLIYOR',
        lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
        baku_tahsilat_notu: '',
        eksik_bilgiler: ['toplam_tutar'],
        ai_guven_skoru: 0.85,
      };
    } else {
      const alinan = Number(aiSonuc.alinan_tutar || 0);
      const toplam = Number(aiSonuc.toplam_tutar || alinan);
      aiSonuc.alinan_tutar = alinan;
      aiSonuc.toplam_tutar = toplam;
      aiSonuc.kalan_tutar = Math.max(0, toplam - alinan);
      aiSonuc.para_birimi = aiSonuc.para_birimi || 'AZN';
      aiSonuc.finans_durumu =
        alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR';
      aiSonuc.lojistik_durumu = 'KANADA_SATINALIM_BEKLIYOR';
    }

    const yeniInbox: OnayBekleyenKaydi = {
      id: 'inbox-' + randomUUID(),
      gelis_tarihi: new Date().toISOString(),
      kaynak: kaynak || 'INSTAGRAM_DM',
      gonderen_kullanici:
        gonderen || aiSonuc.instagram_kullanici_adi || aiSonuc.musteri_adi || '@musteri',
      konusma_gecmisi: mesaj,
      tetikleyici_kod: bulunanKod as any,
      oneri_siparis: {
        ...aiSonuc,
        tenant_id: hedefTenantId,
      },
      durum: 'BEKLEMEDE',
      tenant_id: hedefTenantId,
    };

    if (dbActive(hedefTenantId)) {
      try {
        const { error } = await supabase.from('inbox_mesajlar').insert({
          id: yeniInbox.id,
          tenant_id: hedefTenantId,
          gonderen_kullanici: yeniInbox.gonderen_kullanici,
          kaynak: yeniInbox.kaynak,
          konusma_gecmisi: yeniInbox.konusma_gecmisi,
          durum: yeniInbox.durum,
          oneri_siparis: yeniInbox.oneri_siparis,
        });
        if (error) throw error;
      } catch (sbErr) {
        throw new PublicResourceError('Mesaj kaydedilemedi.', 503);
      }
    }

    if (!dbActive(hedefTenantId)) onayBekleyenler.unshift(yeniInbox);
    res.json({
      basarili: true,
      mesaj: 'Mesaj tetikleyici ile yakalandı ve onay bekleyenler havuzuna eklendi.',
      inbox: yeniInbox,
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});

function approvalOrderId(tenantId: string, inboxId: string): string {
  const hash = createHash('sha256')
    .update(tenantId + ':' + inboxId)
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function transitionFailure(error: { code?: string } | null): never {
  const status =
    error?.code === 'PT404'
      ? 404
      : error?.code === 'PT409'
        ? 409
        : ['PT400', '22P02', '22003', '23514', '23502'].includes(error?.code || '')
          ? 400
          : 503;
  throw new PublicResourceError(
    status === 404
      ? 'Mesaj bulunamadı.'
      : status === 409
        ? 'Mesaj kararı değiştirilemez veya onaylı sipariş artık yok.'
        : status === 400
          ? 'Geçersiz sipariş verisi.'
          : 'Mesaj kararı kaydedilemedi.',
    status
  );
}

async function approveDatabase(
  tenantId: string,
  inboxId: string,
  orderId: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('tomnap_approve_inbox', {
    p_tenant_id: tenantId,
    p_inbox_id: inboxId,
    p_order_id: orderId,
    p_order_payload: payload,
  });
  if (error) transitionFailure(error);
  if (
    !data?.siparis?.id ||
    data.siparis.tenant_id !== tenantId ||
    typeof data.tekrar !== 'boolean'
  ) {
    throw new PublicResourceError('Mesaj kararı doğrulanamadı.', 503);
  }
  return { siparis: formatlaSiparis(data.siparis), tekrar: data.tekrar };
}

function approvedMemory(item: InboxItem, tenantId: string, orderId: string) {
  const pool = tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
  const stored = pool.find(
    (row) => row.id === (item.onaylanan_siparis_id || orderId) && belongs(row, tenantId)
  );
  if (!stored) throw new PublicResourceError('Onaylı sipariş artık mevcut değil.', 409);
  return { siparis: formatlaSiparis(stored), tekrar: true };
}

const approvedResponse = (res: any, result: { siparis: any; tekrar: boolean }) =>
  res.json({
    basarili: true,
    mesaj: 'Sipariş onaylandı ve resmi sipariş tablosuna aktarıldı.',
    ...result,
  });

// POST /api/inbox/:id/onayla — One transaction decides and creates the order.
router.post('/inbox/:id/onayla', async (req, res) => {
  try {
    const tenantId = tenantFor(req, true);
    const { id } = req.params;
    const inboxItem = await ownedInbox(tenantId, id);
    if (!inboxItem) throw new PublicResourceError('Inbox mesajı bulunamadı.', 404);
    const orderId = approvalOrderId(tenantId, id);
    if (inboxItem.durum === 'ONAYLANDI') {
      // Retry returns the original committed order; edited retry bodies never
      // create a replacement or overwrite the first decision.
      return approvedResponse(
        res,
        dbActive(tenantId)
          ? await approveDatabase(tenantId, id, orderId, {})
          : approvedMemory(inboxItem, tenantId, orderId)
      );
    }
    if (inboxItem.durum !== 'BEKLEMEDE')
      throw new PublicResourceError('Mesaj daha önce reddedildi.', 409);
    const submitted = req.body.duzeltilmis_siparis || inboxItem.oneri_siparis;
    if (!submitted || typeof submitted !== 'object' || Array.isArray(submitted))
      throw new PublicResourceError('Geçersiz sipariş verisi.', 400);
    // Hydrate only known business fields before validating references. A nested
    // customer or invoice image must pass the same tenant checks as a direct edit.
    const extras = siparisEkVerileriniAl(submitted);
    const siparisVerisi = { ...submitted, ...extras };
    if (
      (siparisVerisi.tenant_id && siparisVerisi.tenant_id !== tenantId) ||
      (siparisVerisi.tenantId && siparisVerisi.tenantId !== tenantId)
    )
      throw new PublicResourceError('Sipariş başka butike taşınamaz.', 403);
    await assertTenantImageReferences(req, siparisVerisi);
    if (siparisVerisi.musteri_id) {
      let customer: any;
      if (dbActive(tenantId)) {
        const { data, error } = await supabase
          .from('musteriler')
          .select('id')
          .eq('id', siparisVerisi.musteri_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();
        if (error) throw new PublicResourceError('Müşteri doğrulanamadı.', 503);
        customer = data;
      } else
        customer = musterilerVeritabani.find(
          (m) => m.id === siparisVerisi.musteri_id && belongs(m, tenantId)
        );
      if (!customer) throw new PublicResourceError('Müşteri bulunamadı.', 404);
    }

    const alinan = Number(siparisVerisi.alinan_tutar || 0);
    const toplam = Number(siparisVerisi.toplam_tutar || alinan);
    const adet = Number(siparisVerisi.adet ?? 1);
    const kalan = Math.max(0, toplam - alinan);
    if (
      !Number.isFinite(toplam) ||
      !Number.isFinite(alinan) ||
      toplam < 0 ||
      alinan < 0 ||
      !Number.isInteger(adet) ||
      adet <= 0
    )
      throw new PublicResourceError('Geçersiz tutar veya adet.', 400);
    const dbPayload = {
      ek_veriler: extras,
      tenant_id: tenantId,
      is_demo: tenantId === 'demo_sandbox',
      ham_mesaj: inboxItem.konusma_gecmisi,
      siparis_kaynagi: inboxItem.kaynak,
      musteri_adi: siparisVerisi.musteri_adi || 'Müşteri',
      instagram_kullanici_adi: siparisVerisi.instagram_kullanici_adi || '',
      telefon_numarasi: siparisVerisi.telefon_numarasi || '',
      teslimat_sehri: siparisVerisi.teslimat_sehri || 'Bakü',
      teslimat_adresi: siparisVerisi.teslimat_adresi || '',
      urun_aciklamasi: siparisVerisi.urun_aciklamasi || 'Ürün',
      beden_veya_olcu: siparisVerisi.beden_veya_olcu || '',
      renk: siparisVerisi.renk || '',
      adet,
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: siparisVerisi.para_birimi || 'AZN',
      finans_durumu:
        siparisVerisi.finans_durumu ||
        (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: siparisVerisi.lojistik_durumu || 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: siparisVerisi.baku_tahsilat_notu || '',
      eksik_bilgiler: Array.isArray(siparisVerisi.eksik_bilgiler)
        ? siparisVerisi.eksik_bilgiler.filter(
            (v: any) => typeof v === 'string' && !v.startsWith('META:')
          )
        : [],
      ai_guven_skoru: Number(siparisVerisi.ai_guven_skoru || 0.98),
    };

    if (dbActive(tenantId)) {
      return approvedResponse(
        res,
        await approveDatabase(tenantId, id, orderId, hazirlaSupabasePayload(dbPayload))
      );
    }
    // All validations above can yield. Re-read the live row and decision now,
    // then mutate synchronously so approve/reject cannot overwrite one another.
    const current = onayBekleyenler.find((item) => item.id === id && belongs(item, tenantId)) as
      InboxItem | undefined;
    if (!current) throw new PublicResourceError('Inbox mesajı bulunamadı.', 404);
    if (current.durum === 'ONAYLANDI')
      return approvedResponse(res, approvedMemory(current, tenantId, orderId));
    if (current.durum !== 'BEKLEMEDE')
      throw new PublicResourceError('Mesaj daha önce reddedildi.', 409);
    const pool = tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
    let stored = pool.find((row) => row.id === orderId && belongs(row, tenantId));
    const tekrar = !!stored;
    if (!stored) {
      stored = formatlaSiparis({
        id: orderId,
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        kalan_tutar: kalan,
      });
      pool.unshift(stored);
    }
    current.durum = 'ONAYLANDI';
    current.onaylanan_siparis_id = stored.id;
    return approvedResponse(res, { siparis: stored, tekrar });
  } catch (error) {
    inboxFailure(res, error);
  }
});

router.post('/inbox/:id/reddet', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    if (dbActive(tenant)) {
      const { data, error } = await supabase.rpc('tomnap_reject_inbox', {
        p_tenant_id: tenant,
        p_inbox_id: req.params.id,
      });
      if (error) transitionFailure(error);
      if (data?.durum !== 'REDDEDILDI' || typeof data.tekrar !== 'boolean')
        throw new PublicResourceError('Mesaj kararı doğrulanamadı.', 503);
      return res.json({
        basarili: true,
        mesaj: 'Mesaj reddedildi/arşivlendi.',
        tekrar: data.tekrar,
      });
    }
    // No await between reading the state and writing the rejection.
    const inbox = onayBekleyenler.find(
      (item) => item.id === req.params.id && belongs(item, tenant)
    );
    if (!inbox) throw new PublicResourceError('Mesaj bulunamadı.', 404);
    if (inbox.durum === 'REDDEDILDI')
      return res.json({ basarili: true, mesaj: 'Mesaj reddedildi/arşivlendi.', tekrar: true });
    if (inbox.durum !== 'BEKLEMEDE')
      throw new PublicResourceError('Mesaj daha önce onaylandı.', 409);
    inbox.durum = 'REDDEDILDI';
    return res.json({ basarili: true, mesaj: 'Mesaj reddedildi/arşivlendi.', tekrar: false });
  } catch (error) {
    inboxFailure(res, error);
  }
});
export default router;
