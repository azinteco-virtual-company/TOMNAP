import dilListesi from '../i18n/diller.json';

/**
 * Arayüz dilleri (docs/i18n.md). Desteklenen liste `src/i18n/diller.json`'dadır; yeni bir
 * dil o listeye kodu ve `src/i18n/locales/<kod>/` altına aynı ad alanı dosyalarını
 * eklemekle gelir (gerekirse PDF fontu: src/i18n/pdfFontu.ts). Sunucu butiğin varsayılan
 * dilini bu listeye göre doğrular; veritabanı yalnız biçimi denetler (migration 20).
 */
export const DESTEKLENEN_DILLER: readonly string[] = Object.freeze([...dilListesi.desteklenen]);

/** Hiçbir tercih desteklenmiyorsa (karar: İngilizce). */
export const YEDEK_DIL = 'en';
/** Satırı olmayan butiğin varsayılan dili (migration 20'deki DEFAULT ile aynı). */
export const BUTIK_VARSAYILAN_DILI = 'az';
/** Veritabanındaki biçim CHECK'iyle aynı: iki ya da üç küçük harf. */
export const DIL_KODU_BICIMI = /^[a-z]{2,3}$/;
/** Sağdan sola yazılan diller: `<html dir="rtl">`. */
export const RTL_DILLER: readonly string[] = ['ar', 'fa', 'he'];

export function dilDestekleniyor(kod: unknown, desteklenen = DESTEKLENEN_DILLER): kod is string {
  return typeof kod === 'string' && desteklenen.includes(kod);
}

export function yaziYonu(dil: string): 'rtl' | 'ltr' {
  return RTL_DILLER.includes(dil) ? 'rtl' : 'ltr';
}

/**
 * Bir tarayıcı dil etiketini desteklenen bir koda indirir: "en-US" → "en",
 * "az-Latn-AZ" → "az". Desteklenmiyorsa null.
 */
export function dilKoduEsle(etiket: unknown, desteklenen = DESTEKLENEN_DILLER): string | null {
  if (typeof etiket !== 'string') return null;
  const ana = etiket.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return DIL_KODU_BICIMI.test(ana) && desteklenen.includes(ana) ? ana : null;
}
