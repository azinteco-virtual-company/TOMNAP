import { Router } from 'express';
import { Type } from '@google/genai';
import { GEMINI_API_KEY } from '../config';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
import { onayBekleyenler, siparislerVeritabani } from '../services/state';
import { OnayBekleyenKaydi } from '../types';

const router = Router();

// GET /api/inbox — Onay Bekleyen Gelen Kutusu Listele
router.get('/inbox', (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;
  let mesajlar = onayBekleyenler;
  if (seciliTenant && seciliTenant !== 'all') {
    mesajlar = onayBekleyenler.filter(m => (m.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }
  res.json({
    basarili: true,
    toplam: mesajlar.filter(m => m.durum === 'BEKLEMEDE').length,
    mesajlar,
  });
});

// POST /api/webhook/siparis — Webhook Simülasyonu / Canlı Webhook Uç Noktası
router.post('/webhook/siparis', async (req, res) => {
  const { mesaj, gonderen, kaynak, tetikleyici_kod } = req.body;

  if (!mesaj || typeof mesaj !== 'string') {
    return res.status(400).json({ basarili: false, hata: 'Mesaj metni zorunludur.' });
  }

  // Tetikleyici kontrolü: Eğer #SİPARİŞ, #ONAY, #KNB geçmiyorsa isteğe bağlı uyarı veya doğrudan onay havuzuna atma
  const metin = mesaj.toUpperCase();
  const bulunanKod = tetikleyici_kod || (
    metin.includes('#SİPARİŞ') || metin.includes('#SIPARIS') ? '#SİPARİŞ' :
    metin.includes('#ONAY') ? '#ONAY' :
    metin.includes('#KNB') ? '#KNB' : 'MANUEL'
  );

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
    aiSonuc.finans_durumu = alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR';
    aiSonuc.lojistik_durumu = 'KANADA_SATINALIM_BEKLIYOR';
  }

  const hedefTenantId = req.body.tenant_id || 'kanada_shopper_baku';

  const yeniInbox: OnayBekleyenKaydi = {
    id: 'inbox-' + Date.now().toString(36),
    gelis_tarihi: new Date().toISOString(),
    kaynak: kaynak || 'INSTAGRAM_DM',
    gonderen_kullanici: gonderen || aiSonuc.instagram_kullanici_adi || aiSonuc.musteri_adi || '@musteri',
    konusma_gecmisi: mesaj,
    tetikleyici_kod: bulunanKod as any,
    oneri_siparis: {
      ...aiSonuc,
      tenant_id: hedefTenantId,
    },
    durum: 'BEKLEMEDE',
    tenant_id: hedefTenantId,
  };

  onayBekleyenler.unshift(yeniInbox);

  res.json({
    basarili: true,
    mesaj: 'Mesaj tetikleyici ile yakalandı ve onay bekleyenler havuzuna eklendi.',
    inbox: yeniInbox,
  });
});

// POST /api/inbox/:id/onayla — Inbox Mesajını Onayla ve Kesin Siparişe Dönüştür
router.post('/inbox/:id/onayla', async (req, res) => {
  const { id } = req.params;
  const duzeltilmisSiparis = req.body.duzeltilmis_siparis; // Kullanıcının düzenlediği son hali
  const istekTenantId = req.body.tenant_id;

  const bulunanIndex = onayBekleyenler.findIndex(m => m.id === id);
  if (bulunanIndex === -1) {
    return res.status(404).json({ basarili: false, hata: 'Inbox mesajı bulunamadı.' });
  }

  const inboxItem = onayBekleyenler[bulunanIndex];
  const siparisVerisi = duzeltilmisSiparis || inboxItem.oneri_siparis;
  const tenantId = istekTenantId || siparisVerisi.tenant_id || inboxItem.tenant_id || 'kanada_shopper_baku';

  const alinan = Number(siparisVerisi.alinan_tutar || 0);
  const toplam = Number(siparisVerisi.toplam_tutar || alinan);
  const kalan = Math.max(0, toplam - alinan);

  const dbPayload = {
    tenant_id: tenantId,
    is_demo: tenantId === 'kanada_shopper_baku' || tenantId === 'demo_sandbox',
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
    finans_durumu: siparisVerisi.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
    lojistik_durumu: siparisVerisi.lojistik_durumu || 'KANADA_SATINALIM_BEKLIYOR',
    baku_tahsilat_notu: siparisVerisi.baku_tahsilat_notu || '',
    eksik_bilgiler: Array.isArray(siparisVerisi.eksik_bilgiler) ? siparisVerisi.eksik_bilgiler : [],
    ai_guven_skoru: Number(siparisVerisi.ai_guven_skoru || 0.98),
  };

  let kesinSiparis: any = null;

  if (supabase) {
    try {
      const sbPayload = hazirlaSupabasePayload(dbPayload);
      const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
      if (!error && data) {
        kesinSiparis = formatlaSiparis(data);
      }
    } catch (err) {
      console.error('Inbox onayı Supabase hatası:', err);
    }
  }

  if (!kesinSiparis) {
    kesinSiparis = formatlaSiparis({
      id: 'sip-' + Date.now().toString(36),
      olusturma_tarihi: new Date().toISOString(),
      ...dbPayload,
      kalan_tutar: kalan,
    });
    siparislerVeritabani.unshift(kesinSiparis);
  }

  // Durumu güncelle
  onayBekleyenler[bulunanIndex].durum = 'ONAYLANDI';

  res.json({
    basarili: true,
    mesaj: 'Sipariş onaylandı ve resmi sipariş tablosuna aktarıldı.',
    siparis: kesinSiparis,
  });
});

// POST /api/inbox/:id/reddet — Inbox Mesajını Reddet / Sil
router.post('/inbox/:id/reddet', (req, res) => {
  const { id } = req.params;
  const bulunanIndex = onayBekleyenler.findIndex(m => m.id === id);
  if (bulunanIndex !== -1) {
    onayBekleyenler[bulunanIndex].durum = 'REDDEDILDI';
    return res.json({ basarili: true, mesaj: 'Mesaj reddedildi/arşivlendi.' });
  }
  res.status(404).json({ basarili: false, hata: 'Mesaj bulunamadı.' });
});

export default router;
