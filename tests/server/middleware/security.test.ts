import { describe, it, expect } from 'vitest';
import { sanitizeDosyaAdi, yolGuvenlimi, urlGuvenlimi } from '../../../src/server/middleware/security';

describe('Security Utilities', () => {
  describe('sanitizeDosyaAdi', () => {
    it('tehlikeli path traversal karakterlerini temizlemeli', () => {
      expect(sanitizeDosyaAdi('../../etc/passwd')).toBe('passwd');
      expect(sanitizeDosyaAdi('..\\..\\windows\\system32')).toBe('system32');
      expect(sanitizeDosyaAdi('normal-dosya.jpg')).toBe('normal-dosya.jpg');
    });

    it('boş girdi durumunda varsayılan dosya adı dönmeli', () => {
      expect(sanitizeDosyaAdi('')).toMatch(/^dosya_\d+$/);
      expect(sanitizeDosyaAdi(null as any)).toMatch(/^dosya_\d+$/);
    });

    it('geçersiz karakterleri alt çizgiye dönüştürmeli', () => {
      const sonuc = sanitizeDosyaAdi('test*?<file>.jpg');
      expect(sonuc).not.toContain('*');
      expect(sonuc).not.toContain('?');
      expect(sonuc).not.toContain('<');
      expect(sonuc).not.toContain('>');
    });
  });

  describe('yolGuvenlimi', () => {
    const anaDizinWin = 'D:\\Projects\\TOMNAP\\public\\uploads';
    const anaDizinPosix = '/var/app/public/uploads';

    it('ana dizin altındaki yolları onaylamalı', () => {
      // Windows stili yollar
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\public\\uploads\\resim.jpg', anaDizinWin)).toBe(true);
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\public\\uploads\\sub\\resim.jpg', anaDizinWin)).toBe(true);
      // POSIX stili yollar
      expect(yolGuvenlimi('/var/app/public/uploads/resim.jpg', anaDizinPosix)).toBe(true);
      expect(yolGuvenlimi('/var/app/public/uploads/sub/resim.jpg', anaDizinPosix)).toBe(true);
      // Dizin kendisi
      expect(yolGuvenlimi(anaDizinWin, anaDizinWin)).toBe(true);
      expect(yolGuvenlimi(anaDizinPosix, anaDizinPosix)).toBe(true);
    });

    it('ana dizin dışına taşan yolları engellemeli', () => {
      // Windows stili geçersiz yollar
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\server.ts', anaDizinWin)).toBe(false);
      expect(yolGuvenlimi('C:\\Windows\\System32', anaDizinWin)).toBe(false);
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\public\\uploads\\..\\server.ts', anaDizinWin)).toBe(false);
      // POSIX stili geçersiz yollar
      expect(yolGuvenlimi('/var/app/server.ts', anaDizinPosix)).toBe(false);
      expect(yolGuvenlimi('/etc/passwd', anaDizinPosix)).toBe(false);
      expect(yolGuvenlimi('/var/app/public/uploads/../../etc/passwd', anaDizinPosix)).toBe(false);
      // Boş veya geçersiz girdi
      expect(yolGuvenlimi('', anaDizinWin)).toBe(false);
      expect(yolGuvenlimi(null as any, anaDizinWin)).toBe(false);
    });
  });

  describe('urlGuvenlimi (SSRF Koruması)', () => {
    it('güvenli genel internet URL\'lerini kabul etmeli', () => {
      expect(urlGuvenlimi('https://images.unsplash.com/photo-123.jpg').guvenli).toBe(true);
      expect(urlGuvenlimi('https://m.media-amazon.com/images/I/71.jpg').guvenli).toBe(true);
    });

    it('localhost ve loopback adreslerini engellemeli', () => {
      expect(urlGuvenlimi('http://localhost/api').guvenli).toBe(false);
      expect(urlGuvenlimi('http://127.0.0.1:3000').guvenli).toBe(false);
    });

    it('özel yerel IP aralıklarını (private network) engellemeli', () => {
      expect(urlGuvenlimi('http://10.0.0.1/gizli').guvenli).toBe(false);
      expect(urlGuvenlimi('http://192.168.1.1/admin').guvenli).toBe(false);
      expect(urlGuvenlimi('http://172.16.0.1/data').guvenli).toBe(false);
    });

    it('AWS/Cloud metadata IP\'sini (169.254.169.254) engellemeli', () => {
      expect(urlGuvenlimi('http://169.254.169.254/latest/meta-data').guvenli).toBe(false);
    });

    it('http ve https dışındaki protokolleri engellemeli', () => {
      expect(urlGuvenlimi('file:///etc/passwd').guvenli).toBe(false);
      expect(urlGuvenlimi('ftp://example.com/file').guvenli).toBe(false);
    });
  });
});
