import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { kullanicilarVeritabani, firmalarVeritabani, davetlerVeritabani } from '../services/state';
import { activateUser, acceptInvite, OnboardingError } from '../services/onboarding';
import { sifreHashle, sifreDogrula } from '../services/crypto';
import { supabase } from '../services/supabase';
import { DavetKaydi, KullaniciKaydi } from '../types';
import { createSession, readSession, revokeSession } from '../services/sessions';

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
    email: data.email || undefined,
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
    if (typeof sifre !== 'string' || sifre.length < 6 || sifre.length > 1024) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Şifrə ən azı 6 simvoldan ibarət olmalıdır.' });
    }
    if (
      (adSoyad !== undefined && (typeof adSoyad !== 'string' || adSoyad.trim().length > 150)) ||
      (telefon !== undefined &&
        (typeof telefon !== 'string' || (telefon.trim() && !normalizePhone(telefon.trim()))))
    ) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Ad və telefon məlumatlarını yoxlayın.' });
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
      const { user: activatedUser, firma } = await activateUser(cleanToken, {
        sifre_hash: sifreHashle(sifre),
        ad_soyad: typeof adSoyad === 'string' && adSoyad.trim() ? adSoyad.trim() : user.ad_soyad,
        telefon: typeof telefon === 'string' && telefon.trim() ? telefon.trim() : user.telefon,
      });
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
    if (
      invite.email &&
      typeof email === 'string' &&
      email.trim() &&
      email.trim().toLowerCase() !== invite.email.trim().toLowerCase()
    ) {
      return res
        .status(403)
        .json({ basarili: false, hata: 'E-poçt ünvanı dəvətdəki ünvanla uyğun gəlmir.' });
    }
    const userEmail =
      (typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : '') ||
      (typeof email === 'string' ? email.trim().toLowerCase() : '');
    const userPhone = typeof telefon === 'string' ? telefon.trim() : '';
    const validEmail = userEmail.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail);
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
    const { user: acceptedUser, firma: acceptedFirma } = await acceptInvite(cleanToken, newUser);
    return res.json({
      basarili: true,
      tenantId: invite.tenantId,
      tenantAd: acceptedFirma.ad,
      rol: invite.rol,
      mesaj: `Təbriklər! "${acceptedFirma.ad}" komandasına ${invite.rol} olaraq şifrəniz təyin edildi.`,
      kullanici: {
        id: acceptedUser.id,
        adSoyad: acceptedUser.ad_soyad,
        email: acceptedUser.email,
        telefon: acceptedUser.telefon,
        rol: acceptedUser.rol,
        tenantId: acceptedUser.tenant_id,
      },
      firma: acceptedFirma,
    });
  } catch (error) {
    if (error instanceof OnboardingError)
      return res.status(error.status).json({ basarili: false, hata: error.message });
    return res.status(503).json({
      basarili: false,
      hata: 'Şifrə hazırda təyin edilə bilmir. Daha sonra yenidən cəhd edin.',
    });
  }
});

// Login identifiers are exact emails or full phone numbers. Neither names nor
// boutique labels are authentication identities, and SQL wildcard syntax is not
// accepted as an identifier pattern.
function normalizePhone(value: string): string {
  if (!/^[+\d\s().-]+$/.test(value)) return '';
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
}

async function findLoginUser(identifier: string): Promise<KullaniciKaydi | undefined> {
  const email = identifier.toLowerCase();
  const phone = normalizePhone(identifier);
  const emailMatches = (user: KullaniciKaydi) => user.email?.toLowerCase() === email;
  const phoneMatches = (user: KullaniciKaydi) =>
    !!phone && normalizePhone(user.telefon || '') === phone;
  if (!supabase) {
    const matches = kullanicilarVeritabani.filter(
      (user) => emailMatches(user) || phoneMatches(user)
    );
    // Ambiguous identifiers cannot select whichever account happens to be first.
    return matches.length === 1 ? { ...matches[0] } : undefined;
  }
  if (email.includes('@') && email.length <= 254) {
    const escapedEmail = email.replace(/[\\%_]/g, (character) => `\\${character}`);
    const { data, error } = await supabase
      .from('kullanicilar')
      .select('*')
      .ilike('email', escapedEmail)
      .maybeSingle();
    if (error) throw error;
    return data && emailMatches(data) ? data : undefined;
  }
  if (phone) {
    // Digits-only patterns support legacy formatted phone values; the final
    // normalized equality check prevents partial-number authentication.
    const pattern = `%${phone.split('').join('%')}%`;
    const { data, error } = await supabase
      .from('kullanicilar')
      .select('*')
      .ilike('telefon', pattern);
    if (error) throw error;
    const matches = (data || []).filter(phoneMatches);
    return matches.length === 1 ? matches[0] : undefined;
  }
  return undefined;
}

router.post(['/auth/giris', '/firmalar/giris'], async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { identifikator, email, kullaniciAdi, telefon, kod, sifre } = req.body || {};
    const identifier = identifikator || email || kullaniciAdi || telefon || kod;
    if (typeof identifier !== 'string' || !identifier.trim() || identifier.length > 254) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'E-poçt ünvanınızı və ya telefon nömrənizi daxil edin.' });
    }
    if (typeof sifre !== 'string' || !sifre || sifre.length > 1024) {
      return res.status(400).json({ basarili: false, hata: 'Zəhmət olmasa şifrənizi daxil edin.' });
    }
    const user = await findLoginUser(identifier.trim());
    if (!user) {
      return res
        .status(404)
        .json({ basarili: false, hata: 'Bu məlumatlara uyğun aktiv istifadəçi tapılmadı.' });
    }
    if (user.durum !== 'AKTIF') {
      return res.status(403).json({
        basarili: false,
        hata:
          user.durum === 'BEKLEMEDE_SIFRE'
            ? 'Hesabınız hələ aktivləşdirilməyib. E-poçt ünvanınıza göndərilən linkdən şifrənizi təyin edin.'
            : 'Hesabınız aktiv deyil.',
      });
    }
    if (!user.sifre_hash || !sifreDogrula(sifre, user.sifre_hash)) {
      return res.status(401).json({ basarili: false, hata: 'Daxil edilmiş şifrə yanlışdır.' });
    }
    const firma = user.rol === 'SUPER_ADMIN' ? undefined : await findFirma(user.tenant_id);
    const session = await createSession(user, res);
    const tenantId = user.rol === 'SUPER_ADMIN' ? 'all' : user.tenant_id;
    return res.json({
      basarili: true,
      tip: user.rol === 'SUPER_ADMIN' ? 'super_admin' : 'butik',
      rol: user.rol,
      tenantId,
      kullanici: {
        id: user.id,
        adSoyad: user.ad_soyad,
        email: user.email,
        telefon: user.telefon,
        rol: user.rol,
        tenantId,
      },
      firma,
      ...session,
      mesaj: `Xoş gəldiniz, ${user.ad_soyad}!`,
    });
  } catch {
    return res.status(503).json({
      basarili: false,
      hata: 'Giriş hazırda yoxlanıla bilmir. Daha sonra yenidən cəhd edin.',
    });
  }
});

router.get('/auth/oturum', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const session = req.auth || (await readSession(req));
    if (!session) return res.status(401).json({ basarili: false, hata: 'Giriş tələb olunur.' });
    return res.json({
      basarili: true,
      kullanici: session.kullanici,
      csrfToken: session.csrfToken,
      expiresAt: session.expiresAt,
    });
  } catch {
    return res.status(503).json({ basarili: false, hata: 'Oturum hazırda yoxlanıla bilmir.' });
  }
});

// The application authentication middleware requires an active session and its
// CSRF token before this state-changing endpoint can be reached.
router.post('/auth/cikis', async (req, res) => {
  try {
    await revokeSession(req, res);
    return res.json({ basarili: true });
  } catch {
    return res
      .status(503)
      .json({ basarili: false, hata: 'Oturum ləğv edilə bilmədi. Yenidən cəhd edin.' });
  }
});

export default router;
