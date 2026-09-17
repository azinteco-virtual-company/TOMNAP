import { Router, Request } from 'express';
import { randomUUID, createHash } from 'node:crypto';
import { assertTenantImageReferences } from './gorsel';
import { PublicResourceError } from '../services/publicFetch';
import { Type } from '@google/genai';
import { GEMINI_API_KEY } from '../config';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
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
const mappedInbox = (row: any): OnayBekleyenKaydi => ({
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
  return onayBekleyenler.find((m) => m.id === id && belongs(m, tenant));
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

// POST /api/inbox/:id/onayla — Inbox Mesajını Onayla ve Kesin Siparişe Dönüştür
router.post('/inbox/:id/onayla', async (req, res) => {
  try {
    const tenantId = tenantFor(req, true);
    const { id } = req.params;
    const inboxItem = await ownedInbox(tenantId, id);
    if (!inboxItem)
      return res.status(404).json({ basarili: false, hata: 'Inbox mesajı bulunamadı.' });
    if (inboxItem.durum !== 'BEKLEMEDE')
      return res.status(409).json({ basarili: false, hata: 'Mesaj daha önce işlendi.' });
    const siparisVerisi = req.body.duzeltilmis_siparis || inboxItem.oneri_siparis;
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
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError('Geçersiz tutar.', 400);

    const dbPayload = {
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
      adet: Number(siparisVerisi.adet || 1),
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

    // A stable UUID makes retries safe if order creation succeeds but inbox marking fails.
    const hash = createHash('sha256')
      .update(tenantId + ':' + id)
      .digest('hex');
    const orderId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
    let kesinSiparis: any;
    if (dbActive(tenantId)) {
      const { data: prior, error: lookupError } = await supabase
        .from('siparisler')
        .select('*')
        .eq('id', orderId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (lookupError) throw new PublicResourceError('Sipariş doğrulanamadı.', 503);
      if (prior) kesinSiparis = formatlaSiparis(prior);
      else {
        const { data, error } = await supabase
          .from('siparisler')
          .insert({ ...hazirlaSupabasePayload(dbPayload), id: orderId })
          .select('*')
          .single();
        if (error || !data) throw new PublicResourceError('Sipariş kaydedilemedi.', 503);
        kesinSiparis = formatlaSiparis(data);
      }
      const { data: marked, error } = await supabase
        .from('inbox_mesajlar')
        .update({ durum: 'ONAYLANDI' })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('durum', 'BEKLEMEDE')
        .select('id')
        .maybeSingle();
      if (error || !marked)
        throw new PublicResourceError('Sipariş kaydedildi ancak mesaj durumu güncellenemedi.', 503);
    } else {
      const pool = tenantId === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
      kesinSiparis = pool.find((s) => s.id === orderId && belongs(s, tenantId));
      if (!kesinSiparis) {
        kesinSiparis = formatlaSiparis({
          id: orderId,
          olusturma_tarihi: new Date().toISOString(),
          ...dbPayload,
          kalan_tutar: kalan,
        });
        pool.unshift(kesinSiparis);
      }
      inboxItem.durum = 'ONAYLANDI';
    }
    res.json({
      basarili: true,
      mesaj: 'Sipariş onaylandı ve resmi sipariş tablosuna aktarıldı.',
      siparis: kesinSiparis,
    });
  } catch (error) {
    inboxFailure(res, error);
  }
});

router.post('/inbox/:id/reddet', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const inbox = await ownedInbox(tenant, req.params.id);
    if (!inbox) return res.status(404).json({ basarili: false, hata: 'Mesaj bulunamadı.' });
    if (inbox.durum !== 'BEKLEMEDE')
      return res.status(409).json({ basarili: false, hata: 'Mesaj daha önce işlendi.' });
    if (dbActive(tenant)) {
      const { data, error } = await supabase
        .from('inbox_mesajlar')
        .update({ durum: 'REDDEDILDI' })
        .eq('id', inbox.id)
        .eq('tenant_id', tenant)
        .eq('durum', 'BEKLEMEDE')
        .select('id')
        .maybeSingle();
      if (error || !data) throw new PublicResourceError('Mesaj güncellenemedi.', 503);
    } else inbox.durum = 'REDDEDILDI';
    res.json({ basarili: true, mesaj: 'Mesaj reddedildi/arşivlendi.' });
  } catch (error) {
    inboxFailure(res, error);
  }
});
export default router;
