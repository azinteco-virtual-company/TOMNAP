import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { Type } from '@google/genai';
import { UPLOADS_DIR } from '../config';
import { supabase } from '../services/supabase';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import {
  hazirlaSupabasePayload,
  formatlaSiparis,
  uretKanadaTakipKodu,
  uretUluslararasiKargoKodu,
} from '../services/siparisFormatlama';
import {
  siparislerVeritabani,
  setSiparislerVeritabani,
  musterilerVeritabani,
  demoSiparislerVeritabani,
  setDemoSiparislerVeritabani,
  sifirlaDemoVeritabani,
} from '../services/state';
import { MusteriKaydi } from '../types';

const router = Router();

// 1. GET /api/siparisler — Tüm Siparişleri Getir (Tenant İzolasyonlu & Demo Sandbox Korumalı)
router.get('/siparisler', async (req, res) => {
  const seciliTenant = req.query.tenant_id as string | undefined;

  // Əgər sorğu DEMO SANDBOX üçün gəlirsə — təcrid olunmuş 109 sifarişi dərhal qaytar
  if (seciliTenant === 'demo_sandbox') {
    const formatli = demoSiparislerVeritabani.map((s) => formatlaSiparis(s));
    return res.json({
      basarili: true,
      kaynak: 'demo_sandbox',
      toplam: formatli.length,
      siparisler: formatli,
      isDemo: true,
    });
  }

  if (supabase) {
    try {
      let query = supabase.from('siparisler').select('*');
      if (seciliTenant && seciliTenant !== 'all') {
        query = query.eq('tenant_id', seciliTenant);
      }
      const { data, error } = await query.order('olusturma_tarihi', { ascending: false });
      if (error) {
        console.error('Supabase okuma hatası:', error.message);
      } else if (data) {
        const formatli = data.map((s) => formatlaSiparis(s));
        return res.json({
          basarili: true,
          kaynak: 'supabase',
          toplam: formatli.length,
          siparisler: formatli,
        });
      }
    } catch (errDb) {
      console.error('Supabase bağlantı istisnası:', errDb);
    }
  }

  let sonuc = siparislerVeritabani.map((s) => formatlaSiparis(s));
  if (seciliTenant && seciliTenant !== 'all') {
    sonuc = sonuc.filter((s) => (s.tenant_id || 'kanada_shopper_baku') === seciliTenant);
  }

  res.json({
    basarili: true,
    kaynak: 'bellek',
    toplam: sonuc.length,
    siparisler: sonuc,
  });
});

// 2. POST /api/ayristir-siparis — Gemini AI ile Dağınık Mesajı Ayrıştır ve Kaydet
router.post('/ayristir-siparis', async (req, res) => {
  try {
    const { ham_mesaj, musteri_adi_ipucu, siparis_kaynagi, otomatik_kaydet, gorsel_base64, gorsel_mime_type, gorseller } = req.body;

    const hasGorseller = (Array.isArray(gorseller) && gorseller.length > 0) || !!gorsel_base64;

    if ((!ham_mesaj || typeof ham_mesaj !== 'string' || ham_mesaj.trim() === '') && !hasGorseller) {
      return res.status(400).json({
        basarili: false,
        hata: 'Lütfen müşteriden gelen ham mesaj metnini veya bir ürün görseli/ekran görüntüsü iletin.',
      });
    }

    let ai;
    try {
      ai = getGeminiClient();
    } catch (keyErr: any) {
      return res.status(500).json({
        basarili: false,
        hata: keyErr.message,
      });
    }

    // Mevcut müşterilerin özet listesi (Gemini akıllı eşleştirme ve yazım hatası düzeltmesi için)
    const musterilerRehberi = musterilerVeritabani.map(m => ({
      id: m.id,
      ad_soyad: m.ad_soyad,
      telefon: m.telefon,
      sehir: m.sehir,
      adres: m.adres,
      musteri_tipi: m.musteri_tipi,
    }));

    const systemInstruction = `Sen Kanada'dan Azerbaycan'a (Bakü, Gence ve diğer şehirler) Instagram Live, Reels, DM ve WhatsApp üzerinden ürün satışı yapan uluslararası bir butik e-ticaret ve lojistik operasyonunun Uzman Sipariş ve Müşteri Ayrıştırma Yapay Zekasısın.

Müşteriler siparişlerini son derece dağınık, günlük konuşma diliyle veya Azerbaycan Türkçesi / Türkiye Türkçesi karışımı karmaşık mesajlarla iletmektedirler.

GÖREVİN VE ÇOK KRİTİK KURALLAR:
1. MÜŞTERİ TANIMA VE YAZIM HATASI DÜZELTME (DEDUPLICATION & AUTOCORRECT):
   Sistemde kayıtlı mevcut müşteriler listesi:
   ${JSON.stringify(musterilerRehberi, null, 2)}

   - Mesaj veya görseldeki telefon numarası (örn: "+994 50 694 25 25") mevcut bir müşteriyle eşleşiyorsa, mesajda isim yanlış yazılmış olsa bile (örn: "Kemake" -> "Kəmalə Bədirbəyli") müşterinin doğru ve resmi adını 'musteri_adi' alanına yaz!
   - duzeltilen_yazim_hatasi: Eğer isimde bir harf/yazım hatası düzelttiysen belirt (örn: "Kemake -> Kəmalə Bədirbəyli (Telefon: +994 50 694 25 25 eşleşti)").
   - eslesen_musteri_id: Eşleşen müşterinin id'sini yaz (örn: "mus-001").
   - musteri_durumu: Mevcut müşteri eşleştiyse 'MEVCUT_MUSTERI', yeni bir müşteriyse 'YENI_MUSTERI'.
   - musteri_tipi: Eşleşen müşterinin tipini ata, yoksa mesaja göre 'TANIMADIK' veya akraba/tanıdık olduğunu belirten bir not varsa 'AKRABA_YAKIN' ata.
   - Teslimat şehri veya adresi mesajda eksik ama mevcut müşteri kartında varsa, otomatik tamamla (Örn: Gəncə, Ozan küçəsi).

2. BİRDEN FAZLA GÖRSEL & BİRDEN FAZLA ÜRÜN ANALİZİ:
   Kullanıcı aynı müşteri için birden fazla ekran görüntüsü veya ürün fotoğrafı eklemiş olabilir:
   - Müşteri TEK ve AYNI KİŞİDİR. Tüm görseller bu müşteriye aittir.
   - Görsellerdeki TÜM farklı ürünleri tespit et.
   - "urun_aciklamasi" alanında tüm ürünleri açık ve düzenli biçimde listele.
   - "adet" alanına toplam ürün sayısını yaz.
   - "toplam_tutar" alanına tüm ürünlerin toplam fiyatını toplayıp yaz.
   - "alinan_tutar" alanına toplam ödenen kaporayı veya tam ödemeyi yaz.
   - "birden_fazla_urun": Eğer 2 veya daha fazla farklı ürün varsa true, tek bir ürünse false.
   - "urunler": Tespit edilen her bir ürünün ayrı ayrı listesini doldur.

3. FİNANS DURUMU:
   - Tamamı ödendiyse: 'ODENDI'
   - Kapora, avans, beh veya bir kısmı verildiyse: 'KISMI_ODEME'
   - Hiç ödeme yapılmadıysa veya teslimatta ödenecekse: 'BEKLIYOR'
4. LOJİSTİK DURUMU: Varsayılan 'ULUSLARARASI_KARGO'.
5. alinan_tutar: Alınan kapora/beh (belirtilmemişse 0).
6. kalan_tutar: toplam_tutar - alinan_tutar.
7. baku_tahsilat_notu: Bakü'deki akrabanın teslimatta alacağı veya elden teslim edilecek notlar.
8. ozel_not: Müşterinin veya gönderenin kargo, teslimat, sürücü veya paketleme ile ilgili özel talebi.

9. WHATSAPP EKRAN GÖRÜNTÜSÜ VE MÜŞTERİ ADI TESPİTİ:
   - "İletildi / Forwarded / Yönləndirildi" etiketinin hemen altında yazan kişi adı siparişin asıl sahibidir, 'musteri_adi' alanına bunu yaz!
   - Ekranda bir şahıs adı veya telefon numarası varken ASLA 'musteri_adi' alanına "Bilinmiyor" yazma!

10. GÖRSELLERDEKİ ÜRÜN BAZLI TELEFON NUMARALARI VE ÖDEME NOTLARI:
   - Her bir ürün fotoğrafının altında veya hemen yanında yer alan telefon numarası ve ödeme notunu ilgili_telefon ve odeme_notu alanlarına ekle!`;

    const textPrompt = `Aşağıdaki müşteri mesajı / WhatsApp notu ve (varsa) ekli ürün/etiket/dekont görsellerini incele.
Mesaj Metni: "${(ham_mesaj || '').trim()}"${musteri_adi_ipucu ? ` (Kullanıcı İpucu: ${musteri_adi_ipucu})` : ''}

GÖRSEL VE MÜŞTERİ ADI TALİMATI:
Görsel / ekran görüntüsü ekliyse kişi adını, telefon numarasını, beden/fiyat bilgilerini tespit et ve genel toplamı hesapla.`;

    // Multimodal payload hazırlama
    const tumGorseller: Array<{ data: string; mimeType: string; dosyaAdi?: string }> = [];

    if (Array.isArray(gorseller) && gorseller.length > 0) {
      for (const g of gorseller) {
        if (g) {
          const raw = g.gorsel_base64 || g.base64;
          if (raw && typeof raw === 'string') {
            const clean = raw.replace(/^data:image\/\w+;base64,/, '');
            const mime = g.gorsel_mime_type || g.mimeType || 'image/jpeg';
            tumGorseller.push({ data: clean, mimeType: mime, dosyaAdi: g.dosya_adi || g.dosyaAdi });
          }
        }
      }
    } else if (gorsel_base64 && typeof gorsel_base64 === 'string') {
      const clean = gorsel_base64.replace(/^data:image\/\w+;base64,/, '');
      tumGorseller.push({ data: clean, mimeType: gorsel_mime_type || 'image/jpeg' });
    }

    const kaydedilenGorselUrlleri: string[] = [];
    for (let i = 0; i < tumGorseller.length; i++) {
      const g = tumGorseller[i];
      const ext = g.mimeType.includes('png') ? 'png' : g.mimeType.includes('webp') ? 'webp' : 'jpg';
      const dosyaAdi = `gorsel_${Date.now()}_${i + 1}.${ext}`;
      const hedefYol = path.join(UPLOADS_DIR, dosyaAdi);
      try {
        fs.writeFileSync(hedefYol, Buffer.from(g.data, 'base64'));
        kaydedilenGorselUrlleri.push(`/uploads/${dosyaAdi}`);
      } catch (dosyaErr) {
        console.error('Görsel dosyası kaydedilemedi:', dosyaErr);
      }
    }

    let contentsPayload: any = textPrompt;
    if (tumGorseller.length > 0) {
      contentsPayload = [
        { text: textPrompt },
        ...tumGorseller.map((g) => ({
          inlineData: {
            mimeType: g.mimeType,
            data: g.data,
          },
        })),
      ];
    }

    const schemaConfig = {
      systemInstruction,
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          musteri_adi: { type: Type.STRING },
          musteri_durumu: { type: Type.STRING, enum: ['MEVCUT_MUSTERI', 'YENI_MUSTERI'] },
          eslesen_musteri_id: { type: Type.STRING },
          duzeltilen_yazim_hatasi: { type: Type.STRING },
          musteri_tipi: { type: Type.STRING, enum: ['TANIMADIK', 'SADIK_MUSTERI', 'AKRABA_YAKIN', 'VIP'] },
          instagram_kullanici_adi: { type: Type.STRING },
          telefon_numarasi: { type: Type.STRING },
          teslimat_sehri: { type: Type.STRING },
          teslimat_adresi: { type: Type.STRING },
          urun_aciklamasi: { type: Type.STRING },
          beden_veya_olcu: { type: Type.STRING },
          renk: { type: Type.STRING },
          adet: { type: Type.INTEGER },
          birden_fazla_urun: { type: Type.BOOLEAN },
          urunler: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                urun_adi: { type: Type.STRING },
                urun_aciklamasi: { type: Type.STRING },
                adet: { type: Type.INTEGER },
                birim_fiyat: { type: Type.NUMBER },
                tutar: { type: Type.NUMBER },
                beden_veya_olcu: { type: Type.STRING },
                renk: { type: Type.STRING },
                gorsel_indeksi: { type: Type.INTEGER },
                ilgili_telefon: { type: Type.STRING },
                odeme_notu: { type: Type.STRING },
                ozel_not: { type: Type.STRING },
                urun_alani: {
                  type: Type.OBJECT,
                  properties: {
                    ymin: { type: Type.INTEGER },
                    xmin: { type: Type.INTEGER },
                    ymax: { type: Type.INTEGER },
                    xmax: { type: Type.INTEGER },
                  },
                  required: ['ymin', 'xmin', 'ymax', 'xmax'],
                },
              },
              required: ['urun_aciklamasi', 'adet'],
            },
          },
          toplam_tutar: { type: Type.NUMBER },
          alinan_tutar: { type: Type.NUMBER },
          kalan_tutar: { type: Type.NUMBER },
          para_birimi: { type: Type.STRING, enum: ['AZN', 'CAD', 'USD'] },
          finans_durumu: { type: Type.STRING, enum: ['ODENDI', 'KISMI_ODEME', 'BEKLIYOR'] },
          lojistik_durumu: {
            type: Type.STRING,
            enum: [
              'KANADA_SATINALIM_BEKLIYOR',
              'KANADA_DEPO',
              'ULUSLARARASI_KARGO',
              'BAKU_DAGITIM_ARKADAS',
              'TESLIM_EDILDI',
            ],
          },
          baku_tahsilat_notu: { type: Type.STRING },
          ozel_not: { type: Type.STRING },
          eksik_bilgiler: { type: Type.ARRAY, items: { type: Type.STRING } },
          ai_guven_skoru: { type: Type.NUMBER },
        },
        required: [
          'musteri_adi',
          'urun_aciklamasi',
          'adet',
          'toplam_tutar',
          'alinan_tutar',
          'finans_durumu',
          'lojistik_durumu',
          'eksik_bilgiler',
        ],
      },
    };

    const geminiResponse = await generateContentWithRetryAndFallback(ai, {
      contents: contentsPayload,
      config: schemaConfig,
    });

    const parsedJson = JSON.parse(geminiResponse.text || '{}');

    const alinan = Number(parsedJson.alinan_tutar || 0);
    const toplam = Number(parsedJson.toplam_tutar || alinan);
    const kalan = Math.max(0, toplam - alinan);

    const hedefTenantId = req.body.tenant_id || 'kanada_shopper_baku';
    const dbPayload = {
      tenant_id: hedefTenantId,
      is_demo: hedefTenantId === 'kanada_shopper_baku' || hedefTenantId === 'demo_sandbox',
      ham_mesaj: (ham_mesaj || (tumGorseller.length > 0 ? `[${tumGorseller.length} Ekran Görüntüsü & WhatsApp Notu]` : '')).trim(),
      siparis_kaynagi: siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: parsedJson.musteri_adi || 'Bilinmeyen Müşteri',
      instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || '',
      telefon_numarasi: parsedJson.telefon_numarasi || '',
      teslimat_sehri: parsedJson.teslimat_sehri || 'Bakü',
      teslimat_adresi: parsedJson.teslimat_adresi || '',
      urun_aciklamasi: parsedJson.urun_aciklamasi || 'Sipariş Edilen Ürün',
      beden_veya_olcu: parsedJson.beden_veya_olcu || '',
      renk: parsedJson.renk || '',
      adet: Number(parsedJson.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: parsedJson.para_birimi || 'AZN',
      finans_durumu: parsedJson.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: parsedJson.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: parsedJson.baku_tahsilat_notu || '',
      ozel_not: parsedJson.ozel_not || '',
      kanada_takip_kodu: uretKanadaTakipKodu(parsedJson.urun_aciklamasi),
      uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(parsedJson.eksik_bilgiler) ? parsedJson.eksik_bilgiler : [],
      ai_guven_skoru: Number(parsedJson.ai_guven_skoru || 0.95),
      musteri_id: parsedJson.eslesen_musteri_id || '',
      musteri_tipi: parsedJson.musteri_tipi || 'TANIMADIK',
      duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi || '',
      musteri_durumu: parsedJson.musteri_durumu || 'YENI_MUSTERI',
      birden_fazla_urun: parsedJson.birden_fazla_urun || (Array.isArray(parsedJson.urunler) && parsedJson.urunler.length > 1),
      urunler: (Array.isArray(parsedJson.urunler) ? parsedJson.urunler : []).map((u: any, idx: number) => {
        const uAdi = u.urun_adi || u.urun_aciklamasi || `Ürün #${idx + 1}`;
        const uFiyat = u.tutar !== undefined ? Number(u.tutar) : (u.birim_fiyat !== undefined ? Number(u.birim_fiyat) : undefined);
        const gIdx = typeof u.gorsel_indeksi === 'number' && u.gorsel_indeksi < kaydedilenGorselUrlleri.length ? u.gorsel_indeksi : 0;
        return {
          urun_adi: uAdi,
          urun_aciklamasi: uAdi,
          adet: Number(u.adet || 1),
          tutar: uFiyat,
          birim_fiyat: uFiyat,
          beden_veya_olcu: u.beden_veya_olcu || '',
          renk: u.renk || '',
          orijinal_gorsel_url: kaydedilenGorselUrlleri[gIdx] || undefined,
          urun_alani: u.urun_alani || undefined,
          urun_gorseli: kaydedilenGorselUrlleri[gIdx] || undefined,
          ilgili_telefon: u.ilgili_telefon || undefined,
          odeme_notu: u.odeme_notu || undefined,
          ozel_not: u.ozel_not || undefined,
        };
      }),
      gorsel_urlleri: kaydedilenGorselUrlleri.length > 0 ? kaydedilenGorselUrlleri : tumGorseller.map((g, i) => g.dosyaAdi || `Ekran_Goruntusu_${i + 1}.png`),
    };

    const urunNotlari = dbPayload.urunler
      .filter((u: any) => u.ilgili_telefon || u.odeme_notu)
      .map((u: any) => {
        const tel = u.ilgili_telefon ? `Tel: ${u.ilgili_telefon}` : '';
        const odm = u.odeme_notu ? `(${u.odeme_notu})` : '';
        const fyt = u.tutar ? `${u.tutar} ${dbPayload.para_birimi}` : 'Fiyat teyit edilecek';
        return `• ${u.urun_adi}: ${fyt} ${tel} ${odm}`.replace(/\s+/g, ' ').trim();
      });

    if (urunNotlari.length > 0) {
      const urunNotOzeti = `📦 Ürün İletişim & Ödeme Notları:\n${urunNotlari.join('\n')}`;
      if (!dbPayload.ozel_not) {
        dbPayload.ozel_not = urunNotOzeti;
      } else if (!dbPayload.ozel_not.includes('Ürün İletişim & Ödeme')) {
        dbPayload.ozel_not = `${dbPayload.ozel_not}\n\n${urunNotOzeti}`;
      }
    }

    let nihaiSiparis: any = null;

    if (otomatik_kaydet !== false && supabase) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
        if (error) {
          console.error('Supabase kayıt hatası:', error.message);
        } else if (data) {
          nihaiSiparis = {
            ...formatlaSiparis(data),
            musteri_id: parsedJson.eslesen_musteri_id,
            musteri_tipi: parsedJson.musteri_tipi,
            duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi,
            musteri_durumu: parsedJson.musteri_durumu,
            ozel_not: dbPayload.ozel_not,
            urunler: dbPayload.urunler,
            gorsel_urlleri: dbPayload.gorsel_urlleri,
          };
          console.log('✅ Sipariş Supabase veritabanına başarıyla yazıldı ID:', nihaiSiparis.id);
        }
      } catch (errDb) {
        console.error('Supabase istisnası:', errDb);
      }
    }

    if (!nihaiSiparis) {
      nihaiSiparis = formatlaSiparis({
        id: 'sip-' + Date.now().toString(36),
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        kalan_tutar: kalan,
      });
      if (otomatik_kaydet !== false) {
        siparislerVeritabani.unshift(nihaiSiparis);
      }
    }

    // Müşteri Deduplication
    const eslesenMusteriId = parsedJson.eslesen_musteri_id;
    const telNo = (parsedJson.telefon_numarasi || '').replace(/\s+/g, '');
    let bulunanMusteri = musterilerVeritabani.find(m =>
      (eslesenMusteriId && m.id === eslesenMusteriId) ||
      (telNo && m.telefon && m.telefon.replace(/\s+/g, '') === telNo) ||
      (m.ad_soyad.toLowerCase().trim() === (parsedJson.musteri_adi || '').toLowerCase().trim())
    );

    if (bulunanMusteri) {
      bulunanMusteri.toplam_siparis_sayisi += 1;
      bulunanMusteri.toplam_harcama += toplam;
      bulunanMusteri.kalan_toplam_borc += kalan;
      bulunanMusteri.son_siparis_tarihi = new Date().toISOString();
      if (!bulunanMusteri.adres && parsedJson.teslimat_adresi) bulunanMusteri.adres = parsedJson.teslimat_adresi;
      if (!bulunanMusteri.sehir && parsedJson.teslimat_sehri) bulunanMusteri.sehir = parsedJson.teslimat_sehri;
      if (!bulunanMusteri.telefon && parsedJson.telefon_numarasi) bulunanMusteri.telefon = parsedJson.telefon_numarasi;
      nihaiSiparis.musteri_id = bulunanMusteri.id;
      nihaiSiparis.musteri_tipi = bulunanMusteri.musteri_tipi;
    } else if (parsedJson.musteri_adi && parsedJson.musteri_adi !== 'Bilinmeyen Müşteri') {
      const yeniMusteri: MusteriKaydi = {
        id: 'mus-' + Date.now().toString(36),
        ad_soyad: parsedJson.musteri_adi,
        telefon: parsedJson.telefon_numarasi || '',
        instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || '',
        sehir: parsedJson.teslimat_sehri || 'Bakü',
        adres: parsedJson.teslimat_adresi || '',
        musteri_tipi: parsedJson.musteri_tipi || 'TANIMADIK',
        toplam_siparis_sayisi: 1,
        toplam_harcama: toplam,
        kalan_toplam_borc: kalan,
        olusturma_tarihi: new Date().toISOString(),
        son_siparis_tarihi: new Date().toISOString(),
      };
      musterilerVeritabani.unshift(yeniMusteri);
      nihaiSiparis.musteri_id = yeniMusteri.id;
      nihaiSiparis.musteri_tipi = yeniMusteri.musteri_tipi;
    }

    res.json({
      basarili: true,
      mesaj: 'Mesaj başarıyla Gemini AI tarafından ayrıştırıldı ve kaydedildi.',
      siparis: nihaiSiparis,
      ayristirilan_veri: nihaiSiparis,
      kaydedildi: otomatik_kaydet !== false,
      kaynak: supabase ? 'supabase' : 'bellek',
    });
  } catch (err: any) {
    console.error('Gemini Ayrıştırma Hatası:', err);
    res.status(500).json({
      basarili: false,
      hata: 'Yapay zeka ayrıştırması sırasında bir hata oluştu: ' + (err?.message || 'Bilinmeyen hata'),
    });
  }
});

// 3. POST /api/siparisler — Yeni Siparişi Doğrudan Ekle / Onayla
router.post('/siparisler', async (req, res) => {
  try {
    const yeniVeri = req.body;
    if (!yeniVeri || !yeniVeri.urun_aciklamasi || !yeniVeri.musteri_adi) {
      return res.status(400).json({ basarili: false, hata: 'Müşteri adı ve ürün açıklaması zorunludur.' });
    }

    const toplam = Number(yeniVeri.toplam_tutar || 0);
    const alinan = Number(yeniVeri.alinan_tutar || 0);
    const kalan = Math.max(0, toplam - alinan);

    const dbPayload = {
      tenant_id: yeniVeri.tenant_id || (req.query.tenant_id as string) || 'kanada_shopper_baku',
      baku_kurye_id: yeniVeri.baku_kurye_id || null,
      baku_kurye_adi: yeniVeri.baku_kurye_adi || null,
      baku_kurye_bolgesi: yeniVeri.baku_kurye_bolgesi || null,
      ham_mesaj: yeniVeri.ham_mesaj || (yeniVeri.ozel_not ? `Talimat: ${yeniVeri.ozel_not}` : yeniVeri.urun_aciklamasi),
      siparis_kaynagi: yeniVeri.siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: yeniVeri.musteri_adi,
      instagram_kullanici_adi: yeniVeri.instagram_kullanici_adi || '',
      telefon_numarasi: yeniVeri.telefon_numarasi || '',
      teslimat_sehri: yeniVeri.teslimat_sehri || 'Bakü',
      teslimat_adresi: yeniVeri.teslimat_adresi || '',
      urun_aciklamasi: yeniVeri.urun_aciklamasi,
      beden_veya_olcu: yeniVeri.beden_veya_olcu || '',
      renk: yeniVeri.renk || '',
      adet: Number(yeniVeri.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: yeniVeri.para_birimi || 'AZN',
      finans_durumu: yeniVeri.finans_durumu || (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: yeniVeri.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: yeniVeri.baku_tahsilat_notu || '',
      ozel_not: yeniVeri.ozel_not || '',
      kanada_takip_kodu: yeniVeri.kanada_takip_kodu || uretKanadaTakipKodu(yeniVeri.urun_aciklamasi),
      uluslararasi_kargo_kodu: yeniVeri.uluslararasi_kargo_kodu || uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(yeniVeri.eksik_bilgiler) ? yeniVeri.eksik_bilgiler : [],
      ai_guven_skoru: Number(yeniVeri.ai_guven_skoru || 1.0),
      urunler: Array.isArray(yeniVeri.urunler) ? yeniVeri.urunler : [],
      gorsel_urlleri: Array.isArray(yeniVeri.gorsel_urlleri) ? yeniVeri.gorsel_urlleri : [],
    };

    // DEMO SANDBOX MÜHİTİ — Əsas bazaya yazılmır, təcrid olunmuş demo hovuzuna əlavə olunur
    if (dbPayload.tenant_id === 'demo_sandbox' || req.query.tenant_id === 'demo_sandbox') {
      const demoSiparis: any = formatlaSiparis({
        id: 'sip-demo-' + Date.now().toString(36),
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        tenant_id: 'demo_sandbox',
        is_demo: true,
        kalan_tutar: kalan,
      });
      demoSiparislerVeritabani.unshift(demoSiparis);
      return res.json({ basarili: true, kaynak: 'demo_sandbox', siparis: demoSiparis });
    }

    if (supabase) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase.from('siparisler').insert(sbPayload).select().single();
        if (error) {
          console.error('Supabase ekleme hatası:', error.message);
        } else if (data) {
          const formatli = formatlaSiparis({
            ...data,
            ozel_not: dbPayload.ozel_not || undefined,
            urunler: dbPayload.urunler.length > 0 ? dbPayload.urunler : undefined,
            gorsel_urlleri: dbPayload.gorsel_urlleri.length > 0 ? dbPayload.gorsel_urlleri : undefined,
          });
          return res.json({
            basarili: true,
            kaynak: 'supabase',
            siparis: formatli,
          });
        }
      } catch (errDb: any) {
        console.error('Supabase ekleme istisnası:', errDb?.message || errDb);
      }
    }

    const yeniSiparis: any = formatlaSiparis({
      id: 'sip-' + Date.now().toString(36),
      olusturma_tarihi: new Date().toISOString(),
      ...dbPayload,
      kalan_tutar: kalan,
    });

    siparislerVeritabani.unshift(yeniSiparis);
    res.json({ basarili: true, kaynak: 'bellek', siparis: yeniSiparis });
  } catch (genelHata: any) {
    console.error('Sipariş ekleme genel hatası:', genelHata);
    res.status(500).json({ basarili: false, hata: 'Sipariş eklenirken hata: ' + (genelHata?.message || 'Bilinmeyen hata') });
  }
});

// 4. PATCH /api/siparisler/:id — Sipariş Güncelle (Demo Sandbox Korumalı)
router.patch('/siparisler/:id', async (req, res) => {
  const { id } = req.params;

  // Əgər sifariş DEMO SANDBOX hovuzundadırsa — canlı Supabase bazasına toxunma!
  const demoIndex = demoSiparislerVeritabani.findIndex((s) => s.id === id);
  if (demoIndex !== -1 || req.body.tenant_id === 'demo_sandbox') {
    const targetIndex = demoIndex !== -1 ? demoIndex : 0;
    const guncel = {
      ...demoSiparislerVeritabani[targetIndex],
      ...req.body,
      guncellenme_tarihi: new Date().toISOString(),
    };
    if (guncel.toplam_tutar !== undefined && guncel.alinan_tutar !== undefined) {
      guncel.kalan_tutar = Math.max(0, Number(guncel.toplam_tutar) - Number(guncel.alinan_tutar));
      if (guncel.alinan_tutar >= guncel.toplam_tutar && guncel.toplam_tutar > 0) {
        guncel.finans_durumu = 'ODENDI';
      } else if (guncel.alinan_tutar > 0) {
        guncel.finans_durumu = 'KISMI_ODEME';
      }
    }
    demoSiparislerVeritabani[targetIndex] = formatlaSiparis(guncel);
    return res.json({ basarili: true, kaynak: 'demo_sandbox', siparis: demoSiparislerVeritabani[targetIndex] });
  }

  if (supabase) {
    try {
      const { id: _id, kalan_tutar: _k, olusturma_tarihi: _o, guncellenme_tarihi: _g, ...guncellenecekAlanlar } = req.body;

      if (guncellenecekAlanlar.toplam_tutar !== undefined) {
        guncellenecekAlanlar.toplam_tutar = Number(guncellenecekAlanlar.toplam_tutar);
      }
      if (guncellenecekAlanlar.alinan_tutar !== undefined) {
        guncellenecekAlanlar.alinan_tutar = Number(guncellenecekAlanlar.alinan_tutar);
      }

      const { data: mevcutData } = await supabase
        .from('siparisler')
        .select('*')
        .eq('id', id)
        .single();

      let mevcutUrunler: any[] = [];
      let mevcutGorseller: any[] = [];
      let mevcutTemizEksik: any[] = [];

      if (mevcutData && Array.isArray(mevcutData.eksik_bilgiler)) {
        for (const item of mevcutData.eksik_bilgiler) {
          if (typeof item === 'string') {
            if (item.startsWith('META:urunler=')) {
              try { mevcutUrunler = JSON.parse(item.substring('META:urunler='.length)); } catch {}
            } else if (item.startsWith('META:gorseller=')) {
              try { mevcutGorseller = JSON.parse(item.substring('META:gorseller='.length)); } catch {}
            } else {
              mevcutTemizEksik.push(item);
            }
          }
        }
      }

      const sonUrunler = guncellenecekAlanlar.urunler !== undefined ? guncellenecekAlanlar.urunler : mevcutUrunler;
      const sonGorseller = guncellenecekAlanlar.gorsel_urlleri !== undefined ? guncellenecekAlanlar.gorsel_urlleri : mevcutGorseller;
      const sonEksik = guncellenecekAlanlar.eksik_bilgiler !== undefined 
        ? guncellenecekAlanlar.eksik_bilgiler.filter((b: any) => typeof b !== 'string' || !b.startsWith('META:'))
        : mevcutTemizEksik;

      const fullUpdateObj = {
        ...(mevcutData || {}),
        ...guncellenecekAlanlar,
        urunler: sonUrunler,
        gorsel_urlleri: sonGorseller,
        eksik_bilgiler: sonEksik,
      };

      const sbUpdatePayload = hazirlaSupabasePayload(fullUpdateObj);

      const { data, error } = await supabase
        .from('siparisler')
        .update(sbUpdatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Supabase güncelleme hatası:', error.message);
      } else if (data) {
        const formatli = formatlaSiparis({
          ...data,
          ozel_not: fullUpdateObj.ozel_not !== undefined ? fullUpdateObj.ozel_not : undefined,
        });
        return res.json({
          basarili: true,
          kaynak: 'supabase',
          siparis: formatli,
        });
      }
    } catch (errDb) {
      console.error('Supabase güncelleme istisnası:', errDb);
    }
  }

  const index = siparislerVeritabani.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
  }

  const guncel = {
    ...siparislerVeritabani[index],
    ...req.body,
    guncellenme_tarihi: new Date().toISOString(),
  };

  if (guncel.toplam_tutar !== undefined && guncel.alinan_tutar !== undefined) {
    guncel.kalan_tutar = Math.max(0, Number(guncel.toplam_tutar) - Number(guncel.alinan_tutar));
    if (guncel.alinan_tutar >= guncel.toplam_tutar && guncel.toplam_tutar > 0) {
      guncel.finans_durumu = 'ODENDI';
    } else if (guncel.alinan_tutar > 0) {
      guncel.finans_durumu = 'KISMI_ODEME';
    }
  }

  siparislerVeritabani[index] = formatlaSiparis(guncel);
  res.json({ basarili: true, kaynak: 'bellek', siparis: siparislerVeritabani[index] });
});

// 5. DELETE /api/siparisler/:id — Sipariş Sil (Demo Sandbox Korumalı)
router.delete('/siparisler/:id', async (req, res) => {
  const { id } = req.params;

  // Əgər silinən sifariş DEMO SANDBOX hovuzundadırsa — Supabase-ə toxunma!
  const demoIndex = demoSiparislerVeritabani.findIndex((s) => s.id === id);
  if (demoIndex !== -1 || req.query.tenant_id === 'demo_sandbox') {
    setDemoSiparislerVeritabani(demoSiparislerVeritabani.filter((s) => s.id !== id));
    return res.json({
      basarili: true,
      kaynak: 'demo_sandbox',
      mesaj: 'Sifariş sınaq mühitindən silindi (Əsas canlı baza zirehli qorunur).',
    });
  }

  if (supabase) {
    try {
      const { error } = await supabase.from('siparisler').delete().eq('id', id);
      if (error) {
        console.error('Supabase silme hatası:', error.message);
      } else {
        return res.json({ basarili: true, kaynak: 'supabase', mesaj: 'Sipariş Supabase veritabanından silindi.' });
      }
    } catch (errDb) {
      console.error('Supabase silme istisnası:', errDb);
    }
  }

  setSiparislerVeritabani(siparislerVeritabani.filter(s => s.id !== id));
  res.json({ basarili: true, kaynak: 'bellek', mesaj: 'Sipariş başarıyla silindi.' });
});

// 5.1. POST /api/demo/sifirla — Demo Sandbox Mühitini 109 Orijinal Sifarişə Sıfırla
router.post('/demo/sifirla', (_req, res) => {
  const sayi = sifirlaDemoVeritabani();
  res.json({
    basarili: true,
    kaynak: 'demo_sandbox',
    mesaj: `Canlı demo mühiti uğurla sıfırlandı! ${sayi} ədəd orijinal qızıl sifariş ilkin vəziyyətinə bərpa olundu.`,
    toplam: sayi,
  });
});

// 6. POST /api/siparisler/tumunu-uluslararasi-kargo-yap
router.post('/siparisler/tumunu-uluslararasi-kargo-yap', async (_req, res) => {
  try {
    if (supabase) {
      const { error } = await supabase
        .from('siparisler')
        .update({ lojistik_durumu: 'ULUSLARARASI_KARGO' })
        .neq('lojistik_durumu', 'TESLIM_EDILDI');
      if (error) console.error('Supabase toplu lojistik güncelleme hatası:', error.message);
    }

    setSiparislerVeritabani(
      siparislerVeritabani.map(s => 
        s.lojistik_durumu !== 'TESLIM_EDILDI' ? { ...s, lojistik_durumu: 'ULUSLARARASI_KARGO' } : s
      )
    );

    res.json({ basarili: true, mesaj: 'Tüm siparişlerin lojistik aşaması ULUSLARARASI KARGO olarak güncellendi.' });
  } catch (err: any) {
    res.status(500).json({ basarili: false, hata: err.message });
  }
});

export default router;
