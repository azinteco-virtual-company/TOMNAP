import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCompleteList } from '../../src/lib/completeList';
import { setApiSession, setApiTenant } from '../../src/lib/apiClient';
import { useAppStore } from '../../src/store/appStore';
const response = (body: any, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const rows = Array.from({ length: 1207 }, (_, i) => ({
  id: `order-${String(i).padStart(4, '0')}`,
  tenant_id: 'tenant-a',
  olusturma_tarihi: '2026-01-01T00:00:00Z',
}));
function payload(index = 0, items = rows, revision = 'revision-a') {
  const batch = items.slice(index, index + 200);
  const hasMore = index + batch.length < items.length;
  return {
    basarili: true,
    siparisler: batch,
    kaynak: 'supabase',
    pagination: {
      version: 1,
      total: items.length,
      revision,
      pageSize: 200,
      hasMore,
      nextCursor: hasMore ? `cursor-${index + 200}` : null,
    },
  };
}
let mockFetch: ReturnType<typeof vi.fn>;
beforeEach(() => {
  useAppStore.getState().clearSession();
  setApiSession('csrf-test', 'tenant-a');
  useAppStore.setState({
    sessionStatus: 'authenticated',
    session: {
      id: 'owner',
      adSoyad: 'Owner',
      email: 'owner@example.test',
      rol: 'PATRON',
      tenantId: 'tenant-a',
    },
    aktifRol: 'PATRON',
    seciliFirmaId: 'tenant-a',
  });
  mockFetch = vi.fn();
  vi.stubGlobal('fetch', mockFetch);
});
afterEach(() => {
  useAppStore.getState().clearSession();
  vi.unstubAllGlobals();
});
function servePages() {
  mockFetch.mockImplementation(async (url: string) => {
    const cursor = new URL(url, 'https://test.invalid').searchParams.get('cursor');
    return response(payload(cursor ? Number(cursor.slice('cursor-'.length)) : 0));
  });
}
describe('complete list publication', () => {
  it('loads every >1000 record and only then returns the dataset', async () => {
    servePages();
    const data = await loadCompleteList('/api/siparisler?tenant_id=tenant-a', 'siparisler');
    expect(data.items).toEqual(rows);
    expect(mockFetch).toHaveBeenCalledTimes(7);
    for (const [url] of mockFetch.mock.calls)
      expect(new URL(url, 'https://test.invalid').searchParams.get('tenant_id')).toBe('tenant-a');
  });
  it('does not publish first-page counts or data while subsequent pages are pending', async () => {
    const previous = [{ id: 'previous-complete-list' }] as any;
    useAppStore.setState({ siparisler: previous });
    let finish!: (value: Response) => void;
    mockFetch.mockResolvedValueOnce(response(payload())).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const loading = useAppStore.getState().siparisleriYukle();
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(useAppStore.getState().siparisler).toBe(previous);
    expect(useAppStore.getState().yukleniyor).toBe(true);
    mockFetch.mockImplementation(async (url: string) =>
      response(
        payload(Number(new URL(url, 'https://test.invalid').searchParams.get('cursor')!.slice(7)))
      )
    );
    finish(response(payload(200)));
    await loading;
    expect(useAppStore.getState().siparisler).toEqual(rows);
    expect(useAppStore.getState().siparisYuklemeHatasi).toBeNull();
  });
  it('keeps the last complete data and exposes an explicit error after a409; no partial publish', async () => {
    const previous = [{ id: 'old' }] as any;
    useAppStore.setState({ siparisler: previous });
    mockFetch
      .mockResolvedValueOnce(response(payload()))
      .mockResolvedValueOnce(response({ hata: 'Liste değişti' }, 409));
    await useAppStore.getState().siparisleriYukle();
    expect(useAppStore.getState().siparisler).toBe(previous);
    expect(useAppStore.getState().siparisYuklemeHatasi).toContain('Liste değişti');
    expect(useAppStore.getState().yukleniyor).toBe(false);
  });
  it('does not publish a network-interrupted partial list', async () => {
    mockFetch
      .mockResolvedValueOnce(response(payload()))
      .mockRejectedValueOnce(new TypeError('network interrupted'));
    await expect(loadCompleteList('/api/siparisler', 'siparisler', { retries: 0 })).rejects.toThrow(
      'network interrupted'
    );
  });
  it.each([
    'missing metadata',
    'revision changed',
    'count changed',
    'repeated cursor',
    'duplicate row',
    'premature end',
    'oversize',
  ])('rejects %s instead of accepting incomplete data', async (mode) => {
    const first = payload();
    const second = payload(200);
    if (mode === 'missing metadata') delete (first as any).pagination;
    if (mode === 'revision changed') second.pagination.revision = 'revision-b';
    if (mode === 'count changed') second.pagination.total++;
    if (mode === 'repeated cursor') second.pagination.nextCursor = first.pagination.nextCursor;
    if (mode === 'duplicate row') second.siparisler[0] = first.siparisler[0];
    if (mode === 'premature end') {
      second.pagination.hasMore = false;
      second.pagination.nextCursor = null;
    }
    if (mode === 'oversize') first.pagination.total = 10001;
    mockFetch.mockResolvedValueOnce(response(first)).mockResolvedValueOnce(response(second));
    await expect(
      loadCompleteList('/api/siparisler', 'siparisler', { retries: 0 })
    ).rejects.toThrow();
  });
  it('accepts an explicitly complete empty list', async () => {
    mockFetch.mockResolvedValueOnce(response(payload(0, [])));
    expect((await loadCompleteList('/api/siparisler', 'siparisler')).items).toEqual([]);
  });
  it('ignores an older overlapping loader after a newer one completes', async () => {
    let finish!: (value: Response) => void;
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const older = useAppStore.getState().siparisleriYukle();
    mockFetch.mockResolvedValueOnce(response(payload(0, [{ ...rows[0], id: 'new' }])));
    await useAppStore.getState().siparisleriYukle();
    finish(response(payload(0, [{ ...rows[0], id: 'old' }])));
    await older;
    expect(useAppStore.getState().siparisler.map((row) => row.id)).toEqual(['new']);
  });
  it('rejects late pages after a tenant/session switch', async () => {
    let finish!: (value: Response) => void;
    mockFetch.mockResolvedValueOnce(response(payload())).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = loadCompleteList('/api/siparisler', 'siparisler', { retries: 0 });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    setApiTenant('tenant-b');
    finish(response(payload(200)));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
