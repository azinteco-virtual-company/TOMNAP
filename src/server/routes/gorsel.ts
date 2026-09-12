import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { UPLOADS_DIR, GEMINI_API_KEY } from '../config';
import { sanitizeDosyaAdi, yolGuvenlimi, urlGuvenlimi } from '../middleware/security';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { supabase } from '../services/supabase';
import { hazirlaSupabasePayload, formatlaSiparis } from '../services/siparisFormatlama';
import { siparislerVeritabani } from '../services/state';

const router = Router();

// Sayfadan og:image çekerek yüksek çözünürlüklü stüdyo fotoğrafını bulan yardımcı fonksiyon
export async function fetchOgImageFromUrl(pageUrl: string): Promise<string | null> {
  if (!pageUrl || !pageUrl.startsWith('http')) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const resp = await fetch(pageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    clearTimeout(timeout);
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
      if (imgUrl.startsWith('http') && !imgUrl.includes('placeholder') && !imgUrl.includes('logo')) {
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
  if (!url || !url.startsWith('http')) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const resp = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(url).origin,
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) return false;
    const contentType = resp.headers.get('content-type') || '';
    return contentType.startsWith('image/');
  } catch {
    return false;
  }
}

// 1. Akıllı görsel servisi: Dosya birebir yoksa aynı indeksteki veya mevcut son görselle kurtarır
router.get('/uploads/:dosyaAdi', (req, res, next) => {
  const dosyaAdi = sanitizeDosyaAdi(req.params.dosyaAdi);
  const tamYol = path.join(UPLOADS_DIR, dosyaAdi);

  if (!yolGuvenlimi(tamYol, UPLOADS_DIR)) {
    return res.status(403).send('Erişim reddedildi.');
  }

  if (fs.existsSync(tamYol)) {
    return res.sendFile(tamYol);
  }

  // Akıllı Fallback: Eğer dosya adı örn. gorsel_*_1.jpg veya gorsel_*_2.jpg ise
  try {
    const tumDosyalar = fs.readdirSync(UPLOADS_DIR).filter(f => !f.startsWith('.'));
    const indexMatch = dosyaAdi.match(/_([0-9]+)\.(jpe?g|png|webp|svg)$/i);

    if (indexMatch && indexMatch[1]) {
      const arananIndex = indexMatch[1];
      const uzanti = indexMatch[2];
      const eslesenler = tumDosyalar.filter(f => f.endsWith(`_${arananIndex}.${uzanti}`) || f.endsWith(`_${arananIndex}.jpg`) || f.endsWith(`_${arananIndex}.png`));
      if (eslesenler.length > 0) {
        eslesenler.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
        return res.sendFile(path.join(UPLOADS_DIR, eslesenler[0]));
      }
    }

    const resimDosyalari = tumDosyalar.filter(f => /\.(jpe?g|png|webp|svg)$/i.test(f));
    if (resimDosyalari.length > 0) {
      resimDosyalari.sort((a, b) => fs.statSync(path.join(UPLOADS_DIR, b)).mtimeMs - fs.statSync(path.join(UPLOADS_DIR, a)).mtimeMs);
      return res.sendFile(path.join(UPLOADS_DIR, resimDosyalari[0]));
    }
  } catch (fbErr) {
    console.warn('Görsel akıllı kurtarma hatası:', fbErr);
  }

  next();
});

// 2. POST /api/upload-gorsel — Tekil Görsel Yükle
router.post('/upload-gorsel', (req, res) => {
  try {
    const { base64, mimeType, dosyaAdi } = req.body;
    if (!base64 || typeof base64 !== 'string') {
      return res.status(400).json({ basarili: false, hata: 'Geçersiz görsel verisi' });
    }

    const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
    const ext = (mimeType || '').includes('png') ? 'png' : (mimeType || '').includes('webp') ? 'webp' : 'jpg';
    const benzersizAd = `urun_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const dosyaYolu = path.join(UPLOADS_DIR, benzersizAd);

    fs.writeFileSync(dosyaYolu, Buffer.from(cleanBase64, 'base64'));

    res.json({
      basarili: true,
      url: `/uploads/${benzersizAd}`,
      dosya_adi: dosyaAdi || benzersizAd,
    });
  } catch (err: any) {
    console.error('Görsel yükleme hatası:', err);
    res.status(500).json({ basarili: false, hata: 'Görsel kaydedilemedi: ' + err.message });
  }
});

// 3. GET /api/proxy-gorsel — Harici Resimler için Güvenli Vekil Sunucu (SSRF Korumalı)
router.get('/proxy-gorsel', async (req, res) => {
  const gorselUrl = req.query.url as string;
  if (!gorselUrl || !gorselUrl.startsWith('http')) {
    return res.status(400).send('Geçersiz görsel adresi');
  }

  // SSRF Koruması
  const urlKontrol = urlGuvenlimi(gorselUrl);
  if (!urlKontrol.guvenli) {
    console.warn(`[SSRF Engellendi] ${gorselUrl} — Sebep: ${urlKontrol.sebep}`);
    return res.status(403).json({ basarili: false, hata: urlKontrol.sebep });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const resp = await fetch(gorselUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': new URL(gorselUrl).origin,
      },
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      return res.status(resp.status).send(`Görsel indirilemedi (${resp.status})`);
    }

    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return res.status(400).send('Hedef adres resim dosyası değil');
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const arrayBuf = await resp.arrayBuffer();
    res.send(Buffer.from(arrayBuf));
  } catch (err: any) {
    res.status(500).send('Vekil sunucu hatası: ' + err.message);
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
    res.status(500).json({ basarili: false, hata: err.message || 'Ürün görsel araması başarısız oldu.' });
  }
});

// 5. POST /api/gorselden-urun-ara — Görselden Ürünü Tanı ve Web'den Orijinalini Bul
router.post('/gorselden-urun-ara', async (req, res) => {
  try {
    const { gorsel, mevcut_urun_adi, ek_ipucu } = req.body;
    if (!gorsel) {
      return res.status(400).json({ basarili: false, hata: 'Aranacak görsel verisi bulunamadı.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ basarili: false, hata: 'Gemini API anahtarı yapılandırılmamış.' });
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (gorsel.startsWith('data:')) {
      const match = gorsel.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    } else if (gorsel.startsWith('/uploads/')) {
      const dosyaAdi = gorsel.replace('/uploads/', '');
      const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
      if (fs.existsSync(dosyaYolu)) {
        const buffer = fs.readFileSync(dosyaYolu);
        base64Data = buffer.toString('base64');
        mimeType = dosyaAdi.endsWith('.png') ? 'image/png' : 'image/jpeg';
      }
    } else if (gorsel.startsWith('http')) {
      try {
        const fetchRes = await fetch(gorsel);
        if (fetchRes.ok) {
          const arrayBuffer = await fetchRes.arrayBuffer();
          base64Data = Buffer.from(arrayBuffer).toString('base64');
          const ct = fetchRes.headers.get('content-type');
          if (ct && ct.startsWith('image/')) mimeType = ct;
        }
      } catch (err) {
        console.warn('Görsel URL indirilemedi:', err);
      }
    }

    if (!base64Data) {
      return res.status(400).json({ basarili: false, hata: 'Görsel verisi okunamadı veya format desteklenmiyor.' });
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
        console.log(`[Görsel Doğrulama] Modelin ürettiği katalog URL geçersiz çıktı, temizleniyor.`);
        sonuc.katalog_gorsel_url = '';
      }
    }

    if (!sonuc.katalog_gorsel_url) {
      const adayLinkler = [sonuc.urun_sayfasi_url, ...(webLinkleri.map((w: any) => w.url))].filter(Boolean);
      for (const link of adayLinkler) {
        if (!link || link.includes('google.com') || link.includes('google.com.tr')) continue;
        const ogResmi = await fetchOgImageFromUrl(link);
        if (ogResmi && await isValidImageUrl(ogResmi)) {
          sonuc.katalog_gorsel_url = ogResmi;
          break;
        }
      }
    }

    const aramaKelimeleri = (sonuc.google_arama_kelimeleri || `${sonuc.marka || ''} ${sonuc.resmi_urun_adi || ''}`).trim() || 'Ürün Ara';
    const googleGorselAramaUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleWebAramaUrl = `https://www.google.com/search?q=${encodeURIComponent(aramaKelimeleri)}`;
    const googleAlisverisUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(aramaKelimeleri)}`;

    if (!sonuc.urun_sayfasi_url) {
      sonuc.urun_sayfasi_url = googleWebAramaUrl;
    }

    const sonWebLinkleri = webLinkleri.length > 0 ? webLinkleri.slice(0, 5) : [
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
    res.status(500).json({ basarili: false, hata: err.message || 'Görsel üzerinden arama yapılamadı.' });
  }
});

// 6. POST /api/katalog-gorseli-kaydet — Web'den Bulunan Katalog Görselini Sipariş Ürününe Tanımla
router.post('/katalog-gorseli-kaydet', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi, katalog_gorsel_url, urun_sayfasi_url, resmi_urun_adi } = req.body;
    if (!siparis_id || urun_indeksi === undefined || !katalog_gorsel_url) {
      return res.status(400).json({ basarili: false, hata: 'siparis_id, urun_indeksi ve katalog_gorsel_url gereklidir.' });
    }

    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find(s => s.id === siparis_id);
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
    const korunanOrijinalGorsel = mevcutUrun.orijinal_gorsel_url || mevcutUrun.urun_gorseli || (formatli.gorseller && formatli.gorseller[0]) || '';

    let kaydedilecekGorselUrl = katalog_gorsel_url;

    if (kaydedilecekGorselUrl.includes('/api/proxy-gorsel?url=')) {
      try {
        const parsed = new URL(kaydedilecekGorselUrl, 'http://localhost:3000');
        const gercekUrl = parsed.searchParams.get('url');
        if (gercekUrl) kaydedilecekGorselUrl = gercekUrl;
      } catch {}
    }

    if (kaydedilecekGorselUrl.startsWith('data:image/')) {
      try {
        const matches = kaydedilecekGorselUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const rawExt = matches[1].toLowerCase();
          const ext = rawExt.includes('png') ? '.png' : rawExt.includes('webp') ? '.webp' : '.jpg';
          const buffer = Buffer.from(matches[2], 'base64');
          const dosyaAdi = `kirpinti_${Date.now()}_${urun_indeksi}${ext}`;
          const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
          fs.writeFileSync(dosyaYolu, buffer);
          kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
        }
      } catch (errKirpinti) {
        console.warn('Kırpıntı görseli dosyaya kaydedilemedi:', errKirpinti);
      }
    } else if (kaydedilecekGorselUrl.startsWith('http://') || kaydedilecekGorselUrl.startsWith('https://')) {
      try {
        const response = await fetch(kaydedilecekGorselUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            'Referer': new URL(kaydedilecekGorselUrl).origin,
          },
        });

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          return res.status(400).json({
            basarili: false,
            hata: 'Belirtilen adres doğrudan bir görsel dosyası değil, web sayfası linkidir. Lütfen doğrudan resim adresini (.jpg, .png vb.) girin.',
          });
        }

        if (response.ok && contentType.startsWith('image/')) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg';
          const dosyaAdi = `katalog_${Date.now()}_${urun_indeksi}${ext}`;
          const dosyaYolu = path.join(UPLOADS_DIR, dosyaAdi);
          fs.writeFileSync(dosyaYolu, buffer);
          kaydedilecekGorselUrl = `/uploads/${dosyaAdi}`;
        }
      } catch (fetchErr) {
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
        return res.json({ basarili: true, siparis: formatlaSiparis(data), mesaj: 'Orijinal web katalog görseli kaydedildi!' });
      }
    }

    const idx = siparislerVeritabani.findIndex(s => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({ basarili: true, siparis: { ...formatli, urunler: guncelUrunler }, mesaj: 'Orijinal web katalog görseli kaydedildi!' });
  } catch (err: any) {
    console.error('Katalog görseli kaydetme hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

// 7. POST /api/urun-orijinal-gorsele-don — Orijinal Ekran Görüntüsüne Geri Dön
router.post('/urun-orijinal-gorsele-don', async (req, res) => {
  try {
    const { siparis_id, urun_indeksi } = req.body;
    if (!siparis_id || urun_indeksi === undefined) {
      return res.status(400).json({ basarili: false, hata: 'siparis_id ve urun_indeksi gereklidir.' });
    }

    let mevcutSiparis: any = null;
    if (supabase) {
      const { data } = await supabase.from('siparisler').select('*').eq('id', siparis_id).single();
      if (data) mevcutSiparis = data;
    }
    if (!mevcutSiparis) {
      mevcutSiparis = siparislerVeritabani.find(s => s.id === siparis_id);
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
    const geriDonecekGorsel = u.orijinal_gorsel_url || (formatli.gorseller && formatli.gorseller[0]) || '';

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
        return res.json({ basarili: true, siparis: formatlaSiparis(data), mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.' });
      }
    }

    const idx = siparislerVeritabani.findIndex(s => s.id === siparis_id);
    if (idx !== -1) {
      siparislerVeritabani[idx].urunler = guncelUrunler;
    }

    res.json({ basarili: true, siparis: { ...formatli, urunler: guncelUrunler }, mesaj: 'Orijinal ekran görüntüsü başarıyla geri yüklendi.' });
  } catch (err: any) {
    console.error('Orijinal görsele dönme hatası:', err);
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

export default router;
