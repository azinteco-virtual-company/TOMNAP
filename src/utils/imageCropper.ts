import { UrunAlani } from '../types';

/**
 * Resmi yükleyip HTMLImageElement döner
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      // CORS hatası durumunda crossOrigin olmadan son bir deneme
      if (img.crossOrigin) {
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = (err) => reject(err);
        retryImg.src = src;
      } else {
        reject(new Error(`Görsel yüklenemedi: ${src}`));
      }
    };
    img.src = src;
  });
}

/**
 * Normalleştirilmiş (0 - 1000) koordinatlardan resmi kırpar
 */
export async function cropImageFromBox(
  imageSrc: string,
  box: UrunAlani,
  marginPercent: number = 0.04
): Promise<string> {
  try {
    const img = await loadImage(imageSrc);
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;

    // 0-1000 normalize koordinatları piksele çevir
    let x1 = (box.xmin / 1000) * naturalWidth;
    let y1 = (box.ymin / 1000) * naturalHeight;
    let x2 = (box.xmax / 1000) * naturalWidth;
    let y2 = (box.ymax / 1000) * naturalHeight;

    // Kenarlardan biraz nefes payı (margin) ekle
    const w = Math.max(20, x2 - x1);
    const h = Math.max(20, y2 - y1);
    const mx = w * marginPercent;
    const my = h * marginPercent;

    x1 = Math.max(0, x1 - mx);
    y1 = Math.max(0, y1 - my);
    x2 = Math.min(naturalWidth, x2 + mx);
    y2 = Math.min(naturalHeight, y2 + my);

    const cropW = Math.max(20, x2 - x1);
    const cropH = Math.max(20, y2 - y1);

    const canvas = document.createElement('canvas');
    // Maksimum çözünürlüğü makul bir boyutta sınırla (örneğin 800x800)
    const maxDim = 800;
    const scale = Math.min(1, maxDim / Math.max(cropW, cropH));
    canvas.width = Math.round(cropW * scale);
    canvas.height = Math.round(cropH * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) return imageSrc;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      img,
      x1,
      y1,
      cropW,
      cropH,
      0,
      0,
      canvas.width,
      canvas.height
    );

    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.warn('Görsel kırpılamadı, orijinal kaynak kullanılıyor:', err);
    return imageSrc;
  }
}

/**
 * WhatsApp / Instagram ekran görüntülerinde ürün merkezli akıllı kırpma
 */
export async function smartAutoCropScreenshot(imageSrc: string): Promise<string> {
  try {
    const img = await loadImage(imageSrc);
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;

    // Ekran görüntüsüyse (dikdörtgen dikey telefon ekranı: boy > en * 1.4)
    if (nh > nw * 1.3) {
      // Üstteki başlık/durum çubuğunu (%12) ve alttaki mesaj barını (%10) kes
      const y1 = nh * 0.12;
      const cropH = nh * 0.76;
      const x1 = nw * 0.05;
      const cropW = nw * 0.9;

      const canvas = document.createElement('canvas');
      canvas.width = Math.min(800, cropW);
      canvas.height = Math.round(canvas.width * (cropH / cropW));

      const ctx = canvas.getContext('2d');
      if (!ctx) return imageSrc;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, x1, y1, cropW, cropH, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.90);
    }
    return imageSrc;
  } catch {
    return imageSrc;
  }
}

/**
 * Base64 veya kesilmiş görseli sunucuya /api/upload-gorsel ile kaydeder
 */
export async function sunucuyaGorselYukle(
  base64Data: string,
  dosyaAdi: string = 'urun_foto.jpg'
): Promise<string> {
  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const mimeMatch = base64Data.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const res = await fetch('/api/upload-gorsel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base64: cleanBase64,
        mimeType,
        dosyaAdi,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.basarili && data.url) {
        return data.url;
      }
    }
  } catch (err) {
    console.warn('Sunucuya görsel yüklenemedi, base64 korunuyor:', err);
  }
  return base64Data;
}
