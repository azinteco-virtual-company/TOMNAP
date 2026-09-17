import fs from 'node:fs';
import crypto from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';
import {
  CARGO_SETTINGS_FILE,
  decodeSettings,
  defaultSettings,
  mergeSettings,
} from '../../../src/server/services/kargo/settings';
import { migrateCargoSnapshot } from '../../../scripts/lib/migrateCargo';
const service = new KargoMerkezi();
const credentials = {
  entity: 'synthetic-entity',
  kullaniciAdi: 'synthetic-user',
  hesapNo: 'synthetic-account',
  sifre: 'synthetic-password',
  pin: 'synthetic-pin',
  apiKey: 'synthetic-key',
  apiSecret: 'synthetic-secret',
  testModu: true,
};
beforeEach(() => fs.rmSync(CARGO_SETTINGS_FILE, { force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe('Cargo credentials and revisions', () => {
  it('encrypts every credential at rest, masks four secrets and preserves masks on save/test', async () => {
    const first = await service.kaydetAyarlar({
      tenantId: 'cargo-a',
      revision: 0,
      kimlikBilgileri: credentials,
    });
    const raw = fs.readFileSync(CARGO_SETTINGS_FILE, 'utf8');
    for (const value of Object.values(credentials))
      if (typeof value === 'string') expect(raw).not.toContain(value);
    const masked = service.maskeleAyarlar(first);
    for (const field of ['sifre', 'pin', 'apiKey', 'apiSecret']) {
      expect(masked.kimlikBilgileri[field]).toBe('••••••••');
      expect(masked.kimlikBilgileri[field + 'Tanimli']).toBe(true);
    }
    const { sifreTanimli, pinTanimli, apiKeyTanimli, apiSecretTanimli, ...edited } =
      masked.kimlikBilgileri;
    expect(mergeSettings(first, { kimlikBilgileri: edited }).kimlikBilgileri).toEqual(credentials);
    const second = await service.kaydetAyarlar({
      tenantId: 'cargo-a',
      revision: 1,
      kimlikBilgileri: edited,
    });
    expect(second.kimlikBilgileri).toEqual(credentials);
    expect(second.revision).toBe(2);
  });
  it('prevents missing/stale revisions and concurrent local overwrites', async () => {
    await expect(service.kaydetAyarlar({ tenantId: 'cargo-a' })).rejects.toMatchObject({
      status: 400,
    });
    const results = await Promise.allSettled([
      service.kaydetAyarlar({ tenantId: 'cargo-a', revision: 0, aktif: false }),
      service.kaydetAyarlar({ tenantId: 'cargo-a', revision: 0, aktif: true }),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason.status
    ).toBe(409);
    expect((await service.getAyarlar('cargo-a')).aktif).toBe(false);
  });
  it('does not carry credentials across providers or accept unknown credential fields', async () => {
    const first = await service.kaydetAyarlar({
      tenantId: 'cargo-a',
      revision: 0,
      kimlikBilgileri: credentials,
    });
    const next = mergeSettings(first, {
      saglayici: 'DHL',
      kimlikBilgileri: { sifre: '••••••••', testModu: true },
    });
    expect(next.kimlikBilgileri.sifre).toBe('');
    expect(next.kimlikBilgileri.hesapNo).toBeUndefined();
    expect(() =>
      mergeSettings(first, { kimlikBilgileri: { testModu: true, other: 'secret' } as any })
    ).toThrow();
    expect(() => service.getProvider('FEDEX')).toThrow('desteklenmiyor');
  });
  it('does not alter committed data on a missing key or unreadable legacy file', async () => {
    await service.kaydetAyarlar({ tenantId: 'cargo-a', revision: 0, kimlikBilgileri: credentials });
    const original = fs.readFileSync(CARGO_SETTINGS_FILE, 'utf8');
    vi.stubEnv('CARGO_ENCRYPTION_KEYS', '');
    await expect(service.getAyarlar('cargo-a')).rejects.toMatchObject({ status: 503 });
    await expect(service.kaydetAyarlar({ tenantId: 'cargo-a', revision: 1 })).rejects.toMatchObject(
      { status: 503 }
    );
    expect(fs.readFileSync(CARGO_SETTINGS_FILE, 'utf8')).toBe(original);
    fs.writeFileSync(
      CARGO_SETTINGS_FILE,
      JSON.stringify([{ ...defaultSettings('cargo-a'), kimlikBilgileri: credentials }])
    );
    await expect(service.getAyarlar('cargo-a')).rejects.toThrow('geçişi gerekli');
  });
});
function oldEnvelope(secret: string, key: string) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv(
      'aes-256-gcm',
      crypto.createHash('sha256').update(key).digest(),
      iv
    );
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
}
describe('Explicit offline migration', () => {
  it('requires explicit plaintext approval and retains all supported credentials', () => {
    const legacy = [{ ...defaultSettings('cargo-a'), kimlikBilgileri: credentials }];
    const before = JSON.stringify(legacy);
    expect(() => migrateCargoSnapshot(legacy)).toThrow('allow-plaintext');
    const next = migrateCargoSnapshot(legacy, { allowPlaintext: true });
    expect(decodeSettings(next.records[0]).kimlikBilgileri).toEqual(credentials);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(JSON.stringify(next)).not.toContain('synthetic-');
  });
  it('validates the old key and all rows before returning a new snapshot', () => {
    const legacy = [
      {
        ...defaultSettings('cargo-a'),
        kimlikBilgileri: { ...credentials, sifre: oldEnvelope('real-fixture', 'old-fixture-key') },
      },
    ];
    expect(() => migrateCargoSnapshot(legacy, { allowPlaintext: true })).toThrow(
      'Explicit legacy key'
    );
    expect(() =>
      migrateCargoSnapshot(legacy, { allowPlaintext: true, legacySecret: 'wrong' })
    ).toThrow('decryption failed');
    const next = migrateCargoSnapshot(legacy, {
      allowPlaintext: true,
      legacySecret: 'old-fixture-key',
    });
    expect(decodeSettings(next.records[0]).kimlikBilgileri.sifre).toBe('real-fixture');
    expect(() =>
      migrateCargoSnapshot([...legacy, ...legacy], {
        allowPlaintext: true,
        legacySecret: 'old-fixture-key',
      })
    ).toThrow('duplicate');
  });
  it('rotates versioned records and binds the result to its original tenant', () => {
    const current = migrateCargoSnapshot(
      [{ ...defaultSettings('cargo-a'), kimlikBilgileri: credentials }],
      { allowPlaintext: true }
    );
    vi.stubEnv(
      'CARGO_ENCRYPTION_KEYS',
      JSON.stringify({ test: 'a1'.repeat(32), next: 'b2'.repeat(32) })
    );
    vi.stubEnv('CARGO_ENCRYPTION_ACTIVE_KEY_ID', 'next');
    const rotated = migrateCargoSnapshot(current);
    expect(rotated.records[0].revision).toBe(2);
    expect(rotated.records[0].encrypted_credentials).toMatch(/^enc:v2:next:/);
    expect(() => decodeSettings({ ...rotated.records[0], tenant_id: 'cargo-b' })).toThrow();
    expect(decodeSettings(rotated.records[0]).kimlikBilgileri).toEqual(credentials);
  });
});
