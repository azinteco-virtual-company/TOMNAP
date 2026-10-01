import { DESTEKLENEN_DILLER, YEDEK_DIL, dilKoduEsle } from './diller';

/**
 * Arayüz dilinin TEK seçim kuralı (karar 1 Ekim 2026, docs/i18n.md):
 *  - Giriş öncesi (giriş, kayıt, karşılama): bu cihazda elle seçilen dil > cihaz dili > en.
 *  - Giriş sonrası: elle seçilen dil > butiğin varsayılan dili > cihaz dili > en.
 * Butik dili cihaz dilinin önündedir: Bakü'de ekibin telefonu İngilizce ya da Rusça olabilir.
 * Elle seçim giriş öncesinde de uygulanır; giriş sayfasındaki seçici aynı tercihi yazar
 * (OPEN_QUESTIONS 39). Her aday desteklenmiyorsa atlanır.
 */
export type DilAsamasi = 'giris-oncesi' | 'giris-sonrasi';

export interface DilSecimGirdisi {
  asama: DilAsamasi;
  /** navigator.languages, tercih sırasıyla. */
  cihazDilleri: readonly string[];
  /** Bu cihazda elle seçilen dil (localStorage). */
  elleSecim?: string | null;
  /** Butiğin varsayılan dili; yalnız giriş sonrasında. */
  butikDili?: string | null;
}

export function dilSec(girdi: DilSecimGirdisi, desteklenen = DESTEKLENEN_DILLER): string {
  const adaylar: unknown[] = [girdi.elleSecim];
  if (girdi.asama === 'giris-sonrasi') adaylar.push(girdi.butikDili);
  adaylar.push(...girdi.cihazDilleri, YEDEK_DIL);
  for (const aday of adaylar) {
    const kod = dilKoduEsle(aday, desteklenen);
    if (kod) return kod;
  }
  return desteklenen[0] ?? YEDEK_DIL;
}
