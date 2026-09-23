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
  awbOnayKayitlari,
  eslesmeHavuzunuYukle,
  onayKalemleriniHazirla,
  secimIstegiDogrula,
} from '../../../src/server/services/kargo/awbMatchStore';
import {
  eslesmeOnerileriOlustur,
  type EslesmeRaporu,
} from '../../../src/server/services/kargo/manifestMatching';
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

describe('Database confirmation goes through the approval RPC only', () => {
  const manifest = { dosyaAdi: 'dispatch.xlsx', sha256: 'a'.repeat(64) };
  const items = [
    {
      satirNo: 3,
      siparisId: '50000000-0000-4000-8000-000000000001',
      takipNo: 'AWB-1001',
      agirlikKg: 1.5,
      eslesmeTuru: 'TELEFON' as const,
      isimPuani: 0.8,
    },
  ];
  const rejection = { satirNo: 3, siparisId: items[0].siparisId, takipNo: 'AWB-1001' };

  it('passes the tenant, the session user and the manifest, and parses the result', async () => {
    environment.db = fakeDb([]);
    environment.db.rpc.mockResolvedValue({
      data: {
        basarili: false,
        uygulananlar: [],
        reddedilenler: [{ ...rejection, sebep: 'MEVCUT_AWB', mevcutAwb: 'OLD' }],
        kayitSayisi: 0,
      },
      error: null,
    });
    const result = await awbEslesmeleriniOnayla('tenant-a', 'user-a', manifest, items);
    expect(environment.db.rpc).toHaveBeenCalledWith('tomnap_approve_awb_matches', {
      p_tenant_id: 'tenant-a',
      p_user_id: 'user-a',
      p_manifest: manifest,
      p_matches: items,
    });
    expect(result).toEqual({
      basarili: false,
      uygulananlar: [],
      reddedilenler: [{ ...rejection, sebep: 'MEVCUT_AWB', mevcutAwb: 'OLD' }],
    });
    expect(environment.db.calls).toHaveLength(0);

    environment.db.rpc.mockResolvedValue({
      data: { basarili: true, uygulananlar: [{ ...rejection, tekrar: true }], reddedilenler: [] },
      error: null,
    });
    expect((await awbEslesmeleriniOnayla('tenant-a', 'user-a', manifest, items)).uygulananlar).toEqual([
      { ...rejection, tekrar: true },
    ]);
  });

  it('maps validation, authorization, outages and malformed results to safe statuses', async () => {
    environment.db = fakeDb([]);
    for (const [code, status] of [
      ['22023', 400],
      ['PT403', 403],
      ['40P01', 503],
    ] as const) {
      environment.db.rpc.mockResolvedValue({ data: null, error: { code } });
      await expect(awbEslesmeleriniOnayla('tenant-a', 'user-a', manifest, items)).rejects.toMatchObject({
        status,
      });
    }
    for (const data of [
      null,
      { basarili: true },
      { basarili: true, uygulananlar: [{ siparisId: 'x', takipNo: 'y' }], reddedilenler: [] },
      { basarili: false, uygulananlar: [], reddedilenler: [{ ...rejection, sebep: 'OTHER' }] },
    ]) {
      environment.db.rpc.mockResolvedValue({ data, error: null });
      await expect(awbEslesmeleriniOnayla('tenant-a', 'user-a', manifest, items)).rejects.toMatchObject({
        status: 503,
      });
    }
    await expect(awbEslesmeleriniOnayla('all', 'user-a', manifest, items)).rejects.toMatchObject({ status: 400 });
    await expect(awbEslesmeleriniOnayla('tenant-a', '', manifest, items)).rejects.toMatchObject({ status: 401 });
  });
});

describe('Selections are resolved against server-computed suggestions only', () => {
  const report: EslesmeRaporu = eslesmeOnerileriOlustur(
    [
      { takipNo: 'AWB-0001', aliciAdi: 'MƏMMƏDOVA AYTƏN', telefon: '+994552843911', agirlikKg: 2 },
      { takipNo: 'AWB-0002', aliciAdi: 'Ayten Mammadova' },
      { takipNo: 'AWB-0003', aliciAdi: 'Holder' },
    ],
    [
      { id: 'phone', musteriAdi: 'Aytən Məmmədova', telefon: '0552843911', lojistikDurumu: 'KANADA_DEPO', awb: '', awbGosterim: '', kanadaTakipKodu: '' },
      { id: 'name', musteriAdi: 'Aytən Məmmədova', telefon: '', lojistikDurumu: 'KANADA_DEPO', awb: '', awbGosterim: '', kanadaTakipKodu: '' },
      { id: 'holder', musteriAdi: 'Holder', telefon: '', lojistikDurumu: 'ULUSLARARASI_KARGO', awb: 'AWB-0003', awbGosterim: 'AWB-0003', kanadaTakipKodu: '' },
    ]
  );

  it('takes match type, name score, AWB and weight from the server report', () => {
    const result = onayKalemleriniHazirla(report, [
      { satirNo: 1, siparisId: 'phone' },
      { satirNo: 2, siparisId: 'name' },
    ]);
    expect(result.reddedilenler).toEqual([]);
    expect(result.kalemler).toEqual([
      { satirNo: 1, siparisId: 'phone', takipNo: 'AWB-0001', agirlikKg: 2, eslesmeTuru: 'TELEFON', isimPuani: 1 },
      expect.objectContaining({ satirNo: 2, siparisId: 'name', takipNo: 'AWB-0002', agirlikKg: null, eslesmeTuru: 'ISIM' }),
    ]);
    expect(result.kalemler[1].isimPuani).toBeGreaterThanOrEqual(0.5);
  });

  it('turns an already attached pair into an idempotent retry and rejects anything else', () => {
    const result = onayKalemleriniHazirla(report, [
      { satirNo: 3, siparisId: 'holder' },
      // 'holder' already carries an AWB, so it is never a candidate for row 1.
      { satirNo: 1, siparisId: 'holder' },
      { satirNo: 7, siparisId: 'phone' },
    ]);
    expect(result.tekrarlar).toEqual([{ satirNo: 3, siparisId: 'holder', takipNo: 'AWB-0003', tekrar: true }]);
    expect(result.kalemler).toEqual([]);
    expect(result.reddedilenler).toEqual([
      { satirNo: 1, siparisId: 'holder', takipNo: 'AWB-0001', sebep: 'ONERI_GECERSIZ' },
      { satirNo: 7, siparisId: 'phone', takipNo: '', sebep: 'ONERI_GECERSIZ' },
    ]);
  });

  it('validates the selection list before any work is done', () => {
    expect(secimIstegiDogrula({ secimler: [{ satirNo: 2, siparisId: 'a-1' }] })).toEqual([
      { satirNo: 2, siparisId: 'a-1' },
    ]);
    for (const body of [
      null,
      {},
      { secimler: [] },
      { secimler: Array.from({ length: 501 }, (_, index) => ({ satirNo: index + 1, siparisId: `o${index}` })) },
      { secimler: [{ satirNo: 100001, siparisId: 'a' }] },
      { secimler: [{ satirNo: 1 }] },
    ])
      expect(() => secimIstegiDogrula(body)).toThrow();
  });

  it('never exposes the stored approval records for mutation', () => {
    expect(() => awbOnayKayitlari('all')).toThrow();
    const copy = awbOnayKayitlari('tenant-a');
    copy.push({} as never);
    expect(awbOnayKayitlari('tenant-a')).not.toContain(copy[copy.length - 1]);
  });
});
