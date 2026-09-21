import { Router } from 'express';
import { kargoMerkezi } from '../services/kargo/kargoMerkezi';
import { KargoSaglayiciTipi, CikisUlkesi } from '../services/kargo/types';
import { siparislerVeritabani } from '../services/state';
import { updateCargoOrder } from '../services/kargo/orderUpdates';
import { supabase } from '../services/supabase';

import { mergeSettings, CargoSettingsError } from '../services/kargo/settings';

const router = Router();
const status = (error: any) => ([400, 409, 503].includes(error?.status) ? error.status : 500);

// Desteklenen Sağlayıcılar ve Ülkeler Listesi
const DESTEKLENEN_SAGLAYICILAR: Array<{
  id: KargoSaglayiciTipi;
  ad: string;
  aciklama: string;
  durum: 'AKTIF' | 'GENISLETILEBILIR';
}> = [
  {
    id: 'ARAMEX',
    ad: 'Aramex International',
    aciklama: 'Kanada ➔ Bakü ana hava kargo hattı (REST API v2 Canlı & Batch)',
    durum: 'AKTIF',
  },
  {
    id: 'DHL',
    ad: 'DHL Express',
    aciklama: 'Qlobal ekspres kurye şəbəkəsi və hava yolu daşımaları',
    durum: 'GENISLETILEBILIR',
  },
  {
    id: 'UPS',
    ad: 'UPS Worldwide',
    aciklama: 'Şimali Amerika və Avropa mərkəzli geniş lojistika şəbəkəsi',
    durum: 'GENISLETILEBILIR',
  },
  {
    id: 'FEDEX',
    ad: 'FedEx Cross-Border',
    aciklama: 'ABŞ və Asiya istiqamətli beynəlxalq parsel xidməti',
    durum: 'GENISLETILEBILIR',
  },
  {
    id: 'MANUEL',
    ad: 'Fərdi / Özəl Karqo',
    aciklama: 'Kargo kodu və çəkinin əl ilə daxil edildiyi ənənəvi rejim',
    durum: 'AKTIF',
  },
];

const DESTEKLENEN_ULKELER: Array<{
  kod: CikisUlkesi;
  ad: string;
  bayrak: string;
  anaHavalimani: string;
}> = [
  { kod: 'CA', ad: 'Kanada', bayrak: '🇨🇦', anaHavalimani: 'Toronto Pearson (YYZ)' },
  { kod: 'US', ad: 'ABŞ (Amerika)', bayrak: '🇺🇸', anaHavalimani: 'New York (JFK) / Chicago (ORD)' },
  { kod: 'JP', ad: 'Yaponiya', bayrak: '🇯🇵', anaHavalimani: 'Tokyo Narita (NRT)' },
  {
    kod: 'GB',
    ad: 'Böyük Britaniya (İngiltərə)',
    bayrak: '🇬🇧',
    anaHavalimani: 'London Heathrow (LHR)',
  },
  { kod: 'DE', ad: 'Almaniya', bayrak: '🇩🇪', anaHavalimani: 'Frankfurt (FRA)' },
  { kod: 'TR', ad: 'Türkiyə', bayrak: '🇹🇷', anaHavalimani: 'İstanbul (IST)' },
  { kod: 'AE', ad: 'BƏƏ (Birləşmiş Ərəb Əmirlikləri)', bayrak: '🇦🇪', anaHavalimani: 'Dubai (DXB)' },
];

// 1. GET /api/kargo/ayarlar — Tenant'ın Aktif Kargo Ayarlarını Getir
router.get('/kargo/ayarlar', async (req, res) => {
  try {
    const tenantId = (req.query.tenant_id as string) || 'kanada_shopper_baku';
    const ayarlar = await kargoMerkezi.getAyarlar(tenantId);
    const maskeli = kargoMerkezi.maskeleAyarlar(ayarlar);

    res.json({
      basarili: true,
      ayarlar: maskeli,
      desteklenenSaglayicilar: DESTEKLENEN_SAGLAYICILAR,
      desteklenenUlkeler: DESTEKLENEN_ULKELER,
    });
  } catch (err: any) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});

// 2. POST /api/kargo/ayarlar — Kargo Ayarlarını Kaydet
router.post('/kargo/ayarlar', async (req, res) => {
  try {
    const {
      tenantId = 'kanada_shopper_baku',
      revision,
      saglayici = 'ARAMEX',
      cikisUlkesi = 'CA',
      cikisSehri = 'Toronto (YYZ)',
      varisUlkesi = 'AZ',
      varisHavalimani = 'Heydər Əliyev Beynəlxalq Hava Limanı (GYD)',
      kimlikBilgileri = {},
      otomatikSenkronizasyon = true,
      aktif = true,
    } = req.body;

    const guncel = await kargoMerkezi.kaydetAyarlar({
      tenantId,
      revision,
      saglayici,
      cikisUlkesi,
      cikisSehri,
      varisUlkesi,
      varisHavalimani,
      kimlikBilgileri,
      otomatikSenkronizasyon,
      aktif,
    });

    res.json({
      basarili: true,
      mesaj: `Kargo tənzimləmələri "${saglayici}" üçün uğurla yadda saxlanıldı!`,
      ayarlar: kargoMerkezi.maskeleAyarlar(guncel),
    });
  } catch (err: any) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});

// 3. POST /api/kargo/test — Canlı Bağlantı Testi (Test Connection)
router.post('/kargo/test', async (req, res) => {
  try {
    const { tenantId = 'kanada_shopper_baku', ayarlar } = req.body;
    const current = await kargoMerkezi.getAyarlar(tenantId);
    const testAyar = ayarlar ? mergeSettings(current, ayarlar) : current;

    const sonuc = await kargoMerkezi.baglantiTesti(testAyar);
    res.json(sonuc);
  } catch (err: any) {
    res.status(status(err)).json({
      basarili: false,
      mesaj: `Bağlantı sınağı xətası: ${err.message}`,
      saglayici: req.body.ayarlar?.saglayici || 'ARAMEX',
      gecikmeMs: 0,
    });
  }
});

// 4. POST /api/kargo/takip — Canlı AWB Kodlarını Sorgula
router.post('/kargo/takip', async (req, res) => {
  try {
    const { takipNolari, tenantId = 'kanada_shopper_baku' } = req.body;
    if (!Array.isArray(takipNolari) || takipNolari.length === 0) {
      return res.status(400).json({
        basarili: false,
        hata: 'Zəhmət olmasa ən azı bir izləmə (AWB) nömrəsi daxil edin.',
      });
    }

    const sonuclar = await kargoMerkezi.takipEt(takipNolari, tenantId);
    res.json({
      basarili: true,
      toplam: sonuclar.length,
      sonuclar,
    });
  } catch (err: any) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});

// 5. POST /api/kargo/senkronize-et — Yoldaki Tüm Siparişleri Canlı Senkronize Et
router.post('/kargo/senkronize-et', async (req, res) => {
  try {
    const { tenantId = 'all' } = req.body;
    const sonuc = await kargoMerkezi.topluSenkronizeEt(tenantId);
    res.json({
      mesaj:
        sonuc.guncellenenSayi > 0
          ? `${sonuc.sorgulananSayi} kargodan ${sonuc.guncellenenSayi} ədədinin statusu yeniləndi!`
          : `${sonuc.sorgulananSayi} aktiv kargo yoxlandı, bütün statuslar aktualdır.`,
      ...sonuc,
    });
  } catch (err: any) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});

// 6. POST /api/kargo/manifesto-yukle — Aramex Daily Dispatch / Excel İçe Aktarma
router.post('/kargo/manifesto-yukle', async (req, res) => {
  try {
    const {
      dosya_base64,
      dosya_adi = 'manifest.xlsx',
      tenantId = 'kanada_shopper_baku',
      otomatik_esle = true,
    } = req.body;

    if (!dosya_base64) {
      return res
        .status(400)
        .json({ basarili: false, hata: 'Excel və ya CSV fayl məzmunu (base64) tələb olunur.' });
    }

    if (typeof dosya_base64 !== 'string' || dosya_base64.length > 14 * 1024 * 1024)
      return res.status(413).json({ basarili: false, hata: 'Manifesto en fazla 10 MB olabilir.' });

    // Base64'ten Buffer oluştur
    const base64Data = dosya_base64.replace(/^data:.*?;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const ayarlar = await kargoMerkezi.getAyarlar(tenantId);
    const provider = kargoMerkezi.getProvider(ayarlar.saglayici);
    const sonuc = await provider.manifestoAyristir(buffer, dosya_adi);

    if (!sonuc.basarili) {
      return res.status(400).json(sonuc);
    }

    let eslesenSayisi = 0;
    const eslesmeler: any[] = [];

    // Eğer otomatik eşleme aktifse, mevcut siparişleri müşteri adı ve telefon ile eşleştirip AWB kodlarını ata
    if (otomatik_esle && sonuc.satirlar.length > 0) {
      const simdiIso = new Date().toISOString();

      let adaylar = siparislerVeritabani;
      if (supabase) {
        const { data, error } = await supabase
          .from('siparisler')
          .select('*')
          .eq('tenant_id', tenantId);
        if (error) return res.status(503).json({ basarili: false, hata: 'Siparişler okunamadı.' });
        adaylar = data || [];
      }
      for (const satir of sonuc.satirlar) {
        const aliciTemiz = satir.aliciAdi.toLowerCase().replace(/[^a-z0-9]/g, '');
        const telTemiz = (satir.telefon || '').replace(/[^\d]/g, '').slice(-7);

        const bulunan = adaylar.find((s) => {
          if (s.tenant_id !== tenantId) {
            return false;
          }
          // Telefon son 7 hane eşleşmesi
          if (telTemiz && (s.telefon_numarasi || '').replace(/[^\d]/g, '').includes(telTemiz)) {
            return true;
          }
          // İsim benzerliği eşleşmesi
          const sMusteriTemiz = (s.musteri_adi || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (
            aliciTemiz.length >= 4 &&
            (sMusteriTemiz.includes(aliciTemiz) || aliciTemiz.includes(sMusteriTemiz))
          ) {
            return true;
          }
          return false;
        });

        if (bulunan) {
          const changes: Record<string, unknown> = { uluslararasi_kargo_kodu: satir.takipNo };
          if (satir.agirlikKg) changes.kargo_agirligi_kg = satir.agirlikKg;
          if (['KANADA_SATINALIM_BEKLIYOR', 'KANADA_DEPO'].includes(bulunan.lojistik_durumu))
            changes.lojistik_durumu = 'ULUSLARARASI_KARGO';
          await updateCargoOrder(bulunan, changes);
          bulunan.uluslararasi_kargo_kodu = satir.takipNo;
          if (satir.agirlikKg) {
            bulunan.kargo_agirligi_kg = satir.agirlikKg;
          }
          if (
            bulunan.lojistik_durumu === 'KANADA_SATINALIM_BEKLIYOR' ||
            bulunan.lojistik_durumu === 'KANADA_DEPO'
          ) {
            bulunan.lojistik_durumu = 'ULUSLARARASI_KARGO';
          }
          bulunan.guncellenme_tarihi = simdiIso;

          eslesenSayisi++;
          eslesmeler.push({
            siparisId: bulunan.id,
            musteriAdi: bulunan.musteri_adi,
            awbNo: satir.takipNo,
            agirlikKg: satir.agirlikKg,
          });
        }
      }
    }

    res.json({
      basarili: true,
      mesaj: `Excel uğurla oxundu: ${sonuc.toplamSatir} sətir tapıldı, ${eslesenSayisi} sifarişlə AWB barkodu bağlandı!`,
      ayristirma: sonuc,
      eslesenSayisi,
      eslesmeler,
    });
  } catch (err: any) {
    res.status(status(err)).json({ basarili: false, hata: err.message });
  }
});

export default router;
