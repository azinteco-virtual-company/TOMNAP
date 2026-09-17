import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  kullanicilarVeritabani,
  kullanicilariKaydetDosyaya,
  firmalarVeritabani,
  firmalariKaydetDosyaya,
} from '../services/state';
import { davetlerVeritabani } from './firmalar';
import { sifreHashle, sifreDogrula } from '../services/crypto';
import { supabase } from '../services/supabase';
import { DavetKaydi, KullaniciKaydi } from '../types';

const router = Router();

function isUnexpired(value: unknown): boolean {
  return typeof value === 'string' && Date.parse(value) > Date.now();
}

function isPendingActivation(user: KullaniciKaydi, token: string): boolean {
  return (
    user.aktivasyon_token === token &&
    user.durum === 'BEKLEMEDE_SIFRE' &&
    isUnexpired(user.token_gecerlilik)
  );
}

function isAvailableInvite(invite: DavetKaydi, token: string): boolean {
  return (
    invite.token === token &&
    invite.kullanildiMi === false &&
    ['PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS', 'BAKU_KURYE'].includes(
      invite.rol
    ) &&
    isUnexpired(invite.gecerlilikTarihi)
  );
}

// When Supabase is configured it is authoritative. A cached token must never
// bypass a consumed token, a database error, or a missing database record.
async function findActivationUser(token: string): Promise<KullaniciKaydi | undefined> {
  if (!supabase) return kullanicilarVeritabani.find((user) => user.aktivasyon_token === token);
  const { data, error } = await supabase
    .from('kullanicilar')
    .select('*')
    .eq('aktivasyon_token', token)
    .maybeSingle();
  if (error) throw error;
  return data || undefined;
}

async function findInvite(token: string): Promise<DavetKaydi | undefined> {
  if (!supabase) return davetlerVeritabani.find((invite) => invite.token === token);
  const { data, error } = await supabase
    .from('davetler')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return undefined;
  return {
    token: data.token,
    tenantId: data.firma_id,
    tenantAd: '',
    rol: data.rol,
    olusturanKisi: data.olusturan_rol,
    olusturmaTarihi: data.olusturma_tarihi,
    gecerlilikTarihi: data.son_kullanma_tarihi,
    kullanildiMi: data.durum !== 'AKTIF',
    kullananKisi: data.kullanan_adi,
  };
}

async function findFirma(tenantId: string) {
  if (!supabase) return firmalarVeritabani.find((firma) => firma.id === tenantId);
  const { data, error } = await supabase
    .from('firmalar')
    .select('*')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return data || undefined;
}

function cacheUser(user: KullaniciKaydi) {
  const index = kullanicilarVeritabani.findIndex((item) => item.id === user.id);
  if (index < 0) kullanicilarVeritabani.push(user);
  else kullanicilarVeritabani[index] = user;
  kullanicilariKaydetDosyaya(kullanicilarVeritabani);
}

// Token inspection is read-only: it cannot create or repair accounts.
router.get(['/auth/token-kontrol/:token', '/firmalar/davet/:token'], async (req, res) => {
  try {
    const token = req.params.token.trim();
    if (!token) return res.status(400).json({ basarili: false, hata: 'Token təqdim edilməyib.' });
    const user = await findActivationUser(token);
    if (user) {
      if (!isPendingActivation(user, token)) {
        return res.status(400).json({
          basarili: false,
          hata: 'Bu aktivasiya linki etibarsızdır və ya vaxtı bitmişdir.',
        });
      }
      const firma = await findFirma(user.tenant_id);
      return res.json({
        basarili: true,
        tip: 'aktivasyon',
        email: user.email,
        adSoyad: user.ad_soyad,
        butikAdi: firma?.ad || '',
        rol: user.rol,
        tenantId: user.tenant_id,
      });
    }
    const invite = await findInvite(token);
    if (invite) {
      if (!isAvailableInvite(invite, token)) {
        return res.status(400).json({
          basarili: false,
          hata: 'Bu dəvət linki etibarsızdır, istifadə edilib və ya vaxtı bitmişdir.',
        });
      }
      const firma = await findFirma(invite.tenantId);
      return res.json({
        basarili: true,
        tip: 'davet',
        email: invite.email || '',
        adSoyad: invite.kullananKisi || '',
        butikAdi: firma?.ad || invite.tenantAd || '',
        rol: invite.rol,
        tenantId: invite.tenantId,
        davet: invite,
        firma: firma ? { id: firma.id, ad: firma.ad, sehir: firma.sehir } : undefined,
      });
    }
    return res.status(404).json({
      basarili: false,
      hata: 'Aktivasiya və ya dəvət linki etibarsızdır və ya tapılmadı.',
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: 'Token hazırda yoxlanıla bilmir. Daha sonra yenidən cəhd edin.',
    });
  }
});

router.post(['/auth/sifre-belirle', '/firmalar/davet/katil'], async (req, res) => {
  try {
    const { token, sifre, adSoyad, telefon, email } = req.body || {};
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ basarili: false, hata: 'Təhlükəsizlik tokeni mütləqdir.' });
    }
    if (typeof sifre !== 'string' || sifre.length < 6) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır.' });
    }
    const cleanToken = token.trim();
    const user = await findActivationUser(cleanToken);
    if (user) {
      if (!isPendingActivation(user, cleanToken)) {
        return res.status(400).json({
          basarili: false,
          hata: 'Bu aktivasiya linki etibarsızdır və ya vaxtı bitmişdir.',
        });
      }
      const firma = await findFirma(user.tenant_id);
      // Recheck after asynchronous reads, before consuming a local token.
      if (!isPendingActivation(user, cleanToken)) {
        return res
          .status(400)
          .json({ basarili: false, hata: 'Bu aktivasiya linki artıq etibarlı deyil.' });
      }
      const changes = {
        sifre_hash: sifreHashle(sifre),
        durum: 'AKTIF' as const,
        aktivasyon_token: null,
        token_gecerlilik: null,
        ad_soyad: typeof adSoyad === 'string' && adSoyad.trim() ? adSoyad.trim() : user.ad_soyad,
        telefon: typeof telefon === 'string' && telefon.trim() ? telefon.trim() : user.telefon,
      };
      if (supabase) {
        // The conditional UPDATE consumes the token once, including concurrent requests.
        // .select() is required: a successful HTTP response can still update zero rows.
        const { data: updated, error } = await supabase
          .from('kullanicilar')
          .update(changes)
          .eq('id', user.id)
          .eq('aktivasyon_token', cleanToken)
          .eq('durum', 'BEKLEMEDE_SIFRE')
          .gt('token_gecerlilik', new Date().toISOString())
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!updated)
          return res
            .status(409)
            .json({ basarili: false, hata: 'Bu aktivasiya linki artıq etibarlı deyil.' });
        if (firma?.onay_durumu === 'BEKLEMEDE') {
          const { error: firmaError } = await supabase
            .from('firmalar')
            .update({ onay_durumu: 'AKTIF' })
            .eq('id', user.tenant_id)
            .eq('onay_durumu', 'BEKLEMEDE');
          if (firmaError) throw firmaError;
          firma.onay_durumu = 'AKTIF';
        }
      } else {
        if (!isPendingActivation(user, cleanToken)) {
          return res
            .status(400)
            .json({ basarili: false, hata: 'Bu aktivasiya linki artıq etibarlı deyil.' });
        }
        Object.assign(user, changes);
      }
      const activatedUser = { ...user, ...changes };
      cacheUser(activatedUser);
      const localFirma = firmalarVeritabani.find((item) => item.id === user.tenant_id);
      if (localFirma?.onayDurumu === 'BEKLEMEDE') {
        localFirma.onayDurumu = 'AKTIF';
        firmalariKaydetDosyaya(firmalarVeritabani);
      }
      return res.json({
        basarili: true,
        mesaj: 'Şifrəniz uğurla təyin edildi! İndi daxil ola bilərsiniz.',
        kullanici: {
          id: user.id,
          adSoyad: activatedUser.ad_soyad,
          email: user.email,
          telefon: activatedUser.telefon,
          rol: user.rol,
          tenantId: user.tenant_id,
        },
        firma,
      });
    }

    const invite = await findInvite(cleanToken);
    if (!invite)
      return res.status(404).json({
        basarili: false,
        hata: 'Bu tokenə uyğun gözləyən qeydiyyat və ya dəvət tapılmadı.',
      });
    if (!isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({
        basarili: false,
        hata: 'Bu dəvət etibarsızdır, istifadə edilib və ya vaxtı bitmişdir.',
      });
    }
    if (
      (email !== undefined && typeof email !== 'string') ||
      (telefon !== undefined && typeof telefon !== 'string')
    ) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'E-poçt və telefon mətn formatında olmalıdır.' });
    }
    const userEmail =
      (typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '') ||
      (typeof email === 'string' ? email.trim().toLowerCase() : '');
    const userPhone = typeof telefon === 'string' ? telefon.trim() : '';
    const validEmail = userEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
    const phoneDigits = userPhone.replace(/\D/g, '');
    const validPhone =
      /^[+\d\s().-]+$/.test(userPhone) && phoneDigits.length >= 7 && phoneDigits.length <= 15;
    if ((userEmail && !validEmail) || (userPhone && !validPhone) || (!validEmail && !validPhone)) {
      return res.status(400).json({
        basarili: false,
        hata: 'Sonradan giriş üçün etibarlı e-poçt ünvanı və ya telefon nömrəsi daxil edin.',
      });
    }
    const firma = await findFirma(invite.tenantId);
    if (!firma) return res.status(404).json({ basarili: false, hata: 'Əlaqəli butik tapılmadı.' });
    if (!isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({ basarili: false, hata: 'Bu dəvət artıq etibarlı deyil.' });
    }
    const newUser: KullaniciKaydi = {
      id: 'usr_' + randomUUID(),
      tenant_id: invite.tenantId,
      ad_soyad:
        typeof adSoyad === 'string' && adSoyad.trim()
          ? adSoyad.trim()
          : invite.kullananKisi || 'Komanda Üzvü',
      email: userEmail || `invite-${randomUUID()}@tomnap.internal`,
      telefon: userPhone,
      rol: invite.rol as KullaniciKaydi['rol'],
      sifre_hash: sifreHashle(sifre),
      durum: 'AKTIF',
      aktivasyon_token: null,
      token_gecerlilik: null,
      olusturma_tarihi: new Date().toISOString(),
    };
    if (supabase) {
      // Claim before creating a user. A transaction/RPC is still needed to roll
      // back this claim if the subsequent account insertion fails.
      const { data: claimed, error } = await supabase
        .from('davetler')
        .update({
          durum: 'KULLANILDI',
          kullanan_adi: newUser.ad_soyad,
          kullanan_telefon: newUser.telefon,
          kullanildi_tarih: new Date().toISOString(),
        })
        .eq('token', cleanToken)
        .eq('durum', 'AKTIF')
        .gt('son_kullanma_tarihi', new Date().toISOString())
        .select('token')
        .maybeSingle();
      if (error) throw error;
      if (!claimed)
        return res.status(409).json({ basarili: false, hata: 'Bu dəvət artıq etibarlı deyil.' });
      const { data: inserted, error: insertError } = await supabase
        .from('kullanicilar')
        .insert(newUser)
        .select('id')
        .maybeSingle();
      if (insertError) throw insertError;
      if (!inserted)
        return res
          .status(503)
          .json({ basarili: false, hata: 'İstifadəçi qeydi yaradıla bilmədi.' });
    }
    if (!supabase && !isAvailableInvite(invite, cleanToken)) {
      return res.status(400).json({ basarili: false, hata: 'Bu dəvət artıq etibarlı deyil.' });
    }
    invite.kullanildiMi = true;
    invite.kullananKisi = newUser.ad_soyad;
    const localInvite = davetlerVeritabani.find((item) => item.token === cleanToken);
    if (localInvite) Object.assign(localInvite, invite);
    cacheUser(newUser);
    const localFirma = firmalarVeritabani.find((item) => item.id === invite.tenantId);
    if (localFirma) {
      localFirma.aktifKullaniciSayilari ||= {
        PATRON: 1,
        KANADA_SATINALMA: 0,
        SATIS_SORUMLUSU: 0,
        BAKU_FINANS: 0,
        BAKU_KURYE: 0,
      };
      const role = invite.rol as keyof typeof localFirma.aktifKullaniciSayilari;
      if (localFirma.aktifKullaniciSayilari[role] !== undefined)
        localFirma.aktifKullaniciSayilari[role] += 1;
      firmalariKaydetDosyaya(firmalarVeritabani);
    }
    return res.json({
      basarili: true,
      tenantId: invite.tenantId,
      tenantAd: firma.ad,
      rol: invite.rol,
      mesaj: `Təbriklər! "${firma.ad}" komandasına ${invite.rol} olaraq şifrəniz təyin edildi.`,
      kullanici: {
        id: newUser.id,
        adSoyad: newUser.ad_soyad,
        email: newUser.email,
        telefon: newUser.telefon,
        rol: newUser.rol,
        tenantId: newUser.tenant_id,
      },
      firma,
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: 'Şifrə hazırda təyin edilə bilmir. Daha sonra yenidən cəhd edin.',
    });
  }
});

// POST /api/auth/giris — İdentifikator (E-poçt / Telefon) və Şifrə ilə Giriş
router.post(['/auth/giris', '/firmalar/giris'], async (req, res) => {
  try {
    const { identifikator, email, kullaniciAdi, telefon, kod, sifre } = req.body || {};
    const girisMetni = String(
      identifikator || email || kullaniciAdi || telefon || kod || ''
    ).trim();
    const sifreMetni = typeof sifre === 'string' ? sifre : '';

    if (!girisMetni) {
      return res.status(400).json({
        basarili: false,
        hata: 'Zəhmət olmasa e-poçt ünvanınızı və ya telefon nömrənizi daxil edin.',
      });
    }

    const lower = girisMetni.toLowerCase();

    // 1. Super Admin Girişi (Kod və ya Parol ilə)
    if (lower === 'admin2026' || (lower === 'admin' && sifreMetni === 'admin2026')) {
      return res.json({
        basarili: true,
        tip: 'super_admin',
        rol: 'SUPER_ADMIN',
        tenantId: 'all',
        mesaj: 'Səlahiyyətli Super Admin girişi təsdiqləndi.',
      });
    }

    // 2. Canlı Təqdimat Demo Girişi (Toxunulmaz)
    if (
      lower === 'tomnap2026' ||
      lower === 'tomnap' ||
      (lower === 'demo' && sifreMetni === 'tomnap2026')
    ) {
      return res.json({
        basarili: true,
        tip: 'demo',
        rol: 'SUPER_ADMIN',
        tenantId: 'demo_sandbox',
        mesaj: 'Canlı Sandbox Demo Mühitinə keçid edildi.',
      });
    }

    // Normal istifadəçi üçün şifrə mütləqdir
    if (!sifreMetni) {
      return res.status(400).json({
        basarili: false,
        hata: 'Zəhmət olmasa şifrənizi daxil edin.',
      });
    }

    const reqDigits = girisMetni.replace(/[^0-9]/g, '');

    // 3. İstifadəçilər bazasında axtarış (Email və ya Telefon)
    let tapilanKullanici: KullaniciKaydi | undefined = supabase
      ? undefined
      : kullanicilarVeritabani.find((u) => {
          const emailMatch = u.email && u.email.toLowerCase() === lower;
          const uDigits = String(u.telefon || '').replace(/[^0-9]/g, '');
          const phoneMatch =
            reqDigits.length >= 7 &&
            uDigits.length >= 7 &&
            (reqDigits.endsWith(uDigits.slice(-7)) || uDigits.endsWith(reqDigits.slice(-7)));

          return emailMatch || phoneMatch;
        });

    // Supabase varsa etibarlı axtarış (Email, Telefon və ya Butik adı)
    if (!tapilanKullanici && supabase) {
      try {
        let sbUser: any = null;

        // A. Email ilə axtarış
        if (lower.includes('@')) {
          const { data, error } = await supabase
            .from('kullanicilar')
            .select('*')
            .ilike('email', lower)
            .maybeSingle();
          if (error) throw error;
          if (data) sbUser = data;
        }

        // B. Telefon ilə axtarış
        if (!sbUser && reqDigits.length >= 7) {
          const { data, error } = await supabase
            .from('kullanicilar')
            .select('*')
            .ilike('telefon', `%${reqDigits.slice(-7)}%`)
            .maybeSingle();
          if (error) throw error;
          if (data) sbUser = data;
        }

        // C. Ad Soyad ilə axtarış
        if (!sbUser) {
          const { data, error } = await supabase
            .from('kullanicilar')
            .select('*')
            .ilike('ad_soyad', lower)
            .maybeSingle();
          if (error) throw error;
          if (data) sbUser = data;
        }

        // D. Butik Adı ilə axtarış (İstifadəçi butik adını yazıbsa, həmin butikin PATRON istifadəçisini tap)
        if (!sbUser) {
          const { data: matchedFirma, error: firmaError } = await supabase
            .from('firmalar')
            .select('id')
            .or(`ad.ilike.%${girisMetni}%,sahip_email.ilike.%${lower}%`)
            .limit(1)
            .maybeSingle();

          if (firmaError) throw firmaError;
          if (matchedFirma) {
            const { data: patronUser, error: patronError } = await supabase
              .from('kullanicilar')
              .select('*')
              .eq('tenant_id', matchedFirma.id)
              .eq('rol', 'PATRON')
              .maybeSingle();
            if (patronError) throw patronError;
            if (patronUser) sbUser = patronUser;
          }
        }

        if (sbUser) {
          tapilanKullanici = {
            id: sbUser.id,
            tenant_id: sbUser.tenant_id,
            ad_soyad: sbUser.ad_soyad,
            email: sbUser.email,
            telefon: sbUser.telefon,
            rol: sbUser.rol,
            sifre_hash: sbUser.sifre_hash,
            durum: sbUser.durum,
            aktivasyon_token: sbUser.aktivasyon_token,
            token_gecerlilik: sbUser.token_gecerlilik,
            olusturma_tarihi: sbUser.olusturma_tarihi,
          };
        }
      } catch {
        return res.status(503).json({
          basarili: false,
          hata: 'Giriş hazırda yoxlanıla bilmir. Daha sonra yenidən cəhd edin.',
        });
      }
    }

    // Əgər istifadəçi tapıldısa
    if (tapilanKullanici) {
      // Aktivasiya gözləyirsə
      if (tapilanKullanici.durum !== 'AKTIF') {
        return res.status(403).json({
          basarili: false,
          hata:
            tapilanKullanici.durum === 'BEKLEMEDE_SIFRE'
              ? 'Hesabınız hələ aktivləşdirilməyib. Zəhmət olmasa e-poçt ünvanınıza göndərilən təhlükəsiz linkə keçid edərək şifrənizi təyin edin.'
              : 'Hesabınız aktiv deyil.',
        });
      }

      // Şifrə yoxlanışı
      if (!tapilanKullanici.sifre_hash || !sifreDogrula(sifreMetni, tapilanKullanici.sifre_hash)) {
        return res.status(401).json({
          basarili: false,
          hata: 'Daxil edilmiş şifrə yanlışdır. Zəhmət olmasa yenidən cəhd edin.',
        });
      }

      const firma = await findFirma(tapilanKullanici.tenant_id);

      return res.json({
        basarili: true,
        tip: 'butik',
        rol: tapilanKullanici.rol,
        tenantId: tapilanKullanici.tenant_id,
        kullanici: {
          id: tapilanKullanici.id,
          adSoyad: tapilanKullanici.ad_soyad,
          email: tapilanKullanici.email,
          telefon: tapilanKullanici.telefon,
          rol: tapilanKullanici.rol,
          tenantId: tapilanKullanici.tenant_id,
        },
        firma,
        mesaj: `Xoş gəldiniz, ${tapilanKullanici.ad_soyad}!`,
      });
    }

    return res.status(404).json({
      basarili: false,
      hata: 'Bu məlumatlara uyğun aktiv istifadəçi və ya butik tapılmadı. Zəhmət olmasa e-poçt / nömrənizi yoxlayın və ya qeydiyyatdan keçin.',
    });
  } catch {
    res.status(503).json({
      basarili: false,
      hata: 'Giriş hazırda yoxlanıla bilmir. Daha sonra yenidən cəhd edin.',
    });
  }
});

export default router;
