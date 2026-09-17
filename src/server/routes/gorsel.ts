import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { UPLOADS_DIR, GEMINI_API_KEY } from '../config';
import { sanitizeDosyaAdi, yolGuvenlimi, urlGuvenlimi } from '../middleware/security';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
import { siparislerVeritabani } from '../services/state';
import { fetchPublicResource, MAX_IMAGE_BYTES, PublicResourceError } from '../services/publicFetch';

const router = Router();

// Sayfadan og:image çekerek yüksek çözünürlüklü stüdyo fotoğrafını bulan yardımcı fonksiyon
export async function fetchOgImageFromUrl(pageUrl: string): Promise<string | null> {
  if (typeof pageUrl !== 'string' || !pageUrl.startsWith('http')) return null;
  const urlKontrol = urlGuvenlimi(pageUrl);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] fetchOgImageFromUrl: ${pageUrl} — Sebep: ${urlKontrol.sebep}`);
    return null;
  }
  try {
    const resp = await fetchPublicResource(pageUrl, {
      timeoutMs: 4500,
      maxBytes: 2 * 1024 * 1024,
      accept: 'text/html,application/xhtml+xml',
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    if (ogMatch && ogMatch[1]) {
      let imgUrl = ogMatch[1].trim();
      if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
      if (
        imgUrl.startsWith('http') &&
        !imgUrl.includes('placeholder') &&
        !imgUrl.includes('logo')
      ) {
        return imgUrl;
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

// URL'nin gerçekten erişilebilir ve geçerli bir görsel olup olmadığını test eden yardımcı fonksiyon
export async function isValidImageUrl(url: string): Promise<boolean> {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;
  const urlKontrol = urlGuvenlimi(url);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] isValidImageUrl: ${url} — Sebep: ${urlKontrol.sebep}`);
    return false;
  }
  try {
    const resp = await fetchPublicResource(url, { timeoutMs: 3500 });
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return false;
    inspectImage(Buffer.from(await resp.arrayBuffer()), contentType.split(';')[0]);
    return true;
  } catch {
    return false;
  }
}

function decodeImage(base64: string, declaredMime?: string) {
  const dataUrl = base64.match(/^data:([^;]+);base64,(.*)$/s);
  const encoded = dataUrl ? dataUrl[2] : base64;
  if (encoded.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new PublicResourceError('Görsel en fazla 10 MB olabilir.', 413);
  }
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new PublicResourceError('Geçersiz base64 görsel verisi.', 400);
  }
  const buffer = Buffer.from(encoded, 'base64');
  return inspectImage(buffer, declaredMime, dataUrl?.[1]);
}

function inspectImage(buffer: Buffer, ...declaredMimes: (string | undefined)[]) {
  if (buffer.length > MAX_IMAGE_BYTES)
    throw new PublicResourceError('Görsel en fazla 10 MB olabilir.', 413);
  const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
  const webp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  const mimeType = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : '';
  if (!mimeType)
    throw new PublicResourceError('Yalnızca PNG, JPEG veya WebP görselleri desteklenir.', 415);
  for (const claimed of declaredMimes) {
    if (claimed !== undefined && typeof claimed !== 'string')
      throw new PublicResourceError('Geçersiz görsel türü.', 400);
    if (
      claimed &&
      claimed.trim().toLowerCase() !== mimeType &&
      !(claimed === 'image/jpg' && jpeg)
    ) {
      throw new PublicResourceError('Görsel türü dosya içeriğiyle eşleşmiyor.', 415);
    }
  }
  return { buffer, mimeType, ext: png ? 'png' : jpeg ? 'jpg' : 'webp' };
}

// Only the exact uploaded file may be served. Missing files must not reveal
// another customer's latest image.
function uploadPath(dosyaAdi: string): string {
  if (!dosyaAdi || sanitizeDosyaAdi(dosyaAdi) !== dosyaAdi) {
    throw new PublicResourceError('Geçersiz görsel dosya yolu.');
  }
  const candidate = path.join(UPLOADS_DIR, dosyaAdi);
  if (!yolGuvenlimi(candidate, UPLOADS_DIR)) {
    throw new PublicResourceError('Erişim reddedildi.');
  }
  if (fs.existsSync(candidate)) {
    const actual = fs.realpathSync(candidate);
    const root = fs.realpathSync(UPLOADS_DIR);
    if (!yolGuvenlimi(actual, root)) {
      throw new PublicResourceError('Erişim reddedildi.');
    }
    return actual;
  }
  return candidate;
}

export function serveUploadedImage(req: Request, res: Response) {
  try {
    const file = uploadPath(req.params.dosyaAdi);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return res.status(404).send('Görsel bulunamadı.');
    }
    return res.sendFile(file);
  } catch (error) {
    return res
      .status(error instanceof PublicResourceError ? error.status : 500)
      .send('Görsele erişilemiyor.');
  }
}

router.get('/uploads/:dosyaAdi', serveUploadedImage);

// 2. POST /api/upload-gorsel — Tekil Görsel Yükle
router.post('/upload-gorsel', (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Geçersiz görsel verisi' });
    }

    const image = decodeImage(base64, mimeType);
    const benzersizAd = `urun_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${image.ext}`;
    const dosyaYolu = path.join(UPLOADS_DIR, benzersizAd);
    fs.writeFileSync(dosyaYolu, image.buffer);

    res.json({
      basarili: true,
      url: `/uploads/${benzersizAd}`,
      dosya_adi: dosyaAdi || benzersizAd,
    });
  } catch (err: any) {
    console.error('Görsel yükleme hatası:', err);
    res
      .status(err instanceof PublicResourceError ? err.status : 500)
      .json({ basarili: false, hata: 'Görsel kaydedilemedi: ' + err.message });
  }
});

// 3. GET /api/proxy-gorsel — Harici Resimler için Güvenli Vekil Sunucu (SSRF Korumalı)
router.get('/proxy-gorsel', async (req, res) => {
  const gorselUrl = req.query.url as string;
  if (typeof gorselUrl !== 'string' || !gorselUrl.startsWith('http')) {
    return res.status(400).send('Geçersiz görsel adresi');
  }

  // SSRF Koruması
  const urlKontrol = urlGuvenlimi(gorselUrl);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] ${gorselUrl} — Sebep: ${urlKontrol.sebep}`);
    return res.status(403).json({ basarili: false, hata: urlKontrol.sebep });
  }

  try {
    const resp = await fetchPublicResource(gorselUrl);

    if (!resp.ok) {
      return res.status(resp.status).send(`Görsel indirilemedi (${resp.status})`);
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('Hedef adres resim dosyası değil');
    }

    const image = inspectImage(Buffer.from(await resp.arrayBuffer()), contentType.split(';')[0]);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(image.buffer);
  } catch (err: any) {
    res
      .status(err instanceof PublicResourceError ? err.status : 502)
      .send('Vekil sunucu hatası: ' + err.message);
  }
});

// 4. POST /api/urun-katalog-gorseli-ara — Web'den Orijinal Katalog Fotoğrafı Bul (Gemini + Google Search)
router.post('/urun-katalog-gorseli-ara', async (req, res) => {
  try {
    const { urun_adi, marka, renk } = req.body;
    if (!urun_adi) {
      return res.status(400).json({ basarili: false, hata: 'Ürün adı gereklidir.' });
    }

    const ai = getGeminiClient();

    const aramaPrompt = `Sen lüks moda, ayakkabı, çanta ve giyim alanında uzman bir ürün katalog araştırmacısısın.
Aşağıda bilgileri verilen ürün için internette resmi marka sitesinde (Karl Lagerfeld, On Running, Michael Kors, Tommy Hilfiger, Aldo, Coach, Zara vb.) ve yetkili lüks sitelerde (Farfetch, Nordstrom, Saks Fifth Avenue, Bloomingdale's, Amazon vb.) orijinal stüdyo/katalog çekimi fotoğrafını ve ürün satış sayfasını araştır:

Aranan Ürün: "${urun_adi}"
${marka ? `Marka: ${marka}` : ''}
${renk ? `Renk: ${renk}` : ''}

GÖREVLERİN:
1. Ürünün resmi e-ticaret sitelerindeki tam model adını belirle.
2. Ürünün resmi sayfasındaki yüksek çözünürlüklü, beyaz/temiz arka planlı stüdyo katalog fotoğrafı linkini (doğrudan CDN/image URL) veya ürün sayfasını bul.
3. Ürünün resmi ürün sayfası linkini (URL) bul.
4. Ürünün malzeme/koleksiyon özetini belirt.

Yanıtını YALNIZCA aşağıdaki JSON formatında döndür (başka açıklama ekleme):
{
  "resmi_urun_adi": "Ürünün resmi tam adı ve modeli",
  "marka": "Marka",
  "katalog_gorsel_url": "Doğrudan görsel CDN URL'si (varsa, örn: https://cdn...jpg veya https://images...)",
  "urun_sayfasi_url": "Resmi ürün sayfası URL'si",
  "aciklama": "Ürünün resmi katalog açıklaması veya materyali",
  "tahmini_fiyat": "Resmi satış fiyatı (varsa)"
}`;

    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: aramaPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
      },
    });

    const yanitMetni = searchResponse.text || '';
    let sonuc: any = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('JSON parse hatası:', parseErr);
    }

    const groundingMetadata = (searchResponse as any).candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks
      .filter((c: any) => c.web?.uri)
      .map((c: any) => ({
        baslik: c.web.title || 'Resmi Ürün Sayfası',
        url: c.web.uri,
      }));

    if (!sonuc) {
      sonuc = {
        resmi_urun_adi: urun_adi,
        marka: marka || '',
        katalog_gorsel_url: '',
        urun_sayfasi_url: webLinkleri.length > 0 ? webLinkleri[0].url : '',
        aciklama: yanitMetni.slice(0, 200),
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }

    if (!sonuc.katalog_gorsel_url) {
      const hedefLink = sonuc.urun_sayfasi_url || webLinkleri[0]?.url;
      if (hedefLink) {
        const ogResmi = await fetchOgImageFromUrl(hedefLink);
        if (ogResmi) {
          sonuc.katalog_gorsel_url = ogResmi;
        }
      }
    }

    res.json({
      basarili: true,
      sonuc,
      web_linkleri: webLinkleri.slice(0, 4),
    });
  } catch (err: any) {
    console.error('Katalog arama hatası:', err);
    res
      .status(500)
      .json({ basarili: false, hata: err.message || 'Ürün görsel araması başarısız oldu.' });
  }
});

// 5. POST /api/gorselden-urun-ara — Görselden Ürünü Tanı ve Web'den Orijinalini Bul
router.post('/gorselden-urun-ara', async (req, res) => {
  try {
    const { gorsel, mevcut_urun_adi, ek_ipucu } = req.body;
    if (!gorsel || typeof gorsel !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Aranacak görsel verisi bulunamadı.' });
    }

    if (!GEMINI_API_KEY) {
      return res
        .status(500)
        .json({ basarili: false, hata: 'Gemini API anahtarı yapılandırılmamış.' });
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (gorsel.startsWith('data:')) {
      const image = decodeImage(gorsel);
      mimeType = image.mimeType;
      base64Data = image.buffer.toString('base64');
    } else if (gorsel.startsWith('/uploads/')) {
      const dosyaAdi = gorsel.replace('/uploads/', '');
      const dosyaYolu = uploadPath(dosyaAdi);
      if (fs.existsSync(dosyaYolu)) {
        const stat = fs.statSync(dosyaYolu);
        if (!stat.isFile()) throw new PublicResourceError('Geçersiz görsel dosyası.');
        if (stat.size > MAX_IMAGE_BYTES)
          throw new PublicResourceError('Görsel boyut sınırını aşıyor.', 413);
        const image = inspectImage(fs.readFileSync(dosyaYolu));
        base64Data = image.buffer.toString('base64');
        mimeType = image.mimeType;
      }
    } else if (gorsel.startsWith('http')) {
      try {
        const fetchRes = await fetchPublicResource(gorsel);
        if (fetchRes.ok) {
          const image = inspectImage(
            Buffer.from(await fetchRes.arrayBuffer()),
            fetchRes.headers.get('content-type')?.split(';')[0]
          );
          base64Data = image.buffer.toString('base64');
          mimeType = image.mimeType;
        }
      } catch (err) {
        if (err instanceof PublicResourceError) throw err;
        console.warn('Görsel URL indirilemedi:', err);
      }
    }

    if (!base64Data) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Görsel verisi okunamadı veya format desteklenmiyor.' });
    }

    const ai = getGeminiClient();

    const lensPrompt = `Sen profesyonel bir e-ticaret, lüks marka ve ürün tanıma uzmanısın (Google Lens ve AliExpress Visual Search mantığıyla çalışıyorsun).
Ekli görselde kullanıcının odakladığı veya seçtiği bir ürün yer almaktadır.
${mevcut_urun_adi ? `Sipariş metnindeki ürün adı/ipucu: "${mevcut_urun_adi}"` : ''}
${ek_ipucu ? `Kullanıcının belirttiği ek ipucu: "${ek_ipucu}"` : ''}

Lütfen şu adımları eksiksiz uygula:
1. Görseldeki ürünü titizlikle analiz et: Logo, marka amblemi, monogram desen, renk, taban, toka, materyal veya tipografik detayları belirle (Örn: Karl Lagerfeld, Michael Kors, Gucci, Zara, Prada, Guess, Nike, Adidas, vb.).
2. Ürünün tam resmi model adını ve koleksiyonunu tespit et (Örn: "Karl Lagerfeld Kondo Monogram Slide Sandal", "Michael Kors Jet Set Crossbody Bag").
3. Google Search aracı ile bu ürünün orijinal stüdyo fotoğrafını (.jpg veya .png formatında doğrudan resim bağlantısı) ve resmi satış/e-ticaret sayfalarını (Trendyol, Beymen, Farfetch, Brandroom, Hepsiburada, Amazon veya resmi marka sitesi) bul.

Cevabını YALNIZCA geçerli bir JSON nesnesi formatında ver:
{
  "marka": "Tespit edilen marka adı",
  "resmi_urun_adi": "Ürünün resmi model ve tam katalog adı",
  "urun_tipi": "Ürün kategorisi (ör: Terlik, Çanta, Ayakkabı, Saat, Elbise)",
  "renk": "Tespit edilen renk (ör: Siyah, Beyaz-Siyah, Bej)",
  "belirgin_ozellikler": "Görselden tespit edilen logo, desen, materyal vb. detaylar",
  "katalog_gorsel_url": "Doğrudan görsel dosya linki (.jpg, .jpeg, .png, .webp) - web sayfası linki OLMAYACAK",
  "urun_sayfasi_url": "Ürünün resmi e-ticaret satış veya marka sayfası",
  "aciklama": "Ürünün resmi katalog açıklaması ve özellikleri",
  "google_arama_kelimeleri": "Google Görseller veya Google Lens'te tam bu ürünü bulmak için en etkili 4-5 kelimelik arama terimi"
}`;

    const searchResponse = await generateContentWithRetryAndFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: lensPrompt,
        },
      ],
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.1,
      },
    });

    const yanitMetni = searchResponse.text || '';
    let sonuc: any = null;
    try {
      const jsonMatch = yanitMetni.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        sonuc = JSON.parse(jsonMatch[0]);
      }
    } catch (parseErr) {
      console.warn('Görsel arama JSON parse hatası:', parseErr);
    }

    const groundingMetadata = (searchResponse as any).candidates?.[0]?.groundingMetadata;
    const webChunks = groundingMetadata?.groundingChunks || [];
    const webLinkleri = webChunks
      .filter((c: any) => c.web?.uri)
      .map((c: any) => ({
        baslik: c.web.title || 'Resmi Satış Sayfası',
        url: c.web.uri,
      }));

    if (!sonuc) {
      sonuc = {
        marka: '',
        resmi_urun_adi: mevcut_urun_adi || 'Tespit Edilen Ürün',
        urun_tipi: '',
        renk: '',
        belirgin_ozellikler: '',
        katalog_gorsel_url: '',
        urun_sayfasi_url: webLinkleri[0]?.url || '',
        aciklama: yanitMetni.slice(0, 200),
        google_arama_kelimeleri: mevcut_urun_adi || '',
      };
    } else if (!sonuc.urun_sayfasi_url && webLinkleri.length > 0) {
      sonuc.urun_sayfasi_url = webLinkleri[0].url;
    }

    if (sonuc.katalog_gorsel_url) {
      const gecerliMi = await isValidImageUrl(sonuc.katalog_gorsel_url);
      if (!gecerliMi) {
        console.log(
          `[Görsel Doğrulama] Modelin ürettiği katalog URL geçersiz çıktı, temizleniyor.`
        );
        sonuc.katalog_gorsel_url = '';
      }
    }

    if (!sonuc.katalog_gorsel_url) {
      const adayLinkler = [sonuc.urun_sayfasi_url, ...webLinkleri.map((w: any) => w.url)].filter(
        Boolean
      );
      for (const link of adayLinkler) {
        if (!link || link.includes('google.com') || link.includes('google.com.tr')) continue;
        const ogResmi = await fetchOgImageFromUrl(link);
        if (ogResmi && (await isValidImageUrl(ogResmi))) {
          sonuc.katalog_gorsel_url = ogResmi;
          break;
        }
      }
    }

    const aramaKelimeleri =
      (
        sonuc.google_arama_kelimeleri || `${sonuc.marka || ''} ${sonuc.resmi_urun_adi || ''}`
      ).trim() || 'Ürün Ara';
    const googleGorselAramaUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleWebAramaUrl = `https://www.google.com/search?q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleAlisverisUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(aramaKelimeleri)}`;

    if (!sonuc.urun_sayfasi_url) {
      sonuc.urun_sayfasi_url = googleWebAramaUrl;
    }

    const sonWebLinkleri =
      webLinkleri.length > 0
        ? webLinkleri.slice(0, 5)
        : [
            {
              baslik: `Google Görseller: ${aramaKelimeleri}`,
              url: googleGorselAramaUrl,
            },
            {
              baslik: `Google Alışveriş / Fiyatlar: ${aramaKelimeleri}`,
              url: googleAlisverisUrl,
            },
            {
              baslik: `Google Web Arama: ${aramaKelimeleri}`,
              url: googleWebAramaUrl,
            },
          ];

    res.json({
      basarili: true,
      sonuc,
      web_linkleri: sonWebLinkleri,
      google_gorsel_arama_url: googleGorselAramaUrl,
    });
  } catch (err: any) {
    console.error('Görselden arama hatası:', err);
    res
      .status(err instanceof PublicResourceError ? err.status : 500)
      .json({ basarili: false, hata: err.message || 'Görsel üzerinden arama yapılamadı.' });
  }
});

// 6. POST /api/katalog-gorseli-kaydet — Web'den Bulunan Katalog Görselini Sipariş Ürününe Tanımla
router.post('/katalog-gorseli-kaydet', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi, katalog_gorsel_url, urun_sayfasi_url, resmi_urun_adi } =
      req.body;
    if (!siparis_id || urun_indeksi === undefined || !katalog_gorsel_url) {
      return res
        .status(400)
        .json({
          basarili: false,
          hata: 'siparis_id, urun_indeksi ve katalog_gorsel_url gereklidir.',
        });
    }

    // SSRF Koruması: Dış URL verilmişse veritabanına sorgu atmadan önce doğrula
    if (
      typeof katalog_gorsel_url === 'string' &&
      (katalog_gorsel_url.startsWith('http://') || katalog_gorsel_url.startsWith('https://'))
    ) {
      const urlKontrol = urlGuvenlimi(katalog_gorsel_url);
      if (!urlKontrol.guvenli) {
        return res.status(403).json({
          basarili: false,
          hata: `Güvenlik engeli (SSRF): ${urlKontrol.sebep}`,
        });
      }
    }

    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find((s) => s.id === siparis_id);
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    const formatli = formatlaSiparis(mevcutSiparis);
    const guncelUrunler = [...(formatli.urunler || [])];

    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: 'Belirtilen ürün bulunamadı.' });
    }

    const mevcutUrun = guncelUrunler[urun_indeksi];
    const korunanOrijinalGorsel =
      mevcutUrun.orijinal_gorsel_url ||
      mevcutUrun.urun_gorseli ||
      (formatli.gorseller && formatli.gorseller[0]) ||
      '';

    let kaydedilecekGorselUrl = katalog_gorsel_url;

    if (kaydedilecekGorselUrl.includes('/api/proxy-gorsel?url=')) {
      try {
        const parsed = new URL(kaydedilecekGorselUrl, 'http://localhost:3000');
        const gercekUrl = parsed.searchParams.get('url');
        if (gercekUrl) kaydedilecekGorselUrl = gercekUrl;
      } catch {}
    }

    if (kaydedilecekGorselUrl.startsWith('data:image/')) {
      const image = decodeImage(kaydedilecekGorselUrl);
      const dosyaAdi = `kirpinti_${Date.now()}_${urun_indeksi}.${image.ext}`;
      const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
      fs.writeFileSync(dosyaYolu, image.buffer);
      kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
    } else if (
      kaydedilecekGorselUrl.startsWith('http://') ||
      kaydedilecekGorselUrl.startsWith('https://')
    ) {
      const urlKontrol = urlGuvenlimi(kaydedilecekGorselUrl);
      if (!urlKontrol.guvenli) {
        return res.status(403).json({
          basarili: false,
          hata: `Güvenlik engeli (SSRF): ${urlKontrol.sebep}`,
        });
      }
      try {
        const response = await fetchPublicResource(kaydedilecekGorselUrl);

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          return res.status(400).json({
            basarili: false,
            hata: 'Belirtilen adres doğrudan bir görsel dosyası değil, web sayfası linkidir. Lütfen doğrudan resim adresini (.jpg, .png vb.) girin.',
          });
        }

        if (response.ok && contentType.startsWith('image/')) {
          const arrayBuffer = await response.arrayBuffer();
          const image = inspectImage(Buffer.from(arrayBuffer), contentType.split(';')[0]);
          const dosyaAdi = `katalog_${Date.now()}_${urun_indeksi}.${image.ext}`;
          const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
          fs.writeFileSync(dosyaYolu, image.buffer);
          kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
        }
      } catch (fetchErr) {
        if (fetchErr instanceof PublicResourceError) {
          return res.status(fetchErr.status).json({ basarili: false, hata: fetchErr.message });
        }
        console.warn('Görsel yerel indirme uyarısı (URL doğrudan kullanılacak):', fetchErr);
      }
    }

    guncelUrunler[urun_indeksi] = {
      ...mevcutUrun,
      orijinal_gorsel_url: korunanOrijinalGorsel,
      katalog_gorseli: kaydedilecekGorselUrl,
      urun_gorseli: kaydedilecekGorselUrl,
      urun_sayfasi_url: urun_sayfasi_url || mevcutUrun.urun_sayfasi_url,
      resmi_urun_adi: resmi_urun_adi || mevcutUrun.resmi_urun_adi,
    };

    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler,
    });

    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .update(sbPayload)
        .eq('id', siparis_id)
        .select()
        .single();
      if (error) console.error('Supabase katalog görseli güncelleme hatası:', error.message);
      if (data) {
        return res.json({
          basarili: true,
          siparis: formatlaSiparis(data),
          mesaj: 'Orijinal web katalog görseli kaydedildi!',
        });
      }
    }

    const idx = siparislerVeritabani.findIndex((s) => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({
      basarili: true,
      siparis: { ...formatli, urunler: guncelUrunler },
      mesaj: 'Orijinal web katalog görseli kaydedildi!',
    });
  } catch (err: any) {
    console.error('Katalog görseli kaydetme hatası:', err);
    res
      .status(err instanceof PublicResourceError ? err.status : 500)
      .json({ basarili: false, hata: err.message });
  }
});

// 7. POST /api/urun-orijinal-gorsele-don — Orijinal Ekran Görüntüsüne Geri Dön
router.post('/urun-orijinal-gorsele-don', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi } = req.body;
    if (!siparis_id || urun_indeksi === undefined) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'siparis_id ve urun_indeksi gereklidir.' });
    }

    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find((s) => s.id === siparis_id);
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    const formatli = formatlaSiparis(mevcutSiparis);
    const guncelUrunler = [...(formatli.urunler || [])];

    if (!guncelUrunler[urun_indeksi]) {
      return res.status(400).json({ basarili: false, hata: 'Belirtilen ürün bulunamadı.' });
    }

    const u = guncelUrunler[urun_indeksi];
    const geriDonecekGorsel =
      u.orijinal_gorsel_url || (formatli.gorseller && formatli.gorseller[0]) || '';

    guncelUrunler[urun_indeksi] = {
      ...u,
      urun_gorseli: geriDonecekGorsel,
      katalog_gorseli: undefined,
      urun_sayfasi_url: undefined,
      resmi_urun_adi: undefined,
    };

    const sbPayload = hazirlaSupabasePayload({
      ...formatli,
      urunler: guncelUrunler,
    });

    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .update(sbPayload)
        .eq('id', siparis_id)
        .select()
        .single();
      if (error) console.error('Supabase orijinal görsele dönme hatası:', error.message);
      if (data) {
        return res.json({
          basarili: true,
          siparis: formatlaSiparis(data),
          mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.',
        });
      }
    }

    const idx = siparislerVeritabani.findIndex((s) => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({
      basarili: true,
      siparis: { ...formatli, urunler: guncelUrunler },
      mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.',
    });
  } catch (err: any) {
    console.error('Orijinal görsele dönme hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

export default router;
