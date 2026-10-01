import type { jsPDF } from 'jspdf';

/**
 * PDF belgelerinin fontu (docs/i18n.md). jsPDF'in yerleşik Helvetica'sı yalnız Latin-1'i
 * çizer; ə, ş, ğ, ı ve Kiril bozulurdu. Noto Sans (OFL) Latin, genişletilmiş Latin ve Kiril'i
 * kapsar. Font dosyaları yalnız bir PDF üretilirken indirilir (ilk yük paketinde değil).
 *
 * Font belge diline göre BURADAN seçilir: Arapça ya da Çince gibi başka bir yazı sistemi
 * gelince FONTLAR'a bir aile ve DIL_YAZISI'na dil eklenir.
 */
type Agirlik = 'normal' | 'bold';
interface FontAilesi {
  ad: string;
  dosyalar: Record<Agirlik, () => Promise<string>>;
}

const FONTLAR = {
  latinKiril: {
    ad: 'NotoSans',
    dosyalar: {
      normal: () =>
        import('@expo-google-fonts/noto-sans/400Regular/NotoSans_400Regular.ttf?url').then(
          (m) => m.default
        ),
      bold: () =>
        import('@expo-google-fonts/noto-sans/700Bold/NotoSans_700Bold.ttf?url').then(
          (m) => m.default
        ),
    },
  },
} satisfies Record<string, FontAilesi>;
type YaziSistemi = keyof typeof FONTLAR;

/** Languages that need a script other than Latin/Cyrillic map here. */
const DIL_YAZISI: Record<string, YaziSistemi> = {};

export function pdfFontAilesi(belgeDili: string): FontAilesi {
  return FONTLAR[DIL_YAZISI[belgeDili] ?? 'latinKiril'];
}

/** Reads a font file; tests pass their own reader (no network in Node). */
export type FontOkuyucu = (aile: FontAilesi, agirlik: Agirlik) => Promise<ArrayBuffer>;

const tarayiciOkuyucu: FontOkuyucu = async (aile, agirlik) => {
  const yanit = await fetch(await aile.dosyalar[agirlik]());
  if (!yanit.ok) throw new Error(`PDF font ${aile.ad} ${agirlik}: ${yanit.status}`); // i18n-teknik
  return yanit.arrayBuffer();
};

function base64(veri: ArrayBuffer): string {
  const baytlar = new Uint8Array(veri);
  let ikili = '';
  for (let i = 0; i < baytlar.length; i += 0x8000)
    ikili += String.fromCharCode(...baytlar.subarray(i, i + 0x8000));
  return btoa(ikili);
}

const onbellek = new Map<string, Promise<string>>();

/**
 * Registers the document language's font (both weights) in this PDF and returns the
 * family name to pass to setFont and to autoTable styles.
 */
export async function pdfFontuYukle(
  doc: jsPDF,
  belgeDili: string,
  okuyucu: FontOkuyucu = tarayiciOkuyucu
): Promise<string> {
  const aile = pdfFontAilesi(belgeDili);
  for (const agirlik of ['normal', 'bold'] as const) {
    const anahtar = `${aile.ad}-${agirlik}`;
    let veri = onbellek.get(anahtar);
    if (!veri) {
      veri = okuyucu(aile, agirlik).then(base64);
      onbellek.set(anahtar, veri);
      veri.catch(() => onbellek.delete(anahtar));
    }
    const dosya = `${anahtar}.ttf`;
    doc.addFileToVFS(dosya, await veri);
    doc.addFont(dosya, aile.ad, agirlik);
  }
  doc.setFont(aile.ad, 'normal');
  return aile.ad;
}
