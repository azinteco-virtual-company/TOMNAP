import { PublicResourceError } from './publicFetch';
import { PLATFORM_ROLU, rolGrubunda } from '../../shared/roller';

/**
 * Sipariş verisinin yazma hakları tek yerde (Codex R4 F19, F22). Sipariş oluşturma
 * (POST /api/siparisler), inbox onayı, AI otomatik kaydı ve düzenleme (PATCH) aynı
 * kuralları buradan alır.
 *
 * Tahsilat (alinan_tutar ya da ödendi/kısmi durumu) yalnız PAYMENT_WRITE rolleri yazar:
 * PATRON, SATIS_SORUMLUSU, BAKU_FINANS. Bu, v2 ödeme defterinin kuralı ve v1 düzenleme
 * alan listelerinin aynısıdır; SUPER_ADMIN ve satın almacılar tahsilat yazmaz
 * (OPEN_QUESTIONS 24, 32).
 *
 * Detay formunun alanları (OPEN_QUESTIONS 34) genel bir veri hakkıdır: satın alma
 * ayrıntılarını ve müşterinin gümrük kimliğini PATRON ve satın almacılar yazar;
 * SUPER_ADMIN satın alma ayrıntılarını yazar ama gümrük kimliğini yazmaz.
 */
export const SATINALMA_DETAY_ALANLARI = [
  'kanada_magaza_adi',
  'kanada_alis_fiyati_cad',
  'kanada_fatura_gorseli',
] as const;
export const GUMRUK_KIMLIK_ALANLARI = [
  'kanada_gumruk_fin_kodu',
  'kanada_gumruk_pasaport_no',
] as const;
export const DETAY_ALANLARI: readonly string[] = [
  ...SATINALMA_DETAY_ALANLARI,
  ...GUMRUK_KIMLIK_ALANLARI,
];
const TAHSIL_EDILMIS = new Set(['ODENDI', 'KISMI_ODEME']);

export function tahsilatYazabilir(role: string | undefined): boolean {
  return rolGrubunda(role, 'PAYMENT_WRITE');
}
export function tahsilatYetkisiYok(role: string | undefined): PublicResourceError {
  return new PublicResourceError(
    role === PLATFORM_ROLU
      ? 'Platform yöneticisi tahsilat yazamaz; ödemeyi butik ekibi kaydeder.'
      : 'Bu rol tahsilat yazamaz.',
    403
  );
}

export function detayAlaniYazabilir(role: string | undefined, alan: string): boolean {
  if (role === 'PATRON' || rolGrubunda(role, 'BUYERS')) return true;
  if (role === PLATFORM_ROLU) return !(GUMRUK_KIMLIK_ALANLARI as readonly string[]).includes(alan);
  return false;
}
export function detayAlaniYetkisiYok(role: string | undefined, alan: string): PublicResourceError {
  return new PublicResourceError(
    role === PLATFORM_ROLU
      ? 'Platform yöneticisi gümrük kimlik bilgisi yazamaz.'
      : 'Bu alanı yazma yetkiniz yok: ' + alan,
    403
  );
}

/** Light checks of the detail values; FIN and passport are stored upper-case (in place). */
export function detayDegerleriniDenetle(alanlar: Record<string, unknown>): void {
  const bad = (field: string) => new PublicResourceError('Geçersiz değer: ' + field, 400);
  const text = (field: string, pattern: RegExp) => {
    const value = alanlar[field];
    if (value === undefined || value === null) return;
    if (typeof value !== 'string') throw bad(field);
    const normalized = value.trim().toUpperCase();
    if (normalized !== '' && !pattern.test(normalized)) throw bad(field);
    alanlar[field] = normalized;
  };
  text('kanada_gumruk_fin_kodu', /^[A-Z0-9]{7}$/);
  text('kanada_gumruk_pasaport_no', /^[A-Z0-9]{6,12}$/);
  const store = alanlar.kanada_magaza_adi;
  if (store !== undefined && store !== null && (typeof store !== 'string' || store.length > 200))
    throw bad('kanada_magaza_adi');
  const price = alanlar.kanada_alis_fiyati_cad;
  if (
    price !== undefined &&
    price !== null &&
    (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 1_000_000)
  )
    throw bad('kanada_alis_fiyati_cad');
  // An invoice photo: an uploaded file or an inline image under the 4.5 MB request limit.
  const invoice = alanlar.kanada_fatura_gorseli;
  if (
    invoice !== undefined &&
    invoice !== null &&
    (typeof invoice !== 'string' ||
      invoice.length > 4_200_000 ||
      (invoice !== '' &&
        !/^(data:image\/(png|jpeg|webp|gif);base64,|(\/api)?\/uploads\/)/.test(invoice)))
  )
    throw bad('kanada_fatura_gorseli');
}

const bos = (deger: unknown) => deger === undefined || deger === null || deger === '';

/**
 * A new order (direct, inbox approval, AI auto-save): the first collection follows the
 * money-write rule, and every detail field given follows its right and its format.
 * `ekVeriler` is the detail object the caller stores; it is normalized in place.
 */
export function siparisOlusturmaYetkisi(
  role: string | undefined,
  veri: Record<string, unknown>,
  ekVeriler: Record<string, unknown>
): void {
  const alinan = Number(veri.alinan_tutar ?? 0);
  const odenmis =
    (Number.isFinite(alinan) && alinan > 0) || TAHSIL_EDILMIS.has(String(veri.finans_durumu ?? ''));
  if (odenmis && !tahsilatYazabilir(role)) throw tahsilatYetkisiYok(role);
  for (const alan of DETAY_ALANLARI)
    if (!bos(ekVeriler[alan]) && !detayAlaniYazabilir(role, alan))
      throw detayAlaniYetkisiYok(role, alan);
  detayDegerleriniDenetle(ekVeriler);
}
