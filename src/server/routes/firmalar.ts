import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  firmalarVeritabani,
  siparislerVeritabani,
  firmalariKaydetDosyaya,
  davetlerVeritabani,
  getIdentitySnapshot,
  saveIdentitySnapshot,
} from '../services/state';
import { supabase } from '../services/supabase';
import { tokenUret } from '../services/crypto';
import {
  buildActivationEmail,
  buildInviteEmail,
  getApplicationUrl,
} from '../services/emailService';
import { registerBoutique, createInvite, OnboardingError } from '../services/onboarding';
import { createEmailJob, tryDeliverOnboardingEmail } from '../services/onboardingOutbox';
import { FirmaTenantItem, KullaniciKaydi } from '../types';
import {
  PAKET_ROL_LIMITLERI,
  VARSAYILAN_ROL_LIMITLERI,
  ekipRoluMu,
  ilkKullaniciSayilari,
} from '../../shared/roller';
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
          rolLimitleri: d.rol_limitleri || { ...VARSAYILAN_ROL_LIMITLERI },
          aktifKullaniciSayilari: d.aktif_kullanici_sayilari || ilkKullaniciSayilari(),
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

// Shared durable identity snapshot (kept as a compatibility export).
export { davetlerVeritabani } from '../services/state';

// POST /api/firmalar/kayit — İctimai Butik Qeydiyyatı (Self-Service Onboarding)
router.post('/firmalar/kayit', async (req, res) => {
  try {
    const body = req.body || {};
    const ad = String(body.ad || '').trim();
    const sahipAdi = String(body.sahipAdi || '').trim();
    const sahipTelefon = String(body.sahipTelefon || '').trim();
    const sahipEmail = String(body.sahipEmail || '')
      .trim()
      .toLowerCase();
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

    if (
      [body.ad, body.sahipAdi, body.sahipTelefon, body.sahipEmail].some(
        (value) => typeof value !== 'string'
      ) ||
      ad.length > 200 ||
      sahipAdi.length > 150 ||
      sahipEmail.length > 150 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sahipEmail) ||
      !/^[+\d\s().-]+$/.test(sahipTelefon) ||
      !/^\d{7,15}$/.test(sahipTelefon.replace(/\D/g, '')) ||
      sehir.length > 100 ||
      menseiUlke.length > 10
    ) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Qeydiyyat məlumatlarının formatını yoxlayın.' });
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
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 60) +
      '_' +
      randomUUID();

    const upper = String(paket || 'PRO').toUpperCase();
    const normalPaket: 'BASLANGIC' | 'PRO' | 'ENTERPRISE' =
      upper === 'ENTERPRISE' ? 'ENTERPRISE' : upper === 'BASLANGIC' ? 'BASLANGIC' : 'PRO';

    // Pakete görə rol limitləri rol kataloqundan gəlir (src/shared/roller.ts).
    const rolLimitleri = { ...PAKET_ROL_LIMITLERI[normalPaket] };

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
      // Sahib avtomatik ilk istifadəçidir
      aktifKullaniciSayilari: ilkKullaniciSayilari(),
    };

    // 1. Patron üçün İstifadəçi Qeydi və Şifrə Təyin Tokeni Yarat
    const aktivasyonToken = tokenUret(32);
    const tokenGecerlilik = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 saat

    const yeniPatronUser: KullaniciKaydi = {
      id: 'usr_' + randomUUID(),
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

    const { payload } = buildActivationEmail({
      email: sahipEmail,
      adSoyad: sahipAdi,
      butikAdi: ad,
      token: aktivasyonToken,
    });
    const job = createEmailJob(yeniFirma.id, 'ACTIVATION', payload, tokenGecerlilik);
    await registerBoutique(yeniFirma, yeniPatronUser, job);
    const emailGonderildi = await tryDeliverOnboardingEmail(job.id);

    res.json({
      basarili: true,
      mesaj: emailGonderildi
        ? `Qeydiyyat qəbul edildi. Şifrə təyini linki ${sahipEmail} ünvanına göndərildi.`
        : 'Qeydiyyat saxlanıldı. Aktivasiya məktubu göndərilmə növbəsindədir; dəstək xidməti göndərişi yenidən yoxlaya bilər.',
      firma: yeniFirma,
      emailGonderildi,
      emailDurumu: emailGonderildi ? 'GONDERILDI' : 'BEKLIYOR',
    });
  } catch (err: any) {
    res
      .status(err instanceof OnboardingError ? err.status : 503)
      .json({
        basarili: false,
        hata:
          err instanceof OnboardingError
            ? err.message
            : 'Əməliyyat saxlanılmadı. Daha sonra yenidən cəhd edin.',
      });
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
      return res.json({
        basarili: true,
        firma: { ...data, onayDurumu },
        mesaj: 'Firma durumu güncellendi.',
      });
    }
    const next = getIdentitySnapshot();
    const firma = next.companies.find((f) => f.id === id);
    if (!firma) return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
    firma.onayDurumu = onayDurumu;
    saveIdentitySnapshot(next);
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

    if (!ekipRoluMu(rol)) {
      return res.status(400).json({ basarili: false, hata: 'Etibarsız komanda rolu.' });
    }

    if (firma.onayDurumu && firma.onayDurumu !== 'AKTIF')
      return res.status(403).json({ basarili: false, hata: 'Firma aktif değil.' });

    if (
      (email !== undefined &&
        (typeof email !== 'string' ||
          email.trim().length > 150 ||
          (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())))) ||
      (adSoyad !== undefined && (typeof adSoyad !== 'string' || adSoyad.length > 150)) ||
      typeof olusturanKisi !== 'string'
    ) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Dəvət məlumatlarının formatını yoxlayın.' });
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

    const preparedEmail = davet.email
      ? buildInviteEmail({
          email: davet.email,
          adSoyad: davet.kullananKisi,
          butikAdi: firma.ad,
          rol,
          token,
          davetEden: olusturanKisi,
        })
      : undefined;
    const job = preparedEmail
      ? createEmailJob(firma.id, 'INVITE', preparedEmail.payload, gecerlilikTarihi)
      : undefined;
    const created = await createInvite(davet, req.auth?.role || 'PATRON', job);
    const emailGonderildi = job ? await tryDeliverOnboardingEmail(job.id) : false;
    const davetUrlTam = preparedEmail?.link || `${getApplicationUrl()}/davet-qebul?token=${token}`;

    res.json({
      basarili: true,
      davet,
      davetUrl: `/davet?token=${token}`,
      davetUrlTam,
      emailGonderildi,
      mesaj: emailGonderildi
        ? `Dəvət məktubu ${email} ünvanına göndərildi.`
        : `Dəvət linki uğurla yaradıldı.`,
      emailDurumu: job ? (emailGonderildi ? 'GONDERILDI' : 'BEKLIYOR') : 'ISTENMEDI',
      kalanKota: created.remaining,
    });
  } catch (err: any) {
    res
      .status(err instanceof OnboardingError ? err.status : 503)
      .json({
        basarili: false,
        hata:
          err instanceof OnboardingError
            ? err.message
            : 'Əməliyyat saxlanılmadı. Daha sonra yenidən cəhd edin.',
      });
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
        .replace(/[^a-z0-9]/g, '_')
        .slice(0, 60) +
      '_' +
      randomUUID();

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
      rolLimitleri: { ...VARSAYILAN_ROL_LIMITLERI },
      aktifKullaniciSayilari: ilkKullaniciSayilari(),
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
    if (!supabase) firmalariKaydetDosyaya([...firmalarVeritabani, yeniFirma]);

    res.json({
      basarili: true,
      mesaj: `"${ad}" butiki sistemə uğurla əlavə edildi!`,
      firma: yeniFirma,
    });
  } catch (err: any) {
    res
      .status(err instanceof OnboardingError ? err.status : 503)
      .json({
        basarili: false,
        hata:
          err instanceof OnboardingError
            ? err.message
            : 'Əməliyyat saxlanılmadı. Daha sonra yenidən cəhd edin.',
      });
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
    if (!supabase) {
      const next = getIdentitySnapshot();
      if (!next.companies.some((firma) => firma.id === id))
        return res.status(404).json({ basarili: false, hata: 'Butik tapılmadı.' });
      next.companies = next.companies.filter((firma) => firma.id !== id);
      next.users = next.users.filter((user) => user.tenant_id !== id);
      next.invites = next.invites.filter((invite) => invite.tenantId !== id);
      next.emailJobs = next.emailJobs.filter((job) => job.tenant_id !== id);
      saveIdentitySnapshot(next);
    }
    res.json({ basarili: true, mesaj: 'Butik uğurla silindi.' });
  } catch {
    res.status(503).json({ basarili: false, hata: 'Firma silinemedi.' });
  }
});

export default router;
