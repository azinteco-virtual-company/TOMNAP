import { randomBytes } from 'node:crypto';
import { Router, Request, Response } from 'express';
import path from 'path';
import { GEMINI_API_KEY } from '../config';
import { urlGuvenlimi } from '../middleware/security';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
import { siparislerVeritabani } from '../services/state';
import { fetchPublicResource, MAX_IMAGE_BYTES, PublicResourceError } from '../services/publicFetch';
import { tenantImagePrefix as imagePrefix } from '../services/tenantImageNames';

import { decodeImage, inspectImage } from '../services/imageValidation';
import {
  readPrivateImage,
  writePrivateImage,
  assertPrivateImageExists,
} from '../services/privateImageStorage';

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

// Authorize before accessing local or remote storage; object keys never grant access.
function ownedUploadName(req: Request, name: string): string {
  if (!req.auth || !req.tenantId) throw new PublicResourceError('Oturum gerekli.', 401);
  if (/[\\/]/.test(name)) throw new PublicResourceError('Geçersiz görsel dosya yolu.', 403);
  if (
    !/^t_[a-f0-9]{24}_[a-f0-9]{32}\.(png|jpg|webp)$/.test(name) ||
    (!(req.auth.role === 'SUPER_ADMIN' && req.tenantId === 'all') &&
      !name.startsWith(imagePrefix(req.tenantId)))
  )
    throw new PublicResourceError('Görsel bulunamadı.', 404);
  return name;
}

export async function storeTenantImage(req: Request, base64: string, declaredMime?: string) {
  if (!req.auth || !req.tenantId || req.tenantId === 'all')
    throw new PublicResourceError('Görsel için bir firma seçin.', 403);
  if (typeof base64 !== 'string') throw new PublicResourceError('Geçersiz görsel.', 400);
  const parsed = decodeImage(base64, declaredMime);
  const name = `${imagePrefix(req.tenantId)}${randomBytes(16).toString('hex')}.${parsed.ext}`;
  await writePrivateImage(name, parsed.buffer);
  return {
    url: `/uploads/${name}`,
    mimeType: parsed.mimeType,
    base64: parsed.buffer.toString('base64'),
  };
}

// Check references in products, image arrays and serialized META notes alike.
// Unowned legacy files must be migrated explicitly; guessing ownership leaks data.
export async function assertTenantImageReferences(req: Request, payload: unknown): Promise<void> {
  const pending: unknown[] = [payload];
  const names = new Set<string>();
  let count = 0;
  while (pending.length) {
    if (++count > 100000) throw new PublicResourceError('İstek çok karmaşık.', 413);
    const value = pending.pop();
    if (value && typeof value === 'object') pending.push(...Object.values(value));
    if (typeof value !== 'string') continue;
    const normalized = value.replace(/\\\//g, '/');
    for (const match of normalized.matchAll(/(?:\/api)?\/uploads\/([^\s"'<>?#]+)/g)) {
      let name: string;
      try {
        name = decodeURIComponent(match[1]);
      } catch {
        throw new PublicResourceError('Geçersiz görsel.', 400);
      }
      names.add(ownedUploadName(req, name));
      if (names.size > 10000) throw new PublicResourceError('Çok fazla görsel bağlantısı.', 413);
    }
  }
  // Authorize the complete payload before I/O. Bound remote fan-out and stop
  // scheduling after an error or 30 seconds; each in-flight API call also has
  // its own 15-second transport deadline. No writes have happened at this point.
  const remaining = [...names];
  const deadline = Date.now() + 30000;
  let stopped = false;
  const worker = async () => {
    while (!stopped && remaining.length) {
      if (Date.now() >= deadline) {
        stopped = true;
        throw new PublicResourceError('Görsel doğrulaması zaman aşımına uğradı.', 503);
      }
      const name = remaining.pop()!;
      try {
        await assertPrivateImageExists(name);
      } catch (failure) {
        stopped = true;
        throw failure;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, worker));
}

const imageMetadataVersion = (row: any) =>
  JSON.stringify({
    urunler: row.urunler,
    gorsel_urlleri: row.gorsel_urlleri,
    eksik_bilgiler: row.eksik_bilgiler,
  });

async function saveOrderImageMetadata(
  req: Request,
  id: string,
  original: any,
  formatted: any,
  products: any[]
) {
  const metadata = hazirlaSupabasePayload({ ...formatted, urunler: products }).eksik_bilgiler;
  if (supabase) {
    // Image edits must never replay an earlier courier assignment, delivery or
    // financial state after awaiting a remote catalogue image.
    let query = supabase
      .from('siparisler')
      .update({ eksik_bilgiler: metadata })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);
    for (const field of ['eksik_bilgiler', 'urunler', 'gorsel_urlleri']) {
      if (field !== 'eksik_bilgiler' && !Object.hasOwn(original, field)) continue;
      query =
        original[field] == null
          ? query.is(field, null)
          : query.eq(field, JSON.stringify(original[field]));
    }
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw new PublicResourceError('Görsel değişikliği kaydedilemedi.', 503);
    if (!data) throw new PublicResourceError('Görsel bilgileri değişti; siparişi yenileyin.', 409);
    return formatlaSiparis(data);
  }
  const index = siparislerVeritabani.findIndex(
    (row) => row.id === id && row.tenant_id === req.tenantId
  );
  if (index === -1) throw new PublicResourceError('Sipariş bulunamadı.', 404);
  const current = siparislerVeritabani[index];
  if (imageMetadataVersion(formatlaSiparis(current)) !== imageMetadataVersion(formatted))
    throw new PublicResourceError('Görsel bilgileri değişti; siparişi yenileyin.', 409);
  const updated = formatlaSiparis({ ...current, eksik_bilgiler: metadata, urunler: products });
  siparislerVeritabani[index] = updated;
  return updated;
}

export async function serveUploadedImage(req: Request, res: Response) {
  try {
    const name = ownedUploadName(req, req.params.dosyaAdi);
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    const image = await readPrivateImage(name);
    res.setHeader('Content-Type', image.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.send(image.buffer);
  } catch (error) {
    return res
      .status(error instanceof PublicResourceError ? error.status : 500)
      .send('Görsele erişilemiyor.');
  }
}

router.get('/uploads/:dosyaAdi', serveUploadedImage);

// 2. POST /api/upload-gorsel — Tekil Görsel Yükle
router.post('/upload-gorsel', async (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Geçersiz görsel verisi' });
    }

    const stored = await storeTenantImage(req, base64, mimeType);
    const benzersizAd = path.basename(stored.url);

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
    res.setHeader('Cache-Control', 'private, no-store');
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
    await assertTenantImageReferences(req, gorsel);
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
    } else if (gorsel.startsWith('/uploads/') || gorsel.startsWith('/api/uploads/')) {
      const name = ownedUploadName(req, gorsel.replace(/^\/(?:api\/)?uploads\//, ''));
      const image = await readPrivateImage(name);
      base64Data = image.buffer.toString('base64');
      mimeType = image.mimeType;
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
      return res.status(400).json({
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

    if (!req.tenantId || req.tenantId === 'all')
      return res.status(403).json({ basarili: false, hata: 'Firma seçin.' });
    if (!Number.isInteger(urun_indeksi) || urun_indeksi < 0)
      return res.status(400).json({ basarili: false, hata: 'Geçersiz ürün indeksi.' });
    let mevcutSiparis: any = null;
    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .select('*')
        .eq('id', siparis_id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: 'Veritabanı kullanılamıyor.' });
      mevcutSiparis = data;
    } else {
      mevcutSiparis = siparislerVeritabani.find(
        (s) => s.id === siparis_id && s.tenant_id === req.tenantId
      );
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    await assertTenantImageReferences(req, req.body);
    const formatli = formatlaSiparis(mevcutSiparis);
    await assertTenantImageReferences(req, formatli);
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
      kaydedilecekGorselUrl = (await storeTenantImage(req, kaydedilecekGorselUrl)).url;
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
          kaydedilecekGorselUrl = (
            await storeTenantImage(req, image.buffer.toString('base64'), image.mimeType)
          ).url;
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

    const saved = await saveOrderImageMetadata(
      req,
      siparis_id,
      mevcutSiparis,
      formatli,
      guncelUrunler
    );

    res.json({
      basarili: true,
      siparis: saved,
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

    if (!req.tenantId || req.tenantId === 'all')
      return res.status(403).json({ basarili: false, hata: 'Firma seçin.' });
    if (!Number.isInteger(urun_indeksi) || urun_indeksi < 0)
      return res.status(400).json({ basarili: false, hata: 'Geçersiz ürün indeksi.' });
    let mevcutSiparis: any = null;
    if (supabase) {
      const { data, error } = await supabase
        .from('siparisler')
        .select('*')
        .eq('id', siparis_id)
        .eq('tenant_id', req.tenantId)
        .maybeSingle();
      if (error)
        return res.status(503).json({ basarili: false, hata: 'Veritabanı kullanılamıyor.' });
      mevcutSiparis = data;
    } else {
      mevcutSiparis = siparislerVeritabani.find(
        (s) => s.id === siparis_id && s.tenant_id === req.tenantId
      );
    }

    if (!mevcutSiparis) {
      return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    }

    await assertTenantImageReferences(req, req.body);
    const formatli = formatlaSiparis(mevcutSiparis);
    await assertTenantImageReferences(req, formatli);
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

    const saved = await saveOrderImageMetadata(
      req,
      siparis_id,
      mevcutSiparis,
      formatli,
      guncelUrunler
    );

    res.json({
      basarili: true,
      siparis: saved,
      mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.',
    });
  } catch (err: any) {
    console.error('Orijinal görsele dönme hatası:', err);
    res
      .status(err instanceof PublicResourceError ? err.status : 500)
      .json({ basarili: false, hata: err.message });
  }
});

export default router;
