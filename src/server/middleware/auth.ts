import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { readSession, type AuthContext } from '../services/sessions';
import { allowedOrigins } from './security';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      tenantId?: string;
    }
  }
}

const READ = new Set(['GET', 'HEAD', 'OPTIONS']);
const STAFF = ['SUPER_ADMIN', 'PATRON', 'KANADA_SATINALMA', 'SATIS_SORUMLUSU', 'BAKU_FINANS'];
const OWNERS = ['SUPER_ADMIN', 'PATRON'];
const SALES = [...OWNERS, 'SATIS_SORUMLUSU'];
const PURCHASING = [...SALES, 'KANADA_SATINALMA'];
const FINANCE = [...SALES, 'BAKU_FINANS'];
const SHIPPING = [...OWNERS, 'KANADA_SATINALMA'];
const ALL = [...STAFF, 'BAKU_KURYE'];

type Rule = [string, RegExp, string[]];
// Explicit method + complete path allowlist. New routes are denied until reviewed.
const rules: Rule[] = [
  ['GET', /^\/api\/auth\/oturum$/, ALL],
  ['POST', /^\/api\/auth\/cikis$/, ALL],
  ['GET', /^\/api\/firmalar$/, STAFF],
  ['POST', /^\/api\/firmalar\/davet-olustur$/, OWNERS],
  ['POST', /^\/api\/firmalar$/, ['SUPER_ADMIN']],
  ['PATCH', /^\/api\/firmalar\/[^/]+\/onay$/, ['SUPER_ADMIN']],
  ['DELETE', /^\/api\/firmalar\/[^/]+$/, ['SUPER_ADMIN']],
  [
    'GET',
    /^\/api\/(sistem-durum|tenant\/izolasyon-testi|veritabani\/(durum|yedek-al))$/,
    ['SUPER_ADMIN'],
  ],
  [
    'POST',
    /^\/api\/(veritabani\/(temizle|demo-yukle|yedek-yukle)|ornek-verileri-yukle)$/,
    ['SUPER_ADMIN'],
  ],
  ['GET', /^\/api\/siparisler$/, STAFF],
  ['POST', /^\/api\/(siparisler|ayristir-siparis)$/, PURCHASING],
  ['PATCH', /^\/api\/siparisler\/[^/]+$/, STAFF],
  ['DELETE', /^\/api\/siparisler\/[^/]+$/, SALES],
  ['POST', /^\/api\/siparisler\/tumunu-uluslararasi-kargo-yap$/, SHIPPING],
  ['GET', /^\/api\/musteriler(?:\/[^/]+\/siparisler)?$/, FINANCE],
  ['POST', /^\/api\/musteriler$/, SALES],
  ['GET', /^\/api\/inbox$/, SALES],
  ['POST', /^\/api\/(inbox\/[^/]+\/(onayla|reddet)|webhook\/siparis)$/, SALES],
  ['GET', /^\/api\/kuryeler$/, [...SHIPPING, 'BAKU_FINANS']],
  ['POST', /^\/api\/kuryeler(?:\/[^/]+\/kullanici)?$/, OWNERS],
  ['POST', /^\/api\/siparisler\/[^/]+\/kurye$/, SHIPPING],
  ['GET', /^\/api\/kurye\/gorevler$/, ['BAKU_KURYE']],
  ['POST', /^\/api\/kurye\/gorevler\/[^/]+\/teslim$/, ['BAKU_KURYE']],
  ['GET', /^\/api\/kargo\/ayarlar$/, SHIPPING],
  ['POST', /^\/api\/kargo\/ayarlar$/, OWNERS],
  ['POST', /^\/api\/kargo\/(test|takip|senkronize-et|manifesto-yukle)$/, SHIPPING],
  // Human-confirmed AWB matching (FF_V2_FLOW): same roles that may edit an order's AWB.
  ['POST', /^\/api\/kargo\/manifesto-eslestirme\/(oneriler|onayla)$/, SHIPPING],
  ['GET', /^\/api\/proxy-gorsel$/, STAFF],
  ['GET', /^(?:\/api)?\/uploads\/[^/]+$/, STAFF],
  [
    'POST',
    /^\/api\/(upload-gorsel|urun-katalog-gorseli-ara|gorselden-urun-ara|katalog-gorseli-kaydet|urun-orijinal-gorsele-don)$/,
    PURCHASING,
  ],
];

function isPublic(req: Request): boolean {
  return (
    (req.method === 'GET' && /^\/(?:api\/)?health$/.test(req.path)) ||
    (req.method === 'GET' &&
      /^\/api\/(auth\/token-kontrol|firmalar\/davet)\/[^/]+$/.test(req.path)) ||
    (req.method === 'POST' &&
      /^\/api\/(auth\/(giris|sifre-belirle)|firmalar\/(giris|kayit|davet\/katil))$/.test(req.path))
  );
}

function equalToken(received: unknown, expected: string): boolean {
  if (typeof received !== 'string' || !/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

function setTenant(req: Request) {
  const values: unknown[] = [
    req.headers['x-tenant-id'],
    req.query.tenant_id,
    req.query.tenantId,
    req.body?.tenant_id,
    req.body?.tenantId,
    req.body?.duzeltilmis_siparis?.tenant_id,
    req.body?.duzeltilmis_siparis?.tenantId,
    req.body?.ayarlar?.tenantId,
  ];
  const present = values.filter((v) => v !== undefined);
  if (present.some((v) => typeof v !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(v as string)))
    return 'Geçersiz firma kimliği.';
  if (new Set(present).size > 1) return 'Çelişen firma kimlikleri.';
  const requested = present[0] as string | undefined;
  if (req.auth!.role !== 'SUPER_ADMIN' && requested && requested !== req.auth!.tenantId)
    return 'Bu firmaya erişim yetkiniz yok.';
  req.tenantId = req.auth!.role === 'SUPER_ADMIN' ? requested || 'all' : req.auth!.tenantId;
  const globalMutation =
    /^\/api\/(auth\/cikis|firmalar(?:\/[^/]+(?:\/onay)?)?|veritabani\/[^/]+|ornek-verileri-yukle)$/.test(
      req.path
    ) && req.path !== '/api/firmalar/davet-olustur';
  if (!READ.has(req.method) && req.tenantId === 'all' && !globalMutation)
    return 'Bu işlem için bir firma seçin.';
  // Routers consume server-resolved scope, never unvalidated client scope.
  req.query.tenant_id = req.tenantId;
  req.query.tenantId = req.tenantId;
  if (!READ.has(req.method)) {
    if (!req.body) req.body = {};
    if (typeof req.body !== 'object' || Array.isArray(req.body)) return 'Geçersiz istek gövdesi.';
    req.body.tenant_id = req.tenantId;
    req.body.tenantId = req.tenantId;
  }
  return null;
}

export function sessionAuth() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let normalizedPath: string;
    try {
      normalizedPath = decodeURIComponent(req.path).toLowerCase();
    } catch {
      res.status(400).json({ basarili: false, hata: 'Geçersiz istek yolu.' });
      return;
    }
    if (
      !normalizedPath.startsWith('/api/') &&
      !normalizedPath.startsWith('/uploads/') &&
      normalizedPath !== '/health'
    )
      return next();
    res.setHeader('Cache-Control', 'private, no-store');
    res.vary('Cookie');
    if (!READ.has(req.method) && req.headers.origin && !allowedOrigins().has(req.headers.origin)) {
      res.status(403).json({ basarili: false, hata: 'İstek kaynağına izin verilmiyor.' });
      return;
    }
    if (isPublic(req)) return next();
    try {
      const auth = await readSession(req);
      if (!auth) {
        res.status(401).json({ basarili: false, hata: 'Oturum açmanız gerekiyor.' });
        return;
      }
      req.auth = auth;
      if (!READ.has(req.method) && !equalToken(req.headers['x-csrf-token'], auth.csrfToken)) {
        res
          .status(403)
          .json({ basarili: false, hata: 'İstek doğrulaması geçersiz. Sayfayı yenileyin.' });
        return;
      }
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      if (
        !rules.some(
          ([m, path, roles]) => m === method && path.test(req.path) && roles.includes(auth.role)
        )
      ) {
        res.status(403).json({ basarili: false, hata: 'Bu işlem için yetkiniz yok.' });
        return;
      }
      const tenantError = setTenant(req);
      if (tenantError) {
        res.status(403).json({ basarili: false, hata: tenantError });
        return;
      }
      next();
    } catch {
      res.status(503).json({ basarili: false, hata: 'Oturum doğrulama hizmeti kullanılamıyor.' });
    }
  };
}

// Compatibility export for integrations importing the old middleware name.
export const apiKeyAuth = sessionAuth;
