import { describe, expect, it } from 'vitest';
import { dilSec } from '../../src/shared/dilSecimi';
import { dilKoduEsle, yaziYonu, DESTEKLENEN_DILLER } from '../../src/shared/diller';

// The single language rule (decision 1 October 2026): before login manual > device > en;
// after login manual > boutique default > device > en.
// Two kinds of test: the matrix runs on the central list (src/i18n/diller.json), so a new
// language is covered without a test change; the fallback tests that need an UNSUPPORTED
// language pass their own fixed set (IKI_DIL) and never depend on the central list.
const IKI_DIL = ['az', 'en'];
const desteklenen = (kod: string) => DESTEKLENEN_DILLER.includes(kod);
const cihaz = {
  en: ['en-US', 'en'],
  tr: ['tr-TR', 'tr'],
  ru: ['ru-RU', 'ru'],
  ar: ['ar-SA', 'ar'],
  az: ['az-Latn-AZ'],
} as const;

describe('dilSec — after login (device × boutique × manual)', () => {
  // [device, boutique, manual, expected]
  const matris: Array<[keyof typeof cihaz, string, string | null, string]> = [];
  for (const d of ['en', 'tr', 'ru', 'ar'] as const)
    for (const butik of DESTEKLENEN_DILLER)
      for (const elle of [null, ...DESTEKLENEN_DILLER, 'xx'])
        // A supported manual choice wins; otherwise the boutique default (always supported here).
        matris.push([d, butik, elle, elle !== null && desteklenen(elle) ? elle : butik]);

  it.each(matris)('device %s, boutique %s, manual %s → %s', (d, butik, elle, beklenen) => {
    expect(
      dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz[d], butikDili: butik, elleSecim: elle })
    ).toBe(beklenen);
  });

  it('puts the boutique language before the device language', () => {
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz.en, butikDili: 'az' })).toBe('az');
  });
  it('falls back to the device, then en, when the boutique language is missing or unknown', () => {
    const girdi = { asama: 'giris-sonrasi', butikDili: null } as const;
    expect(dilSec({ ...girdi, cihazDilleri: cihaz.az }, IKI_DIL)).toBe('az');
    expect(dilSec({ ...girdi, butikDili: 'xx', cihazDilleri: cihaz.ru }, IKI_DIL)).toBe('en');
    expect(dilSec({ ...girdi, butikDili: undefined, cihazDilleri: [] }, IKI_DIL)).toBe('en');
  });
  it('a device language outside the supported set never wins over en', () => {
    for (const d of ['tr', 'ru', 'ar'] as const)
      expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz[d] }, IKI_DIL)).toBe('en');
  });
});

describe('dilSec — before login (login, registration, landing)', () => {
  // The fixed az+en set: ru, tr and ar are unsupported here whatever the central list says.
  it.each([
    ['en', null, 'en'],
    ['tr', null, 'en'],
    ['ru', null, 'en'],
    ['ar', null, 'en'],
    ['az', null, 'az'],
    ['en', 'az', 'az'],
    ['ru', 'en', 'en'],
    ['tr', 'ru', 'en'],
  ] as const)('unsupported device: device %s, manual %s → %s', (d, elle, beklenen) => {
    expect(
      dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz[d], elleSecim: elle }, IKI_DIL)
    ).toBe(beklenen);
  });

  it.each(DESTEKLENEN_DILLER)('a supported device language (%s) is used as it is', (dil) => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: [dil, 'en'] })).toBe(dil);
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: [`${dil}-XX`] })).toBe(dil);
  });
  it('the Russian device follows the central list: ru when supported, otherwise en', () => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz.ru })).toBe(
      desteklenen('ru') ? 'ru' : 'en'
    );
  });

  it('ignores the boutique language before login', () => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz.en, butikDili: 'az' })).toBe('en');
  });
  it('takes the first supported device language in preference order', () => {
    expect(
      dilSec({ asama: 'giris-oncesi', cihazDilleri: ['ru-RU', 'az-AZ', 'en-US'] }, IKI_DIL)
    ).toBe('az');
  });
});

describe('language tags and direction', () => {
  it('reduces a browser tag to a supported code and rejects anything else', () => {
    expect(dilKoduEsle('en-GB')).toBe('en');
    expect(dilKoduEsle('AZ_az')).toBe('az');
    expect(dilKoduEsle('../en')).toBeNull();
    expect(dilKoduEsle('tr', IKI_DIL)).toBeNull();
    expect(dilKoduEsle(42)).toBeNull();
  });
  it('a language added to the list is chosen without a code change', () => {
    const genis = [...IKI_DIL, 'tr', 'ar'];
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz.tr }, genis)).toBe('tr');
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz.ar, butikDili: null }, genis)).toBe(
      'ar'
    );
  });
  it('writes right-to-left for Arabic, Persian and Hebrew only', () => {
    expect(['ar', 'fa', 'he'].map(yaziYonu)).toEqual(['rtl', 'rtl', 'rtl']);
    expect(['az', 'en', 'ru', 'tr', 'zh'].map(yaziYonu)).toEqual([
      'ltr',
      'ltr',
      'ltr',
      'ltr',
      'ltr',
    ]);
  });
});
