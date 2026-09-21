import { webcrypto } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../src/lib/apiClient', () => ({ apiFetch }));
import { runOrderMaintenance } from '../src/lib/orderMaintenance';
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  apiFetch.mockReset();
});
const body = {
  tenant_id: 'tenant-a',
  siparisler: [{ id: 'private-order', musteri_adi: 'Private customer' }],
  temizleVeYukle: true,
};
describe('maintenance request retry identity', () => {
  it('retains one request ID across a lost response and clears it after confirmed success', async () => {
    apiFetch
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValueOnce({ json: async () => ({ basarili: true, tekrar: true }) });
    await expect(runOrderMaintenance('yedek-yukle', body)).rejects.toThrow('response lost');
    const first = JSON.parse(apiFetch.mock.calls[0][1].body).islem_id;
    expect(storage.size).toBe(1);
    expect(JSON.stringify([...storage])).not.toContain('Private');
    await runOrderMaintenance('yedek-yukle', body);
    expect(JSON.parse(apiFetch.mock.calls[1][1].body).islem_id).toBe(first);
    expect(storage.size).toBe(0);
  });
  it('uses different keys for changed scopes or payloads', async () => {
    apiFetch.mockRejectedValue(new Error('offline'));
    for (const payload of [
      body,
      { ...body, tenant_id: 'tenant-b' },
      { ...body, temizleVeYukle: false },
    ])
      await expect(runOrderMaintenance('yedek-yukle', payload)).rejects.toThrow();
    expect(new Set(apiFetch.mock.calls.map((c) => JSON.parse(c[1].body).islem_id)).size).toBe(3);
  });
  it('sends no destructive request when retry identity cannot be stored', async () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('unavailable');
      },
    });
    await expect(runOrderMaintenance('yedek-yukle', body)).rejects.toThrow('unavailable');
    expect(apiFetch).not.toHaveBeenCalled();
  });
  it('keeps receipt identity if a successful HTTP response body is lost', async () => {
    apiFetch.mockResolvedValue({
      json: async () => {
        throw new Error('body lost');
      },
    });
    await expect(runOrderMaintenance('yedek-yukle', body)).rejects.toThrow('body lost');
    expect(storage.size).toBe(1);
  });
});
