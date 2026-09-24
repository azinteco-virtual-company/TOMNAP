import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../../services/publicFetch';
import {
  v2SiparisGetir,
  v2SiparisGirdisiniDogrula,
  v2SiparisleriListele,
  v2SiparisOlustur,
} from '../../services/v2/siparisStore';

/**
 * v2 siparişleri (A8). Oluşturma: SALES (patron, SUPER_ADMIN, satış); okuma: STAFF.
 * Kapı (FF_V2_FLOW) ve allowlist bu yönlendiriciden önce çalışır.
 */
const router = Router();

function hata(res: Response, error: unknown) {
  if (error instanceof PublicResourceError) {
    const code = [400, 401, 403, 404, 409, 413, 503].includes(error.status) ? error.status : 500;
    return res.status(code).json({ basarili: false, hata: error.message });
  }
  return res.status(500).json({ basarili: false, hata: 'İşlem tamamlanamadı.' });
}

router.post('/siparisler', async (req: Request, res: Response) => {
  try {
    const girdi = v2SiparisGirdisiniDogrula(req.body);
    const siparis = await v2SiparisOlustur(req.tenantId, req.auth?.userId ?? '', girdi);
    res.status(201).json({ basarili: true, siparis });
  } catch (error) {
    hata(res, error);
  }
});

router.get('/siparisler', async (req: Request, res: Response) => {
  try {
    res.json({ basarili: true, siparisler: await v2SiparisleriListele(req.tenantId) });
  } catch (error) {
    hata(res, error);
  }
});

router.get('/siparisler/:id', async (req: Request, res: Response) => {
  try {
    const siparis = await v2SiparisGetir(req.tenantId, req.params.id);
    if (!siparis) return res.status(404).json({ basarili: false, hata: 'Sipariş bulunamadı.' });
    res.json({ basarili: true, siparis });
  } catch (error) {
    hata(res, error);
  }
});

export default router;
