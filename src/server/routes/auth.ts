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
