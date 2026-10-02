import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anahtarFarklari, duzMetinler, eksikAnahtarlar } from '../../scripts/i18nDenetim';
import dilListesi from '../../src/i18n/diller.json';

// The i18n rule (docs/i18n.md, CLAUDE.md): on a moved or touched screen user-visible text
// is written only through a translation key, and the az and en files change together.

/** Files moved to translation keys. A file is added here when its screen is moved. */
export const TASINAN_DOSYALAR = [
  'src/components/DilSecici.tsx',
  'src/i18n/hata.ts',
  // Giriş öncesi: giriş, kayıt, davet kabulü, şifre belirleme.
  'src/components/AccessGateModal.tsx',
  'src/components/landing/ButikQeydiyyatModal.tsx',
  'src/components/DavetQebulSayfasi.tsx',
  'src/components/SifreBelirleSayfasi.tsx',
  // B2: v1 sipariş detay penceresi.
  'src/components/SiparisDetayModal.tsx',
  'src/components/siparisDetayFormu.ts',
  // B1: kargo manifestosu ekranı ve belgeleri (yazdırma, etiket, Excel, PDF, kurye metni).
  'src/components/KargoManifestoSayfasi.tsx',
  'src/components/kargoManifesto/ManifestoBasligi.tsx',
  'src/components/kargoManifesto/ManifestoFiltreleri.tsx',
  'src/components/kargoManifesto/ManifestoTablosu.tsx',
  'src/components/kargoManifesto/manifestoFiltresi.ts',
  'src/belgeler/manifesto.ts',
  'src/belgeler/manifestoYazdirma.ts',
  'src/belgeler/manifestoPdf.ts',
  'src/belgeler/tahsilat.ts',
  'src/i18n/pdfFontu.ts',
  'src/i18n/belge.ts',
  // v2: the whole folder (PR-C); a new v2 file is checked without being listed.
  ...fs
    .readdirSync('src/components/v2')
    .filter((dosya) => /\.tsx?$/.test(dosya))
    .map((dosya) => `src/components/v2/${dosya}`),
];

const KOK = 'src/i18n/locales';

describe('i18n rules', () => {
  it('every supported language has a folder, and every folder is supported', () => {
    const klasorler = fs
      .readdirSync(KOK, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    expect(klasorler).toEqual([...dilListesi.desteklenen].sort());
  });

  it('all languages have the same namespaces and keys', () => {
    expect(anahtarFarklari(KOK)).toEqual([]);
  });

  it('moved files contain no plain user-visible text', () => {
    expect(TASINAN_DOSYALAR.flatMap((dosya) => duzMetinler(dosya))).toEqual([]);
  });

  it('every static t() key used in moved files exists, in its namespace, in every language', () => {
    expect(eksikAnahtarlar(TASINAN_DOSYALAR, KOK)).toEqual([]);
  });

  it('every stable error code the server sends has a translation', () => {
    const dosyalar = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        return e.isDirectory() ? dosyalar(p) : p.endsWith('.ts') ? [p] : [];
      });
    const kodlar = new Set<string>();
    for (const dosya of dosyalar('src/server')) {
      const kaynak = fs.readFileSync(dosya, 'utf8');
      // `kod: 'X'` or `kod: cond ? 'A' : 'B'` (a compared value after === is not a code).
      for (const satir of kaynak.matchAll(/\bkod:([^\n]*)/g))
        for (const m of satir[1].matchAll(/(===\s*)?'([A-Z][A-Z0-9_]{3,})'/g))
          if (!m[1]) kodlar.add(m[2]);
      for (const m of kaynak.matchAll(
        /new (?:PublicResourceError|OnboardingError)\([^;]*?'([A-Z][A-Z0-9_]{3,})'\s*\)/gs
      ))
        kodlar.add(m[1]);
    }
    expect(kodlar.size).toBeGreaterThan(30);
    for (const dil of dilListesi.desteklenen) {
      const ceviri = JSON.parse(fs.readFileSync(path.join(KOK, dil, 'hatalar.json'), 'utf8'));
      expect([dil, [...kodlar].filter((k) => !(k in ceviri))]).toEqual([dil, []]);
    }
  });

  it('the checker itself flags plain text and lets keys and technical strings pass', () => {
    const ornek = path.join(
      fs.mkdtempSync(path.join(process.cwd(), 'node_modules/.i18n-')),
      'x.tsx'
    );
    fs.writeFileSync(
      ornek,
      [
        "const a = t('kasa.teslimAl');",
        'const b = <p className="px-2 text-sm" title="Bağla">Saxla</p>;',
        "const c = 'TESLIM_EDILDI' === x ? '/api/v2/x' : 'Close';",
        "const d = 'Format kalıbı'; // i18n-teknik",
        'const e = html`<html lang="${a}" dir="${b}"><style>td { color: red; }</style><td class="son">${c}</td></html>`;',
        'const f = html`<div class="x">Bakı paylanış ${a}</div>`;',
        'const g = <button>save</button>;', // a lowercase word between tags is visible text
        'const h = <input placeholder="search" aria-label="Close" name="q" />;',
        "const i = <td>{'AZN'}</td>;", // an explicit expression is a deliberate technical value
      ].join('\n')
    );
    try {
      expect(duzMetinler(ornek).map((b) => b.metin)).toEqual([
        'Bağla',
        'Saxla',
        'Close',
        'Bakı paylanış',
        'save',
        'search',
        'Close',
      ]);
    } finally {
      fs.rmSync(path.dirname(ornek), { recursive: true, force: true });
    }
  });

  it('the key checker flags a key missing from every language, a wrong namespace and a missing file', () => {
    const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-anahtar-'));
    try {
      for (const dil of ['az', 'en']) {
        fs.mkdirSync(path.join(kok, 'locales', dil), { recursive: true });
        fs.writeFileSync(
          path.join(kok, 'locales', dil, 'ortak.json'),
          JSON.stringify({ dil: { sec: 'x' }, say: { one: '1', other: 'n' } })
        );
        fs.writeFileSync(
          path.join(kok, 'locales', dil, 'v2.json'),
          JSON.stringify({ a: { b: 'x' } })
        );
      }
      // `v2` has no `dil.sec`: only `ortak` does; the English file also lacks `say`.
      fs.writeFileSync(
        path.join(kok, 'locales', 'en', 'ortak.json'),
        JSON.stringify({ dil: { sec: 'x' } })
      );
      const ornek = path.join(kok, 'x.tsx');
      fs.writeFileSync(
        ornek,
        [
          "const { t } = useTranslation('ortak');",
          "const { t: tv } = useTranslation('v2');",
          "t('dil.sec'); t('dil'); t('say'); t('yok.anahtar');",
          "tv('dil.sec'); tv('a.b'); tv('ortak:dil.sec'); t('yok', { ns: 'v2' });",
          't(`dil.${x}`); t(anahtar);',
          "function f(bt: TFunction) { bt('a.b'); bt('hic.yok'); }",
        ].join('\n')
      );
      expect(
        eksikAnahtarlar([ornek], path.join(kok, 'locales')).map((e) => e.replace(/^.*x\.tsx:/, ''))
      ).toEqual([
        '3  en/ortak: say yok',
        '3  az/ortak: yok.anahtar yok',
        '3  en/ortak: yok.anahtar yok',
        '4  az/v2: dil.sec yok',
        '4  en/v2: dil.sec yok',
        '4  az/v2: yok yok',
        '4  en/v2: yok yok',
        '6  az/?: hic.yok yok',
        '6  en/?: hic.yok yok',
      ]);
    } finally {
      fs.rmSync(kok, { recursive: true, force: true });
    }
  });

  it('plural forms follow each language categories (ru needs few and many, az and en do not)', () => {
    const kok = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-artil-'));
    const yaz = (dil: string, icerik: object) => {
      fs.mkdirSync(path.join(kok, dil), { recursive: true });
      fs.writeFileSync(path.join(kok, dil, 'x.json'), JSON.stringify(icerik));
    };
    try {
      const ikili = { a: { baslik: 'x', paket_one: '1', paket_other: 'n' } };
      yaz('az', ikili);
      yaz('en', ikili);
      yaz('ru', { a: { baslik: 'x', paket_one: '1', paket_other: 'n' } });
      expect(anahtarFarklari(kok)).toEqual([
        'ru/x.json: a.paket_few yok',
        'ru/x.json: a.paket_many yok',
      ]);
      yaz('ru', {
        a: { baslik: 'x', paket_one: '1', paket_few: '2', paket_many: '5', paket_other: 'n' },
      });
      expect(anahtarFarklari(kok)).toEqual([]);
      yaz('en', { a: { baslik: 'x', paket_one: '1', paket_few: '2', paket_other: 'n' } });
      expect(anahtarFarklari(kok)).toEqual(['en/x.json: a.paket_few bu dilde kullanılmaz']);
      // A plural group missing from one language is still a missing key.
      yaz('en', { a: { baslik: 'x' } });
      expect(anahtarFarklari(kok)).toContain('en/x.json: a.paket_* yok');
    } finally {
      fs.rmSync(kok, { recursive: true, force: true });
    }
  });
});
