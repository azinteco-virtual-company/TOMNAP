import { describe, it, expect } from 'vitest';
import { sifreleMetin, cozMetin } from '../../../src/server/services/crypto';

describe('AES-256-GCM Kriptografi Servisi (crypto.ts)', () => {
  it('Metni başarıyla şifrelemeli ve enc: ön eki ile dönmeli', () => {
    const gizliMetin = 'SuperSecretCargoPassword123!#';
    const sifreli = sifreleMetin(gizliMetin);

    expect(sifreli).not.toBe(gizliMetin);
    expect(sifreli.startsWith('enc:')).toBe(true);
    // Format: enc:<iv>:<tag>:<ciphertext>
    const parts = sifreli.slice(4).split(':');
    expect(parts.length).toBe(3);
    expect(parts[0].length).toBe(24); // 12 bytes = 24 hex chars (IV)
    expect(parts[1].length).toBe(32); // 16 bytes = 32 hex chars (Auth tag)
  });

  it('Şifrelenmiş metni aslına kayıpsız ve hatasız çözmeli (Round-trip)', () => {
    const testCases = [
      'admin@123',
      'Aramex_Pin_9999',
      'Xüsusi Şifrə: Bakı-Toronto ✈️ 2026',
      'Complex symbols: !@#$%^&*()_+~`|}{[]:;?><,./-',
    ];

    for (const orjinal of testCases) {
      const sifreli = sifreleMetin(orjinal);
      const cozulen = cozMetin(sifreli);
      expect(cozulen).toBe(orjinal);
    }
  });

  it('Aynı metin şifrelendiğinde rastgele IV sayesinde farklı şifreli metinler üretmeli', () => {
    const metin = 'ayni_gizli_sifre';
    const sifreli1 = sifreleMetin(metin);
    const sifreli2 = sifreleMetin(metin);

    expect(sifreli1).not.toBe(sifreli2);
    expect(cozMetin(sifreli1)).toBe(metin);
    expect(cozMetin(sifreli2)).toBe(metin);
  });

  it('Zaten şifrelenmiş metni tekrar şifrelememeli (idempotent)', () => {
    const metin = 'gizli_parola';
    const sifreli = sifreleMetin(metin);
    const tekrarSifreli = sifreleMetin(sifreli);

    expect(tekrarSifreli).toBe(sifreli);
  });

  it('Düz metin veya geçersiz format verildiğinde cozMetin güvenli fallback yapmalı', () => {
    expect(cozMetin('duz_metin')).toBe('duz_metin');
    expect(cozMetin('')).toBe('');
    expect(cozMetin('enc:eksik_format')).toBe('enc:eksik_format');
    expect(cozMetin('enc:1234:5678:90ab')).toBe('enc:1234:5678:90ab'); // Bozuk hex/tag
  });

  it('Boş ve geçersiz tipleri zararsızca yönetmeli', () => {
    expect(sifreleMetin('')).toBe('');
    expect(sifreleMetin(null as unknown as string)).toBe('');
    expect(cozMetin(null as unknown as string)).toBe('');
  });
});

describe('Parola Heşləmə və Təsdiq (scrypt KDF & timingSafeEqual)', () => {
  it('Şifrəni scrypt formatında heşləməli və fərqli duz (salt) tətbiq etməli', async () => {
    const { sifreHashle } = await import('../../../src/server/services/crypto');
    const sifre = 'GucluParol2026!';
    const hash1 = sifreHashle(sifre);
    const hash2 = sifreHashle(sifre);

    expect(hash1.startsWith('scrypt:')).toBe(true);
    expect(hash2.startsWith('scrypt:')).toBe(true);
    // Hər dəfə təsadüfi duz (salt) istifadə olunduğu üçün heşlər fərqli olmalıdır
    expect(hash1).not.toBe(hash2);
  });

  it('Düzgün şifrə ilə doğrulanmalı, yanlış şifrə ilə rədd edilməlidir', async () => {
    const { sifreHashle, sifreDogrula } = await import('../../../src/server/services/crypto');
    const sifre = 'GizliButikParolu@99';
    const hash = sifreHashle(sifre);

    expect(sifreDogrula(sifre, hash)).toBe(true);
    expect(sifreDogrula('YanlisParol123', hash)).toBe(false);
    expect(sifreDogrula('', hash)).toBe(false);
    expect(sifreDogrula(sifre, 'kecersiz:format')).toBe(false);
  });

  it('tokenUret unikal və təhlükəsiz hex token generasiya etməlidir', async () => {
    const { tokenUret } = await import('../../../src/server/services/crypto');
    const token1 = tokenUret(32);
    const token2 = tokenUret(32);

    expect(token1.length).toBe(64); // 32 bayt = 64 hex simvol
    expect(token2.length).toBe(64);
    expect(token1).not.toBe(token2);
  });
});
