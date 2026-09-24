/**
 * Rol kataloğu: roller, rol grupları ve kota varsayılanları için tek kaynak.
 * Sunucu ve istemci rolleri buradan türetir; başka bir dosyada rol dizisi
 * elle yazılırsa tests/server/rolKatalogu.test.ts düşer. SQL tarafında
 * public.tomnap_gecerli_rol(text) aynı ekip rollerini listeler; test ikisini
 * karşılaştırır.
 */

/** Platform rolü: bir butiğe ait değildir, davetle verilemez. */
export const PLATFORM_ROLU = 'SUPER_ADMIN';

/** Bir butiğin ekibinde bulunabilen, davetle verilebilen roller. */
export const EKIP_ROLLERI = [
  'PATRON', // Butik sahibi: finans, kurye ve sipariş tam kontrol; sistem kodları hariç
  'KANADA_SATINALMA', // Kanada satın alma fişleri, kargo belgeleri, kurye atama
  'ABD_SATINALMA', // ABD'de satın alma ve ABD deposunda kabul (K18); v1'de Kanada'nın eşi
  'SATIS_SORUMLUSU', // Görsel ve WhatsApp siparişi girer, onay bekleyenleri işler
  'BAKU_FINANS', // Bakü tahsilat, kasa ve kalan borç kapama
  'BAKU_KURYE', // Yalnız kendi kurye kaydına açıkça atanmış paketleri görür
] as const;

export const ROLLER = [PLATFORM_ROLU, ...EKIP_ROLLERI] as const;

export type KullaniciRolu = (typeof ROLLER)[number];
export type EkipRolu = (typeof EKIP_ROLLERI)[number];

const ROL_KUMESI: ReadonlySet<string> = new Set(ROLLER);
const EKIP_ROL_KUMESI: ReadonlySet<string> = new Set(EKIP_ROLLERI);

export function gecerliRolMu(value: unknown): value is KullaniciRolu {
  return typeof value === 'string' && ROL_KUMESI.has(value);
}

/** Davet, kabul ve kota yalnız ekip rolleri için geçerlidir. */
export function ekipRoluMu(value: unknown): value is EkipRolu {
  return typeof value === 'string' && EKIP_ROL_KUMESI.has(value);
}

const OWNERS = [PLATFORM_ROLU, 'PATRON'] as const;
const SALES = [...OWNERS, 'SATIS_SORUMLUSU'] as const;
/** Satın almacılar: ülkeye göre (CA, US) aynı yetkiler. */
const BUYERS = ['KANADA_SATINALMA', 'ABD_SATINALMA'] as const;
const STAFF = [...SALES, ...BUYERS, 'BAKU_FINANS'] as const;

/** Yetki grupları: allowlist, menü ve alan yetkileri bu gruplardan türetilir. */
export const ROL_GRUPLARI = {
  /** Kurye dışındaki herkes. */
  STAFF,
  OWNERS,
  SALES,
  BUYERS,
  PURCHASING: [...SALES, ...BUYERS],
  FINANCE: [...SALES, 'BAKU_FINANS'],
  /** AWB, kargo ve kurye ataması. */
  SHIPPING: [...OWNERS, ...BUYERS],
  /** Kur okuma ve girişi (v2 rol matrisi): sahipler, satın almacılar, Bakü finans. */
  RATES: [...OWNERS, ...BUYERS, 'BAKU_FINANS'],
  ALL: [...STAFF, 'BAKU_KURYE'],
} as const satisfies Record<string, readonly KullaniciRolu[]>;

export type RolGrubu = keyof typeof ROL_GRUPLARI;

export function rolGrubunda(role: unknown, grup: RolGrubu): role is KullaniciRolu {
  return (ROL_GRUPLARI[grup] as readonly string[]).includes(role as string);
}

/** Ekip rolü başına kullanıcı sınırı; `firmalar.rol_limitleri` ile aynı biçim. */
export type RolLimitleri = Record<EkipRolu, number>;

export type Paket = 'BASLANGIC' | 'PRO' | 'ENTERPRISE';

/** Kaydında sınır olmayan firmalar ve süper admin'in açtığı firmalar için. */
export const VARSAYILAN_ROL_LIMITLERI: Readonly<RolLimitleri> = {
  PATRON: 1,
  KANADA_SATINALMA: 2,
  ABD_SATINALMA: 2,
  SATIS_SORUMLUSU: 4,
  BAKU_FINANS: 2,
  BAKU_KURYE: 10,
};

/** Kendi kaydolan butiğin paketine göre sınırlar (Başlangıç: hepsi 1). */
export const PAKET_ROL_LIMITLERI: Readonly<Record<Paket, Readonly<RolLimitleri>>> = {
  BASLANGIC: {
    PATRON: 1,
    KANADA_SATINALMA: 1,
    ABD_SATINALMA: 1,
    SATIS_SORUMLUSU: 1,
    BAKU_FINANS: 1,
    BAKU_KURYE: 1,
  },
  PRO: {
    PATRON: 1,
    KANADA_SATINALMA: 2,
    ABD_SATINALMA: 2,
    SATIS_SORUMLUSU: 2,
    BAKU_FINANS: 2,
    BAKU_KURYE: 5,
  },
  ENTERPRISE: {
    PATRON: 2,
    KANADA_SATINALMA: 5,
    ABD_SATINALMA: 5,
    SATIS_SORUMLUSU: 10,
    BAKU_FINANS: 5,
    BAKU_KURYE: 25,
  },
};

/**
 * Kaydında anahtarı olmayan rolün kotası. Mevcut firmaların `rol_limitleri`
 * değiştirilmez (K18): ABD_SATINALMA anahtarı yoksa varsayılana düşer; diğer
 * rollerde eksik anahtar bugünkü gibi 0 demektir. SQL karşılığı
 * public.tomnap_rol_kota_varsayilani(text).
 */
export const EKSIK_ANAHTAR_KOTASI: Readonly<Partial<RolLimitleri>> = {
  ABD_SATINALMA: VARSAYILAN_ROL_LIMITLERI.ABD_SATINALMA,
};

/** Firmanın bir ekip rolü için kotası; kayıtta anahtar yoksa EKSIK_ANAHTAR_KOTASI. */
export function rolKotasi(
  limitler: Readonly<Record<string, unknown>> | undefined,
  rol: EkipRolu
): number {
  const kayitli = limitler?.[rol];
  return kayitli === undefined || kayitli === null
    ? (EKSIK_ANAHTAR_KOTASI[rol] ?? 0)
    : Number(kayitli);
}

/** Yeni firmanın sayaçları: yalnız sahibi (ilk patron) sayılır. */
export function ilkKullaniciSayilari(): RolLimitleri {
  const sayilar = Object.fromEntries(EKIP_ROLLERI.map((rol) => [rol, 0])) as RolLimitleri;
  sayilar.PATRON = 1;
  return sayilar;
}
