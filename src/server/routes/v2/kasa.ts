import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../../services/publicFetch';
import {
  kasaTeslimAl,
  kasaTeslimGirdisi,
  kuryeBakiyeleri,
  kuryeNakitDurumu,
  kuryeTahsilatGirdisi,
  kuryeTahsilatiKaydet,
} from '../../services/v2/kasaStore';

/**
 * Kurye nakdi ve kasa teslimi (A11; K17). Kurye: kendi nakdi (BAKU_KURYE); kasa:
 * bakiyeler ve teslim alma (KASA: patron, SUPER_ADMIN, Bakü finans). Kapı (FF_V2_FLOW)
 * ve allowlist bu yönlendiriciden önce çalışır.
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

router.get('/kurye/nakit', async (req: Request, res: Response) => {
  try {
    res.json({ basarili: true, ...(await kuryeNakitDurumu(req.tenantId, kullanici(req))) });
  } catch (error) {
    hata(res, error);
  }
});

router.post('/kurye/tahsilat', async (req: Request, res: Response) => {
  try {
    const girdi = kuryeTahsilatGirdisi(req.body);
    const sonuc = await kuryeTahsilatiKaydet(req.tenantId, kullanici(req), girdi);
    // A retry of a recorded intent (same operation key) answers 200 with the first payment.
    res.status(sonuc.tekrar ? 200 : 201).json({ basarili: true, ...sonuc });
  } catch (error) {
    hata(res, error);
  }
});

router.get('/kasa/kurye-bakiyeleri', async (req: Request, res: Response) => {
  try {
    res.json({ basarili: true, kuryeler: await kuryeBakiyeleri(req.tenantId) });
  } catch (error) {
    hata(res, error);
  }
});

router.post('/kasa/teslimler', async (req: Request, res: Response) => {
  try {
    const girdi = kasaTeslimGirdisi(req.body);
    res
      .status(201)
      .json({ basarili: true, ...(await kasaTeslimAl(req.tenantId, kullanici(req), girdi)) });
  } catch (error) {
    hata(res, error);
  }
});

export default router;
