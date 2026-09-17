import { afterEach, describe, it, expect, vi } from 'vitest';
import { sifreleMetin, cozMetin, EncryptionError } from '../../../src/server/services/crypto';
const context = { tenantId: 'tenant-a', provider: 'ARAMEX' };
afterEach(() => vi.unstubAllEnvs());
describe('Authenticated versioned credential envelopes', () => {
  it('round-trips Unicode, empty text and enc-prefixed literal secrets without passthrough', () => {
    for (const text of ['', 'Xüsusi Şifrə Bakı ✈️', 'enc:literal-secret']) {
      const encoded = sifreleMetin(text, context);
      expect(encoded).toMatch(/^enc:v2:test:/);
      expect(encoded).not.toBe(text);
      expect(cozMetin(encoded, context)).toBe(text);
      expect(sifreleMetin(text, context)).not.toBe(encoded);
    }
  });
  it('rejects changed tenant, provider, tag and truncated ciphertext', () => {
    const encoded = sifreleMetin('synthetic-secret', context);
    expect(() => cozMetin(encoded, { ...context, tenantId: 'tenant-b' })).toThrow(EncryptionError);
    expect(() => cozMetin(encoded, { ...context, provider: 'DHL' })).toThrow(EncryptionError);
    const pieces = encoded.split(':');
    pieces[4] = '00'.repeat(16);
    expect(() => cozMetin(pieces.join(':'), context)).toThrow(EncryptionError);
    expect(() => cozMetin(encoded.slice(0, -2), context)).toThrow(EncryptionError);
  });
  it.each(['plaintext', '', 'enc:invalid', 'enc:1234:5678:90ab'])(
    'never returns unverified input: %s',
    (value) => {
      expect(() => cozMetin(value, context)).toThrow(EncryptionError);
    }
  );
  it.each(['', 'null', '{}', '{"test":"short"}', '[]'])(
    'fails closed when keyring is absent or invalid: %s',
    (keys) => {
      vi.stubEnv('CARGO_ENCRYPTION_KEYS', keys);
      expect(() => sifreleMetin('secret', context)).toThrow(EncryptionError);
    }
  );
  it('supports explicit rotation, requiring the old key until records are rewrapped', () => {
    const old = sifreleMetin('synthetic-secret', context);
    vi.stubEnv(
      'CARGO_ENCRYPTION_KEYS',
      JSON.stringify({ test: 'a1'.repeat(32), next: 'b2'.repeat(32) })
    );
    vi.stubEnv('CARGO_ENCRYPTION_ACTIVE_KEY_ID', 'next');
    const rotated = sifreleMetin(cozMetin(old, context), context);
    expect(rotated).toMatch(/^enc:v2:next:/);
    vi.stubEnv('CARGO_ENCRYPTION_KEYS', JSON.stringify({ next: 'b2'.repeat(32) }));
    expect(cozMetin(rotated, context)).toBe('synthetic-secret');
    expect(() => cozMetin(old, context)).toThrow(EncryptionError);
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
