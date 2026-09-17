import { Router, Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Type } from '@google/genai';
import { storeTenantImage, assertTenantImageReferences } from './gorsel';
import { PublicResourceError } from '../services/publicFetch';
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
  musterilerVeritabani,
  demoSiparislerVeritabani,
  sifirlaDemoVeritabani,
} from '../services/state';
import { MusteriKaydi } from '../types';

const router = Router();
const rowTenant = (row: any): string => {
  if (row.tenant_id) return row.tenant_id;
  const legacy = Array.isArray(row.eksik_bilgiler)
    ? row.eksik_bilgiler
        .filter((item: any) => typeof item === 'string' && item.startsWith('META:tenant_id='))
        .at(-1)
    : undefined;
  return legacy?.slice('META:tenant_id='.length) || 'kanada_shopper_baku';
};
const belongs = (row: any, tenant: string) => tenant === 'all' || rowTenant(row) === tenant;
function tenantFor(req: Request, mutation = false): string {
  const tenant = (req as any).tenantId;
  if (!tenant || (mutation && tenant === 'all'))
    throw new PublicResourceError('Bir butik seçilmelidir.', 400);
  return tenant;
}
const dbActive = (tenant: string) => !!supabase && tenant !== 'demo_sandbox';
const memoryOrders = (tenant: string) =>
  tenant === 'demo_sandbox' ? demoSiparislerVeritabani : siparislerVeritabani;
async function scopedCustomers(tenant: string): Promise<any[]> {
  if (!dbActive(tenant)) return musterilerVeritabani.filter((m) => belongs(m, tenant));
  const { data, error } = await supabase.from('musteriler').select('*').eq('tenant_id', tenant);
  if (error) throw new PublicResourceError('Müşteriler okunamadı.', 503);
  return (data || []).filter((m) => belongs(m, tenant));
}
async function validateCustomerReference(tenant: string, id: unknown) {
  if (!id) return;
  if (typeof id !== 'string' || !(await scopedCustomers(tenant)).some((m) => m.id === id))
    throw new PublicResourceError('Müşteri bulunamadı.', 404);
}
const orderFailure = (res: any, error: any) =>
  res.status(error instanceof PublicResourceError ? error.status : 503).json({
    basarili: false,
    hata: error instanceof PublicResourceError ? error.message : 'Sipariş işlemi tamamlanamadı.',
  });

// 1. GET /api/siparisler — Tüm Siparişleri Getir (Tenant İzolasyonlu & Demo Sandbox Korumalı)
router.get('/siparisler', async (req, res) => {
  try {
    const tenant = tenantFor(req);
    let orders: any[];
    if (dbActive(tenant)) {
      let query = supabase.from('siparisler').select('*');
      if (tenant !== 'all') query = query.eq('tenant_id', tenant);
      const { data, error } = await query.order('olusturma_tarihi', { ascending: false });
      if (error) throw new PublicResourceError('Siparişler okunamadı.', 503);
      orders = (data || []).filter((s) => belongs(s, tenant)).map(formatlaSiparis);
    } else {
      orders = memoryOrders(tenant)
        .filter((s) => belongs(s, tenant))
        .map(formatlaSiparis);
    }
    res.json({
      basarili: true,
      kaynak: tenant === 'demo_sandbox' ? 'demo_sandbox' : dbActive(tenant) ? 'supabase' : 'bellek',
      toplam: orders.length,
      siparisler: orders,
      ...(tenant === 'demo_sandbox' ? { isDemo: true } : {}),
    });
  } catch (error) {
    orderFailure(res, error);
  }
});

// 2. POST /api/ayristir-siparis — Gemini AI ile Dağınık Mesajı Ayrıştır ve Kaydet
router.post('/ayristir-siparis', async (req, res) => {
  try {
    const hedefTenantId = tenantFor(req, true);
    const {
      ham_mesaj,
      musteri_adi_ipucu,
      siparis_kaynagi,
      otomatik_kaydet,
      gorsel_base64,
      gorsel_mime_type,
      gorseller,
    } = req.body;

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
    const tenantCustomers = await scopedCustomers(hedefTenantId);
    const musterilerRehberi = tenantCustomers.map((m) => ({
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

    // One validated, tenant-owned storage path covers both direct uploads and AI attachments.
    const attachments =
      Array.isArray(gorseller) && gorseller.length
        ? gorseller
        : gorsel_base64
          ? [{ base64: gorsel_base64, mimeType: gorsel_mime_type }]
          : [];
    if (attachments.length > 10)
      throw new PublicResourceError('En fazla 10 görsel yüklenebilir.', 413);
    const tumGorseller: Array<{ data: string; mimeType: string; dosyaAdi?: string }> = [];
    const kaydedilenGorselUrlleri: string[] = [];
    for (const attachment of attachments) {
      const raw = attachment?.gorsel_base64 || attachment?.base64;
      if (typeof raw !== 'string') throw new PublicResourceError('Geçersiz görsel verisi.', 400);
      const saved = storeTenantImage(req, raw, attachment.gorsel_mime_type || attachment.mimeType);
      tumGorseller.push({ data: saved.base64, mimeType: saved.mimeType });
      kaydedilenGorselUrlleri.push(saved.url);
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
          musteri_tipi: {
            type: Type.STRING,
            enum: ['TANIMADIK', 'SADIK_MUSTERI', 'AKRABA_YAKIN', 'VIP'],
          },
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
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError('Geçersiz tutar.', 400);

    const dbPayload = {
      tenant_id: hedefTenantId,
      is_demo: hedefTenantId === 'demo_sandbox',
      ham_mesaj: (
        ham_mesaj ||
        (tumGorseller.length > 0 ? `[${tumGorseller.length} Ekran Görüntüsü & WhatsApp Notu]` : '')
      ).trim(),
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
      finans_durumu:
        parsedJson.finans_durumu ||
        (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: parsedJson.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: parsedJson.baku_tahsilat_notu || '',
      ozel_not: parsedJson.ozel_not || '',
      kanada_takip_kodu: uretKanadaTakipKodu(parsedJson.urun_aciklamasi),
      uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(parsedJson.eksik_bilgiler)
        ? parsedJson.eksik_bilgiler.filter(
            (v: any) => typeof v === 'string' && !v.startsWith('META:')
          )
        : [],
      ai_guven_skoru: Number(parsedJson.ai_guven_skoru || 0.95),
      musteri_id: tenantCustomers.some((m) => m.id === parsedJson.eslesen_musteri_id)
        ? parsedJson.eslesen_musteri_id
        : '',
      musteri_tipi: parsedJson.musteri_tipi || 'TANIMADIK',
      duzeltilen_yazim_hatasi: parsedJson.duzeltilen_yazim_hatasi || '',
      musteri_durumu: parsedJson.musteri_durumu || 'YENI_MUSTERI',
      birden_fazla_urun:
        parsedJson.birden_fazla_urun ||
        (Array.isArray(parsedJson.urunler) && parsedJson.urunler.length > 1),
      urunler: (Array.isArray(parsedJson.urunler) ? parsedJson.urunler : []).map(
        (u: any, idx: number) => {
          const uAdi = u.urun_adi || u.urun_aciklamasi || `Ürün #${idx + 1}`;
          const uFiyat =
            u.tutar !== undefined
              ? Number(u.tutar)
              : u.birim_fiyat !== undefined
                ? Number(u.birim_fiyat)
                : undefined;
          const gIdx =
            typeof u.gorsel_indeksi === 'number' &&
            u.gorsel_indeksi < kaydedilenGorselUrlleri.length
              ? u.gorsel_indeksi
              : 0;
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
        }
      ),
      gorsel_urlleri:
        kaydedilenGorselUrlleri.length > 0
          ? kaydedilenGorselUrlleri
          : tumGorseller.map((g, i) => g.dosyaAdi || `Ekran_Goruntusu_${i + 1}.png`),
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

    if (otomatik_kaydet !== false && dbActive(hedefTenantId)) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase
          .from('siparisler')
          .insert(sbPayload)
          .select()
          .single();
        if (error || !data) {
          throw new PublicResourceError('Sipariş kaydedilemedi.', 503);
        } else if (data) {
          nihaiSiparis = {
            ...formatlaSiparis(data),
            musteri_id: dbPayload.musteri_id,
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
        throw errDb instanceof PublicResourceError
          ? errDb
          : new PublicResourceError('Sipariş kaydedilemedi.', 503);
      }
    }

    if (!nihaiSiparis) {
      nihaiSiparis = formatlaSiparis({
        id: 'sip-' + randomUUID(),
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        kalan_tutar: kalan,
      });
      if (otomatik_kaydet !== false) {
        memoryOrders(hedefTenantId).unshift(nihaiSiparis);
      }
    }

    // Müşteri Deduplication
    const eslesenMusteriId = parsedJson.eslesen_musteri_id;
    const telNo = (parsedJson.telefon_numarasi || '').replace(/\s+/g, '');
    let bulunanMusteri = tenantCustomers.find(
      (m) =>
        (eslesenMusteriId && m.id === eslesenMusteriId) ||
        (telNo && m.telefon && m.telefon.replace(/\s+/g, '') === telNo) ||
        m.ad_soyad.toLowerCase().trim() === (parsedJson.musteri_adi || '').toLowerCase().trim()
    );

    if (otomatik_kaydet !== false && !dbActive(hedefTenantId) && bulunanMusteri) {
      bulunanMusteri.toplam_siparis_sayisi += 1;
      bulunanMusteri.toplam_harcama += toplam;
      bulunanMusteri.kalan_toplam_borc += kalan;
      bulunanMusteri.son_siparis_tarihi = new Date().toISOString();
      if (!bulunanMusteri.adres && parsedJson.teslimat_adresi)
        bulunanMusteri.adres = parsedJson.teslimat_adresi;
      if (!bulunanMusteri.sehir && parsedJson.teslimat_sehri)
        bulunanMusteri.sehir = parsedJson.teslimat_sehri;
      if (!bulunanMusteri.telefon && parsedJson.telefon_numarasi)
        bulunanMusteri.telefon = parsedJson.telefon_numarasi;
      nihaiSiparis.musteri_id = bulunanMusteri.id;
      nihaiSiparis.musteri_tipi = bulunanMusteri.musteri_tipi;
    } else if (
      otomatik_kaydet !== false &&
      !dbActive(hedefTenantId) &&
      !bulunanMusteri &&
      parsedJson.musteri_adi &&
      parsedJson.musteri_adi !== 'Bilinmeyen Müşteri'
    ) {
      const yeniMusteri: MusteriKaydi = {
        id: 'mus-' + randomUUID(),
        tenant_id: hedefTenantId,
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
      kaynak: dbActive(hedefTenantId)
        ? 'supabase'
        : hedefTenantId === 'demo_sandbox'
          ? 'demo_sandbox'
          : 'bellek',
    });
  } catch (err: any) {
    console.error('Gemini Ayrıştırma Hatası:', err);
    orderFailure(res, err);
  }
});

// 3. POST /api/siparisler — Yeni Siparişi Doğrudan Ekle / Onayla
router.post('/siparisler', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const yeniVeri = req.body;
    if (['baku_kurye_id', 'baku_kurye_adi', 'baku_kurye_bolgesi'].some((key) => yeniVeri?.[key]))
      throw new PublicResourceError(
        'Kuryeyi sipariş kaydedildikten sonra atama işlemiyle seçin.',
        400
      );
    await validateCustomerReference(tenant, yeniVeri.musteri_id);
    await assertTenantImageReferences(req, yeniVeri);
    if (!yeniVeri || !yeniVeri.urun_aciklamasi || !yeniVeri.musteri_adi) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Müşteri adı ve ürün açıklaması zorunludur.' });
    }

    const toplam = Number(yeniVeri.toplam_tutar || 0);
    const alinan = Number(yeniVeri.alinan_tutar || 0);
    const kalan = Math.max(0, toplam - alinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(alinan) || toplam < 0 || alinan < 0)
      throw new PublicResourceError('Geçersiz tutar.', 400);

    const dbPayload = {
      tenant_id: tenant,
      is_demo: tenant === 'demo_sandbox',
      musteri_id: yeniVeri.musteri_id || '',
      baku_kurye_id: yeniVeri.baku_kurye_id || null,
      baku_kurye_adi: yeniVeri.baku_kurye_adi || null,
      baku_kurye_bolgesi: yeniVeri.baku_kurye_bolgesi || null,
      ham_mesaj:
        yeniVeri.ham_mesaj ||
        (yeniVeri.ozel_not ? `Talimat: ${yeniVeri.ozel_not}` : yeniVeri.urun_aciklamasi),
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
      finans_durumu:
        yeniVeri.finans_durumu ||
        (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: yeniVeri.lojistik_durumu || 'ULUSLARARASI_KARGO',
      baku_tahsilat_notu: yeniVeri.baku_tahsilat_notu || '',
      ozel_not: yeniVeri.ozel_not || '',
      kanada_takip_kodu:
        yeniVeri.kanada_takip_kodu || uretKanadaTakipKodu(yeniVeri.urun_aciklamasi),
      uluslararasi_kargo_kodu: yeniVeri.uluslararasi_kargo_kodu || uretUluslararasiKargoKodu(),
      eksik_bilgiler: Array.isArray(yeniVeri.eksik_bilgiler)
        ? yeniVeri.eksik_bilgiler.filter(
            (v: any) => typeof v === 'string' && !v.startsWith('META:')
          )
        : [],
      ai_guven_skoru: Number(yeniVeri.ai_guven_skoru || 1.0),
      urunler: Array.isArray(yeniVeri.urunler) ? yeniVeri.urunler : [],
      gorsel_urlleri: Array.isArray(yeniVeri.gorsel_urlleri) ? yeniVeri.gorsel_urlleri : [],
    };

    // DEMO SANDBOX MÜHİTİ — Əsas bazaya yazılmır, təcrid olunmuş demo hovuzuna əlavə olunur
    if (tenant === 'demo_sandbox') {
      const demoSiparis: any = formatlaSiparis({
        id: 'sip-demo-' + randomUUID(),
        olusturma_tarihi: new Date().toISOString(),
        ...dbPayload,
        tenant_id: 'demo_sandbox',
        is_demo: true,
        kalan_tutar: kalan,
      });
      demoSiparislerVeritabani.unshift(demoSiparis);
      return res.json({ basarili: true, kaynak: 'demo_sandbox', siparis: demoSiparis });
    }

    if (dbActive(tenant)) {
      try {
        const sbPayload = hazirlaSupabasePayload(dbPayload);
        const { data, error } = await supabase
          .from('siparisler')
          .insert(sbPayload)
          .select()
          .single();
        if (error || !data) {
          throw new PublicResourceError('Sipariş kaydedilemedi.', 503);
        } else if (data) {
          const formatli = formatlaSiparis({
            ...data,
            ozel_not: dbPayload.ozel_not || undefined,
            urunler: dbPayload.urunler.length > 0 ? dbPayload.urunler : undefined,
            gorsel_urlleri:
              dbPayload.gorsel_urlleri.length > 0 ? dbPayload.gorsel_urlleri : undefined,
          });
          return res.json({
            basarili: true,
            kaynak: 'supabase',
            siparis: formatli,
          });
        }
      } catch (errDb: any) {
        throw errDb instanceof PublicResourceError
          ? errDb
          : new PublicResourceError('Sipariş kaydedilemedi.', 503);
      }
    }

    const yeniSiparis: any = formatlaSiparis({
      id: 'sip-' + randomUUID(),
      olusturma_tarihi: new Date().toISOString(),
      ...dbPayload,
      kalan_tutar: kalan,
    });

    siparislerVeritabani.unshift(yeniSiparis);
    res.json({ basarili: true, kaynak: 'bellek', siparis: yeniSiparis });
  } catch (genelHata: any) {
    console.error('Sipariş ekleme genel hatası:', genelHata);
    orderFailure(res, genelHata);
  }
});

const generalFields = new Set([
  'ham_mesaj',
  'musteri_id',
  'musteri_adi',
  'musteri_tipi',
  'instagram_kullanici_adi',
  'telefon_numarasi',
  'teslimat_sehri',
  'teslimat_adresi',
  'urun_aciklamasi',
  'beden_veya_olcu',
  'renk',
  'adet',
  'toplam_tutar',
  'alinan_tutar',
  'para_birimi',
  'finans_durumu',
  'lojistik_durumu',
  'baku_tahsilat_notu',
  'ozel_not',
  'kanada_takip_kodu',
  'uluslararasi_kargo_kodu',
  'eksik_bilgiler',
  'siparis_kaynagi',
  'urunler',
  'gorsel_urlleri',
  'gorseller',
  'baku_kurye_id',
  'baku_kurye_adi',
  'baku_kurye_bolgesi',
  'teslim_tarihi',
  'teslim_eden_kisi',
  'kargo_agirligi_kg',
]);
const salesFields = new Set(
  [...generalFields].filter(
    (field) =>
      ![
        'lojistik_durumu',
        'baku_tahsilat_notu',
        'kanada_takip_kodu',
        'uluslararasi_kargo_kodu',
        'baku_kurye_id',
        'baku_kurye_adi',
        'baku_kurye_bolgesi',
        'teslim_tarihi',
        'teslim_eden_kisi',
        'kargo_agirligi_kg',
      ].includes(field)
  )
);
const financeFields = new Set(['alinan_tutar', 'finans_durumu', 'baku_tahsilat_notu']);
const purchaseFields = new Set([
  'urun_aciklamasi',
  'beden_veya_olcu',
  'renk',
  'adet',
  'urunler',
  'gorsel_urlleri',
  'gorseller',
  'ozel_not',
  'lojistik_durumu',
  'kanada_takip_kodu',
  'uluslararasi_kargo_kodu',
  'baku_kurye_id',
  'baku_kurye_adi',
  'baku_kurye_bolgesi',
  'kargo_agirligi_kg',
]);
async function ownedOrder(tenant: string, id: string): Promise<any | undefined> {
  if (dbActive(tenant)) {
    const { data, error } = await supabase
      .from('siparisler')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenant)
      .maybeSingle();
    if (error) throw new PublicResourceError('Sipariş okunamadı.', 503);
    return data && belongs(data, tenant) ? data : undefined;
  }
  return memoryOrders(tenant).find((s) => s.id === id && belongs(s, tenant));
}
router.patch('/siparisler/:id', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const existing = await ownedOrder(tenant, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    const formatted = formatlaSiparis(existing);
    const role = (req as any).auth?.role;
    const allowed =
      role === 'BAKU_FINANS'
        ? financeFields
        : role === 'KANADA_SATINALMA'
          ? purchaseFields
          : role === 'SATIS_SORUMLUSU'
            ? salesFields
            : generalFields;
    if (!role || role === 'BAKU_KURYE')
      throw new PublicResourceError('Bu işlem için yetkiniz yok.', 403);
    const updates: Record<string, any> = {};
    for (const [key, value] of Object.entries(req.body)) {
      if (key === 'tenant_id' || key === 'tenantId') {
        if (value !== tenant) throw new PublicResourceError('Sipariş başka butike taşınamaz.', 403);
        continue;
      }
      if (JSON.stringify(value) === JSON.stringify(formatted[key])) continue;
      if (
        [
          'baku_kurye_id',
          'baku_kurye_adi',
          'baku_kurye_bolgesi',
          'kurye_atama_surumu',
          'kurye_teslim_kullanici_id',
          'kurye_teslim_alan',
        ].includes(key)
      )
        throw new PublicResourceError('Kurye ataması için kurye atama işlemini kullanın.', 403);
      if (key === 'kalan_tutar') continue; // Calculated by the server.
      if (!allowed.has(key))
        throw new PublicResourceError('Bu alanı değiştirme yetkiniz yok: ' + key, 403);
      updates[key] = value;
    }
    if (
      updates.eksik_bilgiler !== undefined &&
      (!Array.isArray(updates.eksik_bilgiler) ||
        updates.eksik_bilgiler.some((v: any) => typeof v !== 'string' || v.startsWith('META:')))
    )
      throw new PublicResourceError('Geçersiz eksik bilgi listesi.', 400);
    await validateCustomerReference(tenant, updates.musteri_id);
    await assertTenantImageReferences(req, updates);
    const changed = {
      ...formatted,
      ...updates,
      id: existing.id,
      tenant_id: tenant,
      guncellenme_tarihi: new Date().toISOString(),
    };
    for (const key of ['toplam_tutar', 'alinan_tutar', 'adet']) {
      changed[key] = Number(changed[key]);
      if (!Number.isFinite(changed[key]) || changed[key] < 0)
        throw new PublicResourceError('Geçersiz sayısal değer.', 400);
    }
    changed.kalan_tutar = Math.max(0, changed.toplam_tutar - changed.alinan_tutar);
    changed.finans_durumu =
      changed.alinan_tutar >= changed.toplam_tutar && changed.toplam_tutar > 0
        ? 'ODENDI'
        : changed.alinan_tutar > 0
          ? 'KISMI_ODEME'
          : 'BEKLIYOR';
    if (dbActive(tenant)) {
      const payload = hazirlaSupabasePayload(changed);
      // Assignment is written only by its transaction. A stale ordinary edit
      // must not restore the previous courier or undo a concurrent delivery.
      for (const key of ['baku_kurye_id', 'baku_kurye_adi', 'baku_kurye_bolgesi'])
        delete payload[key];
      const { data, error } = await supabase
        .from('siparisler')
        .update(payload)
        .eq('id', existing.id)
        .eq('tenant_id', tenant)
        .eq('kurye_atama_surumu', Number(formatted.kurye_atama_surumu || 0))
        .eq('lojistik_durumu', formatted.lojistik_durumu)
        .select('*')
        .maybeSingle();
      if (error) throw new PublicResourceError('Sipariş güncellenemedi.', 503);
      if (!data)
        throw new PublicResourceError(
          'Siparişin ataması veya durumu değişti. Listeyi yenileyin.',
          409
        );
      return res.json({ basarili: true, kaynak: 'supabase', siparis: formatlaSiparis(data) });
    }
    const pool = memoryOrders(tenant);
    const index = pool.findIndex((s) => s.id === existing.id && belongs(s, tenant));
    if (
      index < 0 ||
      Number(pool[index].kurye_atama_surumu || 0) !== Number(formatted.kurye_atama_surumu || 0) ||
      pool[index].lojistik_durumu !== formatted.lojistik_durumu
    )
      throw new PublicResourceError(
        'Siparişin ataması veya durumu değişti. Listeyi yenileyin.',
        409
      );
    pool[index] = formatlaSiparis(changed);
    res.json({
      basarili: true,
      kaynak: tenant === 'demo_sandbox' ? 'demo_sandbox' : 'bellek',
      siparis: pool[index],
    });
  } catch (error) {
    orderFailure(res, error);
  }
});

router.delete('/siparisler/:id', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const existing = await ownedOrder(tenant, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    if (dbActive(tenant)) {
      const { error } = await supabase
        .from('siparisler')
        .delete()
        .eq('id', existing.id)
        .eq('tenant_id', tenant);
      if (error) throw new PublicResourceError('Sipariş silinemedi.', 503);
    } else {
      const pool = memoryOrders(tenant);
      pool.splice(
        pool.findIndex((s) => s.id === existing.id && belongs(s, tenant)),
        1
      );
    }
    res.json({ basarili: true, mesaj: 'Sipariş silindi.' });
  } catch (error) {
    orderFailure(res, error);
  }
});

router.post('/demo/sifirla', (req, res) => {
  try {
    if (tenantFor(req, true) !== 'demo_sandbox')
      throw new PublicResourceError('Demo alanı seçilmelidir.', 403);
    const toplam = sifirlaDemoVeritabani();
    res.json({
      basarili: true,
      kaynak: 'demo_sandbox',
      mesaj: 'Demo siparişleri sıfırlandı.',
      toplam,
    });
  } catch (error) {
    orderFailure(res, error);
  }
});

router.post('/siparisler/tumunu-uluslararasi-kargo-yap', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    if (dbActive(tenant)) {
      const { error } = await supabase
        .from('siparisler')
        .update({ lojistik_durumu: 'ULUSLARARASI_KARGO' })
        .eq('tenant_id', tenant)
        .neq('lojistik_durumu', 'TESLIM_EDILDI');
      if (error) throw new PublicResourceError('Siparişler güncellenemedi.', 503);
    } else {
      const pool = memoryOrders(tenant);
      for (let index = 0; index < pool.length; index++)
        if (belongs(pool[index], tenant) && pool[index].lojistik_durumu !== 'TESLIM_EDILDI')
          pool[index] = { ...pool[index], lojistik_durumu: 'ULUSLARARASI_KARGO' };
    }
    res.json({ basarili: true, mesaj: 'Seçili butikin siparişleri güncellendi.' });
  } catch (error) {
    orderFailure(res, error);
  }
});
export default router;
