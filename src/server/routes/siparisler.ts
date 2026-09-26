import { Router, Request } from 'express';
import { randomUUID } from 'node:crypto';
import {
  listRequest,
  databasePage,
  memoryPage,
  completeCustomerDirectory,
} from '../services/listPagination';
import { Type } from '@google/genai';
import { storeTenantImage, assertTenantImageReferences } from './gorsel';
import { PublicResourceError } from '../services/publicFetch';
import { supabase } from '../services/supabase';
import { getGeminiClient, generateContentWithRetryAndFallback } from '../services/gemini';
import { musteriOner } from '../services/musteriOneri';
import {
  hazirlaSupabasePayload,
  formatlaSiparis,
  siparisEkVerileriniAl,
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
import { rolGrubunda } from '../../shared/roller';
import {
  aiOdemeBildirimi,
  DETAY_ALANLARI,
  detayAlaniYazabilir,
  detayAlaniYetkisiYok,
  detayDegerleriniDenetle,
  siparisOlusturmaYetkisi,
  tahsilatYazabilir,
  tahsilatYetkisiYok,
} from '../services/siparisYetkisi';
import { bellekteOdemesiVar } from '../services/v2/odemeStore';

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
  return completeCustomerDirectory(tenant);
}
async function validateCustomerReference(tenant: string, id: unknown) {
  if (!id) return;
  if (typeof id !== 'string') throw new PublicResourceError('Müşteri bulunamadı.', 404);
  if (dbActive(tenant)) {
    const { data, error } = await supabase
      .from('musteriler')
      .select('id,tenant_id')
      .eq('tenant_id', tenant)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new PublicResourceError('Müşteri doğrulanamadı.', 503);
    if (!data || !belongs(data, tenant)) throw new PublicResourceError('Müşteri bulunamadı.', 404);
  } else if (!musterilerVeritabani.some((m) => m.id === id && belongs(m, tenant)))
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
    const request = listRequest(req, tenant, 'siparisler');
    const page = dbActive(tenant)
      ? await databasePage(request, 'siparisler')
      : memoryPage(
          request,
          memoryOrders(tenant).filter((s) => belongs(s, tenant))
        );
    const orders = page.items.map(formatlaSiparis);
    res.json({
      basarili: true,
      kaynak: tenant === 'demo_sandbox' ? 'demo_sandbox' : dbActive(tenant) ? 'supabase' : 'bellek',
      toplam: page.pagination.total,
      pagination: page.pagination,
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

    const systemInstruction = `Sen Kanada'dan Azerbaycan'a (Bakü, Gence ve diğer şehirler) Instagram Live, Reels, DM ve WhatsApp üzerinden ürün satışı yapan uluslararası bir butik e-ticaret ve lojistik operasyonunun Uzman Sipariş ve Müşteri Ayrıştırma Yapay Zekasısın.

Müşteriler siparişlerini son derece dağınık, günlük konuşma diliyle veya Azerbaycan Türkçesi / Türkiye Türkçesi karışımı karmaşık mesajlarla iletmektedirler.

GÖREVİN VE ÇOK KRİTİK KURALLAR:
1. MÜŞTERİ BİLGİLERİ (YALNIZCA MESAJDAN ÇIKAR):
   - Müşterinin adını, telefon numarasını, Instagram kullanıcı adını, şehrini ve adresini yalnızca mesajda ve görsellerde yazdığı gibi çıkar.
   - Sana hiçbir müşteri listesi verilmez; müşteriyi tanımaya, eşleştirmeye veya adını düzeltmeye çalışma. Eşleştirmeyi sunucu yapar.
   - musteri_tipi: Mesajda akraba/tanıdık olduğunu belirten bir not varsa 'AKRABA_YAKIN', yoksa 'TANIMADIK'.

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
      const saved = await storeTenantImage(
        req,
        raw,
        attachment.gorsel_mime_type || attachment.mimeType
      );
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

    // Customer matching happens here, never in the AI prompt (CLAUDE.md): only a
    // unique exact phone match links a customer; similar names are suggestions.
    const tenantCustomers = await scopedCustomers(hedefTenantId);
    const cikarilanAd =
      typeof parsedJson.musteri_adi === 'string' ? parsedJson.musteri_adi.trim() : '';
    const { eslesen, adaylar: musteriAdaylari } = musteriOner(tenantCustomers, {
      telefon: parsedJson.telefon_numarasi,
      ad: cikarilanAd,
    });

    const aiAlinan = Number(parsedJson.alinan_tutar || 0);
    const toplam = Number(parsedJson.toplam_tutar || aiAlinan);
    if (!Number.isFinite(toplam) || !Number.isFinite(aiAlinan) || toplam < 0 || aiAlinan < 0)
      throw new PublicResourceError('Geçersiz tutar.', 400);
    // A saved order carries no collection this role may not write; the payment the AI
    // saw stays as a notice (Codex R4, F19 side effect). A suggestion saves nothing.
    const odemeBildirimi =
      otomatik_kaydet !== false
        ? aiOdemeBildirimi(req.auth?.role, {
            alinan_tutar: aiAlinan,
            finans_durumu: parsedJson.finans_durumu,
            para_birimi: parsedJson.para_birimi,
          })
        : null;
    const alinan = odemeBildirimi ? 0 : aiAlinan;
    const kalan = Math.max(0, toplam - alinan);
    const bildirimliNot = (not: unknown) =>
      [typeof not === 'string' ? not.trim() : '', odemeBildirimi ?? ''].filter(Boolean).join('\n');

    const dbPayload = {
      tenant_id: hedefTenantId,
      is_demo: hedefTenantId === 'demo_sandbox',
      ham_mesaj: (
        ham_mesaj ||
        (tumGorseller.length > 0 ? `[${tumGorseller.length} Ekran Görüntüsü & WhatsApp Notu]` : '')
      ).trim(),
      siparis_kaynagi: siparis_kaynagi || 'INSTAGRAM_LIVE',
      musteri_adi: eslesen?.ad_soyad || cikarilanAd || 'Bilinmeyen Müşteri',
      instagram_kullanici_adi: parsedJson.instagram_kullanici_adi || '',
      telefon_numarasi: parsedJson.telefon_numarasi || '',
      teslimat_sehri: parsedJson.teslimat_sehri || eslesen?.sehir || 'Bakü',
      teslimat_adresi: parsedJson.teslimat_adresi || eslesen?.adres || '',
      urun_aciklamasi: parsedJson.urun_aciklamasi || 'Sipariş Edilen Ürün',
      beden_veya_olcu: parsedJson.beden_veya_olcu || '',
      renk: parsedJson.renk || '',
      adet: Number(parsedJson.adet || 1),
      toplam_tutar: toplam,
      alinan_tutar: alinan,
      para_birimi: parsedJson.para_birimi || 'AZN',
      finans_durumu: odemeBildirimi
        ? 'BEKLIYOR'
        : parsedJson.finans_durumu ||
          (alinan >= toplam && toplam > 0 ? 'ODENDI' : alinan > 0 ? 'KISMI_ODEME' : 'BEKLIYOR'),
      lojistik_durumu: parsedJson.lojistik_durumu || 'ULUSLARARASI_KARGO',
      // The collection note, not the courier instruction (the [TƏLİMAT] tag): the notice
      // is for whoever records the money.
      baku_tahsilat_notu: bildirimliNot(parsedJson.baku_tahsilat_notu),
      ozel_not: parsedJson.ozel_not || '',
      kanada_takip_kodu: uretKanadaTakipKodu(parsedJson.urun_aciklamasi),
      uluslararasi_kargo_kodu: uretUluslararasiKargoKodu(),
      eksik_bilgiler: [
        ...(Array.isArray(parsedJson.eksik_bilgiler)
          ? parsedJson.eksik_bilgiler.filter(
              (v: any) => typeof v === 'string' && !v.startsWith('META:')
            )
          : []),
        ...(odemeBildirimi ? [odemeBildirimi] : []),
      ],
      ai_guven_skoru: Number(parsedJson.ai_guven_skoru || 0.95),
      musteri_id: eslesen?.id || '',
      musteri_tipi: eslesen?.musteri_tipi || parsedJson.musteri_tipi || 'TANIMADIK',
      duzeltilen_yazim_hatasi:
        eslesen && cikarilanAd && cikarilanAd !== eslesen.ad_soyad
          ? `${cikarilanAd} → ${eslesen.ad_soyad} (telefon eşleşti)`
          : '',
      musteri_durumu: eslesen ? 'MEVCUT_MUSTERI' : 'YENI_MUSTERI',
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
    // Saving the parsed order is a creation: same rights as POST /api/siparisler (Codex
    // R4 F19, F22). A suggestion only (otomatik_kaydet: false) writes nothing.
    if (otomatik_kaydet !== false)
      siparisOlusturmaYetkisi((req as any).auth?.role, dbPayload, siparisEkVerileriniAl(dbPayload));

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
            musteri_tipi: dbPayload.musteri_tipi,
            duzeltilen_yazim_hatasi: dbPayload.duzeltilen_yazim_hatasi,
            musteri_durumu: dbPayload.musteri_durumu,
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

    // Müşteri kartı: yalnız güçlü telefon eşleşmesi mevcut kartı günceller. Ad adayı
    // varsa yeni kart da açılmaz; bağlantıyı bir kişi seçer.
    const bulunanMusteri = eslesen;

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
      musteriAdaylari.length === 0 &&
      cikarilanAd &&
      cikarilanAd !== 'Bilinmeyen Müşteri'
    ) {
      const yeniMusteri: MusteriKaydi = {
        id: 'mus-' + randomUUID(),
        tenant_id: hedefTenantId,
        ad_soyad: cikarilanAd,
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
      musteri_adaylari: musteriAdaylari,
      kaydedildi: otomatik_kaydet !== false,
      ...(odemeBildirimi && {
        uyari:
          'Mesajdaki ödeme kaydedilmedi: bu rol tahsilat yazamaz. Sipariş ödemesiz kaydedildi; ' +
          'ödemeyi butik ekibi kaydetmeli.',
      }),
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
    // First collection and detail-field rights, as on every creation path (Codex R4 F19, F22).
    siparisOlusturmaYetkisi((req as any).auth?.role, yeniVeri, siparisEkVerileriniAl(yeniVeri));

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

// Detail-form fields (OPEN_QUESTIONS 34) and the first collection: services/siparisYetkisi.
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
// v2 orders (model_surumu = 2, K20): these old columns are derived from the order lines
// or written only by RPCs; the generic PATCH never changes them.
const v2DerivedFields = new Set([
  'toplam_tutar',
  'alinan_tutar',
  'finans_durumu',
  'lojistik_durumu',
  'urun_aciklamasi',
  'adet',
  'beden_veya_olcu',
  'renk',
  'urunler',
  // The lines are in AZN (K5); the order currency follows them (Codex R3 F9).
  'para_birimi',
]);
// Written only by their own transactions (assignment, delivery); never by the generic edit.
const courierFields = ['baku_kurye_id', 'baku_kurye_adi', 'baku_kurye_bolgesi'];
const moneyFields = ['alinan_tutar', 'toplam_tutar', 'finans_durumu'];
/** Order edit refusals of tomnap_siparis_guncelle, as HTTP answers. */
function orderUpdateError(error: { code?: string } | null): never {
  const code = error?.code ?? '';
  if (code === 'PT409')
    throw new PublicResourceError(
      'Sipariş bu arada değişti (ödeme, AWB, atama ya da durum). Listeyi yenileyin.',
      409
    );
  if (code === 'PT404') throw new PublicResourceError('Sipariş bulunamadı.', 404);
  if (code === 'PT403') throw new PublicResourceError('Bu alan burada değiştirilemez.', 403);
  if (['22023', '22P02', '22007', '22008', '23514', '23502'].includes(code))
    throw new PublicResourceError('Sipariş verisi geçersiz.', 400);
  throw new PublicResourceError('Sipariş güncellenemedi.', 503);
}
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
        : rolGrubunda(role, 'BUYERS')
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
      if (Number(formatted.model_surumu) === 2 && v2DerivedFields.has(key))
        throw new PublicResourceError('v2 siparişte bu alan satırlardan türetilir: ' + key, 409);
      // Money and detail-form fields follow the same rules as order creation (Codex R4
      // F19, F22): services/siparisYetkisi. A platform admin changes no collection.
      if ((key === 'alinan_tutar' || key === 'finans_durumu') && !tahsilatYazabilir(role))
        throw tahsilatYetkisiYok(role);
      if (DETAY_ALANLARI.includes(key)) {
        if (!detayAlaniYazabilir(role, key)) throw detayAlaniYetkisiYok(role, key);
        updates[key] = value;
        continue;
      }
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
      if (key === 'duzeltme_gerekcesi') continue; // Reason for a collection correction, checked below.
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
    detayDegerleriniDenetle(updates);
    await validateCustomerReference(tenant, updates.musteri_id);
    await assertTenantImageReferences(req, updates);
    const kaynak = dbActive(tenant)
      ? 'supabase'
      : tenant === 'demo_sandbox'
        ? 'demo_sandbox'
        : 'bellek';
    // Nothing changed: nothing is written (a stale read must not be written back).
    if (Object.keys(updates).length === 0)
      return res.json({ basarili: true, kaynak, siparis: formatted });
    const simdi = new Date().toISOString();
    const changed: Record<string, any> = {
      ...formatted,
      ...updates,
      id: existing.id,
      tenant_id: tenant,
    };
    for (const key of ['toplam_tutar', 'alinan_tutar', 'adet']) {
      changed[key] = Number(changed[key]);
      if (!Number.isFinite(changed[key]) || changed[key] < 0)
        throw new PublicResourceError('Geçersiz sayısal değer.', 400);
    }
    // A recorded collection is never silently erased: only the patron may lower
    // it, with a reason that is appended to the order history.
    const oncekiAlinan = Number(formatted.alinan_tutar) || 0;
    if (changed.alinan_tutar < oncekiAlinan) {
      if (role !== 'PATRON')
        throw new PublicResourceError(
          'Kaydedilmiş tahsilat azaltılamaz. Düzeltmeyi patron gerekçeyle yapabilir.',
          403
        );
      const gerekce =
        typeof req.body.duzeltme_gerekcesi === 'string' ? req.body.duzeltme_gerekcesi.trim() : '';
      if (gerekce.length < 5 || gerekce.length > 500)
        throw new PublicResourceError(
          'Tahsilatı azaltmak için 5-500 karakterlik bir gerekçe gerekli.',
          400
        );
      changed.islem_gecmisi = [
        ...(Array.isArray(formatted.islem_gecmisi) ? formatted.islem_gecmisi : []),
        {
          tarih: simdi,
          yapan_rol: role,
          yapan_kisi: (req as any).auth?.userId || '',
          eylem: 'TAHSILAT_AZALTILDI',
          aciklama:
            `${oncekiAlinan} → ${changed.alinan_tutar} ${changed.para_birimi || ''}: ${gerekce}`.replace(
              /\s+:/,
              ':'
            ),
        },
      ];
    }
    const paraDegisti = moneyFields.some((key) => key in updates);
    if (paraDegisti) {
      changed.kalan_tutar = Math.max(0, changed.toplam_tutar - changed.alinan_tutar);
      changed.finans_durumu =
        changed.alinan_tutar >= changed.toplam_tutar && changed.toplam_tutar > 0
          ? 'ODENDI'
          : changed.alinan_tutar > 0
            ? 'KISMI_ODEME'
            : 'BEKLIYOR';
    }
    const v2 = Number(formatted.model_surumu) === 2;
    if (dbActive(tenant)) {
      // Codex R3 F1/F2: send only the columns this edit changes (both sides go through
      // the same payload builder, so folded notes, metadata and extras compare equal).
      const once = hazirlaSupabasePayload(formatted);
      const sonra = hazirlaSupabasePayload(changed);
      const degisiklik: Record<string, unknown> = {};
      for (const key of Object.keys(sonra))
        if (JSON.stringify(sonra[key]) !== JSON.stringify(once[key])) degisiklik[key] = sonra[key];
      for (const key of courierFields) delete degisiklik[key];
      if (v2) for (const key of v2DerivedFields) delete degisiklik[key];
      // The note is the tag in baku_tahsilat_notu (Codex R3 F8). A legacy schema's
      // physical ozel_not (the row read has the key) follows it, so a cleared note does
      // not fall back to an older physical value.
      if ('ozel_not' in updates && Object.hasOwn(existing, 'ozel_not'))
        degisiklik.ozel_not = String(updates.ozel_not ?? '').trim() || null;
      if (Object.keys(degisiklik).length === 0)
        return res.json({ basarili: true, kaynak, siparis: formatted });
      // Optimistic lock: the edit applies only to the order it was based on.
      const beklenen: Record<string, unknown> = {
        kurye_atama_surumu: existing.kurye_atama_surumu ?? null,
        lojistik_durumu: existing.lojistik_durumu ?? null,
      };
      if (moneyFields.some((key) => key in degisiklik)) {
        beklenen.alinan_tutar = existing.alinan_tutar ?? null;
        beklenen.toplam_tutar = existing.toplam_tutar ?? null;
      }
      if ('uluslararasi_kargo_kodu' in degisiklik)
        beklenen.uluslararasi_kargo_kodu = existing.uluslararasi_kargo_kodu ?? null;
      if ('ek_veriler' in degisiklik) beklenen.ek_veriler = existing.ek_veriler ?? null;
      const { data, error } = await supabase.rpc('tomnap_siparis_guncelle', {
        p_tenant_id: tenant,
        p_siparis_id: existing.id,
        p_degisiklik: degisiklik,
        p_beklenen: beklenen,
      });
      if (error) orderUpdateError(error);
      if (!data || typeof data !== 'object' || data.id !== existing.id || data.tenant_id !== tenant)
        throw new PublicResourceError('Sipariş güncellenemedi.', 503);
      return res.json({ basarili: true, kaynak, siparis: formatlaSiparis(data) });
    }
    const pool = memoryOrders(tenant);
    const index = pool.findIndex((s) => s.id === existing.id && belongs(s, tenant));
    const current = index < 0 ? undefined : pool[index];
    const ayni = (key: string, numeric = false) =>
      numeric
        ? Number(current?.[key] || 0) === Number(formatted[key] || 0)
        : (current?.[key] ?? null) === (formatted[key] ?? null);
    if (
      !current ||
      !ayni('kurye_atama_surumu', true) ||
      !ayni('lojistik_durumu') ||
      (paraDegisti && (!ayni('alinan_tutar', true) || !ayni('toplam_tutar', true))) ||
      ('uluslararasi_kargo_kodu' in updates && !ayni('uluslararasi_kargo_kodu'))
    )
      throw new PublicResourceError(
        'Sipariş bu arada değişti (ödeme, AWB, atama ya da durum). Listeyi yenileyin.',
        409
      );
    // Apply only this edit to the current order, never the stale copy it was based on.
    const uygula: Record<string, any> = { ...updates, guncellenme_tarihi: simdi };
    if (changed.islem_gecmisi !== formatted.islem_gecmisi)
      uygula.islem_gecmisi = changed.islem_gecmisi;
    if (paraDegisti)
      for (const key of ['toplam_tutar', 'alinan_tutar', 'kalan_tutar', 'finans_durumu'])
        uygula[key] = changed[key];
    for (const key of courierFields) delete uygula[key];
    pool[index] = formatlaSiparis({ ...current, ...uygula });
    res.json({ basarili: true, kaynak, siparis: pool[index] });
  } catch (error) {
    orderFailure(res, error);
  }
});

router.delete('/siparisler/:id', async (req, res) => {
  try {
    const tenant = tenantFor(req, true);
    const existing = await ownedOrder(tenant, req.params.id);
    if (!existing) return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    // A v2 order with payments keeps its money trail (A10; odemeler ON DELETE RESTRICT).
    const odemeli = new PublicResourceError('Ödemesi olan bir sipariş silinemez.', 409);
    if (dbActive(tenant)) {
      const { error } = await supabase
        .from('siparisler')
        .delete()
        .eq('id', existing.id)
        .eq('tenant_id', tenant);
      if (error?.code === '23503') throw odemeli;
      if (error) throw new PublicResourceError('Sipariş silinemedi.', 503);
    } else {
      if (bellekteOdemesiVar(tenant, [existing.id])) throw odemeli;
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
