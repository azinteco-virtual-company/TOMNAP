import { createHash } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { isAwbReviewEnabled } from '../config';
import { kargoMerkezi } from '../services/kargo/kargoMerkezi';
import type {
  AyrismisManifestoSonuc,
  KargoSaglayiciTipi,
  CikisUlkesi,
} from '../services/kargo/types';
import { eslesmeOnerileriOlustur } from '../services/kargo/manifestMatching';
import {
  awbEslesmeleriniOnayla,
  eslesmeHavuzunuYukle,
  onayKalemleriniHazirla,
  secimIstegiDogrula,
  type AwbOnaySonucu,
} from '../services/kargo/awbMatchStore';
import { PublicResourceError } from '../services/publicFetch';

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

// Manifest uploads are parsed with the tenant's carrier parser. Parsing never
// writes: AWB codes reach an order only through an explicit confirmation.
const MAX_MANIFEST_SATIRI = 2000;

class ManifestYuklemeHatasi extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

interface AyrismisManifest {
  sonuc: AyrismisManifestoSonuc;
  /** Cleaned client file name, kept only as a human-readable reference. */
  dosyaAdi: string;
  /** SHA-256 of the decoded upload: the exact file an approval refers to. */
  sha256: string;
}

function requestTenant(req: Request): string {
  const tenant = req.tenantId;
  if (typeof tenant !== 'string' || !tenant || tenant === 'all')
    throw new PublicResourceError('Butik seçilməlidir.', 400);
  return tenant;
}

function requestUser(req: Request): string {
  const userId = req.auth?.userId;
  if (typeof userId !== 'string' || !userId) throw new PublicResourceError('Oturum gerekli.', 401);
  return userId;
}

async function manifestiAyristir(body: unknown, tenantId: string): Promise<AyrismisManifest> {
  const record: Record<string, unknown> =
    body && typeof body === 'object' && !Array.isArray(body) ? { ...body } : {};
  const dosyaBase64 = record.dosya_base64;
  if (!dosyaBase64)
    throw new ManifestYuklemeHatasi(400, 'Excel və ya CSV fayl məzmunu (base64) tələb olunur.');
  if (typeof dosyaBase64 !== 'string' || dosyaBase64.length > 14 * 1024 * 1024)
    throw new ManifestYuklemeHatasi(413, 'Manifesto en fazla 10 MB olabilir.');
  const dosyaAdi =
    (typeof record.dosya_adi === 'string' ? record.dosya_adi : '')
      .replace(/[\p{Cc}\p{Cf}]/gu, '')
      .trim()
      .slice(0, 255) || 'manifest.xlsx';
  const buffer = Buffer.from(dosyaBase64.replace(/^data:.*?;base64,/, ''), 'base64');
  const ayarlar = await kargoMerkezi.getAyarlar(tenantId);
  const sonuc = await kargoMerkezi.getProvider(ayarlar.saglayici).manifestoAyristir(buffer, dosyaAdi);
  return { sonuc, dosyaAdi, sha256: createHash('sha256').update(buffer).digest('hex') };
}

/** Parses the manifest and rebuilds the tenant's suggestions on the server. */
async function manifestOnerileri(body: unknown, tenantId: string) {
  const manifest = await manifestiAyristir(body, tenantId);
  if (!manifest.sonuc.basarili)
    throw new ManifestYuklemeHatasi(400, manifest.sonuc.hatalar?.[0] || 'Manifest oxuna bilmədi.');
  if (manifest.sonuc.satirlar.length > MAX_MANIFEST_SATIRI)
    throw new ManifestYuklemeHatasi(
      413,
      `Bir manifestdə ən çox ${MAX_MANIFEST_SATIRI} sətir işlənə bilər.`
    );
  const rapor = eslesmeOnerileriOlustur(manifest.sonuc.satirlar, await eslesmeHavuzunuYukle(tenantId));
  return { manifest, rapor };
}

function sendError(res: Response, error: unknown) {
  if (
    error instanceof ManifestYuklemeHatasi ||
    error instanceof PublicResourceError ||
    error instanceof CargoSettingsError
  ) {
    const code = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 500;
    return res.status(code).json({ basarili: false, hata: error.message });
  }
  return res.status(500).json({ basarili: false, hata: 'Kargo əməliyyatı tamamlanmadı.' });
}

function awbReviewDisabled(res: Response): boolean {
  if (isAwbReviewEnabled()) return false;
  res.status(404).json({ basarili: false, hata: 'Bu funksiya aktiv deyil.' });
  return true;
}

// 6. POST /api/kargo/manifesto-yukle — Aramex Daily Dispatch / Excel İçe Aktarma
// Only parses. The former automatic name/phone matching wrote AWB codes to wrong
// orders; `otomatik_esle` is accepted for compatibility but never writes.
router.post('/kargo/manifesto-yukle', async (req, res) => {
  try {
    const { sonuc } = await manifestiAyristir(req.body, requestTenant(req));
    if (!sonuc.basarili) return res.status(400).json(sonuc);
    res.json({
      basarili: true,
      mesaj: `Excel uğurla oxundu: ${sonuc.toplamSatir} sətir tapıldı. AWB kodları sifarişlərə avtomatik yazılmır; bağlamaq üçün eşləşdirmə təkliflərini təsdiqləyin.`,
      ayristirma: sonuc,
      eslesenSayisi: 0,
      eslesmeler: [],
      eslesmeOnayiGerekli: true,
    });
  } catch (error) {
    sendError(res, error);
  }
});

// 7. POST /api/kargo/manifesto-eslestirme/oneriler — suggestions only; nothing is written.
router.post('/kargo/manifesto-eslestirme/oneriler', async (req, res) => {
  if (awbReviewDisabled(res)) return;
  try {
    const { manifest, rapor } = await manifestOnerileri(req.body, requestTenant(req));
    res.json({ basarili: true, saglayici: manifest.sonuc.saglayici, ...rapor });
  } catch (error) {
    sendError(res, error);
  }
});

// 8. POST /api/kargo/manifesto-eslestirme/onayla — writes only pairs the server itself
// suggests for the uploaded manifest. Body: { dosya_base64, dosya_adi, secimler:
// [{ satirNo, siparisId }] }. Match type and name score are recomputed here and
// logged with the approving user; any rejection leaves every order unchanged.
router.post('/kargo/manifesto-eslestirme/onayla', async (req, res) => {
  if (awbReviewDisabled(res)) return;
  try {
    const tenantId = requestTenant(req);
    const userId = requestUser(req);
    const secimler = secimIstegiDogrula(req.body);
    const { manifest, rapor } = await manifestOnerileri(req.body, tenantId);
    const hazirlik = onayKalemleriniHazirla(rapor, secimler);
    let sonuc: AwbOnaySonucu;
    if (hazirlik.reddedilenler.length > 0)
      sonuc = { basarili: false, uygulananlar: [], reddedilenler: hazirlik.reddedilenler };
    else if (hazirlik.kalemler.length === 0)
      sonuc = { basarili: true, uygulananlar: hazirlik.tekrarlar, reddedilenler: [] };
    else {
      const yazilan = await awbEslesmeleriniOnayla(
        tenantId,
        userId,
        { dosyaAdi: manifest.dosyaAdi, sha256: manifest.sha256 },
        hazirlik.kalemler
      );
      sonuc = yazilan.basarili
        ? { ...yazilan, uygulananlar: [...hazirlik.tekrarlar, ...yazilan.uygulananlar] }
        : yazilan;
    }
    const yeni = sonuc.uygulananlar.filter((item) => !item.tekrar).length;
    res.json({
      ...sonuc,
      mesaj: sonuc.basarili
        ? `${yeni} AWB kodu təsdiqlənərək sifarişlərə yazıldı.`
        : 'Seçilən eşləşdirmələrin bəziləri tətbiq edilə bilmədi; heç bir sifariş dəyişdirilmədi.',
    });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
