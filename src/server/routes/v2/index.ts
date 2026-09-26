import { Router, type NextFunction, type Request, type Response } from 'express';
import { isV2FlowEnabled } from '../../config';
import { PublicResourceError } from '../../services/publicFetch';
import { kurEkle, kurGirdisiniDogrula, kurlariListele } from '../../services/v2/kurlar';
import {
  ayarGuncellemesiniDogrula,
  ayarlariGuncelle,
  ayarlariOku,
  type V2Ayarlari,
} from '../../services/v2/ayarlar';
import { rolGrubunda } from '../../../shared/roller';
import siparislerRouter from './siparisler';
import odemelerRouter from './odemeler';
import kasaRouter from './kasa';
import kacaklarRouter from './kacaklar';

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

// K21: v2 is closed in the demo area (Codex R3 F12). demo_sandbox lives in memory, which
// cannot carry the transactional RPCs; the stores would otherwise fall back to memory
// there. Runs after the session (the tenant is known) and answers like the closed gate,
// so the v2 shell shows "closed".
router.use((req, res, next) => {
  if (req.tenantId !== 'demo_sandbox') return next();
  res.status(404).json({ basarili: false, hata: 'Bu funksiya demo sahəsində aktiv deyil.' });
});

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

// v2 tenant ayarları (K8, K11): yalnız sahipler (allowlist: OWNERS). Prim oranını yalnız
// patron görür ve değiştirir; SUPER_ADMIN ayarların geri kalanını görür (K15).
const primGorur = (req: Request) => rolGrubunda(req.auth?.role, 'PAYROLL');
function gorunur(req: Request, ayarlar: V2Ayarlari) {
  if (primGorur(req)) return ayarlar;
  const { primOraniVarsayilan: _gizli, ...digerleri } = ayarlar;
  return digerleri;
}

router.get('/ayarlar', async (req, res) => {
  try {
    res.json({ basarili: true, ayarlar: gorunur(req, await ayarlariOku(req.tenantId)) });
  } catch (error) {
    hata(res, error);
  }
});

router.patch('/ayarlar', async (req, res) => {
  try {
    if (!primGorur(req) && Object.hasOwn(Object(req.body), 'prim_orani_varsayilan'))
      throw new PublicResourceError('Prim oranını yalnız patron değiştirebilir.', 403);
    const degisiklik = ayarGuncellemesiniDogrula(req.body);
    res.json({
      basarili: true,
      ayarlar: gorunur(req, await ayarlariGuncelle(req.tenantId, kullanici(req), degisiklik)),
    });
  } catch (error) {
    hata(res, error);
  }
});

// v2 siparişleri ve satırları (A8).
router.use(siparislerRouter);
router.use(odemelerRouter);
router.use(kasaRouter);
router.use(kacaklarRouter);

export default router;
