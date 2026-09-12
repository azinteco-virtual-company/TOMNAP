/**
 * API Key Kimlik Doğrulama Middleware'i
 * 
 * Tüm /api/* route'larına uygulanan basit ama etkili kimlik doğrulama katmanı.
 * - `x-api-key` header veya `?api_key=` query parametresi ile doğrulama
 * - Geliştirme ortamında API_SECRET_KEY tanımlı değilse uyarı verir ama engel olmaz
 * - Production'da API_SECRET_KEY zorunludur
 * 
 * İleride JWT tabanlı kullanıcı kimlik doğrulamasına yükseltilebilir.
 */

import { Request, Response, NextFunction } from 'express';

// Kimlik doğrulama gerektirmeyen herkese açık endpoint'ler
const HERKESE_ACIK_ENDPOINTLER: string[] = [
  '/api/sistem-durum',
];

// Kimlik doğrulama gerektirmeyen HTTP metodları (CORS preflight)
const MUAF_METODLAR = new Set(['OPTIONS']);

/**
 * API Key doğrulama middleware'i oluşturur.
 * Environment'tan API_SECRET_KEY okur ve her istekte kontrol eder.
 */
export function apiKeyAuth() {
  const apiSecretKey = process.env.API_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!apiSecretKey) {
    if (isProduction) {
      console.error('⛔ KRİTİK: API_SECRET_KEY tanımlı değil! Production ortamında tüm API istekleri reddedilecek.');
    } else {
      console.warn('⚠️  UYARI: API_SECRET_KEY tanımlı değil. Geliştirme ortamında kimlik doğrulama atlanıyor.');
      console.warn('   Production\'a çıkmadan önce .env dosyasına API_SECRET_KEY ekleyin.');
    }
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    // OPTIONS (CORS preflight) isteklerini atla
    if (MUAF_METODLAR.has(req.method)) {
      next();
      return;
    }

    // Sadece /api/* route'larına uygula
    if (!req.path.startsWith('/api/')) {
      next();
      return;
    }

    // Herkese açık endpoint kontrolü
    if (HERKESE_ACIK_ENDPOINTLER.some(ep => req.path === ep || req.path.startsWith(ep + '/'))) {
      next();
      return;
    }

    // API key tanımlı değilse: production'da engelle, dev'de atla
    if (!apiSecretKey) {
      if (isProduction) {
        res.status(503).json({
          basarili: false,
          hata: 'Sunucu kimlik doğrulama yapılandırması eksik. Yönetici ile iletişime geçin.',
        });
        return;
      }
      // Development: atla
      next();
      return;
    }

    // İstekten API key'i çıkar
    const gonderilen = extractApiKey(req);

    if (!gonderilen) {
      res.status(401).json({
        basarili: false,
        hata: 'Kimlik doğrulama gerekli. İstek başlığına x-api-key ekleyin veya ?api_key= parametresi kullanın.',
      });
      return;
    }

    // Sabit zamanlı karşılaştırma (timing attack koruması)
    if (!timingSafeEqual(gonderilen, apiSecretKey)) {
      res.status(401).json({
        basarili: false,
        hata: 'Geçersiz API anahtarı. Lütfen doğru anahtarı kullanın.',
      });
      return;
    }

    next();
  };
}

/**
 * İstekten API key'i çıkaran yardımcı fonksiyon.
 * Öncelik: x-api-key header > Authorization Bearer > api_key query param
 */
function extractApiKey(req: Request): string | null {
  // 1. x-api-key header
  const headerKey = req.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  // 2. Authorization: Bearer <key>
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 3. Query parameter
  const queryKey = req.query.api_key;
  if (typeof queryKey === 'string' && queryKey.trim()) {
    return queryKey.trim();
  }

  return null;
}

/**
 * Sabit zamanlı string karşılaştırma (timing attack koruması).
 * Node.js crypto.timingSafeEqual kullanır.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Uzunluk farkı varsa yine de sabit zamanda kontrol et
    const dummyBuffer = Buffer.alloc(Math.max(a.length, b.length));
    const aBuffer = Buffer.from(a.padEnd(dummyBuffer.length));
    const bBuffer = Buffer.from(b.padEnd(dummyBuffer.length));
    try {
      const crypto = require('crypto');
      return crypto.timingSafeEqual(aBuffer, bBuffer) && a.length === b.length;
    } catch {
      return false;
    }
  }

  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Fallback: normal karşılaştırma (crypto mevcut değilse)
    return a === b;
  }
}
