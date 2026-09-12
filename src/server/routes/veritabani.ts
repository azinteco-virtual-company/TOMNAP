import { Router } from 'express';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
import { siparislerVeritabani, setSiparislerVeritabani } from '../services/state';
import { BASLANGIC_SIPARISLER } from '../../data/ornek-siparisler';

const router = Router();

// GET /api/veritabani/durum — Veritabanı Durumu & Rejim İnceleme
router.get('/veritabani/durum', async (req, res) => {
  let supabaseBagli = false;
  let toplamKayit = 0;
  let demoKayitSayisi = 0;
  let canliKayitSayisi = 0;
  let hata: string | null = null;

  try {
    let siparisler: any[] = [];
    if (supabase) {
      const { data, error } = await supabase.from('siparisler').select('*');
      if (error) {
        hata = error.message;
      } else if (data) {
        supabaseBagli = true;
        siparisler = data.map(s => formatlaSiparis(s));
      }
    }
    if (!supabaseBagli) {
      siparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    toplamKayit = siparisler.length;
    demoKayitSayisi = siparisler.filter(s => s.is_demo !== false).length;
    canliKayitSayisi = siparisler.filter(s => s.is_demo === false).length;

    const firmaDagilimi: Record<string, number> = {};
    for (const s of siparisler) {
      const tid = s.tenant_id || 'kanada_shopper_baku';
      firmaDagilimi[tid] = (firmaDagilimi[tid] || 0) + 1;
    }

    res.json({
      basarili: true,
      supabase_bagli: supabaseBagli,
      kaynak: supabaseBagli ? 'supabase' : 'bellek',
      toplam_siparis: toplamKayit,
      demo_siparis_sayisi: demoKayitSayisi,
      canli_siparis_sayisi: canliKayitSayisi,
      rejim: toplamKayit === 0 ? 'TEMIZ_CANLI' : (demoKayitSayisi > 0 ? 'DEMO_MODU' : 'CANLI_MODU'),
      firma_dagilimi: firmaDagilimi,
      hata,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// POST /api/veritabani/temizle — Canlıya Geç / Bütün Demo Verilerini Temizle (Clean Live Mode)
router.post('/veritabani/temizle', async (req, res) => {
  try {
    let silinenAdet = 0;
    if (supabase) {
      const { data, error } = await supabase.from('siparisler').delete().neq('adet', -999999).select('id');
      if (error) {
        console.error('Supabase temizleme hatası:', error.message);
        return res.status(500).json({ basarili: false, hata: 'Supabase temizlenemedi: ' + error.message });
      }
      silinenAdet = data?.length || 0;
    }

    silinenAdet = Math.max(silinenAdet, siparislerVeritabani.length);
    setSiparislerVeritabani([]);

    console.log(`🧹 Veritabanı temizlendi. Toplam silinen: ${silinenAdet}`);
    res.json({
      basarili: true,
      mesaj: 'Verilənlər bazası uğurla təmizləndi. Sistem canlı müştəri sifarişlərini qəbul etməyə tam hazırdır!',
      silinen_adet: silinenAdet,
      toplam: 0,
    });
  } catch (err: any) {
    console.error('Temizleme istisnası:', err);
    res.status(500).json({ basarili: false, hata: 'Temizleme işlemi başarısız: ' + err.message });
  }
});

// POST /api/veritabani/demo-yukle — Demo Verilerini Geri Yükle (Təqdimat / Sınaq Rejimi)
router.post('/veritabani/demo-yukle', async (req, res) => {
  try {
    if (supabase) {
      await supabase.from('siparisler').delete().neq('adet', -999999);
    }
    setSiparislerVeritabani([]);

    const eklenecekler = BASLANGIC_SIPARISLER.map(s => ({
      ...s,
      tenant_id: s.tenant_id || 'kanada_shopper_baku',
      is_demo: true,
    }));

    if (supabase) {
      const chunkSize = 30;
      for (let i = 0; i < eklenecekler.length; i += chunkSize) {
        const chunk = eklenecekler.slice(i, i + chunkSize);
        const sbChunk = chunk.map(item => hazirlaSupabasePayload(item));
        const { error } = await supabase.from('siparisler').insert(sbChunk);
        if (error) {
          console.error(`Supabase batch ${i} yükleme hatası:`, error.message);
        }
      }
    }

    setSiparislerVeritabani([...eklenecekler]);

    console.log(`✅ Demo verileri yüklendi: ${eklenecekler.length} sipariş.`);
    res.json({
      basarili: true,
      mesaj: `${eklenecekler.length} demo sifariş, tarixi qrafiklər və logistika qeydləri bazaya uğurla bərpa edildi!`,
      toplam: eklenecekler.length,
      kaynak: supabase ? 'supabase' : 'bellek',
    });
  } catch (err: any) {
    console.error('Demo yükleme istisnası:', err);
    res.status(500).json({ basarili: false, hata: 'Demo yükleme başarısız: ' + err.message });
  }
});

// GET /api/veritabani/yedek-al — Veritabanı Yedeğini İndir (JSON Export)
router.get('/veritabani/yedek-al', async (req, res) => {
  try {
    let siparisler: any[] = [];
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').order('olusturma_tarihi', { ascending: false });
      if (data) {
        siparisler = data.map(s => formatlaSiparis(s));
      }
    }
    if (siparisler.length === 0) {
      siparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    const yedekPaketi = {
      proje: 'Kanada Shopper Baku ERP',
      tarih: new Date().toISOString(),
      versiyon: '2.0-saas',
      toplam_siparis: siparisler.length,
      siparisler,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=knb_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.json(yedekPaketi);
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: 'Yedek oluşturulamadı: ' + err.message });
  }
});

// POST /api/veritabani/yedek-yukle — Veritabanı Yedeğini Geri Yükle (JSON Import)
router.post('/veritabani/yedek-yukle', async (req, res) => {
  try {
    const { siparisler, temizleVeYukle = true } = req.body;
    if (!Array.isArray(siparisler) || siparisler.length === 0) {
      return res.status(400).json({ basarili: false, hata: 'Geçerli bir sipariş listesi bulunamadı.' });
    }

    if (temizleVeYukle) {
      if (supabase) {
        await supabase.from('siparisler').delete().neq('adet', -999999);
      }
      setSiparislerVeritabani([]);
    }

    if (supabase) {
      const chunkSize = 25;
      for (let i = 0; i < siparisler.length; i += chunkSize) {
        const chunk = siparisler.slice(i, i + chunkSize);
        const sbChunk = chunk.map(s => hazirlaSupabasePayload(s));
        const { error } = await supabase.from('siparisler').insert(sbChunk);
        if (error) console.error('Yedek yükleme chunk hatası:', error.message);
      }
    }

    const formatlanmis = siparisler.map(s => formatlaSiparis(s));
    setSiparislerVeritabani(temizleVeYukle ? [...formatlanmis] : [...formatlanmis, ...siparislerVeritabani]);

    res.json({
      basarili: true,
      mesaj: `${siparisler.length} sifariş uğurla bazaya idxal edildi və bərpa olundu!`,
      toplam: siparisler.length,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: 'Yedek yükleme başarısız: ' + err.message });
  }
});

// Eski rotayla geriye dönük uyumluluk
router.post('/ornek-verileri-yukle', async (req, res) => {
  res.redirect(307, '/api/veritabani/demo-yukle');
});

export default router;
