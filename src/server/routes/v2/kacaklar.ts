import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../../services/publicFetch';
import { kacakEsikleri, kacaklariOku } from '../../services/v2/kacakStore';

/**
 * Kaçaklar panosu v0 (A12): Q4 ve Q5, salt okunur. Okuma: PATRON, SUPER_ADMIN,
 * BAKU_FINANS (allowlist). Kapı (FF_V2_FLOW) bu yönlendiriciden önce çalışır.
 */
const router = Router();

router.get('/kacaklar', async (req: Request, res: Response) => {
  try {
    const esikler = kacakEsikleri(req.query);
    res.json({ basarili: true, ...(await kacaklariOku(req.tenantId, esikler)) });
  } catch (error) {
    if (error instanceof PublicResourceError) {
      const code = [400, 403, 404, 503].includes(error.status) ? error.status : 500;
      return res.status(code).json({ basarili: false, hata: error.message });
    }
    res.status(500).json({ basarili: false, hata: 'İşlem tamamlanamadı.' });
  }
});

export default router;
