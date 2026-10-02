import fs from 'node:fs';
import path from 'node:path';
import dilListesi from '../src/i18n/diller.json';

/**
 * Çeviri inceleme tablosu (docs/i18n.md): `anahtar | <diller…>`, her satır bir çeviri
 * anahtarı (`ad alanı:anahtar`). Dil sütunları `src/i18n/diller.json` sırasındadır; bir dilde
 * olmayan anahtar (ör. ru'nun `_few`/`_many` çoğul biçimleri) boş kalır. Tablo dil
 * dosyalarından üretilir; elle düzenlenmez: `npm run i18n:csv`.
 */
const KOK = 'src/i18n/locales';
const CIKTI = 'docs/i18n/ceviri-inceleme.csv';

type Agac = { [anahtar: string]: string | Agac };

function duzlestir(agac: Agac, onek = ''): Array<[string, string]> {
  return Object.entries(agac).flatMap(([k, v]) =>
    typeof v === 'string' ? [[onek + k, v] as [string, string]] : duzlestir(v, `${onek}${k}.`)
  );
}

function hucre(deger: string): string {
  return /[",\n\r]/.test(deger) ? `"${deger.replace(/"/g, '""')}"` : deger;
}

export function ceviriCsv(kok = KOK, diller: readonly string[] = dilListesi.desteklenen): string {
  const adAlanlari = [
    ...new Set(diller.flatMap((dil) => fs.readdirSync(path.join(kok, dil)))),
  ].sort();
  const satirlar: string[] = [['anahtar', ...diller].map(hucre).join(',')];
  for (const dosya of adAlanlari) {
    const adAlani = dosya.replace(/\.json$/, '');
    const dilDegerleri = diller.map((dil) => {
      const yol = path.join(kok, dil, dosya);
      return new Map(
        fs.existsSync(yol) ? duzlestir(JSON.parse(fs.readFileSync(yol, 'utf8')) as Agac) : []
      );
    });
    // Order of first appearance: the first language's order, then keys only others have.
    const anahtarlar = [...new Set(dilDegerleri.flatMap((m) => [...m.keys()]))];
    for (const anahtar of anahtarlar)
      satirlar.push(
        [`${adAlani}:${anahtar}`, ...dilDegerleri.map((m) => m.get(anahtar) ?? '')]
          .map(hucre)
          .join(',')
      );
  }
  return `${satirlar.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  fs.mkdirSync(path.dirname(CIKTI), { recursive: true });
  // BOM: Excel opens the file as UTF-8 (Cyrillic and Azerbaijani letters stay intact).
  fs.writeFileSync(CIKTI, `﻿${ceviriCsv()}`);
  console.log(`${CIKTI} yazıldı`);
}
