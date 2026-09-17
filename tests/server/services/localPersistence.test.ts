import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_DIR, FIRMALAR_DOSYA_YOLU, KULLANICILAR_DOSYA_YOLU } from '../../../src/server/config';
import {
  JsonStorageError,
  readJsonFile,
  writeJsonAtomic,
} from '../../../src/server/services/atomicJson';
import * as state from '../../../src/server/services/state';
import { KargoMerkezi } from '../../../src/server/services/kargo/kargoMerkezi';

const genericFile = path.join(DATA_DIR, 'atomic-fixture.json');
const cargoFile = path.join(DATA_DIR, 'kargo_ayarlari.json');
const company = () => ({
  id: 'fixture-company',
  ad: 'Fixture Company',
  sehir: 'Bakı',
  varsayilanParaBirimi: 'AZN' as const,
  varsayilanKomisyonYuzdesi: 15,
  aciklama: '',
  onayDurumu: 'AKTIF' as const,
});
const user = () => ({
  id: 'fixture-user',
  tenant_id: company().id,
  ad_soyad: 'Fixture User',
  email: 'user@example.invalid',
  rol: 'PATRON' as const,
  durum: 'AKTIF' as const,
  olusturma_tarihi: '2026-01-01T00:00:00Z',
});
const invite = () => ({
  token: 'fixture-token',
  tenantId: company().id,
  tenantAd: company().ad,
  rol: 'BAKU_FINANS',
  olusturanKisi: 'Fixture Owner',
  olusturmaTarihi: '2026-01-01T00:00:00Z',
  gecerlilikTarihi: '2026-01-08T00:00:00Z',
  kullanildiMi: false,
});
const snapshot = (): state.IdentitySnapshot => ({
  companies: [company()],
  users: [user()],
  invites: [invite()],
  emailJobs: [{ id: 'email-job-1', status: 'PENDING', to: 'user@example.invalid' }],
});
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const denied = () => Object.assign(new Error('simulated filesystem failure'), { code: 'EACCES' });

beforeEach(() => {
  vi.restoreAllMocks();
  state.saveIdentitySnapshot({ companies: [], users: [], invites: [], emailJobs: [] });
  for (const filename of [
    genericFile,
    cargoFile,
    state.IDENTITY_DOSYA_YOLU,
    FIRMALAR_DOSYA_YOLU,
    KULLANICILAR_DOSYA_YOLU,
  ])
    fs.rmSync(filename, { force: true });
});

describe('atomic JSON primitives', () => {
  it('allows a missing file and a valid empty list, but rejects malformed or wrongly shaped data', () => {
    expect(readJsonFile(genericFile, isArray)).toBeUndefined();
    fs.writeFileSync(genericFile, '[]');
    expect(readJsonFile(genericFile, isArray)).toEqual([]);
    for (const invalid of ['{broken', '{}', 'null', '']) {
      fs.writeFileSync(genericFile, invalid);
      expect(() => readJsonFile(genericFile, isArray)).toThrow(JsonStorageError);
      expect(fs.readFileSync(genericFile, 'utf8')).toBe(invalid);
    }
  });

  it('propagates permission/read errors instead of returning an empty initialization', () => {
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw denied();
    });
    expect(() => readJsonFile(genericFile, isArray)).toThrow(JsonStorageError);
  });

  it('replaces existing files atomically with restrictive permissions', () => {
    fs.writeFileSync(genericFile, '["before"]', { mode: 0o644 });
    writeJsonAtomic(genericFile, ['after']);
    expect(readJsonFile(genericFile, isArray)).toEqual(['after']);
    expect(fs.statSync(genericFile).mode & 0o777).toBe(0o600);
    expect(fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });

  it.each(['writeFileSync', 'fsyncSync', 'renameSync'] as const)(
    'preserves the old committed file if %s fails',
    (method) => {
      fs.writeFileSync(genericFile, '["before"]');
      const spy = vi.spyOn(fs, method).mockImplementationOnce((() => {
        throw denied();
      }) as any);
      expect(() => writeJsonAtomic(genericFile, ['after'])).toThrow(JsonStorageError);
      spy.mockRestore();
      expect(fs.readFileSync(genericFile, 'utf8')).toBe('["before"]');
      expect(fs.readdirSync(DATA_DIR).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    }
  );
});

describe('coherent local identity snapshots', () => {
  it('preserves valid empty legacy files without recreating default companies', () => {
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, '[]');
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, '[]');
    expect(state.loadIdentitySnapshot()).toEqual({
      companies: [],
      users: [],
      invites: [],
      emailJobs: [],
    });
  });

  it.each([FIRMALAR_DOSYA_YOLU, KULLANICILAR_DOSYA_YOLU])(
    'fails closed on invalid legacy identity data: %s',
    (filename) => {
      fs.writeFileSync(filename, '{malformed');
      expect(() => state.loadIdentitySnapshot()).toThrow(JsonStorageError);
      expect(fs.readFileSync(filename, 'utf8')).toBe('{malformed');
      expect(fs.existsSync(state.IDENTITY_DOSYA_YOLU)).toBe(false);
    }
  );

  it('imports legacy arrays together, then ignores legacy files after the first commit', () => {
    const originalCompanies = JSON.stringify([company()]);
    const originalUsers = JSON.stringify([user()]);
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, originalCompanies);
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, originalUsers);
    const imported = state.loadIdentitySnapshot();
    state.saveIdentitySnapshot({
      ...imported,
      invites: [invite()],
      emailJobs: [{ id: 'job-1', status: 'PENDING' }],
    });
    expect(fs.readFileSync(FIRMALAR_DOSYA_YOLU, 'utf8')).toBe(originalCompanies);
    expect(fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8')).toBe(originalUsers);
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, '{stale legacy data');
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, '{stale legacy data');
    expect(state.loadIdentitySnapshot().invites).toEqual([invite()]);
    expect(state.loadIdentitySnapshot().emailJobs).toEqual([{ id: 'job-1', status: 'PENDING' }]);
    expect(fs.statSync(state.IDENTITY_DOSYA_YOLU).mode & 0o777).toBe(0o600);
  });

  it('does not fall back to legacy files if the authoritative snapshot is corrupt', () => {
    fs.writeFileSync(FIRMALAR_DOSYA_YOLU, JSON.stringify([company()]));
    fs.writeFileSync(state.IDENTITY_DOSYA_YOLU, '{invalid');
    expect(() => state.loadIdentitySnapshot()).toThrow(JsonStorageError);
    expect(fs.readFileSync(state.IDENTITY_DOSYA_YOLU, 'utf8')).toBe('{invalid');
  });

  it('publishes all four collections only after the single rename succeeds', () => {
    state.saveIdentitySnapshot(snapshot());
    const previousDisk = fs.readFileSync(state.IDENTITY_DOSYA_YOLU, 'utf8');
    const previousMemory = state.getIdentitySnapshot();
    const next = state.getIdentitySnapshot();
    next.companies[0].ad = 'Changed';
    next.users[0].ad_soyad = 'Changed';
    next.invites[0].kullanildiMi = true;
    next.emailJobs[0].status = 'SENT';
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw denied();
    });
    expect(() => state.saveIdentitySnapshot(next)).toThrow(JsonStorageError);
    rename.mockRestore();
    expect(fs.readFileSync(state.IDENTITY_DOSYA_YOLU, 'utf8')).toBe(previousDisk);
    expect(state.getIdentitySnapshot()).toEqual(previousMemory);
    state.saveIdentitySnapshot(next);
    expect(state.getIdentitySnapshot()).toEqual(next);
    expect(state.loadIdentitySnapshot()).toEqual(next);
    next.users[0].ad_soyad = 'Caller mutation';
    expect(state.getIdentitySnapshot().users[0].ad_soyad).toBe('Changed');
  });

  it('retains invitations and queued mail when a compatibility save updates one collection', () => {
    state.saveIdentitySnapshot(snapshot());
    state.firmalariKaydetDosyaya([{ ...company(), ad: 'Renamed' }]);
    state.kullanicilariKaydetDosyaya([{ ...user(), ad_soyad: 'Updated' }]);
    const stored = state.loadIdentitySnapshot();
    expect(stored.companies[0].ad).toBe('Renamed');
    expect(stored.users[0].ad_soyad).toBe('Updated');
    expect(stored.invites).toEqual([invite()]);
    expect(stored.emailJobs).toEqual(snapshot().emailJobs);
    expect(fs.existsSync(FIRMALAR_DOSYA_YOLU)).toBe(false);
    expect(fs.existsSync(KULLANICILAR_DOSYA_YOLU)).toBe(false);
  });

  it('rejects duplicate identities without modifying disk or memory', () => {
    state.saveIdentitySnapshot(snapshot());
    const before = state.getIdentitySnapshot();
    expect(() => state.saveIdentitySnapshot({ ...before, users: [user(), user()] })).toThrow(
      JsonStorageError
    );
    expect(state.loadIdentitySnapshot()).toEqual(before);
    expect(state.getIdentitySnapshot()).toEqual(before);
  });
});

describe('cargo settings commit semantics', () => {
  it('does not write defaults on load, and preserves a stored empty list', () => {
    new KargoMerkezi();
    expect(fs.existsSync(cargoFile)).toBe(false);
    fs.writeFileSync(cargoFile, '[]');
    const service = new KargoMerkezi();
    expect(service.getAyarlar('tenant-empty').kimlikBilgileri.sifre).toBe('');
    expect(fs.readFileSync(cargoFile, 'utf8')).toBe('[]');
  });

  it('rejects malformed settings and unreadable files without silently restoring defaults', () => {
    fs.writeFileSync(cargoFile, '{bad-settings');
    expect(() => new KargoMerkezi()).toThrow(JsonStorageError);
    fs.writeFileSync(cargoFile, '[]');
    vi.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
      throw denied();
    });
    expect(() => new KargoMerkezi()).toThrow(JsonStorageError);
  });

  it('does not publish changed provider settings after a failed disk commit', () => {
    const service = new KargoMerkezi();
    service.kaydetAyarlar({ tenantId: 'cargo-tenant', aktif: false });
    const before = service.getAyarlar('cargo-tenant');
    const previousDisk = fs.readFileSync(cargoFile, 'utf8');
    const rename = vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
      throw denied();
    });
    expect(() =>
      service.kaydetAyarlar({ tenantId: 'cargo-tenant', aktif: true, saglayici: 'DHL' })
    ).toThrow(JsonStorageError);
    rename.mockRestore();
    expect(service.getAyarlar('cargo-tenant')).toEqual(before);
    expect(new KargoMerkezi().getAyarlar('cargo-tenant')).toEqual(before);
    expect(fs.readFileSync(cargoFile, 'utf8')).toBe(previousDisk);
  });

  it('persists encrypted credentials with mode 0600 and returns detached settings', () => {
    const service = new KargoMerkezi();
    const saved = service.kaydetAyarlar({
      tenantId: 'cargo-tenant',
      kimlikBilgileri: { sifre: 'synthetic-secret', pin: 'synthetic-pin', testModu: true },
    });
    const serialized = fs.readFileSync(cargoFile, 'utf8');
    expect(serialized).not.toContain('synthetic-secret');
    expect(serialized).not.toContain('synthetic-pin');
    expect(fs.statSync(cargoFile).mode & 0o777).toBe(0o600);
    expect(new KargoMerkezi().getAyarlar('cargo-tenant').kimlikBilgileri.sifre).toBe(
      'synthetic-secret'
    );
    saved.kimlikBilgileri.sifre = 'Caller change';
    expect(service.getAyarlar('cargo-tenant').kimlikBilgileri.sifre).toBe('synthetic-secret');
  });
});
