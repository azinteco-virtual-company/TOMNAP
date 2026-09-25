import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../../services/publicFetch';
import { PLATFORM_ROLU } from '../../../shared/roller';
import {
  sahipGerekli,
  v2SiparisGetir,
  v2SiparisGirdisiniDogrula,
  v2SiparisleriListele,
  v2SiparisOlustur,
} from '../../services/v2/siparisStore';
import { siparisSahipAdaylari, v2SiparisAyristir } from '../../services/v2/siparisAyristirma';

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

// A9: AI suggestion from one message (A1 rule: no customer data reaches the AI).
// Nothing is written; the person reviews and then posts /siparisler.
router.post('/siparisler/ayristir', async (req: Request, res: Response) => {
  try {
    res.json({ basarili: true, ...(await v2SiparisAyristir(req.tenantId, req.body)) });
  } catch (error) {
    hata(res, error);
  }
});

// Owner picker: active PATRON / SATIS_SORUMLUSU users of the tenant (owners only).
router.get('/siparis-sahipleri', async (req: Request, res: Response) => {
  try {
    res.json({ basarili: true, sahipler: await siparisSahipAdaylari(req.tenantId) });
  } catch (error) {
    hata(res, error);
  }
});

router.post('/siparisler', async (req: Request, res: Response) => {
  try {
    const girdi = v2SiparisGirdisiniDogrula(req.body);
    // The RPC refuses this too; answering here gives the clear message (O-24).
    if (req.auth?.role === PLATFORM_ROLU && girdi.sahipKullaniciId === null) throw sahipGerekli();
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
