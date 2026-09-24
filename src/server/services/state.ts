import path from 'path';
import {
  DATA_DIR,
  FIRMALAR_DOSYA_YOLU,
  KULLANICILAR_DOSYA_YOLU,
  IS_PRODUCTION,
  SUPABASE_URL,
} from '../config';
import { JsonStorageError, readJsonFile, writeJsonAtomic } from './atomicJson';
import { ekipRoluMu, gecerliRolMu } from '../../shared/roller';
import { BASLANGIC_SIPARISLER } from '../../data/ornek-siparisler';
import {
  MusteriKaydi,
  FirmaTenantItem,
  OnayBekleyenKaydi,
  KullaniciKaydi,
  DavetKaydi,
} from '../types';

// In-memory sipariş veritabanı
export let siparislerVeritabani: any[] = [...BASLANGIC_SIPARISLER];

export function setSiparislerVeritabani(yeniListe: any[]) {
  siparislerVeritabani = yeniListe;
}

// DƏYİŞMƏZ QIZIL DEMO BAZASI (Golden Demo Dataset - 109 İlkin Sifariş)
export const GOLDEN_DEMO_SIPARISLER = JSON.parse(JSON.stringify(BASLANGIC_SIPARISLER)).map(
  (s: any) => ({
    ...s,
    tenant_id: 'demo_sandbox',
    is_demo: true,
  })
);

// Təcrid olunmuş Canlı Demo Sandbox Hovuzu (Ziyarətçilər əsas bazanı zədələyə bilməz)
export let demoSiparislerVeritabani: any[] = JSON.parse(JSON.stringify(GOLDEN_DEMO_SIPARISLER));

export function setDemoSiparislerVeritabani(yeniListe: any[]) {
  demoSiparislerVeritabani = yeniListe;
}

export function sifirlaDemoVeritabani(): number {
  demoSiparislerVeritabani = JSON.parse(JSON.stringify(GOLDEN_DEMO_SIPARISLER));
  return demoSiparislerVeritabani.length;
}

// In-memory müşteri veritabanı (CRM)
export let musterilerVeritabani: MusteriKaydi[] = [
  {
    id: 'mus-001',
    ad_soyad: 'Kəmalə Bədirbəyli',
    telefon: '+994 50 694 25 25',
    instagram_kullanici_adi: '@kemale_bedirbeyli',
    sehir: 'Gəncə',
    adres: 'Gəncə şəhəri, Ozan küçəsi döngə 4',
    musteri_tipi: 'SADIK_MUSTERI',
    toplam_siparis_sayisi: 3,
    toplam_harcama: 580.0,
    kalan_toplam_borc: 80.0,
    notlar: 'Gəncə daimi müştərisi, Ozan küçəsində yaşayır. 3 fərqli uğurlu sifarişi var.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 36).toISOString(),
    son_urun_aciklamasi: 'Michael Kors Greenwich Dəri Çanta (180 AZN)',
    son_siparis_tutari: 180.0,
  },
  {
    id: 'mus-002',
    ad_soyad: 'Aytən Məmmədova',
    telefon: '+994 50 214 55 88',
    instagram_kullanici_adi: '@ayten_fashion_baku',
    sehir: 'Bakı',
    adres: 'Nərimanov m/s yaxınlığı, Təbriz küçəsi',
    musteri_tipi: 'SADIK_MUSTERI',
    toplam_siparis_sayisi: 2,
    toplam_harcama: 265.0,
    kalan_toplam_borc: 65.0,
    notlar: 'Bəzən beh atıb maaş günündə qalanını bağlayır.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 40).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    son_urun_aciklamasi: 'Canlı yayındaki kırmızı midi elbise (85 AZN)',
    son_siparis_tutari: 85.0,
  },
  {
    id: 'mus-003',
    ad_soyad: 'Nigar Əliyeva',
    telefon: '+994 55 987 11 22',
    instagram_kullanici_adi: '@nigar.aliyeva',
    sehir: 'Bakı',
    adres: '28 May m/s çıxışı, Səməd Vurğun bağının yanı',
    musteri_tipi: 'VIP',
    toplam_siparis_sayisi: 5,
    toplam_harcama: 1240.0,
    kalan_toplam_borc: 0.0,
    notlar: 'Çanta və ayaqqabı daimi alıcısı. Tam ödəniş edir.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 42).toISOString(),
    son_urun_aciklamasi: 'Michael Kors deri omuz çantası (190 AZN)',
    son_siparis_tutari: 190.0,
  },
  {
    id: 'mus-004',
    ad_soyad: 'Leyla Qasımova',
    telefon: '+994 70 333 44 11',
    instagram_kullanici_adi: '@leylaq_89',
    sehir: 'Bakı',
    adres: '',
    musteri_tipi: 'AKRABA_YAKIN',
    toplam_siparis_sayisi: 1,
    toplam_harcama: 240.0,
    kalan_toplam_borc: 240.0,
    notlar: 'Xalanın rəfiqəsi. Bakıda qohuma nağd ödəyir.',
    olusturma_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
    son_siparis_tarihi: new Date(Date.now() - 1000 * 60 * 60 * 70).toISOString(),
    son_urun_aciklamasi: 'Canada Goose çocuk kışlık mont (240 AZN)',
    son_siparis_tutari: 240.0,
  },
];

export function setMusterilerVeritabani(yeniListe: MusteriKaydi[]) {
  musterilerVeritabani = yeniListe;
}

// A single local identity snapshot keeps company, user, invitation and queued
// email changes together. Legacy files are read only until the first snapshot;
// they remain on disk for operator-controlled backup/migration.
export const IDENTITY_DOSYA_YOLU = path.join(DATA_DIR, 'identity.json');
export interface IdentitySnapshot {
  companies: FirmaTenantItem[];
  users: KullaniciKaydi[];
  invites: DavetKaydi[];
  emailJobs: Record<string, unknown>[];
}
type PersistedIdentity = IdentitySnapshot & { version: 1 };
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function companyRecord(value: unknown): value is FirmaTenantItem {
  return (
    object(value) &&
    nonempty(value.id) &&
    nonempty(value.ad) &&
    typeof value.sehir === 'string' &&
    ['AZN', 'CAD', 'USD'].includes(String(value.varsayilanParaBirimi)) &&
    typeof value.varsayilanKomisyonYuzdesi === 'number' &&
    Number.isFinite(value.varsayilanKomisyonYuzdesi) &&
    typeof value.aciklama === 'string'
  );
}
function userRecord(value: unknown): value is KullaniciKaydi {
  return (
    object(value) &&
    nonempty(value.id) &&
    nonempty(value.tenant_id) &&
    typeof value.ad_soyad === 'string' &&
    typeof value.email === 'string' &&
    gecerliRolMu(value.rol) &&
    ['BEKLEMEDE_SIFRE', 'AKTIF', 'PASIF'].includes(String(value.durum)) &&
    typeof value.olusturma_tarihi === 'string'
  );
}
function inviteRecord(value: unknown): value is DavetKaydi {
  return (
    object(value) &&
    nonempty(value.token) &&
    nonempty(value.tenantId) &&
    typeof value.tenantAd === 'string' &&
    ekipRoluMu(value.rol) &&
    typeof value.olusturanKisi === 'string' &&
    typeof value.olusturmaTarihi === 'string' &&
    typeof value.gecerlilikTarihi === 'string' &&
    typeof value.kullanildiMi === 'boolean'
  );
}
function records<T>(
  value: unknown,
  valid: (item: unknown) => item is T,
  key: keyof T
): value is T[] {
  return (
    Array.isArray(value) &&
    value.every(valid) &&
    new Set(value.map((item) => item[key])).size === value.length
  );
}
function snapshotRecord(value: unknown): value is PersistedIdentity {
  return (
    object(value) &&
    value.version === 1 &&
    records(value.companies, companyRecord, 'id') &&
    records(value.users, userRecord, 'id') &&
    records(value.invites, inviteRecord, 'token') &&
    Array.isArray(value.emailJobs) &&
    value.emailJobs.every(object)
  );
}
function defaultCompanies(): FirmaTenantItem[] {
  return [
    {
      id: 'kanada_shopper_baku',
      ad: 'Kanada Shopper Bakı',
      sehir: 'Bakı',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      aciklama: 'Əsas canlı butik və beynəlxalq logistika iş sahəsi',
    },
    {
      id: 'ayla_boutique',
      ad: 'Ayla Boutique',
      sehir: 'Gəncə',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 18,
      aciklama: 'Gəncə və qərb rayonları üzrə tərəfdaş butik',
    },
    {
      id: 'luxury_brand_baku',
      ad: 'Luxury Brands VIP',
      sehir: 'Bakı',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 20,
      aciklama: 'Lüks çanta və geyim sifarişləri (VIP müştərilər)',
    },
    {
      id: 'demo_sandbox',
      ad: 'Demo & Təlim İş Sahəsi',
      sehir: 'Bakı / Toronto',
      varsayilanParaBirimi: 'AZN',
      varsayilanKomisyonYuzdesi: 15,
      aciklama: 'Yeni müştərilərə və işçilərə təqdimat mühiti',
      isDemo: true,
    },
  ];
}

export function loadIdentitySnapshot(): IdentitySnapshot {
  const current = readJsonFile(IDENTITY_DOSYA_YOLU, snapshotRecord);
  if (current !== undefined)
    return structuredClone({
      companies: current.companies,
      users: current.users,
      invites: current.invites,
      emailJobs: current.emailJobs,
    });
  const companies = readJsonFile(FIRMALAR_DOSYA_YOLU, (value): value is FirmaTenantItem[] =>
    records(value, companyRecord, 'id')
  );
  const users = readJsonFile(KULLANICILAR_DOSYA_YOLU, (value): value is KullaniciKaydi[] =>
    records(value, userRecord, 'id')
  );
  return {
    companies: companies === undefined ? defaultCompanies() : companies,
    users: users ?? [],
    invites: [],
    emailJobs: [],
  };
}

// The database is authoritative in configured/production deployments. Stale
// development files must neither supply accounts nor block database startup.
const initialIdentity: IdentitySnapshot =
  IS_PRODUCTION || SUPABASE_URL
    ? { companies: [], users: [], invites: [], emailJobs: [] }
    : loadIdentitySnapshot();
export let firmalarVeritabani = initialIdentity.companies;
export let kullanicilarVeritabani = initialIdentity.users;
export let davetlerVeritabani = initialIdentity.invites;
let identityEmailJobs = initialIdentity.emailJobs;

export function getIdentitySnapshot(): IdentitySnapshot {
  return structuredClone({
    companies: firmalarVeritabani,
    users: kullanicilarVeritabani,
    invites: davetlerVeritabani,
    emailJobs: identityEmailJobs,
  });
}

/** Callers must prepare fresh arrays/objects; never mutate exported authority
 * before this succeeds. All memory publication follows the single rename. */
export function saveIdentitySnapshot(
  next: Omit<IdentitySnapshot, 'emailJobs'> & { emailJobs?: Record<string, unknown>[] }
): void {
  let snapshot: PersistedIdentity;
  try {
    snapshot = structuredClone({
      version: 1 as const,
      ...next,
      emailJobs: next.emailJobs ?? identityEmailJobs,
    });
  } catch (error) {
    throw new JsonStorageError('Yerel kimlik verileri geçersiz.', error);
  }
  if (!snapshotRecord(snapshot)) throw new JsonStorageError('Yerel kimlik verileri geçersiz.');
  writeJsonAtomic(IDENTITY_DOSYA_YOLU, snapshot);
  firmalarVeritabani = snapshot.companies;
  kullanicilarVeritabani = snapshot.users;
  davetlerVeritabani = snapshot.invites;
  identityEmailJobs = snapshot.emailJobs;
}

export function firmalariYukleDosyadan(): FirmaTenantItem[] {
  return loadIdentitySnapshot().companies;
}
export function kullanicilariYukleDosyadan(): KullaniciKaydi[] {
  return loadIdentitySnapshot().users;
}
export function firmalariKaydetDosyaya(companies: FirmaTenantItem[]): void {
  saveIdentitySnapshot({ ...getIdentitySnapshot(), companies });
}
export function kullanicilariKaydetDosyaya(users: KullaniciKaydi[]): void {
  saveIdentitySnapshot({ ...getIdentitySnapshot(), users });
}
// Explicit memory-only helpers remain useful for isolated fixtures.
export function setFirmalarVeritabani(companies: FirmaTenantItem[]) {
  firmalarVeritabani = companies;
}
export function setKullanicilarVeritabani(users: KullaniciKaydi[]) {
  kullanicilarVeritabani = users;
}
export function setDavetlerVeritabani(invites: DavetKaydi[]) {
  davetlerVeritabani = invites;
}

// In-memory onay bekleyen mesajlar havuzu (Gelen Kutusu / Staging Inbox)
export let onayBekleyenler: OnayBekleyenKaydi[] = [
  {
    id: 'inbox-001',
    gelis_tarihi: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    kaynak: 'INSTAGRAM_DM',
    gonderen_kullanici: '@sevda_aliyeva',
    konusma_gecmisi: `Müşteri: Salam canım, bu Aldo çanta hələ qalıb?
Satıcı: Bəli Sevda xanım, son 2 ədəd qalıb qara və bej rəngi.
Müşteri: Bej rəngini istəyirəm, 60 manat bibinizə beh atdım, qalanını Bakıda çatdıranda verəcəm.
Satıcı: Əla, qeydə aldım #SİPARİŞ`,
    tetikleyici_kod: '#SİPARİŞ',
    durum: 'BEKLEMEDE',
    tenant_id: 'kanada_shopper_baku',
    oneri_siparis: {
      tenant_id: 'kanada_shopper_baku',
      musteri_adi: 'Sevda Əliyeva',
      instagram_kullanici_adi: '@sevda_aliyeva',
      telefon_numarasi: '',
      teslimat_sehri: 'Bakü',
      teslimat_adresi: '',
      urun_aciklamasi: 'Aldo Bej Çanta',
      beden_veya_olcu: 'Standart',
      renk: 'Bej',
      adet: 1,
      toplam_tutar: 110,
      alinan_tutar: 60,
      kalan_tutar: 50,
      para_birimi: 'AZN',
      finans_durumu: 'KISMI_ODEME',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: '60 AZN bibiye ödendi, 50 AZN Baküde teslimatta',
      eksik_bilgiler: ['telefon_numarasi', 'teslimat_adresi'],
      ai_guven_skoru: 0.94,
    },
  },
  {
    id: 'inbox-002',
    gelis_tarihi: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    kaynak: 'WHATSAPP',
    gonderen_kullanici: '+994 50 333 44 55 (Leyla Q.)',
    konusma_gecmisi: `Leyla: Salam, Sephora-dakı Rare Beauty ənlik var idi ya, Hope rəngi?
Satıcı: Bəli var, qiyməti 75 manatdır.
Leyla: Zəhmət olmasa 1 ədəd mənə ayırın, kartınıza tam 75 manat atdım indicə. Ünvan: Elmlər m/s yaxınlığı.
Satıcı: Çox sağ olun Leyla xanım, sifarişiniz qəbul edildi #ONAY`,
    tetikleyici_kod: '#ONAY',
    durum: 'BEKLEMEDE',
    tenant_id: 'kanada_shopper_baku',
    oneri_siparis: {
      tenant_id: 'kanada_shopper_baku',
      musteri_adi: 'Leyla Q.',
      instagram_kullanici_adi: '',
      telefon_numarasi: '+994 50 333 44 55',
      teslimat_sehri: 'Bakü',
      teslimat_adresi: 'Elmlər m/s yaxınlığı',
      urun_aciklamasi: 'Rare Beauty Allık (Hope)',
      beden_veya_olcu: 'Standart',
      renk: 'Hope',
      adet: 1,
      toplam_tutar: 75,
      alinan_tutar: 75,
      kalan_tutar: 0,
      para_birimi: 'AZN',
      finans_durumu: 'ODENDI',
      lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
      baku_tahsilat_notu: 'Tam tutar peşin karta ödendi',
      eksik_bilgiler: [],
      ai_guven_skoru: 0.98,
    },
  },
];

export function setOnayBekleyenler(yeniListe: OnayBekleyenKaydi[]) {
  onayBekleyenler = yeniListe;
}
