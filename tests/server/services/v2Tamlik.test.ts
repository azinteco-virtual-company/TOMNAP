import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// Codex R3 F10: PostgREST answers at most "max rows" (1000 on Supabase) per request and
// says nothing when it cuts. The v2 order list read all lines of up to 200 orders in one
// request (up to 20,000 lines) and the ledger read all payments of an order in one
// request, then summed them in TypeScript: past 1000 rows lines went missing and the
// paid total was wrong. Reads now page until complete; the paid total is the one SQL
// keeps (the ledger trigger's alinan_tutar).
type Row = Record<string, unknown>;
const env = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import { v2SiparisleriListele } from '../../../src/server/services/v2/siparisStore';
import { v2SiparisOdemeleri } from '../../../src/server/services/v2/odemeStore';

/** A PostgREST-like fake: filters, ordering, ranges, exact counts and a max-rows cap. */
function fakeDb(tables: Record<string, Row[]>, maxRows: number) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = [];
      const orders: Array<[string, boolean]> = [];
      let columns: string[] | null = null;
      let count = false;
      let from = 0;
      let to = Number.POSITIVE_INFINITY;
      let limit = Number.POSITIVE_INFINITY;
      const run = () => {
        const all = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
        all.sort((a, b) => {
          for (const [col, asc] of orders) {
            const [x, y] = [String(a[col]).padStart(20, '0'), String(b[col]).padStart(20, '0')];
            if (x !== y) return (x < y ? -1 : 1) * (asc ? 1 : -1);
          }
          return 0;
        });
        const end = Math.min(to + 1, from + limit, from + maxRows);
        const data = all
          .slice(from, end)
          .map((row) =>
            columns ? Object.fromEntries(columns.map((c) => [c, row[c]])) : { ...row }
          );
        return { data, error: null, count: count ? all.length : null };
      };
      const chain = {
        select(cols: string, options?: { count?: string }) {
          columns = cols === '*' ? null : cols.split(',');
          count = options?.count === 'exact';
          return chain;
        },
        eq(col: string, value: unknown) {
          filters.push((row) => row[col] === value);
          return chain;
        },
        in(col: string, values: unknown[]) {
          filters.push((row) => values.includes(row[col]));
          return chain;
        },
        order(col: string, options?: { ascending?: boolean }) {
          orders.push([col, options?.ascending !== false]);
          return chain;
        },
        limit(n: number) {
          limit = n;
          return chain;
        },
        range(a: number, b: number) {
          from = a;
          to = b;
          return chain;
        },
        maybeSingle: () => {
          const { data } = run();
          return Promise.resolve({ data: data[0] ?? null, error: null });
        },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
      };
      return chain;
    },
  };
}

const TENANT = 't-tamlik';
const header = (id: string, extra: Row = {}): Row => ({
  id,
  tenant_id: TENANT,
  model_surumu: 2,
  sahip_kullanici_id: 'u-1',
  musteri_adi: 'Aytən',
  toplam_tutar: '600.00',
  alinan_tutar: '0.00',
  kalan_tutar: '600.00',
  finans_durumu: 'BEKLIYOR',
  lojistik_durumu: 'KANADA_SATINALIM_BEKLIYOR',
  ek_veriler: {},
  olusturma_tarihi: '2026-09-26T08:00:00Z',
  ...extra,
});
const line = (siparisId: string, sira: number): Row => ({
  id: randomUUID(),
  tenant_id: TENANT,
  siparis_id: siparisId,
  sira,
  urun_aciklamasi: 'Çanta ' + sira,
  beden: null,
  renk: null,
  adet: 1,
  birim_satis_fiyati_azn: '100.00',
  kaynak_ulke: 'CA',
  iptal: false,
});
const payment = (siparisId: string, i: number): Row => ({
  id: randomUUID(),
  tenant_id: TENANT,
  siparis_id: siparisId,
  tutar_azn: '1.00',
  yontem: 'NAKIT',
  kaynak: 'BUTIK',
  alan_kullanici_id: 'u-1',
  alma_zamani: '2026-09-26T08:00:00Z',
  kaydeden_kullanici_id: 'u-1',
  aciklama: null,
  ters_kayit_odeme_id: null,
  kasa_teslim_id: null,
  olusturma_zamani: `2026-09-26T08:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}.${String(i).padStart(6, '0')}Z`,
});

describe.each([1000, 400])('v2 reads are complete past max rows = %i (Codex R3 F10)', (maxRows) => {
  it('lists 200 orders with all of their 1200 lines', async () => {
    const orders = Array.from({ length: 200 }, (_, i) =>
      header(randomUUID(), {
        olusturma_tarihi: `2026-09-26T08:00:00.${String(i).padStart(3, '0')}Z`,
      })
    );
    const lines = orders.flatMap((o) => [1, 2, 3, 4, 5, 6].map((n) => line(String(o.id), n)));
    env.db = fakeDb({ siparisler: orders, siparis_satirlari: lines }, maxRows);
    const listed = await v2SiparisleriListele(TENANT);
    expect(listed).toHaveLength(200);
    const counts = listed.map((o) => o.satirlar.length);
    expect(counts.filter((n) => n !== 6)).toEqual([]);
    expect(listed[0].satirlar.map((s) => s.sira)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('reads all 1001 payments of an order; the paid total is the SQL one', async () => {
    const id = randomUUID();
    const payments = Array.from({ length: 1001 }, (_, i) => payment(id, i));
    env.db = fakeDb(
      {
        siparisler: [
          header(id, { toplam_tutar: '2000.00', alinan_tutar: '1001.00', kalan_tutar: '999.00' }),
        ],
        odemeler: payments,
      },
      maxRows
    );
    const ledger = await v2SiparisOdemeleri(TENANT, id);
    expect(ledger?.odemeler).toHaveLength(1001);
    expect(new Set(ledger?.odemeler.map((o) => o.id)).size).toBe(1001);
    expect(ledger?.ozet).toEqual({
      siparisId: id,
      toplamTutar: 2000,
      odenenTutar: 1001,
      kalanTutar: 999,
      durum: 'KISMI',
    });
  });
});
