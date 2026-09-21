import { beforeEach, describe, it, expect, vi } from 'vitest';
const db = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../../../src/server/services/supabase', () => ({ supabase: db }));
import {
  loadCargoSettings,
  saveCargoSettings,
  defaultSettings,
  encodeSettings,
} from '../../../src/server/services/kargo/settings';
function mockRead(data: any = null, error: any = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  db.from.mockReturnValue(chain);
  return chain;
}
beforeEach(() => vi.resetAllMocks());
describe('Authoritative cargo settings database', () => {
  it('scopes reads to one tenant and uses blank settings only for a confirmed missing row', async () => {
    const chain = mockRead();
    expect((await loadCargoSettings('tenant-a')).revision).toBe(0);
    expect(db.from).toHaveBeenCalledWith('cargo_settings');
    expect(chain.eq).toHaveBeenCalledWith('tenant_id', 'tenant-a');
    mockRead(null, { message: 'outage' });
    await expect(loadCargoSettings('tenant-a')).rejects.toMatchObject({ status: 503 });
  });
  it('uses one atomic revision RPC and rejects stale/failed commits', async () => {
    mockRead();
    db.rpc.mockResolvedValue({ error: { code: '40001' } });
    await expect(saveCargoSettings({ tenantId: 'tenant-a', revision: 0 })).rejects.toMatchObject({
      status: 409,
    });
    db.rpc.mockResolvedValue({ error: { code: 'XX000' } });
    await expect(saveCargoSettings({ tenantId: 'tenant-a', revision: 0 })).rejects.toMatchObject({
      status: 503,
    });
    db.rpc.mockImplementation(async (_name, { p_record }) => ({ data: p_record, error: null }));
    const result = await saveCargoSettings({
      tenantId: 'tenant-a',
      revision: 0,
      kimlikBilgileri: { apiKey: 'synthetic-secret', testModu: true },
    });
    expect(result.revision).toBe(1);
    expect(result.kimlikBilgileri.apiKey).toBe('synthetic-secret');
    const args = db.rpc.mock.lastCall![1];
    expect(args.p_expected_revision).toBe(0);
    expect(JSON.stringify(args)).not.toContain('synthetic-secret');
  });
  it('refuses ciphertext stored under another tenant even when DB read succeeds', async () => {
    const row = encodeSettings({ ...defaultSettings('tenant-b'), revision: 1 });
    row.tenant_id = 'tenant-a';
    mockRead(row);
    await expect(loadCargoSettings('tenant-a')).rejects.toMatchObject({ status: 503 });
  });
});
