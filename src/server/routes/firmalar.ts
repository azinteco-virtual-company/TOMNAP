import { Router } from 'express';
import {
  firmalarVeritabani,
  siparislerVeritabani,
  firmalariKaydetDosyaya,
  kullanicilarVeritabani,
  kullanicilariKaydetDosyaya,
} from '../services/state';
import { supabase } from '../services/supabase';
import { tokenUret } from '../services/crypto';
import { sendActivationEmail, sendInviteEmail, getApplicationUrl } from '../services/emailService';
import { FirmaTenantItem, KullaniciKaydi } from '../types';
import { IS_PRODUCTION, RESEND_API_KEY } from '../config';

const router = Router();

// GET /api/firmalar — Multi-Tenant SaaS Listesi
router.get('/firmalar', async (req, res) => {
  const sayilar: Record<string, number> = {};
  for (const s of siparislerVeritabani) {
    const tid = s.tenant_id;
    if (!tid || (req.tenantId !== 'all' && tid !== req.tenantId)) continue;
    sayilar[tid] = (sayilar[tid] || 0) + 1;
  }

  // Supabase-dən oxumağa cəhd et, cədvəl yoxdursa yerli fayl/yaddaşa keç
  if (supabase) {
    try {
      let query = supabase.from('firmalar').select('*');
      if (req.auth?.role !== 'SUPER_ADMIN') query = query.eq('id', req.tenantId);
      const { data, error } = await query;
      if (error)
        return res.status(503).json({ basarili: false, hata: 'Firma bilgileri okunamadı.' });
      if (data) {
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
          rolLimitleri: d.rol_limitleri || {
            PATRON: 1,
            KANADA_SATINALMA: 2,
            SATIS_SORUMLUSU: 4,
            BAKU_FINANS: 2,
            BAKU_KURYE: 10,
          },
          aktifKullaniciSayilari: d.aktif_kullanici_sayilari || {
            PATRON: 1,
            KANADA_SATINALMA: 0,
            SATIS_SORUMLUSU: 0,
            BAKU_FINANS: 0,
            BAKU_KURYE: 0,
          },
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
      return res.status(503).json({ basarili: false, hata: 'Firma bilgileri okunamadı.' });
    }
  }

  res.json({
    basarili: true,
    kaynak: 'bellek',
    firmalar: firmalarVeritabani.filter(
      (f) => req.auth?.role === 'SUPER_ADMIN' || f.id === req.tenantId
    ),
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

    if (!ad || !sahipAdi || !sahipTelefon || !sahipEmail) {
      return res.status(400).json({
        basarili: false,
        hata: 'Butik adı, sahibinin adı, əlaqə telefonu və e-poçt ünvanı mütləqdir.',
      });
    }

    if (IS_PRODUCTION && !RESEND_API_KEY) {
      return res.status(503).json({
        basarili: false,
        hata: 'Aktivasiya məktubu xidməti hazır deyil. Daha sonra yenidən cəhd edin.',
      });
    }

    getApplicationUrl();

    const slug =
      ad
        .toLowerCase()
        .replace(/ə/g, 'e')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/[^a-z0-9]/g, '_') +
      '_' +
      Date.now().toString(36).slice(-4);

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
      onayDurumu: 'BEKLEMEDE', // Şifrə təyin edilənə və ya təsdiq olunana qədər gözləmədə
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

    // 1. Patron üçün İstifadəçi Qeydi və Şifrə Təyin Tokeni Yarat
    const aktivasyonToken = tokenUret(32);
    const tokenGecerlilik = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 saat

    const yeniPatronUser: KullaniciKaydi = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36).slice(-4),
      tenant_id: slug,
      ad_soyad: sahipAdi,
      email: sahipEmail.toLowerCase(),
      telefon: sahipTelefon,
      rol: 'PATRON',
      durum: 'BEKLEMEDE_SIFRE',
      aktivasyon_token: aktivasyonToken,
      token_gecerlilik: tokenGecerlilik,
      olusturma_tarihi: new Date().toISOString(),
    };

    // Supabase-ə yazmağa cəhd et (Etibarlı və tam ardıcıl, gizli timeout olmadan)
    if (supabase) {
      try {
        const { error: fErr } = await supabase.from('firmalar').insert({
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
        if (fErr) {
          return res.status(503).json({
            basarili: false,
            hata: 'Qeydiyyat saxlanılmadı. Daha sonra yenidən cəhd edin.',
          });
        }

        const { error: uErr } = await supabase.from('kullanicilar').insert({
          id: yeniPatronUser.id,
          tenant_id: yeniPatronUser.tenant_id,
          ad_soyad: yeniPatronUser.ad_soyad,
          email: yeniPatronUser.email,
          telefon: yeniPatronUser.telefon,
          rol: yeniPatronUser.rol,
          durum: yeniPatronUser.durum,
          aktivasyon_token: yeniPatronUser.aktivasyon_token,
          token_gecerlilik: yeniPatronUser.token_gecerlilik,
          olusturma_tarihi: yeniPatronUser.olusturma_tarihi,
        });
        if (uErr) {
          return res.status(503).json({
            basarili: false,
            hata: 'İstifadəçi qeydi saxlanılmadı. Dəstək xidməti ilə əlaqə saxlayın.',
          });
        }
      } catch (errDb) {
        return res.status(503).json({
          basarili: false,
          hata: 'Qeydiyyat xidməti əlçatan deyil. Daha sonra yenidən cəhd edin.',
        });
      }
    }

    firmalarVeritabani.push(yeniFirma);
    firmalariKaydetDosyaya(firmalarVeritabani);
    kullanicilarVeritabani.push(yeniPatronUser);
    kullanicilariKaydetDosyaya(kullanicilarVeritabani);

    // Activation links use the configured application origin, never request headers.

    const emailResult = await sendActivationEmail({
      email: sahipEmail,
      adSoyad: sahipAdi,
      butikAdi: ad,
      token: aktivasyonToken,
    });

    res.json({
      basarili: true,
      mesaj: emailResult.basarili
        ? `Qeydiyyat qəbul edildi. Şifrə təyini linki ${sahipEmail} ünvanına göndərildi.`
        : 'Qeydiyyat qəbul edildi, lakin aktivasiya məktubu göndərilə bilmədi. Dəstək xidməti ilə əlaqə saxlayın.',
      firma: yeniFirma,
      emailGonderildi: emailResult.basarili,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// PATCH /api/firmalar/:id/onay — Super Admin Butik Təsdiqi / Rəddi
router.patch('/firmalar/:id/onay', async (req, res) => {
  const { id } = req.params;
  const { onayDurumu } = req.body; // 'AKTIF' | 'REDDEDILDI' | 'BEKLEMEDE'

  if (!['AKTIF', 'REDDEDILDI', 'BEKLEMEDE', 'DONDURULMUS'].includes(onayDurumu))
    return res.status(400).json({ basarili: false, hata: 'Geçersiz firma durumu.' });
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('firmalar')
        .update({ onay_durumu: onayDurumu })
        .eq('id', id)
        .select('id,ad,onay_durumu')
        .maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: 'Firma durumu kaydedilemedi.' });
      if (!data) return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
      const local = firmalarVeritabani.find((f) => f.id === id);
      if (local) local.onayDurumu = onayDurumu;
      return res.json({
        basarili: true,
        firma: { ...data, onayDurumu },
        mesaj: 'Firma durumu güncellendi.',
      });
    }
    const firma = firmalarVeritabani.find((f) => f.id === id);
    if (!firma) return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    firma.onayDurumu = onayDurumu;
    firmalariKaydetDosyaya(firmalarVeritabani);
    return res.json({ basarili: true, firma, mesaj: 'Firma durumu güncellendi.' });
  } catch {
    return res.status(503).json({ basarili: false, hata: 'Firma durumu kaydedilemedi.' });
  }
});

// POST /api/firmalar/davet-olustur — Rol Üzrə Komanda Dəvət Linki Yaratma
router.post('/firmalar/davet-olustur', async (req, res) => {
  try {
    const { tenantId, rol, olusturanKisi = 'Butik Patronu', email, adSoyad } = req.body;
    let firma = firmalarVeritabani.find((f) => f.id === tenantId);
    if (supabase) {
      const { data, error } = await supabase
        .from('firmalar')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: 'Firma bilgileri okunamadı.' });
      firma = data
        ? {
            ...data,
            onayDurumu: data.onay_durumu,
            rolLimitleri: data.rol_limitleri,
            aktifKullaniciSayilari: data.aktif_kullanici_sayilari,
          }
        : undefined;
    }
    if (!firma) {
      return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    }

    if (
      !['PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS', 'BAKU_KURYE'].includes(rol)
    ) {
      return res.status(400).json({ basarili: false, hata: 'Etibarsız komanda rolu.' });
    }

    if (firma.onayDurumu && firma.onayDurumu !== 'AKTIF')
      return res.status(403).json({ basarili: false, hata: 'Firma aktif değil.' });

    // Limit yoxlanışı
    const limit = (firma.rolLimitleri as any)?.[rol] ?? 5;
    const movcud = (firma.aktifKullaniciSayilari as any)?.[rol] ?? 0;

    if (movcud >= limit) {
      return res.status(400).json({
        basarili: false,
        hata: `Bu butik üçün ${rol} vəzifəsi üzrə limit (${limit}/${limit}) dolmuşdur. Zəhmət olmasa paketinizi yüksəldin.`,
      });
    }

    const token = 'inv_' + tokenUret(32);
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
      email: email ? String(email).trim().toLowerCase() : undefined,
      kullananKisi: adSoyad ? String(adSoyad).trim() : undefined,
    };

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('davetler')
          .insert({
            id: davet.token,
            token: davet.token,
            firma_id: davet.tenantId,
            rol: davet.rol,
            olusturan_rol: req.auth?.role || 'PATRON',
            durum: 'AKTIF',
            son_kullanma_tarihi: davet.gecerlilikTarihi,
          })
          .select('token')
          .maybeSingle();
        if (error || !data) {
          return res
            .status(503)
            .json({ basarili: false, hata: 'Dəvət saxlanılmadı. Daha sonra yenidən cəhd edin.' });
        }
      } catch {
        return res.status(503).json({ basarili: false, hata: 'Dəvət xidməti əlçatan deyil.' });
      }
    }

    davetlerVeritabani.push(davet);

    // E-poçt göstərilibsə real dəvət göndər
    let emailGonderildi = false;
    let davetUrlTam = `/davet-qebul?token=${token}`;

    if (email && String(email).includes('@')) {
      const emailSonuc = await sendInviteEmail({
        email: String(email).trim().toLowerCase(),
        adSoyad: adSoyad ? String(adSoyad).trim() : undefined,
        butikAdi: firma.ad,
        rol,
        token,
        davetEden: olusturanKisi,
      });

      emailGonderildi = emailSonuc.basarili;
      if (emailSonuc.link) {
        davetUrlTam = emailSonuc.link;
      }
    }

    res.json({
      basarili: true,
      davet,
      davetUrl: `/davet?token=${token}`,
      davetUrlTam,
      emailGonderildi,
      mesaj: emailGonderildi
        ? `Dəvət məktubu ${email} ünvanına göndərildi.`
        : `Dəvət linki uğurla yaradıldı.`,
      kalanKota: limit - movcud,
    });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// POST /api/firmalar — Yeni Butik / Firma Ekle (Mövcud Admin endpointi)
router.post('/firmalar', async (req, res) => {
  try {
    const {
      ad,
      sehir,
      varsayilanParaBirimi = 'AZN',
      varsayilanKomisyonYuzdesi = 15,
      aciklama,
    } = req.body;
    if (!ad) {
      return res.status(400).json({ basarili: false, hata: 'Firma / butik adı zorunludur.' });
    }

    const slug =
      ad
        .toLowerCase()
        .replace(/ə/g, 'e')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ç/g, 'c')
        .replace(/ğ/g, 'g')
        .replace(/[^a-z0-9]/g, '_') +
      '_' +
      Date.now().toString(36).slice(-4);

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

    if (supabase) {
      const { data, error } = await supabase
        .from('firmalar')
        .insert({
          id: yeniFirma.id,
          ad: yeniFirma.ad,
          sehir: yeniFirma.sehir,
          varsayilan_para_birimi: yeniFirma.varsayilanParaBirimi,
          varsayilan_komisyon_yuzdesi: yeniFirma.varsayilanKomisyonYuzdesi,
          aciklama: yeniFirma.aciklama,
          is_demo: false,
          onay_durumu: 'AKTIF',
          paket: yeniFirma.paket,
          rol_limitleri: yeniFirma.rolLimitleri,
          aktif_kullanici_sayilari: yeniFirma.aktifKullaniciSayilari,
        })
        .select('id')
        .maybeSingle();
      if (error || !data)
        return res.status(503).json({ basarili: false, hata: 'Firma kaydedilemedi.' });
    }
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
router.delete('/firmalar/:id', async (req, res) => {
  const { id } = req.params;
  if (id === 'kanada_shopper_baku')
    return res.status(400).json({ basarili: false, hata: 'Əsas canlı butik silinə bilməz.' });
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('firmalar')
        .delete()
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) return res.status(503).json({ basarili: false, hata: 'Firma silinemedi.' });
      if (!data) return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    }
    const index = firmalarVeritabani.findIndex((f) => f.id === id);
    if (!supabase && index === -1)
      return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    if (index !== -1) firmalarVeritabani.splice(index, 1);
    firmalariKaydetDosyaya(firmalarVeritabani);
    res.json({ basarili: true, mesaj: 'Butik uğurla silindi.' });
  } catch {
    res.status(503).json({ basarili: false, hata: 'Firma silinemedi.' });
  }
});

export default router;
