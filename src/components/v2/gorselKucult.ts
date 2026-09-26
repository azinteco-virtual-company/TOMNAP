/**
 * A9b: ekran görüntülerini tarayıcıda küçültür. Vercel Functions gövdeyi 4,5 MB'ta
 * keser; üç görsel en çok ~0,8 MB JPEG olarak (base64 ile ~3,2 MB) gider. Görsel hiçbir
 * yere yüklenmez; yalnız AI önerisi için sunucuya gönderilir (sunucu sınırı: 3 × 1 MB).
 */

export const KUCULTME = {
  adet: 3,
  uzunKenar: 1600,
  hedefBayt: 800_000,
  kaliteler: [0.85, 0.7, 0.55] as const,
  /** Each round the long edge shrinks to this share if no quality fits. */
  kucultmeOrani: 0.75,
  enKucukKenar: 480,
};

export interface GonderilecekGorsel {
  mime_type: 'image/jpeg';
  veri_base64: string;
}

/** Scales (width, height) so the long edge is at most `uzunKenar`; never enlarges. */
export function hedefBoyut(genislik: number, yukseklik: number, uzunKenar: number) {
  const oran = Math.min(1, uzunKenar / Math.max(genislik, yukseklik));
  return {
    genislik: Math.max(1, Math.round(genislik * oran)),
    yukseklik: Math.max(1, Math.round(yukseklik * oran)),
  };
}

/** Standard base64 of bytes (chunked, so large images do not overflow the call stack). */
export function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function jpeg(canvas: HTMLCanvasElement, kalite: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', kalite));
}

/** Downscales one image to a JPEG under the target size; throws if it cannot. */
export async function gorseliKucult(dosya: Blob): Promise<GonderilecekGorsel> {
  if (!/^image\/(jpeg|png|webp)$/.test(dosya.type))
    throw new Error('Yalnız JPEG, PNG və ya WebP şəkil seçin.');
  const bitmap = await createImageBitmap(dosya);
  try {
    let kenar = KUCULTME.uzunKenar;
    while (kenar >= KUCULTME.enKucukKenar) {
      const { genislik, yukseklik } = hedefBoyut(bitmap.width, bitmap.height, kenar);
      const canvas = document.createElement('canvas');
      canvas.width = genislik;
      canvas.height = yukseklik;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Şəkil hazırlana bilmədi.');
      context.drawImage(bitmap, 0, 0, genislik, yukseklik);
      for (const kalite of KUCULTME.kaliteler) {
        const blob = await jpeg(canvas, kalite);
        if (blob && blob.size <= KUCULTME.hedefBayt)
          return {
            mime_type: 'image/jpeg',
            veri_base64: base64(new Uint8Array(await blob.arrayBuffer())),
          };
      }
      kenar = Math.floor(kenar * KUCULTME.kucultmeOrani);
    }
    throw new Error('Şəkil çox böyükdür; daha kiçik ekran görüntüsü seçin.');
  } finally {
    bitmap.close();
  }
}
