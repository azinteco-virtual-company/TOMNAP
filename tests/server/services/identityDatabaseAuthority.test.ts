import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const backend = vi.hoisted(() => ({ db: null as any }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return backend.db;
  },
}));
const dataDirectory = process.env.DATA_DIR!;
const identityFile = path.join(dataDirectory, 'identity.json');
const options = {
  email: 'admin@example.invalid',
  password: 'Synthetic operator password',
  tenantId: 'synthetic-company',
};
beforeEach(() => {
  vi.resetModules();
  backend.db = null;
  for (const name of ['identity.json', 'firmalar.json', 'kullanicilar.json'])
    fs.writeFileSync(path.join(dataDirectory, name), '{invalid local data');
});
afterEach(() => vi.unstubAllEnvs());

describe('database identity authority', () => {
  it.each([
    ['production', ''],
    ['development', 'https://example.invalid'],
  ])('does not load stale local identities in %s with database URL %s', async (mode, url) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.stubEnv('SUPABASE_URL', url);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', url ? 'synthetic-service-role-key' : '');
    const state = await import('../../../src/server/services/state');
    expect(state.getIdentitySnapshot()).toEqual({
      companies: [],
      users: [],
      invites: [],
      emailJobs: [],
    });
    const { bootstrapAdmin } = await import('../../../scripts/bootstrap-admin');
    await expect(bootstrapAdmin(options)).rejects.toThrow('service-role database connection');
    expect(fs.readFileSync(identityFile, 'utf8')).toBe('{invalid local data');
  });

  it('never falls back to a local identity write after a configured DB lookup fails', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic-service-role-key');
    const builder: any = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ error: { message: 'Synthetic outage' } }),
    };
    backend.db = { from: vi.fn(() => builder) };
    const { bootstrapAdmin } = await import('../../../scripts/bootstrap-admin');
    await expect(bootstrapAdmin(options)).rejects.toThrow('Administrator lookup failed');
    expect(fs.readFileSync(identityFile, 'utf8')).toBe('{invalid local data');
  });
});
