/**
 * Güvenlik Yardımcıları ve Input Sanitization
 * 
 * Path traversal, SSRF, dosya adı manipülasyonu ve 
 * diğer input tabanlı saldırılara karşı koruma fonksiyonları.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { URL } from 'url';

// ==============================
// DOSYA ADI SANİTASYONU
// ==============================

/**
 * Dosya adından tehlikeli karakterleri ve path traversal 
 * girişimlerini temizler.
 * 
 * @param dosyaAdi - Ham dosya adı
 * @returns Güvenli dosya adı
 */
export function sanitizeDosyaAdi(dosyaAdi: string): string {
  if (!dosyaAdi || typeof dosyaAdi !== 'string') {
    return `dosya_${Date.now()}`;
  }

  // Windows backslash'lerini Unix forward slash'e normalize et (cross-platform uyumluluk)
  const normalized = dosyaAdi.replace(/\\/g, '/');

  // path.posix.basename ile dizin bileşenlerini kaldır (../ ve ..\ saldırısı)
  let temiz = path.posix.basename(normalized);

  // Null byte'ları kaldır (null byte injection)
  temiz = temiz.replace(/\0/g, '');

  // Yalnızca güvenli karakterlere izin ver: harfler, rakamlar, alt çizgi, tire, nokta
  temiz = temiz.replace(/[^a-zA-Z0-9_.-]/g, '_');

  // Ardışık noktaları kaldır (..php, ...exe gibi uzantı gizleme)
  temiz = temiz.replace(/\.{2,}/g, '.');

  // Başındaki noktaları kaldır (gizli dosya oluşturma)
  temiz = temiz.replace(/^\.+/, '');

  // Boşsa fallback
  if (!temiz || temiz === '.') {
    temiz = `dosya_${Date.now()}`;
  }

  return temiz;
}

/**
 * Dosya yolunun belirtilen dizin içinde olduğunu doğrular.
 * Path traversal saldırılarına karşı son savunma hattı.
 * 
 * @param dosyaYolu - Kontrol edilecek tam yol
 * @param izinliDizin - İzin verilen kök dizin
 * @returns Yolun güvenli olup olmadığı
 */
export function yolGuvenlimi(dosyaYolu: string, izinliDizin: string): boolean {
  if (!dosyaYolu || !izinliDizin || typeof dosyaYolu !== 'string' || typeof izinliDizin !== 'string') {
    return false;
  }

  // Windows ve Unix yollarını cross-platform uyumluluk için normalize et
  const pNorm = dosyaYolu.replace(/\\/g, '/');
  const dNorm = izinliDizin.replace(/\\/g, '/');

  const normalizedPath = path.resolve(pNorm);
  const normalizedDir = path.resolve(dNorm);

  const sep = path.sep;
  const dirPrefix = normalizedDir.endsWith(sep) ? normalizedDir : normalizedDir + sep;

  return normalizedPath === normalizedDir || normalizedPath.startsWith(dirPrefix);
}

// ==============================
// SSRF (Server-Side Request Forgery) KORUMASI
// ==============================

/**
 * Özel/dahili IP aralıkları — SSRF koruması için engellenen adresler.
 * RFC 1918, RFC 3927, RFC 5737, RFC 6598 ve loopback aralıkları.
 */
const ENGELLI_IP_ARALIKLARI = [
  // IPv4 private aralıkları
  /^10\./,                        // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./,   // 172.16.0.0/12
  /^192\.168\./,                  // 192.168.0.0/16
  /^127\./,                       // 127.0.0.0/8 (loopback)
  /^169\.254\./,                  // 169.254.0.0/16 (link-local, AWS metadata)
  /^0\./,                         // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGNAT)
  /^192\.0\.0\./,                 // 192.0.0.0/24
  /^198\.1[89]\./,                // 198.18.0.0/15 (benchmark)
  /^240\./,                       // 240.0.0.0/4 (reserved)

  // IPv6 loopback ve private
  /^::1$/,
  /^fc/i,                         // fc00::/7 (unique local)
  /^fd/i,                         // fd00::/8
  /^fe80/i,                       // fe80::/10 (link-local)
];

/**
 * Engellenen hostname'ler — cloud metadata servislerine erişim engeli.
 */
const ENGELLI_HOSTLAR = new Set([
  'localhost',
  '0.0.0.0',
  'metadata.google.internal',
  'metadata.google',
  'metadata',
  'instance-data',
]);

/**
 * URL'nin güvenli olup olmadığını kontrol eder.
 * Private IP'ler, localhost ve cloud metadata servisleri engellenir.
 * 
 * @param url - Kontrol edilecek URL string'i
 * @returns { guvenli: boolean, sebep?: string }
 */
export function urlGuvenlimi(url: string): { guvenli: boolean; sebep?: string } {
  if (!url || typeof url !== 'string') {
    return { guvenli: false, sebep: 'Geçersiz URL' };
  }

  // Sadece http/https protokollerine izin ver
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { guvenli: false, sebep: 'Yalnızca http:// ve https:// protokolleri desteklenir.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { guvenli: false, sebep: 'Geçersiz URL formatı.' };
  }

  // Protokol kontrolü (tekrar)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { guvenli: false, sebep: `Desteklenmeyen protokol: ${parsed.protocol}` };
  }

  // Hostname kontrolü
  const hostname = parsed.hostname.toLowerCase();

  if (ENGELLI_HOSTLAR.has(hostname)) {
    return { guvenli: false, sebep: `Engellenen sunucu adresi: ${hostname}` };
  }

  // IP adresi kontrolü
  for (const pattern of ENGELLI_IP_ARALIKLARI) {
    if (pattern.test(hostname)) {
      return { guvenli: false, sebep: `Dahili/özel ağ adresleri engellenmiştir: ${hostname}` };
    }
  }

  // Port kontrolü (standart dışı portları engelle)
  const port = parsed.port ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);
  if (port !== 80 && port !== 443 && port !== 8080 && port !== 8443 && port !== 3000) {
    return { guvenli: false, sebep: `Standart dışı port engellenmiştir: ${port}` };
  }

  return { guvenli: true };
}

// ==============================
// CORS YAPILANDIRMASI
// ==============================

/**
 * Konfigüre edilebilir CORS middleware'i.
 * CORS_ORIGIN env variable'ından izin verilen origin'leri okur.
 */
export function corsMiddleware() {
  const corsOrigin = process.env.CORS_ORIGIN || '*';
  const izinliOriginler = corsOrigin === '*' ? null : corsOrigin.split(',').map(o => o.trim());

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;

    if (izinliOriginler === null) {
      // Geliştirme: hepsine izin ver (ama production'da CORS_ORIGIN ayarlanmalı)
      res.header('Access-Control-Allow-Origin', origin || '*');
    } else if (origin && izinliOriginler.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // Tarayıcı dışı istekler (curl, Postman vb.) — origin göndermez
      res.header('Access-Control-Allow-Origin', izinliOriginler[0] || '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // 24 saat preflight cache

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

// ==============================
// INPUT VALİDASYON YARDIMCILARI
// ==============================

/**
 * String input'u güvenli şekilde kırpar ve temizler.
 * XSS'e karşı temel HTML tag'lerini kaldırır.
 */
export function temizleMetin(deger: any, maxUzunluk: number = 5000): string {
  if (typeof deger !== 'string') return '';
  
  return deger
    .trim()
    .slice(0, maxUzunluk)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

/**
 * Sayısal değeri güvenli şekilde dönüştürür.
 */
export function temizleSayi(deger: any, varsayilan: number = 0): number {
  const sayi = Number(deger);
  if (isNaN(sayi) || !isFinite(sayi)) return varsayilan;
  return sayi;
}
