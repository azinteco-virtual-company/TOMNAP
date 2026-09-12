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
    const anaDizin = 'D:\\Projects\\TOMNAP\\public\\uploads';

    it('ana dizin altındaki yolları onaylamalı', () => {
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\public\\uploads\\resim.jpg', anaDizin)).toBe(true);
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\public\\uploads\\sub\\resim.jpg', anaDizin)).toBe(true);
    });

    it('ana dizin dışına taşan yolları engellemeli', () => {
      expect(yolGuvenlimi('D:\\Projects\\TOMNAP\\server.ts', anaDizin)).toBe(false);
      expect(yolGuvenlimi('C:\\Windows\\System32', anaDizin)).toBe(false);
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
