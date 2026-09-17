import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const environment = vi.hoisted(() => ({ db: null as any, ai: vi.fn() }));
vi.mock('../../../src/server/services/supabase', () => ({
  get supabase() {
    return environment.db;
  },
}));
vi.mock('../../../src/server/services/gemini', () => ({
  getGeminiClient: () => ({}),
  generateContentWithRetryAndFallback: environment.ai,
}));

import ordersRouter from '../../../src/server/routes/siparisler';
import customersRouter from '../../../src/server/routes/musteriler';
import inboxRouter from '../../../src/server/routes/inbox';
import couriersRouter from '../../../src/server/routes/kuryeler';
import { storeTenantImage } from '../../../src/server/routes/gorsel';
import * as state from '../../../src/server/services/state';

// These route tests deliberately inject already-verified authority. Middleware
// session/cookie/CSRF integration is independently covered at the application edge.
function app(tenant = 'tenant-a', role = 'PATRON') {
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => {
    (req as any).tenantId = tenant;
    (req as any).auth = { userId: 'user-a', role, tenantId: tenant };
    next();
  });
  server.use('/api', ordersRouter, customersRouter, inboxRouter, couriersRouter);
  return server;
}
const order = (tenant: string, id = `order-${tenant}`) => ({
  id,
  tenant_id: tenant,
  musteri_id: `customer-${tenant}`,
  musteri_adi: `Customer ${tenant}`,
  telefon_numarasi: tenant === 'tenant-a' ? '+994501111111' : '+994502222222',
  urun_aciklamasi: 'Bag',
  toplam_tutar: 100,
  alinan_tutar: 10,
  kalan_tutar: 90,
  adet: 1,
  finans_durumu: 'KISMI_ODEME',
  lojistik_durumu: 'KANADA_DEPO',
  baku_kurye_id: 'kurye-elvin',
  eksik_bilgiler: [],
  olusturma_tarihi: '2026-01-01T00:00:00Z',
  urunler: [],
});
const customer = (tenant: string) => ({
  id: `customer-${tenant}`,
  tenant_id: tenant,
  ad_soyad: `Customer ${tenant}`,
  telefon: tenant === 'tenant-a' ? '+994501111111' : '+994502222222',
  adres: `Secret address ${tenant}`,
  musteri_tipi: 'TANIMADIK' as const,
  toplam_siparis_sayisi: 0,
  toplam_harcama: 0,
  kalan_toplam_borc: 0,
  olusturma_tarihi: '2026-01-01T00:00:00Z',
  son_siparis_tarihi: '2026-01-01T00:00:00Z',
});
const inbox = (tenant: string) => ({
  id: `inbox-${tenant}`,
  tenant_id: tenant,
  gelis_tarihi: '2026-01-01T00:00:00Z',
  kaynak: 'WHATSAPP' as const,
  gonderen_kullanici: 'Customer',
  konusma_gecmisi: `Private message ${tenant}`,
  durum: 'BEKLEMEDE' as const,
  oneri_siparis: {
    musteri_adi: `Customer ${tenant}`,
    urun_aciklamasi: 'Bag',
    toplam_tutar: 100,
    tenant_id: tenant,
  },
});

function database(tables: Record<string, any[]>) {
  const calls: { table: string; operation: string; filters: [string, string, any][] }[] = [];
  const failures: { table: string; operation: string; empty?: boolean }[] = [];
  const db = {
    tables,
    calls,
    failures,
    from: vi.fn((table: string) => {
      let operation = 'select';
      let values: any;
      let single = false;
      const filters: [string, string, any][] = [];
      const run = () => {
        calls.push({ table, operation, filters: [...filters] });
        const failIndex = failures.findIndex((f) => f.table === table && f.operation === operation);
        if (failIndex >= 0) {
          const [failure] = failures.splice(failIndex, 1);
          return {
            data: null,
            error: failure.empty ? null : { message: 'private database detail' },
          };
        }
        const records = (tables[table] ||= []);
        let found = records.filter((r) =>
          filters.every(([kind, key, value]) =>
            kind === 'eq' ? r[key] === value : r[key] !== value
          )
        );
        if (operation === 'insert') {
          const inserted = {
            id: `generated-${records.length}`,
            olusturma_tarihi: '2026-01-01T00:00:00Z',
            ...structuredClone(values),
          };
          if (records.some((r) => r.id === inserted.id))
            return { data: null, error: { message: 'duplicate' } };
          records.push(inserted);
          found = [inserted];
        }
        if (operation === 'update') found.forEach((r) => Object.assign(r, structuredClone(values)));
        if (operation === 'delete') tables[table] = records.filter((r) => !found.includes(r));
        return {
          data: single ? structuredClone(found[0] || null) : structuredClone(found),
          error: null,
        };
      };
      const query: any = {
        select: () => query,
        eq: (key: string, value: any) => {
          filters.push(['eq', key, value]);
          return query;
        },
        neq: (key: string, value: any) => {
          filters.push(['neq', key, value]);
          return query;
        },
        order: () => query,
        insert: (value: any) => {
          operation = 'insert';
          values = value;
          return query;
        },
        update: (value: any) => {
          operation = 'update';
          values = value;
          return query;
        },
        delete: () => {
          operation = 'delete';
          return query;
        },
        maybeSingle: () => {
          single = true;
          return query;
        },
        single: () => {
          single = true;
          return query;
        },
        then: (resolve: any, reject: any) => Promise.resolve().then(run).then(resolve, reject),
      };
      return query;
    }),
  };
  return db;
}

beforeEach(() => {
  environment.db = null;
  environment.ai.mockReset().mockResolvedValue({
    text: JSON.stringify({
      musteri_adi: 'New Customer',
      urun_aciklamasi: 'Bag',
      toplam_tutar: 100,
      alinan_tutar: 0,
      urunler: [],
    }),
  });
  state.setSiparislerVeritabani([order('tenant-a'), order('tenant-b')]);
  state.setMusterilerVeritabani([customer('tenant-a'), customer('tenant-b')]);
  state.setOnayBekleyenler([inbox('tenant-a'), inbox('tenant-b')]);
  state.setDemoSiparislerVeritabani([order('demo_sandbox', 'demo-order')]);
});

describe('tenant boundaries in core routes', () => {
  it('filters orders, CRM, inbox, and courier aggregates by trusted authority', async () => {
    for (const [path, key] of [
      ['siparisler', 'siparisler'],
      ['musteriler', 'musteriler'],
      ['inbox', 'mesajlar'],
    ]) {
      const result = await request(app()).get(`/api/${path}?tenant_id=tenant-b`);
      expect(result.status).toBe(200);
      expect(result.body[key]).toHaveLength(1);
      expect(JSON.stringify(result.body)).not.toContain('tenant-b');
    }
    const courier = await request(app()).get('/api/kuryeler?tenant_id=all');
    expect(courier.body.kuryeler.find((r: any) => r.id === 'kurye-elvin').toplam_paket_sayisi).toBe(
      1
    );
  });

  it('honors legacy tenant metadata before exposing an order or aggregate', async () => {
    state.setSiparislerVeritabani([
      { ...order('tenant-b'), tenant_id: undefined, eksik_bilgiler: ['META:tenant_id=tenant-b'] },
    ]);
    const result = await request(app('kanada_shopper_baku')).get('/api/siparisler');
    expect(result.status).toBe(200);
    expect(result.body.siparisler).toEqual([]);
    const courier = await request(app('kanada_shopper_baku')).get('/api/kuryeler');
    expect(courier.body.kuryeler.every((r: any) => r.toplam_paket_sayisi === 0)).toBe(true);
  });

  it('does not reveal another tenant customer through an ID lookup', async () => {
    const result = await request(app()).get('/api/musteriler/customer-tenant-b/siparisler');
    expect(result.status).toBe(404);
    expect(JSON.stringify(result.body)).not.toContain('Secret address');
  });

  it('denies ID-only cross-tenant order and customer mutations', async () => {
    const before = structuredClone([state.siparislerVeritabani, state.musterilerVeritabani]);
    expect(
      (await request(app()).patch('/api/siparisler/order-tenant-b').send({ alinan_tutar: 100 }))
        .status
    ).toBe(404);
    expect((await request(app()).delete('/api/siparisler/order-tenant-b')).status).toBe(404);
    expect(
      (
        await request(app())
          .post('/api/musteriler')
          .send({ id: 'customer-tenant-b', ad_soyad: 'Attack' })
      ).status
    ).toBe(404);
    expect([state.siparislerVeritabani, state.musterilerVeritabani]).toEqual(before);
  });

  it('denies inbox ownership and nested tenant retargeting without creating orders', async () => {
    const count = state.siparislerVeritabani.length;
    expect((await request(app()).post('/api/inbox/inbox-tenant-b/onayla').send({})).status).toBe(
      404
    );
    expect((await request(app()).post('/api/inbox/inbox-tenant-b/reddet').send({})).status).toBe(
      404
    );
    expect(
      (
        await request(app())
          .post('/api/inbox/inbox-tenant-a/onayla')
          .send({ duzeltilmis_siparis: { tenant_id: 'tenant-b' } })
      ).status
    ).toBe(403);
    expect(state.siparislerVeritabani).toHaveLength(count);
    expect(state.onayBekleyenler.every((r) => r.durum === 'BEKLEMEDE')).toBe(true);
  });

  it('makes tenant and order IDs immutable and limits finance fields', async () => {
    expect(
      (await request(app()).patch('/api/siparisler/order-tenant-a').send({ id: 'changed-id' }))
        .status
    ).toBe(403);
    expect(
      (await request(app()).patch('/api/siparisler/order-tenant-a').send({ tenant_id: 'tenant-b' }))
        .status
    ).toBe(403);
    expect(
      (
        await request(app('tenant-a', 'BAKU_FINANS'))
          .patch('/api/siparisler/order-tenant-a')
          .send({ lojistik_durumu: 'TESLIM_EDILDI' })
      ).status
    ).toBe(403);
    const paid = await request(app('tenant-a', 'BAKU_FINANS'))
      .patch('/api/siparisler/order-tenant-a')
      .send({ alinan_tutar: 100 });
    expect(paid.status).toBe(200);
    expect(paid.body.siparis.kalan_tutar).toBe(0);
    expect(state.siparislerVeritabani.find((r) => r.tenant_id === 'tenant-b')?.alinan_tutar).toBe(
      10
    );
  });

  it('requires a selected tenant for admin mutations and scopes bulk updates', async () => {
    expect(
      (
        await request(app('all', 'SUPER_ADMIN'))
          .post('/api/siparisler')
          .send({ musteri_adi: 'A', urun_aciklamasi: 'B' })
      ).status
    ).toBe(400);
    expect(
      (await request(app()).post('/api/siparisler/tumunu-uluslararasi-kargo-yap').send({})).status
    ).toBe(200);
    expect(state.siparislerVeritabani[0].lojistik_durumu).toBe('ULUSLARARASI_KARGO');
    expect(state.siparislerVeritabani[1].lojistik_durumu).toBe('KANADA_DEPO');
  });

  it('does not patch the first demo order when the requested ID is absent', async () => {
    expect(
      (
        await request(app('demo_sandbox'))
          .patch('/api/siparisler/missing')
          .send({ tenant_id: 'demo_sandbox', musteri_adi: 'Attack' })
      ).status
    ).toBe(404);
    expect(state.demoSiparislerVeritabani[0].musteri_adi).toBe('Customer demo_sandbox');
  });

  it('prevents cross-tenant customer and image references during order creation', async () => {
    expect(
      (
        await request(app())
          .post('/api/siparisler')
          .send({ musteri_id: 'customer-tenant-b', musteri_adi: 'A', urun_aciklamasi: 'B' })
      ).status
    ).toBe(404);
    const img = storeTenantImage(
      { auth: { role: 'PATRON' }, tenantId: 'tenant-b' } as any,
      'iVBORw0KGgo=',
      'image/png'
    );
    expect(
      (
        await request(app())
          .post('/api/siparisler')
          .send({ musteri_adi: 'A', urun_aciklamasi: 'B', urunler: [{ urun_gorseli: img.url }] })
      ).status
    ).toBe(404);
  });
});

describe('authoritative database ownership and failure behavior', () => {
  beforeEach(() => {
    environment.db = database({
      siparisler: [order('tenant-a'), order('tenant-b')],
      musteriler: [customer('tenant-a'), customer('tenant-b')],
      inbox_mesajlar: [inbox('tenant-a'), inbox('tenant-b')],
    });
  });

  it('scopes DB reads for every core listing and rejects a DB-only foreign customer', async () => {
    state.setMusterilerVeritabani([]);
    for (const path of ['siparisler', 'musteriler', 'inbox', 'kuryeler']) {
      const result = await request(app()).get('/api/' + path);
      expect(result.status).toBe(200);
      expect(JSON.stringify(result.body)).not.toContain('tenant-b');
    }
    for (const query of environment.db.calls)
      expect(query.filters).toContainEqual(['eq', 'tenant_id', 'tenant-a']);
    expect((await request(app()).get('/api/musteriler/customer-tenant-b/siparisler')).status).toBe(
      404
    );
  });

  it('scopes DB-only inbox rejection and bulk order updates', async () => {
    state.setOnayBekleyenler([]);
    expect((await request(app()).post('/api/inbox/inbox-tenant-b/reddet').send({})).status).toBe(
      404
    );
    expect((await request(app()).post('/api/inbox/inbox-tenant-a/reddet').send({})).status).toBe(
      200
    );
    expect(environment.db.tables.inbox_mesajlar[1].durum).toBe('BEKLEMEDE');
    expect(
      (await request(app()).post('/api/siparisler/tumunu-uluslararasi-kargo-yap').send({})).status
    ).toBe(200);
    expect(environment.db.tables.siparisler[0].lojistik_durumu).toBe('ULUSLARARASI_KARGO');
    expect(environment.db.tables.siparisler[1].lojistik_durumu).toBe('KANADA_DEPO');
  });

  it('does not fall back to memory when a list query fails', async () => {
    for (const [path, table] of [
      ['siparisler', 'siparisler'],
      ['musteriler', 'musteriler'],
      ['inbox', 'inbox_mesajlar'],
      ['kuryeler', 'siparisler'],
    ]) {
      environment.db.failures.push({ table, operation: 'select' });
      const result = await request(app()).get('/api/' + path);
      expect(result.status).toBe(503);
      expect(JSON.stringify(result.body)).not.toContain('private database detail');
    }
  });

  it('does not acknowledge or cache a webhook whose DB write fails', async () => {
    const before = structuredClone(state.onayBekleyenler);
    environment.db.failures.push({ table: 'inbox_mesajlar', operation: 'insert' });
    expect(
      (await request(app()).post('/api/webhook/siparis').send({ mesaj: 'A bag please' })).status
    ).toBe(503);
    expect(state.onayBekleyenler).toEqual(before);
  });

  it('handles DB-only rows and scopes the lookup plus update', async () => {
    state.setSiparislerVeritabani([]);
    const result = await request(app())
      .patch('/api/siparisler/order-tenant-a')
      .send({ alinan_tutar: 100 });
    expect(result.status).toBe(200);
    expect(result.body.kaynak).toBe('supabase');
    const calls = environment.db.calls.filter((r: any) => r.table === 'siparisler');
    expect(calls).toHaveLength(2);
    for (const call of calls) expect(call.filters).toContainEqual(['eq', 'tenant_id', 'tenant-a']);
    expect(environment.db.tables.siparisler[1].alinan_tutar).toBe(10);
  });

  it('cannot mutate foreign DB-only rows and never falls back to stale memory', async () => {
    // A stale local row must not authorize an entity whose DB owner differs.
    state.setSiparislerVeritabani([order('tenant-a', 'order-tenant-b')]);
    expect(
      (await request(app()).patch('/api/siparisler/order-tenant-b').send({ alinan_tutar: 100 }))
        .status
    ).toBe(404);
    expect((await request(app()).delete('/api/siparisler/order-tenant-b')).status).toBe(404);
    expect(state.siparislerVeritabani[0].alinan_tutar).toBe(10);
    expect(environment.db.tables.siparisler).toHaveLength(2);
  });

  it('keeps reads empty when the DB has no authorized records', async () => {
    environment.db.tables.siparisler = [];
    environment.db.tables.musteriler = [];
    environment.db.tables.inbox_mesajlar = [];
    for (const [path, key] of [
      ['siparisler', 'siparisler'],
      ['musteriler', 'musteriler'],
      ['inbox', 'mesajlar'],
    ]) {
      const result = await request(app()).get(`/api/${path}`);
      expect(result.status).toBe(200);
      expect(result.body[key]).toEqual([]);
    }
  });

  it('returns a service error without local mutation on DB failure or empty insert', async () => {
    const before = structuredClone(state.siparislerVeritabani);
    for (const empty of [false, true]) {
      environment.db.failures.push({ table: 'siparisler', operation: 'insert', empty });
      expect(
        (
          await request(app())
            .post('/api/siparisler')
            .send({ musteri_adi: 'A', urun_aciklamasi: 'B' })
        ).status
      ).toBe(503);
    }
    environment.db.failures.push({ table: 'siparisler', operation: 'update' });
    expect(
      (await request(app()).patch('/api/siparisler/order-tenant-a').send({ alinan_tutar: 100 }))
        .status
    ).toBe(503);
    expect(state.siparislerVeritabani).toEqual(before);
  });

  it('updates DB-only CRM cards and rejects another tenant ID', async () => {
    state.setMusterilerVeritabani([]);
    expect(
      (
        await request(app())
          .post('/api/musteriler')
          .send({ id: 'customer-tenant-a', ad_soyad: 'Updated' })
      ).status
    ).toBe(200);
    expect(
      (
        await request(app())
          .post('/api/musteriler')
          .send({ id: 'customer-tenant-b', ad_soyad: 'Attack' })
      ).status
    ).toBe(404);
    expect(environment.db.tables.musteriler[1].ad_soyad).toBe('Customer tenant-b');
    const update = environment.db.calls.find((c: any) => c.operation === 'update');
    expect(update.filters).toContainEqual(['eq', 'tenant_id', 'tenant-a']);
  });

  it('approves a DB-only inbox item and deduplicates retry after marking failure', async () => {
    state.setOnayBekleyenler([]);
    environment.db.failures.push({ table: 'inbox_mesajlar', operation: 'update' });
    expect((await request(app()).post('/api/inbox/inbox-tenant-a/onayla').send({})).status).toBe(
      503
    );
    const count = environment.db.tables.siparisler.length;
    expect((await request(app()).post('/api/inbox/inbox-tenant-a/onayla').send({})).status).toBe(
      200
    );
    expect(environment.db.tables.siparisler).toHaveLength(count);
    expect(environment.db.tables.inbox_mesajlar[0].durum).toBe('ONAYLANDI');
    expect(environment.db.tables.inbox_mesajlar[1].durum).toBe('BEKLEMEDE');
  });
});

describe('AI prompt and upload boundaries', () => {
  it('sends only authorized CRM context and does not write CRM on preview', async () => {
    const before = structuredClone([state.musterilerVeritabani, state.siparislerVeritabani]);
    environment.ai.mockResolvedValue({
      text: JSON.stringify({
        musteri_adi: 'Customer tenant-b',
        eslesen_musteri_id: 'customer-tenant-b',
        urun_aciklamasi: 'Bag',
        toplam_tutar: 100,
      }),
    });
    const result = await request(app())
      .post('/api/ayristir-siparis')
      .send({ ham_mesaj: 'A bag please', otomatik_kaydet: false });
    expect(result.status).toBe(200);
    const args = environment.ai.mock.calls[0][1];
    expect(JSON.stringify(args.config.systemInstruction)).toContain('Customer tenant-a');
    expect(JSON.stringify(args.config.systemInstruction)).not.toContain('tenant-b');
    expect(result.body.siparis.musteri_id).not.toBe('customer-tenant-b');
    expect([state.musterilerVeritabani, state.siparislerVeritabani]).toEqual(before);
  });

  it('rejects malformed AI attachments through the shared image validator', async () => {
    const result = await request(app())
      .post('/api/ayristir-siparis')
      .send({
        gorsel_base64: Buffer.from('<html>attack</html>').toString('base64'),
        gorsel_mime_type: 'image/png',
        otomatik_kaydet: false,
      });
    expect(result.status).toBe(415);
    expect(environment.ai).not.toHaveBeenCalled();
  });

  it('stores a new AI customer under the authenticated tenant only', async () => {
    const result = await request(app())
      .post('/api/ayristir-siparis')
      .send({ ham_mesaj: 'A bag please' });
    expect(result.status).toBe(200);
    expect(state.musterilerVeritabani.find((c) => c.ad_soyad === 'New Customer')?.tenant_id).toBe(
      'tenant-a'
    );
    expect(
      state.musterilerVeritabani.find((c) => c.tenant_id === 'tenant-b')?.toplam_siparis_sayisi
    ).toBe(0);
  });
});
