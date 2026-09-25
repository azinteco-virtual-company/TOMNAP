import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../../services/publicFetch';
import {
  tersKayitGerekcesi,
  v2OdemeGirdisiniDogrula,
  v2OdemeKaydet,
  v2OdemeTersKayit,
  v2SiparisOdemeleri,
} from '../../services/v2/odemeStore';

/**
 * Ödeme defteri (A10). Yazma: FINANCE (patron, SUPER_ADMIN, Bakü finans; satış yalnız
 * butikte); okuma: STAFF. Kapı (FF_V2_FLOW) ve allowlist bu yönlendiriciden önce çalışır.
 */
const router = Router();

function hata(res: Response, error: unknown) {
  if (error instanceof PublicResourceError) {
    const code = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 500;
    return res.status(code).json({ basarili: false, hata: error.message });
  }
  return res.status(500).json({ basarili: false, hata: 'İşlem tamamlanamadı.' });
}
const kullanici = (req: Request) => req.auth?.userId ?? '';

router.post('/odemeler', async (req: Request, res: Response) => {
  try {
    const girdi = v2OdemeGirdisiniDogrula(req.body);
    res
      .status(201)
      .json({ basarili: true, ...(await v2OdemeKaydet(req.tenantId, kullanici(req), girdi)) });
  } catch (error) {
    hata(res, error);
  }
});

router.post('/odemeler/:id/ters-kayit', async (req: Request, res: Response) => {
  try {
    const gerekce = tersKayitGerekcesi(req.body);
    res.status(201).json({
      basarili: true,
      ...(await v2OdemeTersKayit(req.tenantId, kullanici(req), req.params.id, gerekce)),
    });
  } catch (error) {
    hata(res, error);
  }
});

router.get('/siparisler/:id/odemeler', async (req: Request, res: Response) => {
  try {
    const defter = await v2SiparisOdemeleri(req.tenantId, req.params.id);
    if (!defter) return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    res.json({ basarili: true, ...defter });
  } catch (error) {
    hata(res, error);
  }
});

export default router;
