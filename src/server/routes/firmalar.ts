import { Router } from 'express';
import { firmalarVeritabani, siparislerVeritabani, firmalariKaydetDosyaya } from '../services/state';
import { supabase } from '../services/supabase';
import { FirmaTenantItem } from '../types';

const router = Router();

// GET /api/firmalar — Multi-Tenant SaaS Listesi
router.get('/firmalar', async (req, res) => {
  const sayilar: Record<string, number> = {};
  for (const s of siparislerVeritabani) {
    const tid = s.tenant_id || 'kanada_shopper_baku';
    sayilar[tid] = (sayilar[tid] || 0) + 1;
  }

  // Supabase-dən oxumağa cəhd et, cədvəl yoxdursa yerli fayl/yaddaşa keç
  if (supabase) {
    try {
      const { data, error } = await supabase.from('firmalar').select('*');
      if (!error && data && data.length > 0) {
        const sbFirmalar: FirmaTenantItem[] = data.map((d: any) => ({
          id: d.id,
          ad: d.ad,
          sehir: d.sehir || 'Bakı',
          varsayilanParaBirimi: d.varsayilan_para_birimi || 'AZN',
          varsayilanKomisyonYuzdesi: Number(d.varsayilan_komisyon_yuzdesi || 15),
          aciklama: d.aciklama || '',
          isDemo: d.is_demo || false,
          onayDurumu: d.onay_durumu || 'AKTIF',
          paket: d.paket || 'PRO',
          sahipAdi: d.sahip_adi || '',
          sahipEmail: d.sahip_email || '',
          sahipTelefon: d.sahip_telefon || '',
          menseiUlke: d.mensei_ulke || 'CA',
          rolLimitleri: d.rol_limitleri || { PATRON: 1, KANADA_SATINALMA: 2, SATIS_SORUMLUSU: 4, BAKU_FINANS: 2, BAKU_KURYE: 10 },
          aktifKullaniciSayilari: d.aktif_kullanici_sayilari || { PATRON: 1, KANADA_SATINALMA: 0, SATIS_SORUMLUSU: 0, BAKU_FINANS: 0, BAKU_KURYE: 0 },
          kayitTarihi: d.kayit_tarihi || new Date().toISOString(),
        }));
        return res.json({
          basarili: true,
          kaynak: 'supabase',
          firmalar: sbFirmalar,
          siparis_sayilari: sayilar,
        });
      }
    } catch (sbErr) {
      // Supabase cədvəli hələ yaradılmayıbsa gracefully yaddaş bazasından qaytar
    }
  }

  res.json({
    basarili: true,
    kaynak: 'bellek',
    firmalar: firmalarVeritabani,
    siparis_sayilari: sayilar,
  });
});

// In-memory davet listesi
export const davetlerVeritabani: any[] = [];

// POST /api/firmalar/kayit — İctimai Butik Qeydiyyatı (Self-Service Onboarding)
router.post('/firmalar/kayit', async (req, res) => {
  try {
    const body = req.body || {};
    const ad = String(body.ad || '').trim();
    const sahipAdi = String(body.sahipAdi || '').trim();
    const sahipTelefon = String(body.sahipTelefon || '').trim();
    const sahipEmail = String(body.sahipEmail || '').trim();
    const sehir = String(body.sehir || 'Bakı').trim();
    const paket = body.paket || 'PRO';
    const menseiUlke = String(body.menseiUlke || 'CA').trim();
    const aciklama = String(body.aciklama || '').trim();

    if (!ad || !sahipAdi || !sahipTelefon) {
      return res.status(400).json({
        basarili: false,
        hata: 'Butik adı, sahibinin adı və əlaqə telefonu mütləqdir.',
      });
    }

    const slug = ad
      .toLowerCase()
      .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u')
      .replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36).slice(-4);

    const upper = String(paket || 'PRO').toUpperCase();
    const normalPaket: 'BASLANGIC' | 'PRO' | 'ENTERPRISE' =
      upper === 'ENTERPRISE' ? 'ENTERPRISE' : upper === 'BASLANGIC' ? 'BASLANGIC' : 'PRO';

    // Pakete görə rol limitləri (Solo Başlanğıc: 1-1-1-1-1, Pro: 1-2-4-2-10)
    let rolLimitleri = {
      PATRON: 1,
      KANADA_SATINALMA: 1,
      SATIS_SORUMLUSU: 1,
      BAKU_FINANS: 1,
      BAKU_KURYE: 1,
    };

    if (normalPaket === 'PRO') {
      rolLimitleri = {
        PATRON: 1,
        KANADA_SATINALMA: 2,
        SATIS_SORUMLUSU: 2,
        BAKU_FINANS: 2,
        BAKU_KURYE: 5,
      };
    } else if (normalPaket === 'ENTERPRISE') {
      rolLimitleri = {
        PATRON: 2,
        KANADA_SATINALMA: 5,
        SATIS_SORUMLUSU: 10,
        BAKU_FINANS: 5,
        BAKU_KURYE: 25,
      };
    }

    const yeniFirma: FirmaTenantItem = {
      id: slug,
      ad,
      sehir: sehir || 'Bakı',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      aciklama: aciklama || `${sahipAdi} tərəfindən qeydiyyatdan keçirilmiş butik`,
      isDemo: false,
      onayDurumu: 'BEKLEMEDE', // Super Admin təsdiqi gözləyir
      paket: normalPaket,
      sahipAdi,
      sahipEmail,
      sahipTelefon,
      kayitTarihi: new Date().toISOString(),
      menseiUlke,
      rolLimitleri,
      aktifKullaniciSayilari: {
        PATRON: 1, // Sahib avtomatik ilk istifadəçidir
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0,
      },
    };

    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);

    // Supabase-ə yazmağa cəhd et (cədvəl varsa dərhal sinxronlaşsın, 3s timeout ilə)
    if (supabase) {
      try {
        const insertPromise = supabase.from('firmalar').insert({
          id: yeniFirma.id,
          ad: yeniFirma.ad,
          sehir: yeniFirma.sehir,
          varsayilan_para_birimi: yeniFirma.varsayilanParaBirimi,
          varsayilan_komisyon_yuzdesi: yeniFirma.varsayilanKomisyonYuzdesi,
          aciklama: yeniFirma.aciklama,
          is_demo: yeniFirma.isDemo,
          onay_durumu: yeniFirma.onayDurumu,
          paket: yeniFirma.paket,
          sahip_adi: yeniFirma.sahipAdi,
          sahip_email: yeniFirma.sahipEmail,
          sahip_telefon: yeniFirma.sahipTelefon,
          mensei_ulke: yeniFirma.menseiUlke,
          rol_limitleri: yeniFirma.rolLimitleri,
          aktif_kullanici_sayilari: yeniFirma.aktifKullaniciSayilari,
        });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Supabase insert timeout')), 3000)
        );
        await Promise.race([insertPromise, timeoutPromise]);
      } catch (errDb) {
        console.warn('Supabase firmalar yazma xətası (yerli yaddaş aktivdir):', errDb);
      }
    }

    res.json({
      basarili: true,
      mesaj: `Təbriklər! "${ad}" butiki üçün müraciətiniz qeydə alındı. Super Admin təsdiqindən sonra aktivləşdiriləcək.`,
      firma: yeniFirma,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// PATCH /api/firmalar/:id/onay — Super Admin Butik Təsdiqi / Rəddi
router.patch('/firmalar/:id/onay', async (req, res) => {
  const { id } = req.params;
  const { onayDurumu } = req.body; // 'AKTIF' | 'REDDEDILDI' | 'BEKLEMEDE'

  const firma = firmalarVeritabani.find((f) => f.id === id);
  if (!firma) {
    return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
  }

  firma.onayDurumu = onayDurumu || 'AKTIF';
  firmalariKaydetDosyaya(firmalarVeritabani);

  if (supabase) {
    try {
      await supabase.from('firmalar').update({ onay_durumu: firma.onayDurumu }).eq('id', id);
    } catch (errDb) {}
  }

  res.json({
    basarili: true,
    mesaj: `"${firma.ad}" butikinin statusu "${firma.onayDurumu}" olaraq yeniləndi.`,
    firma,
  });
});

// POST /api/firmalar/davet-olustur — Rol Üzrə Komanda Dəvət Linki Yaratma
router.post('/firmalar/davet-olustur', async (req, res) => {
  try {
    const { tenantId, rol, olusturanKisi = 'Butik Patronu' } = req.body;
    const firma = firmalarVeritabani.find((f) => f.id === tenantId);
    if (!firma) {
      return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    }

    // Limit yoxlanışı
    const limit = (firma.rolLimitleri as any)?.[rol] ?? 5;
    const movcud = (firma.aktifKullaniciSayilari as any)?.[rol] ?? 0;

    if (movcud >= limit) {
      return res.status(400).json({
        basarili: false,
        hata: `Bu butik üçün ${rol} vəzifəsi üzrə limit (${limit}/${limit}) dolmuşdur. Zəhmət olmasa paketinizi yüksəldin.`,
      });
    }

    const token = 'inv_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const gecerlilikTarihi = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 gün

    const davet = {
      token,
      tenantId: firma.id,
      tenantAd: firma.ad,
      rol,
      olusturanKisi,
      olusturmaTarihi: new Date().toISOString(),
      gecerlilikTarihi,
      kullanildiMi: false,
    };

    davetlerVeritabani.push(davet);

    if (supabase) {
      try {
        await supabase.from('davetler').insert({
          id: davet.token,
          token: davet.token,
          firma_id: davet.tenantId,
          rol: davet.rol,
          olusturan_rol: davet.olusturanKisi,
          durum: 'AKTIF',
          son_kullanma_tarihi: davet.gecerlilikTarihi,
        });
      } catch (errDb) {}
    }

    res.json({
      basarili: true,
      davet,
      davetUrl: `/davet?token=${token}`,
      kalanKota: limit - movcud,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// GET /api/firmalar/davet/:token — Dəvət Linkini Yoxlama
router.get('/firmalar/davet/:token', async (req, res) => {
  const { token } = req.params;
  const davet = davetlerVeritabani.find((d) => d.token === token);
  if (!davet) {
    return res.status(404).json({ basarili: false, hata: 'Dəvət linki etibarsızdır və ya tapılmadı.' });
  }

  if (new Date(davet.gecerlilikTarihi) < new Date()) {
    return res.status(400).json({ basarili: false, hata: 'Bu dəvət linkinin vaxtı bitmişdir.' });
  }

  const firma = firmalarVeritabani.find((f) => f.id === davet.tenantId);
  res.json({
    basarili: true,
    davet,
    firma: firma ? { id: firma.id, ad: firma.ad, sehir: firma.sehir } : null,
  });
});

// POST /api/firmalar/davet/katil — Komandaya Qoşulma (Dəvəti Təsdiqləmə)
router.post('/firmalar/davet/katil', async (req, res) => {
  const { token, adSoyad, telefon } = req.body;
  const davet = davetlerVeritabani.find((d) => d.token === token);
  if (!davet) {
    return res.status(404).json({ basarili: false, hata: 'Dəvət tapılmadı.' });
  }

  const firma = firmalarVeritabani.find((f) => f.id === davet.tenantId);
  if (!firma) {
    return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
  }

  davet.kullanildiMi = true;
  davet.kullananKisi = adSoyad;

  // Sayı artır
  if (!firma.aktifKullaniciSayilari) {
    firma.aktifKullaniciSayilari = {
      PATRON: 1,
      KANADA_SATINALMA: 0,
      SATIS_SORUMLUSU: 0,
      BAKU_FINANS: 0,
      BAKU_KURYE: 0,
    };
  }
  const rol = davet.rol as keyof typeof firma.aktifKullaniciSayilari;
  if (firma.aktifKullaniciSayilari[rol] !== undefined) {
    firma.aktifKullaniciSayilari[rol] = (firma.aktifKullaniciSayilari[rol] || 0) + 1;
  }
  firmalariKaydetDosyaya(firmalarVeritabani);

  if (supabase) {
    try {
      await supabase.from('davetler').update({
        durum: 'KULLANILDI',
        kullanildi_tarih: new Date().toISOString(),
        kullanan_adi: adSoyad,
        kullanan_telefon: telefon,
      }).eq('token', token);

      await supabase.from('firmalar').update({
        aktif_kullanici_sayilari: firma.aktifKullaniciSayilari,
      }).eq('id', firma.id);
    } catch (errDb) {}
  }

  res.json({
    basarili: true,
    mesaj: `Xoş gəldiniz! "${firma.ad}" komandasına ${davet.rol} olaraq uğurla qoşuldunuz.`,
    tenantId: firma.id,
    tenantAd: firma.ad,
    rol: davet.rol,
  });
});

// POST /api/firmalar — Yeni Butik / Firma Ekle (Mövcud Admin endpointi)
router.post('/firmalar', (req, res) => {
  try {
    const { ad, sehir, varsayilanParaBirimi = 'AZN', varsayilanKomisyonYuzdesi = 15, aciklama } = req.body;
    if (!ad) {
      return res.status(400).json({ basarili: false, hata: 'Firma / butik adı zorunludur.' });
    }

    const slug = ad.toLowerCase()
      .replace(/ə/g, 'e').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ğ/g, 'g')
      .replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString(36).slice(-4);

    const yeniFirma: FirmaTenantItem = {
      id: slug,
      ad,
      sehir: sehir || 'Bakı',
      varsayilanParaBirimi: varsayilanParaBirimi || 'AZN',
      varsayilanKomisyonYuzdesi: Number(varsayilanKomisyonYuzdesi || 15),
      aciklama: aciklama || '',
      isDemo: false,
      onayDurumu: 'AKTIF',
      paket: 'PRO',
      rolLimitleri: {
        PATRON: 1,
        KANADA_SATINALMA: 2,
        SATIS_SORUMLUSU: 4,
        BAKU_FINANS: 2,
        BAKU_KURYE: 10,
      },
      aktifKullaniciSayilari: {
        PATRON: 1,
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0,
      },
    };

    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);

    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistemə uğurla əlavə edildi!`,
      firma: yeniFirma,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// DELETE /api/firmalar/:id — Butik Sil
router.delete('/firmalar/:id', (req, res) => {
  const { id } = req.params;
  const index = firmalarVeritabani.findIndex(f => f.id === id);
  if (index === -1) {
    return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
  }
  if (id === 'kanada_shopper_baku') {
    return res.status(400).json({ basarili: false, hata: 'Əsas canlı butik silinə bilməz.' });
  }
  firmalarVeritabani.splice(index, 1);
  firmalariKaydetDosyaya(firmalarVeritabani);
  res.json({ basarili: true, mesaj: 'Butik uğurla silindi.' });
});

export default router;
