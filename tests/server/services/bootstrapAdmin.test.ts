import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { bootstrapAdmin } from '../../../scripts/bootstrap-admin';
import { FIRMALAR_DOSYA_YOLU, KULLANICILAR_DOSYA_YOLU } from '../../../src/server/config';
import { sifreDogrula } from '../../../src/server/services/crypto';

const options = {
  email: 'admin@example.test',
  password: 'Operator supplied password!',
  tenantId: 'existing-company',
};
beforeEach(() => {
  fs.rmSync(KULLANICILAR_DOSYA_YOLU, { force: true });
  fs.writeFileSync(
    FIRMALAR_DOSYA_YOLU,
    JSON.stringify([{ id: options.tenantId, ad: 'Existing company' }])
  );
});

describe('Explicit first administrator bootstrap', () => {
  it('creates a real active account using only a salted password hash', async () => {
    const created = await bootstrapAdmin({
      ...options,
      email: 'Admin@Example.Test',
      name: 'Operator Name',
    });
    const serialized = fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8');
    const [stored] = JSON.parse(serialized);
    expect(stored).toMatchObject({
      id: created.id,
      email: options.email,
      tenant_id: options.tenantId,
      ad_soyad: 'Operator Name',
      rol: 'SUPER_ADMIN',
      durum: 'AKTIF',
    });
    expect(sifreDogrula(options.password, stored.sifre_hash)).toBe(true);
    expect(serialized).not.toContain(options.password);
    expect(fs.statSync(KULLANICILAR_DOSYA_YOLU).mode & 0o777).toBe(0o600);
  });

  it.each([
    { email: '' },
    { email: 'invalid' },
    { password: '' },
    { password: 'short' },
    { tenantId: '' },
    { tenantId: 'all' },
    { tenantId: 'missing-company' },
  ])('refuses invalid or missing configuration without creating a file: %j', async (changes) => {
    await expect(bootstrapAdmin({ ...options, ...changes })).rejects.toThrow();
    expect(fs.existsSync(KULLANICILAR_DOSYA_YOLU)).toBe(false);
  });

  it('refuses subsequent execution without overwriting the existing account', async () => {
    await bootstrapAdmin(options);
    const before = fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8');
    await expect(bootstrapAdmin({ ...options, email: 'another@example.test' })).rejects.toThrow(
      'already exists'
    );
    expect(fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8')).toBe(before);
  });

  it('never promotes an existing account with the same email', async () => {
    const before = JSON.stringify([
      { id: 'existing-user', email: 'ADMIN@example.test', rol: 'PATRON' },
    ]);
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, before);
    await expect(bootstrapAdmin(options)).rejects.toThrow('already belongs');
    expect(fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8')).toBe(before);
  });

  it('preserves invalid account data rather than treating it as an empty database', async () => {
    fs.writeFileSync(KULLANICILAR_DOSYA_YOLU, '{malformed');
    await expect(bootstrapAdmin(options)).rejects.toThrow();
    expect(fs.readFileSync(KULLANICILAR_DOSYA_YOLU, 'utf8')).toBe('{malformed');
  });
});
