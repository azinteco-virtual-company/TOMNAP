import { Router, type NextFunction, type Request, type Response } from 'express';
import { isV2FlowEnabled } from '../../config';
import { PublicResourceError } from '../../services/publicFetch';
import { kurEkle, kurGirdisiniDogrula, kurlariListele } from '../../services/v2/kurlar';
import {
  ayarGuncellemesiniDogrula,
  ayarlariGuncelle,
  ayarlariOku,
} from '../../services/v2/ayarlar';

/**
 * v2 akışı (FF_V2_FLOW). Kapı, oturum doğrulamasından ÖNCE bağlanır: bayrak
 * kapalıyken /api/v2 altındaki hiçbir istek (girişli ya da girişsiz) oturum,
 * allowlist ya da v2 kodu çalıştırmaz; hepsi aynı 404'ü alır.
 */
export function v2Kapisi(_req: Request, res: Response, next: NextFunction) {
  if (isV2FlowEnabled()) return next();
  res.status(404).json({ basarili: false, hata: 'Bu funksiya aktiv deyil.' });
}

const router = Router();

function hata(res: Response, error: unknown) {
  if (error instanceof PublicResourceError) {
    const code = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 500;
    return res.status(code).json({ basarili: false, hata: error.message });
  }
  return res.status(500).json({ basarili: false, hata: 'İşlem tamamlanamadı.' });
}

const kullanici = (req: Request) => req.auth?.userId ?? '';

// Kabuğun sunucu bayrağını doğrulaması için; iş verisi döndürmez.
router.get('/durum', (_req, res) => {
  res.json({ basarili: true, v2: true });
});

// Kurlar (K4): okuma ve giriş PATRON, satın almacılar ve BAKU_FINANS (allowlist: RATES).
router.get('/kurlar', async (req, res) => {
  try {
    res.json({ basarili: true, ...(await kurlariListele(req.tenantId)) });
  } catch (error) {
    hata(res, error);
  }
});

router.post('/kurlar', async (req, res) => {
  try {
    const girdi = kurGirdisiniDogrula(req.body);
    res
      .status(201)
      .json({ basarili: true, kur: await kurEkle(req.tenantId, kullanici(req), girdi) });
  } catch (error) {
    hata(res, error);
  }
});

// v2 tenant ayarları (K8, K11): yalnız sahipler (allowlist: OWNERS).
router.get('/ayarlar', async (req, res) => {
  try {
    res.json({ basarili: true, ayarlar: await ayarlariOku(req.tenantId) });
  } catch (error) {
    hata(res, error);
  }
});

router.patch('/ayarlar', async (req, res) => {
  try {
    const degisiklik = ayarGuncellemesiniDogrula(req.body);
    res.json({
      basarili: true,
      ayarlar: await ayarlariGuncelle(req.tenantId, kullanici(req), degisiklik),
    });
  } catch (error) {
    hata(res, error);
  }
});

export default router;
