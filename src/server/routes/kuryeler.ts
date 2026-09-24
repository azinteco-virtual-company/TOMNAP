import { Router, type Request, type Response } from 'express';
import { PublicResourceError } from '../services/publicFetch';
import {
  listCouriers,
  createCourier,
  bindCourier,
  assignCourier,
  courierTasks,
  deliverCourierTask,
} from '../services/couriers';
import { ROL_GRUPLARI } from '../../shared/roller';

const router = Router();
const owners = new Set<string>(ROL_GRUPLARI.OWNERS);
const operators = new Set<string>(ROL_GRUPLARI.SHIPPING);
function requireRole(req: Request, roles: Set<string>) {
  if (!req.auth || !roles.has(req.auth.role))
    throw new PublicResourceError('Bu işlem için yetkiniz yok.', 403);
  if (!req.tenantId || req.tenantId === 'all')
    throw new PublicResourceError('Bir butik seçilmelidir.', 400);
  return req.tenantId;
}
function body(req: Request, allowed: string[]) {
  if (
    !req.body ||
    typeof req.body !== 'object' ||
    Array.isArray(req.body) ||
    Object.keys(req.body).some((key) => ![...allowed, 'tenant_id', 'tenantId'].includes(key))
  )
    throw new PublicResourceError('Geçersiz kurye isteği.', 400);
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new PublicResourceError('Zorunlu alanları kontrol edin.', 400);
  return value.trim();
}
function optionalText(value: unknown, max: number) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.trim().length > max)
    throw new PublicResourceError('Alan uzunluğunu kontrol edin.', 400);
  return value.trim();
}
function nullableId(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
    throw new PublicResourceError('Geçersiz kimlik.', 400);
  return value;
}
function version(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new PublicResourceError('Görev sürümü geçersiz. Listeyi yenileyin.', 400);
  return value;
}
function failure(res: Response, error: unknown) {
  res.status(error instanceof PublicResourceError ? error.status : 503).json({
    basarili: false,
    hata: error instanceof PublicResourceError ? error.message : 'Kurye işlemi tamamlanamadı.',
  });
}
router.get('/kuryeler', async (req, res) => {
  try {
    const tenant = requireRole(req, new Set([...operators, 'BAKU_FINANS']));
    res.json({ basarili: true, ...(await listCouriers(tenant, owners.has(req.auth!.role))) });
  } catch (error) {
    failure(res, error);
  }
});
router.post('/kuryeler', async (req, res) => {
  try {
    const tenant = requireRole(req, owners);
    body(req, ['ad_soyad', 'telefon', 'bolge']);
    const kurye = await createCourier(tenant, {
      ad_soyad: text(req.body.ad_soyad, 150),
      telefon: optionalText(req.body.telefon, 50),
      bolge: optionalText(req.body.bolge, 150),
    });
    res.status(201).json({ basarili: true, kurye });
  } catch (error) {
    failure(res, error);
  }
});
router.post('/kuryeler/:id/kullanici', async (req, res) => {
  try {
    const tenant = requireRole(req, owners);
    body(req, ['kullanici_id', 'beklenen_kullanici_id']);
    res.json({
      basarili: true,
      ...(await bindCourier(
        tenant,
        req.params.id,
        nullableId(req.body.kullanici_id),
        nullableId(req.body.beklenen_kullanici_id)
      )),
    });
  } catch (error) {
    failure(res, error);
  }
});
router.post('/siparisler/:id/kurye', async (req, res) => {
  try {
    const tenant = requireRole(req, operators);
    body(req, ['kurye_id', 'beklenen_atama_surumu']);
    res.json({
      basarili: true,
      ...(await assignCourier(
        tenant,
        req.params.id,
        nullableId(req.body.kurye_id),
        version(req.body.beklenen_atama_surumu)
      )),
    });
  } catch (error) {
    failure(res, error);
  }
});
router.get('/kurye/gorevler', async (req, res) => {
  try {
    const tenant = requireRole(req, new Set(['BAKU_KURYE']));
    res.json({ basarili: true, ...(await courierTasks(tenant, req.auth!.userId)) });
  } catch (error) {
    failure(res, error);
  }
});
router.post('/kurye/gorevler/:id/teslim', async (req, res) => {
  try {
    const tenant = requireRole(req, new Set(['BAKU_KURYE']));
    body(req, ['beklenen_atama_surumu', 'teslim_alan']);
    res.json({
      basarili: true,
      ...(await deliverCourierTask(
        tenant,
        req.auth!.userId,
        req.params.id,
        version(req.body.beklenen_atama_surumu),
        text(req.body.teslim_alan, 150)
      )),
    });
  } catch (error) {
    failure(res, error);
  }
});
export default router;
