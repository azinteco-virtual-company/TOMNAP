import { beforeEach, describe, expect, it, vi } from 'vitest';

interface QueryCall {
  table: string;
  columns: string;
  filters: Array<[string, string, unknown]>;
  limit: number | null;
}
interface FakeDb {
  calls: QueryCall[];
  rpc: ReturnType<typeof vi.fn>;
  from: (table: string) => unknown;
}

const environment = vi.hoisted(() => ({ db: null as FakeDb | null }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return environment.db;
  },
}));

import {
  awbEslesmeleriniOnayla,
  eslesmeHavuzunuYukle,
} from '../../../src/server/services/kargo/awbMatchStore';
import { setDemoSiparislerVeritabani } from '../../../src/server/services/state';

// Read-only fake: every write method throws, so a write attempt fails the test.
function fakeDb(pages: unknown[][], error: unknown = null): FakeDb {
  const calls: QueryCall[] = [];
  const refuse = () => {
    throw new Error('Unexpected write during candidate loading');
  };
  return {
    calls,
    rpc: vi.fn(),
    from(table: string) {
      const call: QueryCall = { table, columns: '', filters: [], limit: null };
      calls.push(call);
      const page = pages[calls.length - 1] ?? [];
      const builder = {
        select(columns: string) {
          call.columns = columns;
          return builder;
        },
        eq(column: string, value: unknown) {
          call.filters.push(['eq', column, value]);
          return builder;
        },
        gt(column: string, value: unknown) {
          call.filters.push(['gt', column, value]);
          return builder;
        },
        order(column: string) {
          call.filters.push(['order', column, 'asc']);
          return builder;
        },
        limit(size: number) {
          call.limit = size;
          return builder;
        },
        then(resolve: (value: { data: unknown; error: unknown }) => void) {
          resolve({ data: error ? null : page, error });
        },
        insert: refuse,
        update: refuse,
        upsert: refuse,
        delete: refuse,
      };
      return builder;
    },
  };
}

const row = (index: number, extra: Record<string, unknown> = {}) => ({
  id: `id-${String(index).padStart(5, '0')}`,
  tenant_id: 'tenant-a',
  musteri_adi: `Customer ${index}`,
  telefon_numarasi: '',
  lojistik_durumu: 'KANADA_DEPO',
  uluslararasi_kargo_kodu: null,
  kanada_takip_kodu: null,
  ...extra,
});

beforeEach(() => {
  environment.db = null;
});

describe('Database candidate loading is complete, read-only and tenant-scoped', () => {
  it('pages by id and filters every page by the requesting tenant', async () => {
    const first = Array.from({ length: 1000 }, (_, index) => row(index));
    environment.db = fakeDb([first, [row(1000), row(1001), { id: 7 }]]);
    const orders = await eslesmeHavuzunuYukle('tenant-a');
    expect(orders).toHaveLength(1002);
    const calls = environment.db.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.table).toBe('siparisler');
      expect(call.filters).toContainEqual(['eq', 'tenant_id', 'tenant-a']);
      expect(call.limit).toBe(1000);
      // Only matching fields; private extras, notes and addresses are never read.
      expect(call.columns.split(',').sort()).toEqual(
        [
          'id',
          'kanada_takip_kodu',
          'lojistik_durumu',
          'musteri_adi',
          'telefon_numarasi',
          'tenant_id',
          'uluslararasi_kargo_kodu',
        ].sort()
      );
    }
    expect(calls[0].filters.some(([kind]) => kind === 'gt')).toBe(false);
    expect(calls[1].filters).toContainEqual(['gt', 'id', 'id-00999']);
  });

  it('fails closed on database errors, oversized pools and unusable cursors', async () => {
    environment.db = fakeDb([], { code: 'XX000' });
    await expect(eslesmeHavuzunuYukle('tenant-a')).rejects.toMatchObject({ status: 503 });

    const full = Array.from({ length: 1000 }, (_, index) => row(index));
    environment.db = fakeDb(Array.from({ length: 11 }, () => full));
    await expect(eslesmeHavuzunuYukle('tenant-a')).rejects.toMatchObject({ status: 413 });

    const withoutCursor = Array.from({ length: 1000 }, (_, index) =>
      index === 999 ? { ...row(index), id: 999 } : row(index)
    );
    environment.db = fakeDb([withoutCursor]);
    await expect(eslesmeHavuzunuYukle('tenant-a')).rejects.toMatchObject({ status: 503 });
  });

  it('rejects global or malformed tenant scopes before querying', async () => {
    environment.db = fakeDb([[row(1)]]);
    for (const tenant of ['all', '', 'tenant a', '../x'])
      await expect(eslesmeHavuzunuYukle(tenant)).rejects.toMatchObject({ status: 400 });
    expect(environment.db.calls).toHaveLength(0);
  });

  it('keeps the demo sandbox in memory even when a database is configured', async () => {
    environment.db = fakeDb([[row(1)]]);
    setDemoSiparislerVeritabani([
      { id: 'demo-1', tenant_id: 'demo_sandbox', musteri_adi: 'Demo' },
      { id: 'other', tenant_id: 'tenant-a', musteri_adi: 'Other' },
    ]);
    const orders = await eslesmeHavuzunuYukle('demo_sandbox');
    expect(orders.map((order) => order.id)).toEqual(['demo-1']);
    expect(environment.db.calls).toHaveLength(0);
  });
});

describe('Database confirmation goes through the transactional RPC only', () => {
  const items = [{ siparisId: '50000000-0000-4000-8000-000000000001', takipNo: 'AWB-1001', agirlikKg: 1.5 }];

  it('passes the server-resolved tenant and parses the result', async () => {
    environment.db = fakeDb([]);
    environment.db.rpc.mockResolvedValue({
      data: {
        basarili: false,
        uygulananlar: [],
        reddedilenler: [
          { siparisId: items[0].siparisId, takipNo: 'AWB-1001', sebep: 'MEVCUT_AWB', mevcutAwb: 'OLD' },
        ],
      },
      error: null,
    });
    const result = await awbEslesmeleriniOnayla('tenant-a', items);
    expect(environment.db.rpc).toHaveBeenCalledWith('tomnap_confirm_awb_matches', {
      p_tenant_id: 'tenant-a',
      p_matches: items,
    });
    expect(result).toEqual({
      basarili: false,
      uygulananlar: [],
      reddedilenler: [
        { siparisId: items[0].siparisId, takipNo: 'AWB-1001', sebep: 'MEVCUT_AWB', mevcutAwb: 'OLD' },
      ],
    });
    expect(environment.db.calls).toHaveLength(0);

    environment.db.rpc.mockResolvedValue({
      data: { basarili: true, uygulananlar: [{ siparisId: 'x', takipNo: 'AWB-1001', tekrar: true }], reddedilenler: [] },
      error: null,
    });
    expect((await awbEslesmeleriniOnayla('tenant-a', items)).uygulananlar).toEqual([
      { siparisId: 'x', takipNo: 'AWB-1001', tekrar: true },
    ]);
  });

  it('maps validation errors, outages and malformed results to safe statuses', async () => {
    environment.db = fakeDb([]);
    environment.db.rpc.mockResolvedValue({ data: null, error: { code: '22023' } });
    await expect(awbEslesmeleriniOnayla('tenant-a', items)).rejects.toMatchObject({ status: 400 });
    environment.db.rpc.mockResolvedValue({ data: null, error: { code: '40P01' } });
    await expect(awbEslesmeleriniOnayla('tenant-a', items)).rejects.toMatchObject({ status: 503 });
    for (const data of [
      null,
      { basarili: true },
      { basarili: true, uygulananlar: [{ siparisId: 1 }], reddedilenler: [] },
      { basarili: false, uygulananlar: [], reddedilenler: [{ siparisId: 'x', takipNo: 'y', sebep: 'OTHER' }] },
    ]) {
      environment.db.rpc.mockResolvedValue({ data, error: null });
      await expect(awbEslesmeleriniOnayla('tenant-a', items)).rejects.toMatchObject({ status: 503 });
    }
    await expect(awbEslesmeleriniOnayla('all', items)).rejects.toMatchObject({ status: 400 });
  });
});
