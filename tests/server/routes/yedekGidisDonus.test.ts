import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Backup round trip: what /yedek-al exports, /yedek-yukle must take back, in both
// modes. tests/fixtures/siparisler-kolonlari.json lists every siparisler column;
// tests/sql/siparis-yedek-kolonlari.sql fails when a migration adds one, so a new
// server column cannot silently break restores again.
const KOLONLAR: string[] = JSON.parse(
  fs.readFileSync('tests/fixtures/siparisler-kolonlari.json', 'utf8')
);

interface Query {
  table: string;
  filters: Array<[string, unknown]>;
}
const env = vi.hoisted(() => ({
  db: null as unknown,
  exported: [] as Record<string, unknown>[],
  users: [] as Array<{ id: string; tenant_id: string }>,
  queries: [] as Query[],
  restores: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return env.db;
  },
}));
import router from '../../../src/server/routes/veritabani';
import * as state from '../../../src/server/services/state';

function fakeDb() {
  return {
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'tomnap_export_orders') return { data: env.exported, error: null };
      if (name === 'tomnap_restore_orders') {
        env.restores.push(args);
        const orders = args.p_orders as unknown[];
        return {
          data: { toplam: orders.length, hedef_tenant: args.p_tenant_id, tekrar: false },
          error: null,
        };
      }
      return { data: null, error: { code: 'XX000' } };
    }),
    from: (table: string) => {
      const query: Query = { table, filters: [] };
      env.queries.push(query);
      const rows = () =>
        (table === 'kullanicilar' ? env.users : []).filter((row) =>
          query.filters.every(([key, value]) =>
            key.endsWith(':in')
              ? (value as unknown[]).includes(row[key.slice(0, -3) as keyof typeof row])
              : row[key as keyof typeof row] === value
          )
        );
      const chain = {
        select: () => chain,
        eq: (key: string, value: unknown) => (query.filters.push([key, value]), chain),
        in: (key: string, values: unknown) => (query.filters.push([`${key}:in`, values]), chain),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows(), error: null }).then(resolve),
      };
      return chain;
    },
  };
}

function app(tenant = 'restore_a') {
  const server = express();
  server.use(express.json({ limit: '12mb' }));
  server.use((req, _res, next) => {
    req.tenantId = tenant;
    req.auth = { role: 'SUPER_ADMIN', tenantId: tenant } as never;
    next();
  });
  server.use('/api', router);
  return server;
}

/** A delivered v1 order exactly as tomnap_export_orders returns it: every column. */
function exportedRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: randomUUID(),
    tenant_id: 'restore_a',
    olusturma_tarihi: '2026-09-01T10:00:00+00:00',
    guncellenme_tarihi: '2026-09-02T10:00:00+00:00',
    ham_mesaj: 'Çanta istəyirəm',
    siparis_kaynagi: 'WHATSAPP',
    musteri_adi: 'Aytən',
    instagram_kullanici_adi: '@ayten',
    telefon_numarasi: '0552843911',
    teslimat_sehri: 'Bakü',
    teslimat_adresi: 'Nərimanov',
    urun_aciklamasi: 'Çanta',
    beden_veya_olcu: 'M',
    renk: 'Qara',
    adet: 2,
    toplam_tutar: 100,
    alinan_tutar: 100,
    kalan_tutar: 0,
    para_birimi: 'AZN',
    finans_durumu: 'ODENDI',
    lojistik_durumu: 'TESLIM_EDILDI',
    baku_kurye_id: 'kurye-a',
    baku_kurye_adi: 'Elvin',
    baku_kurye_bolgesi: 'Nərimanov',
    teslim_tarihi: '2026-09-03T10:00:00+00:00',
    teslim_eden_kisi: 'Elvin',
    ozel_not: null,
    baku_tahsilat_notu: '',
    kanada_takip_kodu: 'CA123',
    uluslararasi_kargo_kodu: 'AWB-1',
    eksik_bilgiler: [],
    ai_guven_skoru: 0.9,
    is_demo: false,
    ek_veriler: {},
    kurye_atama_surumu: 3,
    kurye_teslim_kullanici_id: 'kurye-user-a',
    kurye_teslim_alan: 'Ana',
    model_surumu: 1,
    sahip_kullanici_id: null,
    ...extra,
  };
}

// Columns a restore deliberately does not write, and why. Every other column goes back.
const YAZILMAYAN: Record<string, string> = {
  kalan_tutar: 'derived from toplam_tutar - alinan_tutar',
  ozel_not: 'kept inside baku_tahsilat_notu as [TƏLİMAT: …]',
  kurye_atama_surumu: 'server version counter; must never go backwards',
  model_surumu: 'v1 backups hold only v1 orders (database default 1)',
  sahip_kullanici_id: 'v1 orders have no owner',
};

const users = [
  { id: 'kurye-user-a', tenant_id: 'restore_a', rol: 'BAKU_KURYE', durum: 'AKTIF' },
  { id: 'kurye-user-b', tenant_id: 'restore_b', rol: 'BAKU_KURYE', durum: 'AKTIF' },
];
const restoreBody = (siparisler: unknown) => ({
  siparisler,
  islem_id: randomUUID(),
  temizleVeYukle: true,
  onay_kodu: 'DEGISTIR:restore_a',
});

beforeEach(() => {
  env.db = null;
  env.exported = [];
  env.users = users.map(({ id, tenant_id }) => ({ id, tenant_id }));
  env.queries = [];
  env.restores = [];
  state.setFirmalarVeritabani([
    { id: 'restore_a', ad: 'A' },
    { id: 'restore_b', ad: 'B' },
  ] as never);
  state.setKullanicilarVeritabani(users as never);
  state.setSiparislerVeritabani([]);
});

describe('backup export -> restore round trip keeps server-added columns', () => {
  it('the fixture row carries every siparisler column', () => {
    expect(Object.keys(exportedRow()).sort()).toEqual([...KOLONLAR].sort());
  });

  it('Supabase mode: an export restores as-is, courier delivery included', async () => {
    env.db = fakeDb();
    env.exported = [exportedRow()];
    const exported = await request(app()).get('/api/veritabani/yedek-al');
    expect(exported.status).toBe(200);
    const restored = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restoreBody(exported.body.siparisler));
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);

    expect(env.restores).toHaveLength(1);
    const [order] = env.restores[0].p_orders as Array<Record<string, unknown>>;
    expect(order).toMatchObject({
      id: env.exported[0].id,
      tenant_id: 'restore_a',
      lojistik_durumu: 'TESLIM_EDILDI',
      baku_kurye_id: 'kurye-a',
      kurye_teslim_kullanici_id: 'kurye-user-a',
      kurye_teslim_alan: 'Ana',
    });
    for (const key of Object.keys(order)) expect(KOLONLAR, key).toContain(key);
    for (const column of KOLONLAR)
      expect(
        column in order || column in YAZILMAYAN,
        `${column} is neither written nor explained`
      ).toBe(true);
    expect(order).not.toHaveProperty('kurye_atama_surumu');

    // The courier check reads only the session tenant's users.
    const lookup = env.queries.find((q) => q.table === 'kullanicilar');
    expect(lookup?.filters).toEqual(
      expect.arrayContaining([
        ['tenant_id', 'restore_a'],
        ['id:in', ['kurye-user-a']],
      ])
    );
  });

  it('memory mode: an export restores as-is and keeps the courier version', async () => {
    const row = exportedRow();
    state.setSiparislerVeritabani([row]);
    const exported = await request(app()).get('/api/veritabani/yedek-al');
    expect(exported.status).toBe(200);
    const restored = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restoreBody(exported.body.siparisler));
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect(state.siparislerVeritabani.find((r) => r.id === row.id)).toMatchObject({
      lojistik_durumu: 'TESLIM_EDILDI',
      kurye_teslim_kullanici_id: 'kurye-user-a',
      kurye_teslim_alan: 'Ana',
      kurye_atama_surumu: 3,
    });
  });

  it('refuses a courier user of another boutique in both modes, before writing', async () => {
    const foreign = [exportedRow({ kurye_teslim_kullanici_id: 'kurye-user-b' })];
    const response = await request(app())
      .post('/api/veritabani/yedek-yukle')
      .send(restoreBody(foreign));
    expect(response.status).toBe(404);
    expect(state.siparislerVeritabani).toEqual([]);

    env.db = fakeDb();
    const db = await request(app()).post('/api/veritabani/yedek-yukle').send(restoreBody(foreign));
    expect(db.status).toBe(404);
    expect(env.restores).toEqual([]);
  });

  it('refuses malformed courier fields', async () => {
    for (const extra of [
      { kurye_teslim_kullanici_id: 7 },
      { kurye_teslim_alan: { ad: 'x' } },
      { kurye_teslim_alan: 'x'.repeat(151) },
      { kurye_atama_surumu: -1 },
      { kurye_atama_surumu: 'üç' },
    ]) {
      const response = await request(app())
        .post('/api/veritabani/yedek-yukle')
        .send(restoreBody([exportedRow(extra)]));
      expect([extra, response.status]).toEqual([extra, 400]);
    }
    expect(state.siparislerVeritabani).toEqual([]);
  });
});
