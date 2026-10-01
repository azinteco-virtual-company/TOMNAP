import { describe, expect, it } from 'vitest';
import { dilSec } from '../../src/shared/dilSecimi';
import { dilKoduEsle, yaziYonu, DESTEKLENEN_DILLER } from '../../src/shared/diller';

// The single language rule (decision 1 October 2026): before login manual > device > en;
// after login manual > boutique default > device > en. Supported today: az, en.
const cihaz = {
  en: ['en-US', 'en'],
  tr: ['tr-TR', 'tr'],
  ru: ['ru-RU', 'ru'],
  ar: ['ar-SA', 'ar'],
  az: ['az-Latn-AZ'],
} as const;

describe('dilSec — after login (device × boutique × manual)', () => {
  // [device, boutique, manual, expected]
  const matris: Array<[keyof typeof cihaz, string | null, string | null, string]> = [];
  for (const d of ['en', 'tr', 'ru', 'ar'] as const)
    for (const butik of ['az', 'en'])
      for (const elle of [null, 'az', 'en', 'ru'])
        // A supported manual choice wins; otherwise the boutique default (always supported here).
        matris.push([d, butik, elle, elle === 'az' || elle === 'en' ? elle : butik]);

  it.each(matris)('device %s, boutique %s, manual %s → %s', (d, butik, elle, beklenen) => {
    expect(
      dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz[d], butikDili: butik, elleSecim: elle })
    ).toBe(beklenen);
  });

  it('puts the boutique language before the device language', () => {
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz.en, butikDili: 'az' })).toBe('az');
  });
  it('falls back to the device, then en, when the boutique language is missing or unknown', () => {
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz.az, butikDili: null })).toBe('az');
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: cihaz.ru, butikDili: 'xx' })).toBe('en');
    expect(dilSec({ asama: 'giris-sonrasi', cihazDilleri: [], butikDili: undefined })).toBe('en');
  });
});

describe('dilSec — before login (login, registration, landing)', () => {
  it.each([
    ['en', null, 'en'],
    ['tr', null, 'en'],
    ['ru', null, 'en'],
    ['ar', null, 'en'],
    ['az', null, 'az'],
    ['en', 'az', 'az'],
    ['ru', 'en', 'en'],
    ['tr', 'ru', 'en'],
  ] as const)('device %s, manual %s → %s', (d, elle, beklenen) => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz[d], elleSecim: elle })).toBe(
      beklenen
    );
  });

  it('ignores the boutique language before login', () => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: cihaz.en, butikDili: 'az' })).toBe('en');
  });
  it('takes the first supported device language in preference order', () => {
    expect(dilSec({ asama: 'giris-oncesi', cihazDilleri: ['ru-RU', 'az-AZ', 'en-US'] })).toBe('az');
  });
});

describe('language tags and direction', () => {
  it('reduces a browser tag to a supported code and rejects anything else', () => {
    expect(dilKoduEsle('en-GB')).toBe('en');
    expect(dilKoduEsle('AZ_az')).toBe('az');
    expect(dilKoduEsle('../en')).toBeNull();
    expect(dilKoduEsle('tr')).toBeNull();
    expect(dilKoduEsle(42)).toBeNull();
  });
  it('a language added to the list is chosen without a code change', () => {
    const genis = [...DESTEKLENEN_DILLER, 'tr', 'ar'];
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
