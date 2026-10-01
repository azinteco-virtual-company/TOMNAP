import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { anahtarFarklari, duzMetinler } from '../../scripts/i18nDenetim';
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
      ].join('\n')
    );
    try {
      expect(duzMetinler(ornek).map((b) => b.metin)).toEqual([
        'Bağla',
        'Saxla',
        'Close',
        'Bakı paylanış',
      ]);
    } finally {
      fs.rmSync(path.dirname(ornek), { recursive: true, force: true });
    }
  });
});
