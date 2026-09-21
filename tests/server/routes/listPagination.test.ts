import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
vi.mock('../../../src/server/services/supabase', () => ({ supabase: null }));
import ordersRouter from '../../../src/server/routes/siparisler';
import inboxRouter from '../../../src/server/routes/inbox';
import customersRouter from '../../../src/server/routes/musteriler';
import * as state from '../../../src/server/services/state';
import { boundedSnapshot } from '../../../src/server/services/listPagination';

function app(tenant = 'page-a') {
  const app = express();
  app.use((req, _res, next) => {
    (req as any).tenantId = tenant;
    next();
  });
  app.use('/api', ordersRouter, inboxRouter, customersRouter);
  return app;
}
const order = (i: number, tenant = 'page-a') =>
  ({
    id: `order-${String(i).padStart(5, '0')}`,
    tenant_id: tenant,
    musteri_adi: `Customer ${i}`,
    telefon_numarasi: `phone-${i}`,
    musteri_id: `customer-${i}`,
    urun_aciklamasi: 'Synthetic item',
    toplam_tutar: 10,
    alinan_tutar: 2,
    kalan_tutar: 8,
    adet: 1,
    eksik_bilgiler: [],
    olusturma_tarihi: '2026-01-01T00:00:00Z',
    finans_durumu: 'KISMI_ODEME',
    lojistik_durumu: 'KANADA_DEPO',
  }) as any;
beforeEach(() => {
  state.setSiparislerVeritabani(Array.from({ length: 1207 }, (_, i) => order(i)));
  state.setMusterilerVeritabani([]);
  state.setOnayBekleyenler(
    Array.from(
      { length: 1207 },
      (_, i) =>
        ({
          id: `inbox-${String(i).padStart(5, '0')}`,
          tenant_id: 'page-a',
          gelis_tarihi: '2026-01-01T00:00:00Z',
          durum: i % 2 ? 'REDDEDILDI' : 'BEKLEMEDE',
          oneri_siparis: {},
        }) as any
    )
  );
});
async function allPages(server: any, path: string, field: string) {
  const items: any[] = [];
  let cursor: string | null = null;
  let first: any;
  do {
    const response = await request(server)
      .get(path)
      .query({ page_size: 500, ...(cursor ? { cursor } : {}) });
    expect(response.status).toBe(200);
    first ||= response.body;
    expect(response.body.pagination.total).toBe(first.pagination.total);
    expect(response.body.pagination.revision).toBe(first.pagination.revision);
    items.push(...response.body[field]);
    cursor = response.body.pagination.nextCursor;
    expect(response.body.pagination.hasMore).toBe(!!cursor);
  } while (cursor);
  return { items, first };
}
describe('complete revisioned lists', () => {
  it.each([
    ['siparisler', 'siparisler'],
    ['inbox', 'mesajlar'],
    ['musteriler', 'musteriler'],
  ])('returns all >1000 %s rows with exact totals and tenant scope', async (path, field) => {
    state.siparislerVeritabani.push(order(9999, 'page-b'));
    const { items, first } = await allPages(app(), '/api/' + path, field);
    expect(items).toHaveLength(1207);
    expect(new Set(items.map((i) => i.id)).size).toBe(1207);
    expect(first.pagination.total).toBe(1207);
    expect(items.every((i) => i.tenant_id === 'page-a')).toBe(true);
    if (path === 'musteriler')
      expect(items.reduce((n, c) => n + c.kalan_toplam_borc, 0)).toBe(1207 * 8);
    if (path === 'inbox') expect(first.toplam).toBe(604);
  });
  it('paginates a customer full order history beyond the REST cap', async () => {
    for (const row of state.siparislerVeritabani) {
      row.musteri_adi = 'One customer';
      row.telefon_numarasi = 'same';
      row.musteri_id = 'customer';
    }
    const { items } = await allPages(app(), '/api/musteriler/customer/siparisler', 'siparisler');
    expect(items).toHaveLength(1207);
  });
  it.each(['siparisler', 'inbox', 'musteriler'])(
    'rejects changed %s and foreign tenant/list cursors',
    async (path) => {
      const first = await request(app())
        .get('/api/' + path)
        .query({ page_size: 1 });
      const cursor = first.body.pagination.nextCursor;
      expect(
        (
          await request(app('page-b'))
            .get('/api/' + path)
            .query({ page_size: 1, cursor })
        ).status
      ).toBe(400);
      expect(
        (
          await request(app())
            .get('/api/' + (path === 'siparisler' ? 'inbox' : 'siparisler'))
            .query({ page_size: 1, cursor })
        ).status
      ).toBe(400);
      if (path === 'inbox') state.onayBekleyenler[0].durum = 'REDDEDILDI';
      else state.siparislerVeritabani[0].toplam_tutar = 999;
      expect(
        (
          await request(app())
            .get('/api/' + path)
            .query({ page_size: 1, cursor })
        ).status
      ).toBe(409);
    }
  );
  it('keeps all-tenant cursors sensitive to every tenant while own cursors ignore others', async () => {
    const own = await request(app()).get('/api/siparisler').query({ page_size: 1 });
    const global = await request(app('all')).get('/api/siparisler').query({ page_size: 1 });
    state.siparislerVeritabani.push(order(9999, 'page-b'));
    expect(
      (
        await request(app())
          .get('/api/siparisler')
          .query({ page_size: 1, cursor: own.body.pagination.nextCursor })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app('all'))
          .get('/api/siparisler')
          .query({ page_size: 1, cursor: global.body.pagination.nextCursor })
      ).status
    ).toBe(409);
  });
  it.each(['0', '-1', '501', '1.5', '1e2', '', 'abc'])(
    'rejects invalid page size %s',
    async (size) => {
      expect((await request(app()).get('/api/siparisler').query({ page_size: size })).status).toBe(
        400
      );
    }
  );
  it('rejects duplicate parameters, malformed cursors and changed page size', async () => {
    expect((await request(app()).get('/api/siparisler?page_size=1&page_size=2')).status).toBe(400);
    expect((await request(app()).get('/api/siparisler?cursor=garbage')).status).toBe(400);
    const first = await request(app()).get('/api/siparisler?page_size=1');
    expect(
      (
        await request(app())
          .get('/api/siparisler')
          .query({ page_size: 2, cursor: first.body.pagination.nextCursor })
      ).status
    ).toBe(400);
  });
  it('returns explicit413 instead of truncating the maximum supported dataset', async () => {
    state.setSiparislerVeritabani(Array.from({ length: 10001 }, (_, i) => order(i)));
    expect((await request(app()).get('/api/siparisler')).status).toBe(413);
    expect((await request(app()).get('/api/musteriler')).status).toBe(413);
    expect(() => boundedSnapshot('x'.repeat(32 * 1024 * 1024), 1)).toThrow(/32 MiB/);
  });
});
