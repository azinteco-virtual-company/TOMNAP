/**
 * Rate Limiting Middleware
 * 
 * IP bazlı istek sınırlama — DDoS ve kota aşımını önler.
 * Farklı endpoint grupları için farklı limitler uygulanır.
 */

import rateLimit from 'express-rate-limit';

/**
 * Genel API rate limiter.
 * Tüm /api/* endpoint'lerine uygulanır.
 * 
 * Limit: 15 dakikada 150 istek / IP
 */
export const genelApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: 'Bu IP adresinden çok fazla istek gönderildi. Lütfen 15 dakika sonra tekrar deneyin.',
  },
});

/**
 * AI endpoint'leri için sıkı rate limiter.
 * Gemini API çağrıları pahalıdır, kota koruması gerekir.
 * 
 * Limit: 1 dakikada 10 istek / IP
 */
export const aiEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: 'Yapay zeka işlem kotası aşıldı. Lütfen 1 dakika sonra tekrar deneyin.',
  },
});

/**
 * Veritabanı yönetim endpoint'leri için çok sıkı rate limiter.
 * Temizleme ve toplu silme gibi tehlikeli operasyonları korur.
 * 
 * Limit: 1 dakikada 3 istek / IP
 */
export const veritabaniYonetimLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: {
    basarili: false,
    hata: 'Veritabanı yönetim işlem limiti aşıldı. Lütfen biraz bekleyin.',
  },
});
