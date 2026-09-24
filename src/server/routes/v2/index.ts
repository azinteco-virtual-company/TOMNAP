import { Router, type NextFunction, type Request, type Response } from 'express';
import { isV2FlowEnabled } from '../../config';

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

// Kabuğun sunucu bayrağını doğrulaması için; iş verisi döndürmez.
router.get('/durum', (_req, res) => {
  res.json({ basarili: true, v2: true });
});

export default router;
