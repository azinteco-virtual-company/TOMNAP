import { supabase } from './supabase';
import { getIdentitySnapshot, saveIdentitySnapshot } from './state';
import type { DavetKaydi, FirmaTenantItem, KullaniciKaydi } from '../types';
import { ekipRoluMu } from '../../shared/roller';

export class OnboardingError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export async function onboardingRpc(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase!.rpc(name, args);
  if (error) {
    if (error.code === '23505')
      throw new OnboardingError(409, 'Bu e-poçt və ya telefon artıq qeydiyyatdadır.');
    if (error.code === 'PT409')
      throw new OnboardingError(409, 'Link artıq etibarlı deyil və ya komanda limiti dolub.');
    if (error.code === 'PT403') throw new OnboardingError(403, 'Firma aktiv deyil.');
    throw new OnboardingError(503, 'Qeydiyyat saxlanılmadı. Daha sonra yenidən cəhd edin.');
  }
  if (!data) throw new OnboardingError(409, 'Əməliyyat tamamlanmadı. Linki yenidən yoxlayın.');
  return data as any;
}

function ensureUnique(users: KullaniciKaydi[], user: KullaniciKaydi) {
  const email = user.email.trim().toLowerCase();
  const phone = (user.telefon || '').replace(/\D/g, '');
  if (
    users.some(
      (existing) =>
        existing.id !== user.id &&
        (existing.email.trim().toLowerCase() === email ||
          (phone && (existing.telefon || '').replace(/\D/g, '') === phone))
    )
  )
    throw new OnboardingError(409, 'Bu e-poçt və ya telefon artıq qeydiyyatdadır.');
}

function available(invite: DavetKaydi, token: string) {
  return (
    invite.token === token &&
    !invite.kullanildiMi &&
    Date.parse(invite.gecerlilikTarihi) > Date.now() &&
    ekipRoluMu(invite.rol)
  );
}

function capacity(firma: FirmaTenantItem, users: KullaniciKaydi[], role: string) {
  if (firma.onayDurumu !== 'AKTIF') throw new OnboardingError(403, 'Firma aktiv deyil.');
  const limit = Number(firma.rolLimitleri?.[role]);
  const count = users.filter(
    (user) => user.tenant_id === firma.id && user.rol === role && user.durum !== 'PASIF'
  ).length;
  if (!Number.isInteger(limit) || limit <= count)
    throw new OnboardingError(409, 'Komanda rolu üzrə limit dolub.');
  return { count, remaining: limit - count };
}

export function companyRow(firma: FirmaTenantItem) {
  return {
    id: firma.id,
    ad: firma.ad,
    sehir: firma.sehir,
    varsayilan_para_birimi: firma.varsayilanParaBirimi,
    varsayilan_komisyon_yuzdesi: firma.varsayilanKomisyonYuzdesi,
    aciklama: firma.aciklama,
    is_demo: false,
    onay_durumu: firma.onayDurumu,
    paket: firma.paket,
    sahip_adi: firma.sahipAdi,
    sahip_email: firma.sahipEmail,
    sahip_telefon: firma.sahipTelefon,
    mensei_ulke: firma.menseiUlke,
    rol_limitleri: firma.rolLimitleri,
    aktif_kullanici_sayilari: firma.aktifKullaniciSayilari,
  };
}

export async function registerBoutique(
  firma: FirmaTenantItem,
  user: KullaniciKaydi,
  emailJob: Record<string, unknown>
) {
  if (supabase)
    return onboardingRpc('tomnap_register_boutique', {
      p_firma: companyRow(firma),
      p_user: user,
      p_email_job: emailJob,
    });
  const next = getIdentitySnapshot();
  ensureUnique(next.users, user);
  if (next.companies.some((item) => item.id === firma.id))
    throw new OnboardingError(409, 'Bu firma artıq mövcuddur.');
  next.companies.push(firma);
  next.users.push(user);
  next.emailJobs.push(emailJob);
  saveIdentitySnapshot(next);
  return { firma, user };
}

export async function activateUser(
  token: string,
  changes: Pick<KullaniciKaydi, 'sifre_hash' | 'ad_soyad' | 'telefon'>
) {
  if (supabase)
    return onboardingRpc('tomnap_activate_user', {
      p_token: token,
      p_password_hash: changes.sifre_hash,
      p_name: changes.ad_soyad,
      p_phone: changes.telefon || '',
    });
  const next = getIdentitySnapshot();
  const user = next.users.find((item) => item.aktivasyon_token === token);
  if (
    !user ||
    user.durum !== 'BEKLEMEDE_SIFRE' ||
    Date.parse(user.token_gecerlilik || '') <= Date.now() ||
    !Number.isFinite(Date.parse(user.token_gecerlilik || ''))
  ) {
    throw new OnboardingError(409, 'Bu aktivasiya linki artıq etibarlı deyil.');
  }
  const firma = next.companies.find((item) => item.id === user.tenant_id);
  if (!firma || !['BEKLEMEDE', 'AKTIF'].includes(firma.onayDurumu || ''))
    throw new OnboardingError(403, 'Firma aktiv deyil.');
  Object.assign(user, changes, { durum: 'AKTIF', aktivasyon_token: null, token_gecerlilik: null });
  ensureUnique(next.users, user);
  if (firma.onayDurumu === 'BEKLEMEDE') firma.onayDurumu = 'AKTIF';
  saveIdentitySnapshot(next);
  return { user, firma };
}

export async function acceptInvite(token: string, user: KullaniciKaydi) {
  if (supabase) return onboardingRpc('tomnap_accept_invite', { p_token: token, p_user: user });
  const next = getIdentitySnapshot();
  const invite = next.invites.find((item) => item.token === token);
  if (!invite || !available(invite, token))
    throw new OnboardingError(409, 'Bu dəvət artıq etibarlı deyil.');
  const firma = next.companies.find((item) => item.id === invite.tenantId);
  if (!firma) throw new OnboardingError(403, 'Firma aktiv deyil.');
  if (invite.email && invite.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    throw new OnboardingError(403, 'E-poçt ünvanı dəvətdəki ünvanla uyğun gəlmir.');
  }
  const { count } = capacity(firma, next.users, invite.rol);
  const accepted = {
    ...user,
    tenant_id: invite.tenantId,
    rol: invite.rol as KullaniciKaydi['rol'],
    email: invite.email?.trim().toLowerCase() || user.email,
  };
  ensureUnique(next.users, accepted);
  next.users.push(accepted);
  invite.kullanildiMi = true;
  invite.kullananKisi = accepted.ad_soyad;
  firma.aktifKullaniciSayilari = {
    ...firma.aktifKullaniciSayilari,
    [invite.rol]: count + 1,
  } as FirmaTenantItem['aktifKullaniciSayilari'];
  saveIdentitySnapshot(next);
  return { user: accepted, firma };
}

export async function createInvite(
  invite: DavetKaydi,
  creatorRole: string,
  emailJob?: Record<string, unknown>
) {
  if (supabase)
    return onboardingRpc('tomnap_create_invite', {
      p_invite: {
        id: invite.token,
        token: invite.token,
        firma_id: invite.tenantId,
        rol: invite.rol,
        olusturan_rol: creatorRole,
        son_kullanma_tarihi: invite.gecerlilikTarihi,
        email: invite.email || null,
        kullanan_adi: invite.kullananKisi || null,
      },
      p_email_job: emailJob || null,
    });
  const next = getIdentitySnapshot();
  const firma = next.companies.find((item) => item.id === invite.tenantId);
  if (!firma) throw new OnboardingError(403, 'Firma aktiv deyil.');
  const { remaining } = capacity(firma, next.users, invite.rol);
  next.invites.push(invite);
  if (emailJob) next.emailJobs.push(emailJob);
  saveIdentitySnapshot(next);
  return { invite, remaining };
}
