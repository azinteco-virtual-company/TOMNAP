import { APP_URL } from '../config';
/**
 * Güvenlik Yardımcıları ve Input Sanitization
 *
 * Path traversal, SSRF, dosya adı manipülasyonu ve
 * diğer input tabanlı saldırılara karşı koruma fonksiyonları.
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import { URL } from 'url';
import { BlockList, isIP } from 'node:net';

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
  if (
    !dosyaYolu ||
    !izinliDizin ||
    typeof dosyaYolu !== 'string' ||
    typeof izinliDizin !== 'string'
  ) {
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
const blockedIpv4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedIpv4.addSubnet(address, prefix, 'ipv4');
}
const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');
const blockedIpv6 = new BlockList();
for (const [address, prefix] of [
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
] as const) {
  blockedIpv6.addSubnet(address, prefix, 'ipv6');
}

// Only globally routable addresses: also excludes mapped IPv4, link-local,
// loopback, multicast and translation/tunnel IPv6 ranges.
export function genelIpAdresiMi(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedIpv4.check(address, 'ipv4');
  if (family === 6) return globalIpv6.check(address, 'ipv6') && !blockedIpv6.check(address, 'ipv6');
  return false;
}

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
 * URL biçimini ve doğrudan IP adresini kontrol eder.
 * DNS ve redirect doğrulaması için indirmelerde fetchPublicResource kullanılmalıdır.
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

  if (parsed.username || parsed.password) {
    return { guvenli: false, sebep: 'URL içinde kullanıcı bilgisi desteklenmez.' };
  }

  // URL.hostname retains brackets around IPv6 literals. Check IP ranges only
  // for actual addresses; domain names beginning with fc/fd remain valid.
  const hostname = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (
    ENGELLI_HOSTLAR.has(hostname) ||
    hostname.endsWith('.localhost') ||
    (!isIP(hostname) && !hostname.includes('.'))
  ) {
    return { guvenli: false, sebep: `Engellenen sunucu adresi: ${hostname}` };
  }
  if (isIP(hostname) && !genelIpAdresiMi(hostname)) {
    return { guvenli: false, sebep: `Dahili/özel ağ adresleri engellenmiştir: ${hostname}` };
  }

  // Port kontrolü (standart dışı portları engelle)
  const port = parsed.port ? parseInt(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
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
export function allowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const configured = [
    process.env.APP_URL || APP_URL,
    ...(process.env.CORS_ORIGIN || '').split(','),
  ];
  for (const value of configured) {
    try {
      const url = new URL(value.trim());
      if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password)
        origins.add(url.origin);
    } catch {
      /* Wildcards and malformed origins grant no access. */
    }
  }
  return origins;
}

export function corsMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    res.vary('Origin');
    if (origin && allowedOrigins().has(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token, x-tenant-id');
      res.header('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(origin && !allowedOrigins().has(origin) ? 403 : 204).end();
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
