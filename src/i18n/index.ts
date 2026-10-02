import i18n, { type BackendModule, type ReadCallback, type TFunction } from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  BUTIK_VARSAYILAN_DILI,
  DESTEKLENEN_DILLER,
  YEDEK_DIL,
  dilDestekleniyor,
  yaziYonu,
} from '../shared/diller';
import { dilSec, type DilAsamasi } from '../shared/dilSecimi';

/**
 * Arayüz dili (docs/i18n.md). Dil dosyaları `locales/<dil>/<ad alanı>.json`; her biri ayrı
 * bir parça olarak yalnız gerektiğinde yüklenir, ilk yük paketine girmez.
 */
const yukleyiciler = import.meta.glob<{ default: Record<string, unknown> }>('./locales/*/*.json');

const tembelYukleyici: BackendModule = {
  type: 'backend',
  init() {},
  read(dil: string, adAlani: string, geri: ReadCallback) {
    const yukle = yukleyiciler[`./locales/${dil}/${adAlani}.json`];
    if (!yukle) {
      geri(new Error(`Çeviri dosyası yok: ${dil}/${adAlani}`), false);
      return;
    }
    yukle().then(
      (modul) => geri(null, modul.default),
      (hata: unknown) => geri(hata instanceof Error ? hata : new Error(String(hata)), false)
    );
  },
};

// The manual choice made on this device (the key the old language context used).
const ELLE_SECIM_ANAHTARI = 'tomnap_dil';
const ESKI_ELLE_SECIM_ANAHTARI = 'knb_dil';

// The choice lives in memory first; localStorage is only the persistence layer, so a
// blocked or failing storage (private mode, quota) never loses it within this page.
let bellekElleSecim: string | null = null;

export function elleSecimOku(): string | null {
  if (bellekElleSecim) return bellekElleSecim;
  try {
    return (
      localStorage.getItem(ELLE_SECIM_ANAHTARI) ?? localStorage.getItem(ESKI_ELLE_SECIM_ANAHTARI)
    );
  } catch {
    return null;
  }
}

/** Forgets the manual choice, in memory and on this device (also lets tests start clean). */
export function elleSecimiSifirla() {
  bellekElleSecim = null;
  try {
    localStorage.removeItem(ELLE_SECIM_ANAHTARI);
    localStorage.removeItem(ESKI_ELLE_SECIM_ANAHTARI);
  } catch {
    // Storage unavailable: nothing persisted to forget.
  }
}

function cihazDilleri(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

const durum: { asama: DilAsamasi; butikDili: string | null } = {
  asama: 'giris-oncesi',
  butikDili: null,
};

/** The language the single rule picks for the current state. */
export function seciliDil(): string {
  return dilSec({
    asama: durum.asama,
    cihazDilleri: cihazDilleri(),
    elleSecim: elleSecimOku(),
    butikDili: durum.butikDili,
  });
}

/** `<html lang>` and `dir` follow the interface language (RTL: ar, fa, he). */
export function htmlDiliniAyarla(dil: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = dil;
  document.documentElement.dir = yaziYonu(dil);
}

export const i18nHazir: Promise<TFunction> = i18n
  .use(tembelYukleyici)
  .use(initReactI18next)
  .init({
    lng: seciliDil(),
    // Every language has the same keys (CI); no second language is loaded as a fallback.
    fallbackLng: false,
    supportedLngs: [...DESTEKLENEN_DILLER],
    load: 'languageOnly',
    ns: ['ortak', 'hatalar'],
    defaultNS: 'ortak',
    interpolation: { escapeValue: false },
    returnNull: false,
    react: { useSuspense: true },
  });
i18n.on('languageChanged', htmlDiliniAyarla);
htmlDiliniAyarla(i18n.language || seciliDil());

function uygula() {
  const dil = seciliDil();
  if (i18n.language !== dil) void i18n.changeLanguage(dil);
  // Prints use the boutique language: have its document strings ready.
  void i18n.loadLanguages(belgeDili()).then(() => i18n.loadNamespaces('belge'));
}

/** Session changes: login state and the boutique's default language. */
export function dilDurumunuGuncelle(girisYapildi: boolean, butikDili: string | null) {
  durum.asama = girisYapildi ? 'giris-sonrasi' : 'giris-oncesi';
  durum.butikDili = girisYapildi ? butikDili : null;
  uygula();
}

/** The language selector: remembered on this device only (karar 1 Ekim 2026). */
export function elleDilSec(dil: string) {
  if (!dilDestekleniyor(dil)) return;
  bellekElleSecim = dil;
  try {
    localStorage.setItem(ELLE_SECIM_ANAHTARI, dil);
  } catch {
    // Private mode or blocked storage: the choice lasts for this page, not the next visit.
  }
  uygula();
}

/**
 * Printed and exported documents (manifest, labels, collection list) use the boutique's
 * default language, whatever the interface language is: a courier's label does not
 * change with the courier's phone.
 */
export function belgeDili(): string {
  return dilDestekleniyor(durum.butikDili) ? durum.butikDili : BUTIK_VARSAYILAN_DILI;
}

/** A translator bound to the document language and the `belge` namespace. */
export function belgeT(): TFunction {
  return i18n.getFixedT(belgeDili(), 'belge');
}

/** Makes sure the document strings are loaded before a print or PDF export. */
export async function belgeCevirisiniHazirla(): Promise<TFunction> {
  await i18nHazir;
  await i18n.loadLanguages(belgeDili());
  await i18n.loadNamespaces('belge');
  return belgeT();
}

export { YEDEK_DIL };
export default i18n;
