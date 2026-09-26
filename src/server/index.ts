import express from 'express';
import path from 'path';
import helmet from 'helmet';

import { PORT } from './config';
import { apiKeyAuth } from './middleware/auth';
import {
  genelApiLimiter,
  girisLimiter,
  aiEndpointLimiter,
  veritabaniYonetimLimiter,
} from './middleware/rateLimiter';
import { corsMiddleware } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import { logger, requestLogger } from './logger';
import { isPrivateBuildPath } from './services/clientBuildBoundary';

import sistemRouter from './routes/sistem';
import siparislerRouter from './routes/siparisler';
import musterilerRouter from './routes/musteriler';
import inboxRouter from './routes/inbox';
import firmalarRouter from './routes/firmalar';
import kuryelerRouter from './routes/kuryeler';
import gorselRouter, { serveUploadedImage } from './routes/gorsel';
import veritabaniRouter from './routes/veritabani';
import kargoRouter from './routes/kargoEntegrasyon';
import authRouter from './routes/auth';
import v2Router, { v2Kapisi } from './routes/v2';

export interface AppOptions {
  /** Express "trust proxy": hops whose X-Forwarded-For entry is trusted; false = none. */
  trustProxy?: number | false;
}

export function createApp({ trustProxy = false }: AppOptions = {}) {
  const app = express();

  // Without a proxy in front (local, Docker) X-Forwarded-For is client-controlled
  // and must not decide req.ip, which keys the rate limiters. Only the Vercel
  // entry point trusts its one hop (see src/server/vercel.ts).
  app.set('trust proxy', trustProxy);

  // 1. HTTP Güvenlik Başlıkları (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // SPA için CSP'yi devre dışı bırak (Vite dev server uyumu)
      crossOriginResourcePolicy: { policy: 'same-origin' }, // Görsel servisi için
      crossOriginEmbedderPolicy: false,
    })
  );

  // 2. CORS Yapılandırması
  app.use(corsMiddleware());

  // 3. HTTP İstek Günlüğü (Structured Request Logger)
  app.use(requestLogger);

  // 4. JSON body parser — Serverless (Vercel) mühitində artıq oxunubsa ilişib qalmasın
  app.use((req, res, next) => {
    if (req.body !== undefined && typeof req.body === 'object') {
      (req as any)._body = true;
    }
    next();
  });
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // Limit anonymous authentication attempts before password hashing.
  app.use(
    [
      '/api/auth/giris',
      '/api/firmalar/giris',
      '/api/auth/sifre-belirle',
      '/api/firmalar/davet/katil',
      '/api/firmalar/kayit',
    ],
    girisLimiter
  );
  // v2 kapısı oturumdan önce: FF_V2_FLOW kapalıyken /api/v2 hiçbir kodu çalıştırmadan 404.
  app.use('/api/v2', v2Kapisi);
  app.use(apiKeyAuth());
  app.get(['/health', '/api/health'], (_req, res) => res.json({ basarili: true }));

  // 5. Genel API Rate Limiter (150 istek / 15 dk)
  app.use('/api/', genelApiLimiter);

  // 6. AI endpoint'leri için sıkı rate limiter (10 istek / 1 dk)
  app.use('/api/ayristir-siparis', aiEndpointLimiter);
  app.use('/api/urun-katalog-gorseli-ara', aiEndpointLimiter);
  app.use('/api/gorselden-urun-ara', aiEndpointLimiter);
  app.use('/api/webhook/siparis', aiEndpointLimiter);
  app.use('/api/v2/siparisler/ayristir', aiEndpointLimiter);

  // 7. Veritabanı yönetim endpoint'leri için çok sıkı rate limiter (3 istek / 1 dk)
  app.use('/api/veritabani/temizle', veritabaniYonetimLimiter);
  app.use('/api/veritabani/demo-yukle', veritabaniYonetimLimiter);
  app.use('/api/veritabani/yedek-yukle', veritabaniYonetimLimiter);

  // Uploads ve Görsel Servisi
  app.get('/uploads/:dosyaAdi', serveUploadedImage);

  // Route'ları Mount Et (Yalnızca /api altında güvenli ve korumalı)
  const mountRoutes = (basePath: string) => {
    app.use(basePath, sistemRouter);
    app.use(basePath, siparislerRouter);
    app.use(basePath, musterilerRouter);
    app.use(basePath, inboxRouter);
    app.use(basePath, firmalarRouter);
    app.use(basePath, kuryelerRouter);
    app.use(basePath, gorselRouter);
    app.use(basePath, veritabaniRouter);
    app.use(basePath, kargoRouter);
    app.use(basePath, authRouter);
  };
  mountRoutes('/api');
  app.use('/api/v2', v2Router);

  // Global Hata Yakalayıcı
  app.use(errorHandler);

  return app;
}

export function mountClientAssets(app: ReturnType<typeof createApp>, directory: string) {
  // Also deny legacy paths if an operator accidentally retains an old server
  // bundle in the client directory. CI/build separately reject that artifact.
  app.use((req, res, next) => {
    let requested: string;
    try {
      requested = decodeURIComponent(req.path);
    } catch {
      res.status(400).send('Geçersiz istek yolu.');
      return;
    }
    if (isPrivateBuildPath(requested)) {
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).send('Bulunamadı.');
      return;
    }
    next();
  });
  app.use(express.static(directory));
  app.get('*', (_req, res) => res.sendFile(path.join(directory, 'index.html')));
}

export async function startServer() {
  const app = createApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    mountClientAssets(app, distPath);
  }

  return new Promise((resolve) => {
    const server = app.listen(
      PORT,
      process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
      () => {
        logger.info(`Kanada-Bakü Lojistik Portalı port ${PORT} üzerinde hazır.`, {
          port: PORT,
          env: process.env.NODE_ENV || 'development',
        });
        resolve(server);
      }
    );
  });
}
