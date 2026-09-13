import { Router } from 'express';
import { supabase } from '../services/supabase';
import { formatlaSiparis } from '../services/siparisFormatlama';
import { musterilerVeritabani, siparislerVeritabani } from '../services/state';
import { MusteriKaydi } from '../types';

const router = Router();

// GET /api/musteriler — Müşteriler Listesi (CRM & Müşteri Geçmişi - Tenant İzolasyonlu)
router.get('/musteriler', async (req, res) => {
  try {
    const seciliTenant = req.query.tenant_id as string | undefined;

    // 1. Tüm siparişleri topla (Supabase veya in-memory)
    let tumSiparisler: any[] = [];
    let supabaseOkundu = false;
    if (supabase) {
      try {
        let query = supabase.from('siparisler').select('*');
        if (seciliTenant && seciliTenant !== 'all') {
          query = query.eq('tenant_id', seciliTenant);
        }
        const { data, error } = await query;
        if (!error && data) {
          tumSiparisler = data.map(s => formatlaSiparis(s));
          supabaseOkundu = true;
        }
      } catch (err) {
        console.warn('Supabase siparişleri okunamadı:', err);
      }
    }
    if (!supabaseOkundu) {
      tumSiparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
    }

    // Seçili butike göre siparişleri filtrele
    const ilgiliSiparisler = (seciliTenant && seciliTenant !== 'all')
      ? tumSiparisler.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant)
      : tumSiparisler;

    // 2. Bu butik için müşteri havuzunu belirle (Supabase + In-memory senkron)
    let tumMusteriler: MusteriKaydi[] = [...musterilerVeritabani];
    if (supabase) {
      try {
        const { data: dbMusteriler, error } = await supabase.from('musteriler').select('*');
        if (!error && dbMusteriler && dbMusteriler.length > 0) {
          for (const dbm of dbMusteriler) {
            const idx = tumMusteriler.findIndex(m => m.id === dbm.id);
            if (idx !== -1) {
              tumMusteriler[idx] = { ...tumMusteriler[idx], ...dbm };
            } else {
              tumMusteriler.push(dbm);
            }
          }
        }
      } catch (sbMusteriErr) {
        // In-memory fallback
      }
    }

    let tenantMusteriListesi: MusteriKaydi[] = [];

    if (seciliTenant && seciliTenant !== 'all') {
      if (seciliTenant === 'kanada_shopper_baku' || seciliTenant === 'demo_sandbox') {
        tenantMusteriListesi = tumMusteriler.filter(m => !m.tenant_id || m.tenant_id === seciliTenant);
      } else {
        // Yeni veya özel butik: Sadece bu butik için kaydedilmiş müşteriler
        tenantMusteriListesi = tumMusteriler.filter(m => m.tenant_id === seciliTenant);
      }

      // Ayrıca bu butik için siparişi olan ama listede henüz olmayan kişileri dinamik ekle
      for (const s of ilgiliSiparisler) {
        if (!s.musteri_adi) continue;
        const telNo = (s.telefon_numarasi || '').replace(/\s+/g, '');
        const varMi = tenantMusteriListesi.some(m =>
          (telNo && m.telefon && m.telefon.replace(/\s+/g, '') === telNo) ||
          m.ad_soyad.toLowerCase().trim() === s.musteri_adi.toLowerCase().trim()
        );
        if (!varMi) {
          tenantMusteriListesi.push({
            id: s.musteri_id || `mus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            ad_soyad: s.musteri_adi,
            telefon: s.telefon_numarasi || '',
            instagram_kullanici_adi: s.instagram_kullanici_adi || '',
            sehir: s.teslimat_sehri || 'Bakı',
            adres: s.teslimat_adresi || '',
            musteri_tipi: s.musteri_tipi || 'TANIMADIK',
            toplam_siparis_sayisi: 0,
            toplam_harcama: 0,
            kalan_toplam_borc: 0,
            olusturma_tarihi: s.olusturma_tarihi || new Date().toISOString(),
            son_siparis_tarihi: s.olusturma_tarihi || new Date().toISOString(),
            son_urun_aciklamasi: s.urun_aciklamasi,
            son_siparis_tutari: s.toplam_tutar,
            tenant_id: seciliTenant,
          });
        }
      }
    } else {
      // Tümü / Global görünüm
      tenantMusteriListesi = [...musterilerVeritabani];
    }

    // 3. Her müşterinin seçili butik siparişlerine göre harcama, borç ve son siparişini hesapla
    const zenginlestirilmis = tenantMusteriListesi.map(m => {
      const telNo = (m.telefon || '').replace(/\s+/g, '');
      const eslesenSiparisler = ilgiliSiparisler.filter(s =>
        s.musteri_id === m.id ||
        (telNo && s.telefon_numarasi && s.telefon_numarasi.replace(/\s+/g, '') === telNo) ||
        s.musteri_adi.toLowerCase().trim() === m.ad_soyad.toLowerCase().trim()
      ).sort((a, b) => new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime());

      const sonSiparis = eslesenSiparisler[0];
      const toplamHarcama = eslesenSiparisler.reduce((toplam, s) => toplam + (Number(s.toplam_tutar) || 0), 0);
      const toplamBorc = eslesenSiparisler.reduce((toplam, s) => toplam + (Number(s.kalan_tutar) || 0), 0);

      return {
        ...m,
        toplam_siparis_sayisi: eslesenSiparisler.length > 0 ? eslesenSiparisler.length : (seciliTenant && seciliTenant !== 'all' ? 0 : m.toplam_siparis_sayisi),
        toplam_harcama: eslesenSiparisler.length > 0 ? toplamHarcama : (seciliTenant && seciliTenant !== 'all' ? 0 : m.toplam_harcama),
        kalan_toplam_borc: toplamBorc,
        son_urun_aciklamasi: sonSiparis ? sonSiparis.urun_aciklamasi : (seciliTenant && seciliTenant !== 'all' ? 'Bu butikdə sifariş yoxdur' : (m.son_urun_aciklamasi || 'Sipariş yoxdur')),
        son_siparis_tutari: sonSiparis ? sonSiparis.toplam_tutar : (seciliTenant && seciliTenant !== 'all' ? 0 : (m.son_siparis_tutari || 0)),
        son_siparis_tarihi: sonSiparis ? sonSiparis.olusturma_tarihi : (seciliTenant && seciliTenant !== 'all' ? m.olusturma_tarihi : m.son_siparis_tarihi),
      };
    });

    // Yeni bir butik seçilmişse ve o butike ait müşteri yoksa, liste boş döner
    const filtrelenmis = zenginlestirilmis.filter(m => {
      if (seciliTenant && seciliTenant !== 'all' && seciliTenant !== 'kanada_shopper_baku' && seciliTenant !== 'demo_sandbox') {
        return m.tenant_id === seciliTenant || m.toplam_siparis_sayisi > 0;
      }
      return true;
    });

    filtrelenmis.sort((a, b) => new Date(b.son_siparis_tarihi || 0).getTime() - new Date(a.son_siparis_tarihi || 0).getTime());

    res.json({
      basarili: true,
      toplam: filtrelenmis.length,
      musteriler: filtrelenmis,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// GET /api/musteriler/:id/siparisler — Tek Müşteri ve Sipariş Geçmişi
router.get('/musteriler/:id/siparisler', async (req, res) => {
  const { id } = req.params;
  const seciliTenant = req.query.tenant_id as string | undefined;

  let tumSiparisler: any[] = [];
  if (supabase) {
    try {
      let query = supabase.from('siparisler').select('*');
      if (seciliTenant && seciliTenant !== 'all') {
        query = query.eq('tenant_id', seciliTenant);
      }
      const { data } = await query;
      if (data && data.length > 0) {
        tumSiparisler = data.map(s => formatlaSiparis(s));
      }
    } catch {}
  }
  if (tumSiparisler.length === 0) {
    tumSiparisler = siparislerVeritabani.map(s => formatlaSiparis(s));
  }

  const musteri = musterilerVeritabani.find(m => m.id === id);
  const telNo = musteri ? (musteri.telefon || '').replace(/\s+/g, '') : '';
  const musteriAdi = musteri ? musteri.ad_soyad.toLowerCase().trim() : '';

  let musteriSiparisleri = tumSiparisler.filter(s => 
    s.musteri_id === id || 
    (telNo && s.telefon_numarasi && s.telefon_numarasi.replace(/\s+/g, '') === telNo) ||
    (musteriAdi && s.musteri_adi.toLowerCase().trim() === musteriAdi)
  );

  if (seciliTenant && seciliTenant !== 'all') {
    musteriSiparisleri = musteriSiparisleri.filter(s => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }

  musteriSiparisleri.sort((a, b) => new Date(b.olusturma_tarihi).getTime() - new Date(a.olusturma_tarihi).getTime());

  res.json({
    basarili: true,
    musteri: musteri || { id, ad_soyad: 'Müştəri' },
    siparisler: musteriSiparisleri,
  });
});

// POST /api/musteriler — Müşteri Ekle / Güncelle
router.post('/musteriler', async (req, res) => {
  const { id, ad_soyad, telefon, instagram_kullanici_adi, sehir, adres, musteri_tipi, notlar, tenant_id } = req.body;
  if (!ad_soyad) {
    return res.status(400).json({ basarili: false, hata: 'Müşteri adı zorunludur.' });
  }

  let musteri = id ? musterilerVeritabani.find(m => m.id === id) : null;
  if (musteri) {
    musteri.ad_soyad = ad_soyad;
    if (telefon !== undefined) musteri.telefon = telefon;
    if (instagram_kullanici_adi !== undefined) musteri.instagram_kullanici_adi = instagram_kullanici_adi;
    if (sehir !== undefined) musteri.sehir = sehir;
    if (adres !== undefined) musteri.adres = adres;
    if (musteri_tipi !== undefined) musteri.musteri_tipi = musteri_tipi;
    if (notlar !== undefined) musteri.notlar = notlar;
    if (tenant_id !== undefined) musteri.tenant_id = tenant_id;
  } else {
    musteri = {
      id: 'mus-' + Date.now().toString(36),
      ad_soyad,
      telefon: telefon || '',
      instagram_kullanici_adi: instagram_kullanici_adi || '',
      sehir: sehir || 'Bakı',
      adres: adres || '',
      musteri_tipi: musteri_tipi || 'TANIMADIK',
      toplam_siparis_sayisi: 0,
      toplam_harcama: 0,
      kalan_toplam_borc: 0,
      notlar: notlar || '',
      olusturma_tarihi: new Date().toISOString(),
      son_siparis_tarihi: new Date().toISOString(),
      tenant_id: tenant_id || 'kanada_shopper_baku',
    };
    musterilerVeritabani.unshift(musteri);
  }

  // Supabase kalıcılığı
  if (supabase) {
    try {
      await supabase.from('musteriler').upsert({
        id: musteri.id,
        ad_soyad: musteri.ad_soyad,
        telefon: musteri.telefon,
        instagram_kullanici_adi: musteri.instagram_kullanici_adi,
        sehir: musteri.sehir,
        adres: musteri.adres,
        musteri_tipi: musteri.musteri_tipi,
        notlar: musteri.notlar,
        tenant_id: musteri.tenant_id,
        toplam_siparis_sayisi: musteri.toplam_siparis_sayisi,
        toplam_harcama: musteri.toplam_harcama,
        kalan_toplam_borc: musteri.kalan_toplam_borc,
      });
    } catch (errDb) {
      console.warn('Müşteri Supabase kaydetme uyarısı:', errDb);
    }
  }

  res.json({ basarili: true, musteri });
});

export default router;
