import express from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';

import { PORT, UPLOADS_DIR } from './config';
import { apiKeyAuth } from './middleware/auth';
import { genelApiLimiter, aiEndpointLimiter, veritabaniYonetimLimiter } from './middleware/rateLimiter';
import { corsMiddleware } from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import { logger, requestLogger } from './logger';

import sistemRouter from './routes/sistem';
import siparislerRouter from './routes/siparisler';
import musterilerRouter from './routes/musteriler';
import inboxRouter from './routes/inbox';
import firmalarRouter from './routes/firmalar';
import kuryelerRouter from './routes/kuryeler';
import gorselRouter from './routes/gorsel';
import veritabaniRouter from './routes/veritabani';
import kargoRouter from './routes/kargoEntegrasyon';
import authRouter from './routes/auth';

export function createApp() {
  const app = express();

  // Reverse proxy / Vercel / Cloudflare uyumu
  app.set('trust proxy', 1);

  // 1. HTTP Güvenlik Başlıkları (Helmet)
  app.use(helmet({
    contentSecurityPolicy: false, // SPA için CSP'yi devre dışı bırak (Vite dev server uyumu)
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Görsel servisi için
    crossOriginEmbedderPolicy: false,
  }));

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
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 4. API Key Kimlik Doğrulama (tüm /api/* route'larına uygulanır)
  app.use(apiKeyAuth());

  // 5. Genel API Rate Limiter (150 istek / 15 dk)
  app.use('/api/', genelApiLimiter);

  // 6. AI endpoint'leri için sıkı rate limiter (10 istek / 1 dk)
  app.use('/api/ayristir-siparis', aiEndpointLimiter);
  app.use('/api/urun-katalog-gorseli-ara', aiEndpointLimiter);
  app.use('/api/gorselden-urun-ara', aiEndpointLimiter);
  app.use('/api/webhook/siparis', aiEndpointLimiter);

  // 7. Veritabanı yönetim endpoint'leri için çok sıkı rate limiter (3 istek / 1 dk)
  app.use('/api/veritabani/temizle', veritabaniYonetimLimiter);
  app.use('/api/veritabani/demo-yukle', veritabaniYonetimLimiter);
  app.use('/api/veritabani/yedek-yukle', veritabaniYonetimLimiter);

  // 8. Görsel yükleme endpoint'i için büyük payload'a izin ver (ayrı parser)
  const buyukPayloadParser = express.json({ limit: '25mb' });
  app.post('/api/upload-gorsel', buyukPayloadParser);
  app.post('/api/ayristir-siparis', buyukPayloadParser);
  app.post('/api/katalog-gorseli-kaydet', buyukPayloadParser);
  app.post('/api/gorselden-urun-ara', buyukPayloadParser);

  // Uploads dizini oluştur (Serverless read-only mühitlərdə EROFS xətasının qarşısını al)
  try {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  } catch {
    // Read-only filesystem (məs. Vercel Lambda /var/task)
  }

  // Görseller için ek CORS başlıkları (Helmet'ın üzerine)
  app.use('/uploads', (req, res, next) => {
    res.header('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });

  // Uploads ve Görsel Servisi
  app.use(gorselRouter);
  app.use('/uploads', express.static(UPLOADS_DIR));

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

  // Global Hata Yakalayıcı
  app.use(errorHandler);

  return app;
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
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return new Promise((resolve) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      logger.info(`Kanada-Bakü Lojistik Portalı port ${PORT} üzerinde hazır.`, { port: PORT, env: process.env.NODE_ENV || 'development' });
      resolve(server);
    });
  });
}
